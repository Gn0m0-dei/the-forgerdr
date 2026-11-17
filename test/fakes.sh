#!/usr/bin/env bash
# Fake hc and herdr-app for the tests. Every call is logged in $FAKE_CALLS as one JSON array, the program's name first;
# what they answer comes from files under $FAKE_DIR that each test writes. Sourced, never executed.
# shellcheck shell=bash

# Writes the fakes into a directory, and exports what makes the scripts under test use them: never the real hc or
# herdr-app, nor the terminal running the tests.
fakes_install() {
  unset HC_TERMINAL_ID HC_TERMINAL_SOCKET HC_SCOPE HERDR_APP_HOME CLAUDE_CODE_MESSAGING_SOCKET FORGE_CLAUDE_ARGS \
    FORGE_SESSION_TITLE FORGE_REPORT_TO FORGE_AGENT_RECORD
  export FAKE_DIR="$1" FAKE_CALLS="$1/calls" FORGE_HC="$1/hc" FORGE_HERDR_APP="$1/herdr-app" \
    FORGE_READY_PAUSE=0 FORGE_READY_TRIES=5 SHELL=/bin/zsh
  mkdir -p "$FAKE_DIR/terminals"
  : > "$FAKE_CALLS"
  rm -f "$FAKE_DIR/made.jsonl"
  # hc: run starts $FAKE_RUN_ADDRESS (t9); get, read and keys use terminals/<address>.json, .screen and
  # .after-keys.json; kill marks a terminal finished, unless FAKE_KILL_IGNORED.
  cat > "$FORGE_HC" <<'SH'
#!/usr/bin/env bash
jq -cn '["hc"] + $ARGS.positional' --args -- "$@" >> "$FAKE_CALLS"
t="$FAKE_DIR/terminals/${2:-}"
case "$1" in
  run) [ -z "${FAKE_RUN_FAILS:-}" ] || exit 1; printf '{"address":"%s"}\n' "${FAKE_RUN_ADDRESS:-t9}" ;;
  get) if [ -f "$t.json" ]; then cat "$t.json"; else printf '{"error":{"kind":"not_found"}}\n' >&2; exit 3; fi ;;
  read) [ ! -f "$t.screen" ] || cat "$t.screen" ;;
  keys) [ ! -f "$t.after-keys.json" ] || cp "$t.after-keys.json" "$t.json" ;;
  kill) [ -n "${FAKE_KILL_IGNORED:-}" ] || [ ! -f "$t.json" ] || { jq '.state = "finished"' "$t.json" > "$t.tmp" && mv "$t.tmp" "$t.json"; } ;;
esac
exit 0
SH
  # herdr-app: ls answers ls.json, in the shape the real herdr-app ls has (spaces > tabs > terminals, a status string or
  # null, sub_agents as addresses), plus with FAKE_LS_MADE the spaces space.new made; space.new and tab.new answer what
  # they made; FAKE_APP_DOWN makes every call fail.
  cat > "$FORGE_HERDR_APP" <<'SH'
#!/usr/bin/env bash
jq -cn '["herdr-app"] + $ARGS.positional' --args -- "$@" >> "$FAKE_CALLS"
[ -z "${FAKE_APP_DOWN:-}" ] || exit 1
case "$1 ${2:-}" in
  "ls "*)
    listed='{"spaces":[]}'
    [ ! -f "$FAKE_DIR/ls.json" ] || listed="$(cat "$FAKE_DIR/ls.json")"
    if [ -n "${FAKE_LS_MADE:-}" ] && [ -f "$FAKE_DIR/made.jsonl" ]; then
      listed="$(jq -cs '.[0].spaces += .[1:] | .[0]' <(printf '%s\n' "$listed") "$FAKE_DIR/made.jsonl")"
    fi
    printf '%s\n' "$listed" ;;
  "do space.new")
    folder="$(jq -rn '$ARGS.positional as $a | ($a | index("--folder")) as $i | if $i == null then "" else $a[$i + 1] end' --args -- "$@")"
    jq -cn --arg folder "$folder" --arg t "${FAKE_NEW_TERMINAL:-t20}" \
      '{id: "sp-new", name: "made", folder: $folder, machine: null, active: false,
        tabs: [{id: "tb-new", name: "1", active: true, settled: false,
                terminals: [{terminal: $t, pane: "p-new", status: null, app: null, name: null, sub_agents: []}]}]}' >> "$FAKE_DIR/made.jsonl"
    printf '{"space":"sp-new","tab":"tb-new","terminal":"%s"}\n' "${FAKE_NEW_TERMINAL:-t20}" ;;
  "do tab.new") printf '{"space":"sp-own","tab":"tb-made","terminal":"%s"}\n' "${FAKE_NEW_TERMINAL:-t21}" ;;
  "do "*) printf '{"ok":true}\n' ;;
esac
exit 0
SH
  chmod +x "$FORGE_HC" "$FORGE_HERDR_APP"
}

fakes_reset() {
  : > "$FAKE_CALLS"
}

# Writes what hc get answers for a terminal: its state, its agent status and message (none when empty), its labels as
# key=value words.
fake_terminal() {
  local address="$1" state="$2" status="${3:-}" msg="${4:-}" labels="{}" pair
  shift 4 2>/dev/null || shift $#
  for pair in "$@"; do labels="$(jq -c --arg k "${pair%%=*}" --arg v "${pair#*=}" '.[$k] = $v' <<<"$labels")"; done
  jq -n --arg address "$address" --arg state "$state" --arg status "$status" --arg msg "$msg" --argjson labels "$labels" \
    '{address: $address, state: $state, labels: $labels,
      status: (if $status == "" then null else {app: "claude-code", state: $status, msg: (if $msg == "" then null else $msg end)} end)}' \
    > "$FAKE_DIR/terminals/$address.json"
}

# Whether a logged call starts with these arguments, the program's name first.
called() {
  jq -en '[inputs | select(.[0:($ARGS.positional | length)] == $ARGS.positional)] | length > 0' --args -- "$@" < "$FAKE_CALLS" >/dev/null \
    && echo yes || echo no
}

# The first logged call that starts with these arguments, as JSON.
call_of() {
  jq -cn 'first(inputs | select(.[0:($ARGS.positional | length)] == $ARGS.positional)) // empty' --args -- "$@" < "$FAKE_CALLS"
}

# The value that follows an option in a logged call (JSON array on stdin), empty when the option is absent.
option_of() {
  jq -r --arg option "$1" '(index($option)) as $i | if $i == null then empty else .[$i + 1] end'
}

# Whether a logged call (JSON array on stdin) holds this argument.
has_arg() {
  jq -e --arg arg "$1" 'index($arg) != null' >/dev/null && echo yes || echo no
}
