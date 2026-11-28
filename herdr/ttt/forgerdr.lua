-- forgerdr's ttt plugin, which bin/forge-ide.sh loads with ttt --plugin: it tells the IDE panel which files of the
-- checkout are unsaved, so stopping ttt never loses them, and saves them all when the panel asks.
--   FORGE_IDE_STATE     the state it keeps: JSON {"checkout","active","unsaved":[absolute paths, sorted]}, and
--                       "order":"<id>", the last order it answered, once it answered one.
--   FORGE_IDE_ORDER     the order forge-ide.sh leaves, the line "save <id>": every unsaved file saved, the order
--                       emptied, then the state written with that id whatever the order did (every file saved, or one
--                       ttt asks about still listed and active), so the panel knows it was answered.
--   FORGE_IDE_CHECKOUT  the checkout, the state's checkout.
-- Without FORGE_IDE_STATE (ttt run with this profile by hand) it writes and obeys nothing.
-- plugin.ttt.json beside it grants exactly what it uses, system.exec mv among it: ttt.fs has no rename, and fs.write
-- rewrites a file in place, where forge-ide.sh stop could read it empty and kill ttt with its unsaved files.
-- A file counts as unsaved from its first change until ttt saves or closes it, or its buffer, read as the active one,
-- matches the disk. The editor API reads the active buffer of one group only, the one focused when ttt wired the
-- plugin; the active file is the focused group's, as tab.change and editor.change name it.
-- forge: ttt.debug() exposes buffer.modified and tabs[].modified, exact, but for the focused group alone, with a heavy
-- payload and the screen.read and terminal.read permissions. It is the upgrade path for two gaps. Untitled buffers are
-- not tracked: an untitled tab sends no file.close, so one listed would stay listed until ttt stops; what is typed in
-- one is lost when that ttt stops. Files changed in a split group the editor API does not read stay listed until
-- saved, closed or seen clean there.
-- forge: limits. A file with no grammar (ttt sends no file.open or file.close for it) closed with Discard stays listed
-- until an order finds it clean or ttt stops. A rename to a name with no grammar keeps the OLD name listed until ttt
-- stops: the IDE panel then names a file that is gone while the edits live under the new name, and Discard loses them.
-- A dirty tab whose file was deleted from disk stays listed, and an order skips it. A change of line endings or of the
-- BOM alone is not seen as one. The active file drifts to the last file an LSP rename across files changes, until the
-- next tab change. In a split, an order opens each file it saves in the focused group, leaving a shared tab of it
-- there. Every publish that changes the state runs mv, which makes ttt refresh its git view.
local ttt = require("ttt")
local editor = require("ttt.editor")
local events = require("ttt.events")
local fs = require("ttt.fs")
local json = require("ttt.json")
local settings = require("ttt.settings")
local system = require("ttt.system")

local CONFIG = {
  bom = "\239\187\191",
  boot_retry_ms = 50,
  order_poll_ms = 300,
  save_order = "save",
  settle_ms = 300,
  show_final_newline = "editor.showTrailingNewline",
}

local checkout, state_path, order_path, written, last_saved
-- The id of the last order answered; nil before one, or after orders with none.
local answered
-- The focused group's active file; nil on a tab that is no file.
local active
-- Paths whose edits the disk may lack, paths changed since they were last compared, and paths closed in the current
-- batch of events.
local unsaved, changed, closed = {}, {}, {}

-- A file's path is absolute; an untitled buffer's is a bare name.
local function is_file(path)
  return path:sub(1, 1) == "/"
end

-- The text ttt's buffer holds for a file's bytes, loaded as ttt loads it (core/buffer SetText): no BOM, split on LF
-- with one CR dropped from each line's end, and an empty last line when the final newline is shown as one.
-- forge: the setting is read now, while a buffer keeps the one it was opened with; toggling it mid-session can count
-- a file opened before as unsaved until it is saved.
local function as_loaded(bytes)
  local text = bytes:sub(1, #CONFIG.bom) == CONFIG.bom and bytes:sub(#CONFIG.bom + 1) or bytes
  local lines = {}
  for line in (text .. "\n"):gmatch("(.-)\n") do
    lines[#lines + 1] = line:gsub("\r$", "")
  end
  if text:sub(-1) == "\n" then
    lines[#lines] = nil
  end
  if settings.get(CONFIG.show_final_newline) ~= false and (text:sub(-1) == "\n" or lines[#lines] ~= "") then
    lines[#lines + 1] = ""
  end
  return table.concat(lines, "\n")
end

-- Whether a file holds edits its file on disk lacks. A buffer the editor API does not show as its active one cannot be
-- read, and counts.
local function has_unsaved_edits(path)
  if editor.file_path() ~= path then
    return true
  end
  local bytes = fs.read(path)
  return bytes == nil or editor.buffer_text() ~= as_loaded(bytes)
end

local function sorted_unsaved()
  local paths = {}
  for path in pairs(unsaved) do
    paths[#paths + 1] = path
  end
  table.sort(paths)
  return paths
end

-- Replaces a file whole: a temporary file beside it, moved over it. When it cannot (system.exec missing too, as
-- without plugin.ttt.json), the file is emptied in place, so what it held, now out of date, is never read as the
-- truth: forge-ide.sh stop refuses a state it cannot read.
local function replace(path, content)
  local temporary = path .. ".tmp"
  local wrote, write_error = fs.write(temporary, content)
  local moved, exec_error
  if wrote and system.exec then
    moved, exec_error = system.exec("mv", { "-f", temporary, path })
  end
  if moved and moved.exit_code == 0 then
    return true
  end
  ttt.log("error", "forgerdr: cannot replace " .. path .. ": "
    .. ((moved and moved.stderr) or exec_error or write_error or "system.exec is not granted"))
  local emptied, empty_error = fs.write(path, "")
  if not emptied then
    ttt.log("error", "forgerdr: cannot empty " .. path .. ": " .. empty_error)
  end
  return false
end

-- Writes the state when it changed; nothing before the state's path is known, or when there is none.
local function publish()
  if not state_path or state_path == "" then
    return
  end
  local state = string.format('{"checkout":%s,"active":%s,"unsaved":%s%s}', json.encode(checkout),
    active and json.encode(active) or "null", json.encode(sorted_unsaved()),
    answered and ',"order":' .. json.encode(answered) or "")
  if state ~= written then
    written = replace(state_path, state) and state or nil
  end
end

local function forget(path)
  unsaved[path] = nil
  changed[path] = nil
end

local function compare_changed()
  for path in pairs(changed) do
    unsaved[path] = has_unsaved_edits(path) or nil
  end
  changed = {}
  publish()
end

local compare_later = ttt.debounce(CONFIG.settle_ms, compare_changed)

-- Unsaved at once, so a stop never misses an edit still settling; the compare clears it when the disk matches.
events.on("editor.change", function(path)
  active = is_file(path) and path or nil
  if active then
    unsaved[path] = true
    changed[path] = true
    compare_later()
  end
  publish()
end)

-- A file made active again can be compared with its disk once more.
events.on("tab.change", function(path)
  active = is_file(path) and path or nil
  if active then
    changed[path] = unsaved[path] or changed[path]
  end
  compare_changed()
end)

-- ttt renames a tab, or gives it another language, by closing its path and at once opening the new one, the buffer and
-- its edits kept: an open takes over the close just before it, and its mark. A file opened afresh is clean.
events.on("file.open", function(path)
  local previous = table.remove(closed)
  if previous then
    local carried = unsaved[previous]
    forget(previous)
    if carried then
      unsaved[path] = true
      changed[path] = true
    end
  end
  compare_changed()
end)

-- A tab closed for good is forgotten once its batch of events is over, unless an open took it over. One whose file is
-- gone from disk is kept: renamed to a name with no grammar, ttt sends no open, and its edits live on under a name not
-- seen yet.
local function settle_closed()
  for _, path in ipairs(closed) do
    if fs.exists(path) then
      forget(path)
    end
  end
  closed = {}
  publish()
end

events.on("file.close", function(path)
  closed[#closed + 1] = path
  ttt.set_timeout(0, settle_closed)
end)

events.on("file.save", function(path)
  last_saved = path
  forget(path)
  publish()
end)

-- Saves one file, made active first. A file gone from disk is left listed. One the editor API sees active and clean is
-- forgotten unsaved, no format on save run for nothing. One it does not see (the focus is in another split group, or
-- the file could not be opened) is saved anyway when its file reads, or left listed. Saved only when ttt says it saved
-- that path: no save, or another path's, means a dialog now waits (a read-only file, one changed on disk, a folder
-- gone, a failed write) and acts on the active tab when answered, or the wrong tab was active: false, the order stops.
local function save(path)
  if not fs.exists(path) then
    return true
  end
  ttt.open_file(path)
  local seen = editor.file_path() == path
  if seen and not has_unsaved_edits(path) then
    forget(path)
    return true
  end
  if not seen and not fs.read(path) then
    return true
  end
  last_saved = nil
  ttt.exec_command("file.save")
  return last_saved == path
end

-- ttt has no command that saves every file: one at a time, as its own Save All & Quit, the active one first, then the
-- file that was active made active again.
local function save_all()
  compare_changed()
  local back = active
  local queue = {}
  if back and unsaved[back] then
    queue[1] = back
  end
  for _, path in ipairs(sorted_unsaved()) do
    if path ~= back then
      queue[#queue + 1] = path
    end
  end
  local switched = false
  for _, path in ipairs(queue) do
    switched = switched or path ~= back
    if not save(path) then
      -- The file ttt asks about: the save made it active.
      if editor.file_path() == path then
        active = path
      end
      publish()
      return
    end
  end
  if back and switched then
    ttt.open_file(back)
    -- It sends no tab.change, while saving may have sent editor.change for each file it changed.
    active = back
  end
  publish()
end

local function obey_order()
  local word, id = (fs.read(order_path) or ""):match("^%s*(%S+)%s*(%S*)")
  if word ~= CONFIG.save_order then
    return
  end
  -- Consumed before it runs: an order left meanwhile runs on the next poll.
  local emptied, error_message = fs.write(order_path, "")
  if not emptied then
    ttt.log("error", "forgerdr: cannot empty " .. order_path .. ": " .. error_message)
  end
  save_all()
  -- Answered once the loop is over, never by a publish inside it.
  if id ~= "" then
    answered = id
    publish()
  end
end

local function start()
  state_path = system.env("FORGE_IDE_STATE")
  order_path = system.env("FORGE_IDE_ORDER")
  checkout = system.env("FORGE_IDE_CHECKOUT")
  if state_path ~= "" and order_path ~= "" then
    ttt.set_interval(CONFIG.order_poll_ms, obey_order)
  end
  publish()
end

-- ttt --plugin runs this file before it wires the plugin to the editor: the listeners above can be registered now, but
-- system.env reads "" until then, and a timer that fires before then is dropped. An interval retries until a tick gets
-- through.
local boot
boot = ttt.set_interval(CONFIG.boot_retry_ms, function()
  ttt.clear_interval(boot)
  if state_path == nil then
    start()
  end
end)
