#!/usr/bin/env bash
# Smallest check that fails if forgerdr's ttt plugin (herdr/ttt/forgerdr.lua) breaks: the state it keeps for the IDE
# panel (the active file and the unsaved ones, exact, whatever the file's line endings, through renames, closes and
# split groups), replaced by a rename or emptied when it cannot be, and the order to save every file. Each case drives
# a real ttt headless through --exec on a workspace of the test's own, its TTT_CONFIG_DIR a fresh copy of the profile,
# HOME a folder of the test's own and PATH the system's alone (no language server of this machine starts), so nothing
# of this machine's ttt is read or written. Files are .js where ttt's file events matter: it sends them only for files
# it has a grammar for. A ttt that must wait on the test waits for go.flag to show in its explorer (release). The ttt
# is FORGE_TEST_TTT, else the one on PATH; below the version forgerdr needs, or none (CI), the test is skipped.
# Run: FORGE_TEST_TTT=/path/to/ttt bash test/ide-plugin.test.sh
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source-path=SCRIPTDIR/../bin
# shellcheck source=forge-lib.sh
. "$root/bin/forge-lib.sh"
sandbox="$(cd "$(mktemp -d)" && pwd -P)"
trap 'chmod -R u+rwx "$sandbox" 2>/dev/null; rm -rf "$sandbox"' EXIT
export HOME="$sandbox/home" XDG_CONFIG_HOME="$sandbox/config" XDG_STATE_HOME="$sandbox/state" \
  TTT_CONFIG_DIR="$sandbox/profile"
unset FORGE_IDE_STATE FORGE_IDE_ORDER FORGE_IDE_CHECKOUT
mkdir -p "$HOME"

ttt="${FORGE_TEST_TTT:-$(command -v ttt || true)}"
version="$([ -z "$ttt" ] || forge_version_of "$ttt")"
if [ -z "$version" ] || forge_version_newer "$FORGE_TTT_MIN" "$version"; then
  printf 'skipped: no ttt >= %s\n' "$FORGE_TTT_MIN"
  exit 0
fi

failures=0
expect() {
  if [ "$2" = "$3" ]; then printf 'ok   %s\n' "$1"; else printf 'FAIL %s\n  expected: %s\n  actual:   %s\n' "$1" "$2" "$3"; failures=$((failures + 1)); fi
}

checkout="$sandbox/work/api"
state_dir="$XDG_STATE_HOME/forgerdr/ide"
state="$state_dir/ide-test.json"
order="$state_dir/ide-test.order"
# What forge-ide.sh gives the plugin.
ide_env=("FORGE_IDE_STATE=$state" "FORGE_IDE_ORDER=$order" "FORGE_IDE_CHECKOUT=$checkout")
# What a ttt that waits on the test runs last: it waits for release, then quits.
released="wait-for go.flag timeout=25000; quit"

# Runs ttt on the checkout with the plugin and a fresh profile, the files opened (the last one active) and an --exec
# script run; killed after a minute, should it hang. profile_settings, a jq filter, changes the profile's settings;
# manifest=no leaves plugin.ttt.json out of it.
profile_settings=.
manifest=yes
run_ttt() {
  local script="$1"
  shift
  rm -rf "$TTT_CONFIG_DIR"
  cp -R "$root/herdr/ttt" "$TTT_CONFIG_DIR"
  jq "$profile_settings" "$root/herdr/ttt/settings.json" > "$TTT_CONFIG_DIR/settings.json"
  [ "$manifest" = yes ] || rm "$TTT_CONFIG_DIR/plugin.ttt.json"
  (cd "$checkout" && env "${ide_env[@]}" PATH=/usr/bin:/bin perl -e 'alarm 60; exec @ARGV' "$ttt" \
    --plugin "$TTT_CONFIG_DIR/forgerdr.lua" --size 120x40 --exec "$script" . "$@" </dev/null >/dev/null 2>&1)
}
# The same in the background, for a script that ends with $released.
start_ttt() {
  run_ttt "$@" &
  ttt_pid=$!
}
release() {
  touch "$checkout/go.flag"
  wait "$ttt_pid" || true
}

# The state the plugin wrote, its keys sorted; nothing when it wrote none.
state_now() {
  jq -cS . "$state" 2>/dev/null || true
}
state_of() {
  local active="$1"
  shift
  jq -cnS --arg checkout "$checkout" --arg active "$active" '{checkout: $checkout, active: $active,
    unsaved: $ARGS.positional}' --args -- "$@"
}
unsaved_now() {
  jq -c .unsaved "$state" 2>/dev/null || true
}
active_now() {
  jq -r .active "$state" 2>/dev/null || true
}
# The paths of the checkout's files, as a JSON array.
paths() {
  local name
  for name in "$@"; do printf '%s/%s\n' "$checkout" "$name"; done | jq -cRn '[inputs]'
}
# Leaves the order to save, as forge-ide.sh does: with an id when one is given.
order_save() {
  local tmp
  tmp="$(mktemp "$order.XXXXXX")"
  printf 'save%s\n' "${1:+ $1}" > "$tmp"
  mv "$tmp" "$order"
}
# The id of the last order the state says ttt answered; nothing before one.
order_now() {
  jq -r '.order // empty' "$state" 2>/dev/null || true
}
order_is() {
  [ "$(order_now)" = "$1" ]
}
# Waits up to ten seconds for a command to succeed.
eventually() {
  local tries=100
  until "$@"; do
    tries=$((tries - 1))
    [ "$tries" -gt 0 ] || return 1
    sleep 0.1
  done
}
unsaved_is() {
  [ "$(unsaved_now)" = "$1" ]
}
active_is() {
  [ "$(active_now)" = "$1" ]
}
consumed() {
  [ -f "$order" ] && [ ! -s "$order" ]
}
# The order consumed, and the save it runs in the same turn of ttt's loop over.
order_done() {
  eventually consumed || true
  sleep 0.3
}
fresh() {
  [ ! -d "$state_dir" ] || chmod 700 "$state_dir"
  rm -rf "$checkout" "$state_dir"
  mkdir -p "$checkout" "$state_dir"
  printf 'hello\n' > "$checkout/a.txt"
  printf 'hello\n' > "$checkout/a.js"
  printf 'other\n' > "$checkout/b.js"
}

fresh
run_ttt "wait 500; quit" b.js a.js
expect "files opened and not edited: the active one, nothing unsaved" "$(state_of "$checkout/a.js")" "$(state_now)"
expect "nothing unsaved is an empty array, as forge-ide.sh and the mod read it" array \
  "$(jq -r '.unsaved | type' "$state" 2>/dev/null || true)"

fresh
run_ttt "wait 300; type hi; wait 600; quit" a.txt
expect "typed into: unsaved, once the typing settles too" "$(state_of "$checkout/a.txt" "$checkout/a.txt")" \
  "$(state_now)"
expect "and the file on disk untouched" hello "$(cat "$checkout/a.txt")"

# ttt quits before the typing settles: a stop then must already see the file unsaved.
fresh
run_ttt "wait 300; type hi; quit" a.txt
expect "typed into and not settled yet: unsaved at once" "$(paths a.txt)" "$(unsaved_now)"

fresh
start_ttt "wait 300; type hi; $released" a.txt
eventually unsaved_is "$(paths a.txt)" || true
# A second name for the state as it is now: a rename leaves it on the old file, a rewrite in place does not.
before="$sandbox/state-before.json"
rm -f "$before"
ln "$state" "$before" 2>/dev/null || true
order_save
eventually unsaved_is '[]' || true
order_done
release
expect "the order to save: the typed text on disk" hihello "$(cat "$checkout/a.txt")"
expect "and nothing unsaved" "$(state_of "$checkout/a.txt")" "$(state_now)"
expect "the order consumed, so it runs once" consumed "$(consumed && echo consumed || echo pending)"
expect "the state replaced by a rename, never rewritten in place" yes \
  "$([ -f "$before" ] && [ -f "$state" ] && ! [ "$state" -ef "$before" ] && echo yes || echo no)"

# An order with an id: the state carries it once ttt has answered it, whatever the order did, so the panel knows when a
# file still listed is one ttt asks about.
fresh
start_ttt "wait 300; type hi; $released" a.txt
eventually unsaved_is "$(paths a.txt)" || true
order_save o1
eventually order_is o1 || true
expect "an order with an id: answered in the state, every file saved by then" "o1 [] hihello" \
  "$(order_now) $(unsaved_now) $(cat "$checkout/a.txt")"
order_save o2
eventually order_is o2 || true
expect "one with nothing to save is answered too" "o2 []" "$(order_now) $(unsaved_now)"
release
expect "no temporary file left beside it" "ide-test.json ide-test.order" "$(cd "$state_dir" && echo *)"

# Typed then deleted back to the saved text, in files whose buffer is not their bytes: CRLF, no final newline, a
# UTF-8 BOM, empty. empty.txt is compared once the typing settles, the others when made active again (they are left
# before they settle, unsaved until then). dirty.txt, typed into last, stays unsaved: the plugin seen alive.
undone() {
  local typed="type xy; key backspace; key backspace" previous="exec View: Previous Tab" next="exec View: Next Tab"
  fresh
  printf 'one\r\ntwo\r\n' > "$checkout/crlf.txt"
  printf 'no final newline' > "$checkout/bare.txt"
  printf '\357\273\277bom\n' > "$checkout/bom.txt"
  : > "$checkout/empty.txt"
  printf 'dirty\n' > "$checkout/dirty.txt"
  run_ttt "wait 300; $typed; wait 500; $previous; $typed; $previous; $typed; $previous; $typed; $previous; $typed; \
$next; $next; $next; $previous; $previous; $previous; $previous; type z; wait 100; quit" \
    dirty.txt a.txt crlf.txt bare.txt bom.txt empty.txt
}
undone
expect "typed then deleted back to the saved text: not unsaved, whatever the line endings" "$(paths dirty.txt)" \
  "$(unsaved_now)"
profile_settings='.editor.showTrailingNewline = false'
undone
expect "nor with the final newline not shown as a line" "$(paths dirty.txt)" "$(unsaved_now)"
profile_settings=.

fresh
printf 'save\n' > "$order"
ide_env=("FORGE_IDE_ORDER=$order" "FORGE_IDE_CHECKOUT=$checkout")
run_ttt "wait 300; type hi; wait 600; quit" a.txt
expect "no FORGE_IDE_STATE: no state written" ide-test.order "$(cd "$state_dir" && echo *)"
expect "nor any order obeyed" "save hello" "$(cat "$order") $(cat "$checkout/a.txt")"
ide_env=("FORGE_IDE_STATE=$state" "FORGE_IDE_ORDER=$order" "FORGE_IDE_CHECKOUT=$checkout")

# Without plugin.ttt.json, ttt --plugin grants everything but system.exec: the state cannot be moved into place.
fresh
manifest=no
run_ttt "wait 500; quit" a.js
manifest=yes
expect "no system.exec to move the state: the state left empty, never stale" empty \
  "$(if [ -f "$state" ] && ! [ -s "$state" ]; then echo empty; else state_now; fi)"

# Typed into, then renamed in the explorer: ttt sends the close of the old path and the open of the new, the edits kept.
rename_to() {
  printf 'wait 300; type x; exec Explorer: Reveal Active File; wait 200; exec Explorer: Rename; wait 200; '
  printf 'key backspace; key backspace; key backspace; key backspace; type %s; key enter' "$1"
}
fresh
start_ttt "$(rename_to c.js); $released" a.js
eventually unsaved_is "$(paths c.js)" || true
release
expect "a file typed into and renamed: unsaved under its new path" "$(paths c.js)" "$(unsaved_now)"
expect "and the new path the active one" "$checkout/c.js" "$(active_now)"

# Renamed to a name with no grammar, ttt sends the close and no open: the old path stays listed, the edits living on
# under a name not seen yet; an order then leaves it listed, and makes no empty file for it.
fresh
start_ttt "$(rename_to c.txt); $released" a.js
eventually active_is "$checkout/c.txt" || true
sleep 0.3
order_save
order_done
release
expect "renamed to a name with no grammar: the old path stays listed" "$(paths a.js)" "$(unsaved_now)"
expect "and an order makes no empty file for it" absent "$([ -e "$checkout/a.js" ] && echo present || echo absent)"

fresh
run_ttt "wait 300; exec Explorer: New File; wait 200; type n.js; key enter; wait 400; quit" a.js
expect "a file opened afresh: active, and clean at once" "$checkout/n.js []" "$(active_now) $(unsaved_now)"

# a.txt typed into and closed with Discard (no grammar: ttt sends no close, so it stays listed), then made unreadable:
# an order cannot open it, and must not save the active b.js in its place.
fresh
start_ttt "wait 300; exec View: Previous Tab; type x; exec View: Close Tab; wait 200; key left; key left; key enter; \
$released" a.txt b.js
eventually active_is "$checkout/b.js" || true
chmod 000 "$checkout/a.txt"
ln "$checkout/b.js" "$sandbox/b-before.js"
order_save
order_done
release
chmod 600 "$checkout/a.txt"
expect "a listed file ttt cannot open: left listed" "$(paths a.txt)" "$(unsaved_now)"
expect "and no other file saved in its place" untouched \
  "$([ "$checkout/b.js" -ef "$sandbox/b-before.js" ] && echo untouched || echo saved)"
rm -f "$sandbox/b-before.js"

fresh
run_ttt "wait 300; type x; exec View: Close Tab; wait 200; key left; key left; key enter; wait 300; quit" b.js a.js
expect "a file typed into and closed with Discard: no longer unsaved" "[] hello" "$(unsaved_now) $(cat "$checkout/a.js")"

# Two files typed into, a third the active one. The order saves both, through a formatter that changes them on save
# (so ttt sends editor.change for each), then makes the third active again: so the state says, and the typing after
# the release lands there.
three() {
  fresh
  printf 'x\n' > "$checkout/x.js"
  printf 'y\n' > "$checkout/y.js"
  printf 'z\n' > "$checkout/z.js"
  start_ttt "wait 300; exec View: Previous Tab; type 1; exec View: Previous Tab; type 2; exec View: Next Tab; \
exec View: Next Tab; wait-for go.flag timeout=25000; type q; wait 300; quit" x.js y.js z.js
  eventually unsaved_is "$(paths x.js y.js)" || true
  eventually active_is "$checkout/z.js" || true
}
profile_settings='.editor.formatOnSave = true | .formatters.js = "tr a-z A-Z"'
three
profile_settings=.
order_save
eventually unsaved_is '[]' || true
order_done
expect "the order saves every file, not only the active one" "2X 1Y z" \
  "$(cat "$checkout/x.js") $(cat "$checkout/y.js") $(cat "$checkout/z.js")"
expect "and the state names the file that was active again, whatever saving them changed" "$checkout/z.js" \
  "$(active_now)"
release
expect "which is the active one indeed" "$(paths z.js)" "$(unsaved_now)"

# x.js changed on disk meanwhile: ttt asks before overwriting it, so the order stops there, y.js not saved after it.
three
printf 'changed on disk\n' > "$checkout/x.js"
order_save o3
order_done
expect "a file ttt asks about stops the order: both still unsaved" "$(paths x.js y.js)" "$(unsaved_now)"
expect "and the order answered all the same, with the file asked about the active one" "o3 $checkout/x.js" \
  "$(order_now) $(active_now)"
expect "and nothing saved after it" "changed on disk y" "$(cat "$checkout/x.js") $(cat "$checkout/y.js")"
release

# A state folder that cannot take the new state: the state left there emptied, so forge-ide.sh stop cannot read stale
# unsaved files there and refuses.
fresh
start_ttt "wait-for go.flag timeout=25000; type hi; wait 300; quit" a.js
eventually test -s "$state" || true
chmod 500 "$state_dir"
release
expect "a state that cannot be replaced is emptied" empty \
  "$(if [ -f "$state" ] && ! [ -s "$state" ]; then echo empty; else state_now; fi)"
chmod 700 "$state_dir"

# A split: the second group, focused, opens b.js beside the first group's a.js and types into it. The editor API
# reads the first group, so the plugin cannot compare b.js; an order still saves it there.
fresh
start_ttt "wait 300; exec Split: Open to the Side; wait 200; exec View: Focus Previous Group; wait 200; \
exec View: Previous Tab; wait 200; exec View: Focus Next Group; wait 200; type q; $released" a.js b.js
eventually unsaved_is "$(paths b.js)" || true
expect "in a split, the active file is the focused group's" "$checkout/b.js $(paths b.js)" \
  "$(active_now) $(unsaved_now)"
order_save
eventually unsaved_is '[]' || true
order_done
release
expect "and an order saves a file typed into in the second group" "[] qother" "$(unsaved_now) $(cat "$checkout/b.js")"

fresh
run_ttt "wait 300; exec Split: Open to the Side; wait 200; exec Explorer: New File; wait 200; type n.js; key enter; \
wait 400; quit" a.js
expect "a file opened afresh in the second group: not listed" "$checkout/n.js []" "$(active_now) $(unsaved_now)"

fresh
run_ttt "wait 300; exec Split: Right; wait 200; type u; wait 400; quit" a.js
expect "an untitled buffer typed into: not a file, never listed, and no active file" "[] null" \
  "$(unsaved_now) $(active_now)"

[ "$failures" -eq 0 ] || { printf '%s failed\n' "$failures"; exit 1; }
printf 'all passed\n'
