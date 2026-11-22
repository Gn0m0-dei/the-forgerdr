// What the smith's manual lists (design 08): the app's keys from keys(), grouped by what they work and named as the
// manual names them, and forgerdr's commands from the cheat sheet /forgerdr:help prints (references/cheatsheet.txt), with
// the search that narrows them. Pure: Node tests it (test/herdr-mod.test.mjs).

export const MANUAL_SECTION = Object.freeze({
  commands: "commands",
  forge: "forge",
  forges: "forges",
  sessions: "sessions",
  terminal: "terminal",
});

/** @typedef {typeof MANUAL_SECTION[keyof typeof MANUAL_SECTION]} ManualSection */

/** The sections in the order the manual shows them. @type {ReadonlyArray<ManualSection>} */
export const MANUAL_ORDER = Object.freeze([
  MANUAL_SECTION.forges,
  MANUAL_SECTION.sessions,
  MANUAL_SECTION.forge,
  MANUAL_SECTION.terminal,
  MANUAL_SECTION.commands,
]);

/**
 * A row of the manual: a key's action and its bindings, or a forgerdr command and what it does.
 * @typedef {object} ManualRow
 * @property {ManualSection} section
 * @property {string} label
 * @property {string[]} keys its bindings as keys.json writes them; none for a command
 * @property {boolean} range the keys are the first and the last of a numbered run (⌘1 to ⌘9)
 * @property {string} detail the action for a key, what it does for a command
 */

/** A binding, as keys() gives it. @typedef {ReturnType<typeof import("herdr").keys>[number]} Binding */

/**
 * An object binding, as keys() writes it in JSON.
 * @typedef {object} ObjectBinding
 * @property {unknown} [command]
 * @property {{ name?: unknown }} [args]
 */

/** keys() writes an object binding as its JSON. @type {(text: string) => ObjectBinding | null} */
const parseBinding = JSON.parse;

// The app's own commands and forgerdr's, in the order the manual lists them; a numbered run is `name:#`. An action not
// here is listed last in its section, in its own words.
/** @type {ReadonlyArray<[string, string]>} */
const LABELS = Object.freeze([
  ["space.new", "New space"],
  ["space.next", "Next space"],
  ["space.prev", "Previous space"],
  ["space.select:#", "Show space"],
  ["space.rename", "Rename space"],
  ["pane.split:right", "Split right"],
  ["pane.split:down", "Split down"],
  ["pane.go:left", "Focus pane left"],
  ["pane.go:right", "Focus pane right"],
  ["pane.go:up", "Focus pane up"],
  ["pane.go:down", "Focus pane down"],
  ["pane.swap:left", "Swap pane left"],
  ["pane.swap:right", "Swap pane right"],
  ["pane.swap:up", "Swap pane up"],
  ["pane.swap:down", "Swap pane down"],
  ["pane.zoom", "Zoom pane"],
  ["pane.close", "Close pane"],
  ["layout.toggle:sidebar", "Show or hide the sidebar"],
  ["layout.switch", "Switch layout"],
  ["tab.new", "New session"],
  ["tab.next", "Next session"],
  ["tab.prev", "Previous session"],
  ["tab.select:#", "Show session"],
  ["tab.rename", "Rename session"],
  ["tab.close", "Close session"],
  ["agent.next", "Next golem"],
  ["agent.prev", "Previous golem"],
  ["app.palette", "Command palette"],
  ["mod.open:picker", "Open the picker"],
  ["forgerdr.start", "Start work"],
  ["forgerdr.inbox", "Inbox"],
  ["forgerdr.floor", "Forge floor"],
  ["forgerdr.mode", "Forge mode"],
  ["forgerdr.worktree-new", "New worktree"],
  ["forgerdr.worktree-remove", "Remove worktree"],
  ["forgerdr.lanes", "Fold or unfold the golem lanes"],
  ["forgerdr.motion", "Motion off or on"],
  ["forgerdr.manual", "Smith's manual"],
  ["forgerdr review", "Review pull requests"],
  ["forgerdr worktree", "Items in worktrees"],
  ["app.help", "Herdr's keys"],
  ["app.settings", "Settings"],
  ["app.zoom_in", "Zoom in"],
  ["app.zoom_out", "Zoom out"],
  ["app.zoom_reset", "Reset zoom"],
  ["app.reset", "Back to herdr's main screen"],
  ["window.minimize", "Minimize"],
  ["app.hide", "Hide herdr"],
  ["app.hide_others", "Hide the others"],
  ["app.quit", "Quit herdr"],
  ["terminal.search", "Find"],
  ["terminal.copy", "Copy"],
  ["terminal.paste", "Paste"],
  ["terminal.paste_image", "Paste an image"],
  ["terminal.select_all", "Select all"],
]);

const LABEL = new Map(LABELS);
const ORDER = new Map(LABELS.map(([action], index) => [action, index]));

// Where an action of each command family goes; anything else is the forge's.
/** @type {Readonly<Record<string, ManualSection>>} */
const FAMILY = Object.freeze({
  agent: MANUAL_SECTION.sessions,
  layout: MANUAL_SECTION.forges,
  pane: MANUAL_SECTION.forges,
  space: MANUAL_SECTION.forges,
  tab: MANUAL_SECTION.sessions,
});

// Bindings that only type into the program, which the manual leaves to the program.
const TYPING = /^(send:|terminal$)/;

// The run of a numbered command: tab.select:3 is tab.select:#.
const NUMBERED = /^(?<command>.+):(?<number>\d+)$/;

// The name the dev copy of the mod gives its commands, read as the installed copy's.
const DEV = /^forgerdr-dev\./;

/**
 * An object binding keys() gives as JSON: the command, and the forgerdr tab it opens when it is one.
 * @param {string} action
 * @returns {string} the action the manual knows it by
 */
const actionKey = (action) => {
  if (!action.startsWith("{")) return action.replace(DEV, "forgerdr.");
  try {
    const binding = parseBinding(action);
    const name = binding?.args?.name;
    return typeof name === "string" && LABEL.has(name)
      ? name
      : String(binding?.command ?? action);
  } catch (error) {
    console.error(
      `forgerdr: the manual cannot read the binding ${action}`,
      error,
    );
    return action;
  }
};

/** @param {string} action */
const ownWords = (action) => {
  const words = action.replace(/[.:_-]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
};

/**
 * What the manual calls an action: its own name for the commands it knows, the action's words otherwise.
 * @param {string} action as keys() gives it
 */
export const actionLabel = (action) => {
  const key = actionKey(action);
  return LABEL.get(key) ?? ownWords(key);
};

/**
 * The section a binding of keys() goes to; null for one the manual leaves out: another layout's, a mod's, or one that
 * only types into the program.
 * @param {Binding} binding
 * @returns {ManualSection | null}
 */
const sectionOf = ({ section, action }) => {
  if (TYPING.test(action)) return null;
  if (section === "terminal") return MANUAL_SECTION.terminal;
  if (section !== "global" && !section.startsWith("layout:forgerdr"))
    return null;
  return FAMILY[actionKey(action).split(".")[0]] ?? MANUAL_SECTION.forge;
};

/** @param {string} key */
const rank = (key) => ORDER.get(key) ?? LABELS.length;

// By code point: herdr's runtime has no Intl for localeCompare, and the labels are plain English.
/**
 * @param {string} one
 * @param {string} other
 */
const alphabetical = (one, other) => (one < other ? -1 : one > other ? 1 : 0);

// forgerdr's own commands, which the manual lists with no key too, so they can be bound in keys.json.
const OWN_COMMANDS = Object.freeze(
  LABELS.map(([action]) => action).filter((action) =>
    action.startsWith("forgerdr."),
  ),
);

/**
 * The app's keys as the manual lists them: a row per action with every binding it has, a numbered run (⌘1 to ⌘9) in
 * one row, forgerdr's own commands with no key among them, each section in the manual's order.
 * @param {Binding[]} bindings what keys() gives
 * @returns {ManualRow[]}
 */
export const keyRows = (bindings) => {
  /** @type {Map<string, { row: ManualRow, numbers: { number: number, keys: string }[] }>} */
  const rows = new Map();
  for (const binding of bindings) {
    const section = sectionOf(binding);
    if (section === null) continue;
    const action = actionKey(binding.action);
    const run = NUMBERED.exec(action)?.groups;
    const key = run === undefined ? action : `${run.command}:#`;
    const id = `${section} ${key}`;
    const held = rows.get(id) ?? {
      numbers: [],
      row: {
        detail: action,
        keys: [],
        label: LABEL.get(key) ?? ownWords(run?.command ?? action),
        range: false,
        section,
      },
    };
    if (run !== undefined)
      held.numbers.push({ keys: binding.keys, number: Number(run.number) });
    else if (!held.row.keys.includes(binding.keys))
      held.row.keys.push(binding.keys);
    rows.set(id, held);
  }
  for (const action of OWN_COMMANDS) {
    const id = `${MANUAL_SECTION.forge} ${action}`;
    if (rows.has(id)) continue;
    rows.set(id, {
      numbers: [],
      row: {
        detail: action,
        keys: [],
        label: LABEL.get(action) ?? ownWords(action),
        range: false,
        section: MANUAL_SECTION.forge,
      },
    });
  }
  return [...rows.values()]
    .map(({ row, numbers }) => {
      const sorted = numbers.toSorted(
        (one, other) => one.number - other.number,
      );
      const first = sorted.at(0);
      const last = sorted.at(-1);
      if (first === undefined || last === undefined) return row;
      const range = first !== last;
      return {
        ...row,
        keys: range ? [first.keys, last.keys] : [first.keys],
        label: range
          ? `${row.label} ${first.number}–${last.number}`
          : `${row.label} ${first.number}`,
        range,
      };
    })
    .toSorted(
      (one, other) =>
        MANUAL_ORDER.indexOf(one.section) -
          MANUAL_ORDER.indexOf(other.section) ||
        rank(rowKey(one)) - rank(rowKey(other)) ||
        alphabetical(one.label, other.label),
    );
};

/** @param {ManualRow} row */
const rowKey = (row) => {
  const run = NUMBERED.exec(row.detail)?.groups;
  return run === undefined ? row.detail : `${run.command}:#`;
};

// A command of the cheat sheet: indented, then the command and its arguments, then two spaces or more before what it does.
const COMMAND =
  /^\s+(?<command>\/forgerdr:\S+(?: \S+)*?)(?:\s{2,}(?<does>\S.*))?$/;

// What a command does, on the line under it when the command is too long to leave room.
const UNDER = /^\s{8,}(?<does>[^\s/].*)$/;

/**
 * forgerdr's commands, as the cheat sheet lists them: each with what it does, whether on its line or the one under it.
 * A command the sheet gives no words for (a form of one listed before) is left out.
 * @param {string} sheet references/cheatsheet.txt
 * @returns {ManualRow[]}
 */
export const commandRows = (sheet) => {
  const lines = sheet.split("\n");
  return lines.flatMap((line, index) => {
    const found = COMMAND.exec(line)?.groups;
    if (found === undefined) return [];
    const under = UNDER.exec(lines.at(index + 1) ?? "")?.groups;
    const detail = (found.does ?? under?.does ?? "").trim();
    return detail === ""
      ? []
      : [
          {
            detail,
            keys: [],
            label: found.command,
            range: false,
            section: MANUAL_SECTION.commands,
          },
        ];
  });
};

/**
 * The rows whose words, action or keys hold what is searched, with no regard to case; every row when nothing is.
 * @param {ManualRow[]} rows
 * @param {string} query
 */
export const filterRows = (rows, query) => {
  const wanted = query.trim().toLowerCase();
  return wanted === ""
    ? rows
    : rows.filter((row) =>
        [row.label, row.detail, ...row.keys].some((field) =>
          field.toLowerCase().includes(wanted),
        ),
      );
};
