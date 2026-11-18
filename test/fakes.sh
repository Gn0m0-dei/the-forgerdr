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
  # they made; FAKE_APP_DOWN makes every call fail. With FAKE_TAB_SIZE ("cols rows"), tab.new makes a tab of its own
  # (tb-made-1, tb-made-2...) whose terminal (t40, t41...) has that size and a working agent; terminal.open splits the
  # terminal pane.focus focused as the app's main layout does, in two halves less 6 columns or 4 rows (the split one
  # keeps its size with FAKE_LAYOUT_STUCK), and its new terminal takes the next address; pane.split does the same to the
  # terminal of the pane it names (p-<address>), its new terminal FAKE_SPLIT_ADDRESS when set, and fails with
  # FAKE_SPLIT_FAILS. With FAKE_LS_PANES, ls also lists every live terminal the fakes know, in pane p-<address>. status
  # answers status.json, else tab tb-own shown with pane p-t5 focused.
  cat > "$FORGE_HERDR_APP" <<'SH'
#!/usr/bin/env bash
jq -cn '["herdr-app"] + $ARGS.positional' --args -- "$@" >> "$FAKE_CALLS"
[ -z "${FAKE_APP_DOWN:-}" ] || exit 1
option() { jq -rn --arg o "$1" '$ARGS.positional as $a | ($a | index($o)) as $i | if $i == null then "" else $a[$i + 1] end' --args -- "${@:2}"; }
next_address() { local n; n="$(cat "$FAKE_DIR/next" 2>/dev/null || echo 40)"; printf '%s\n' $((n + 1)) > "$FAKE_DIR/next"; printf 't%s\n' "$n"; }
# Splits a terminal's pane right or down, as the app's main layout does, into a new terminal at an address; prints it.
# A terminal the test wrote beforehand keeps what it says, and one that says no size is split as 120x40.
split_off() {
  local split="$FAKE_DIR/terminals/$1.json" cols rows
  cols="$(jq -r '.cols // 120' "$split" 2>/dev/null || echo 120)" rows="$(jq -r '.rows // 40' "$split" 2>/dev/null || echo 40)"
  if [ "$2" = right ]; then cols=$(((cols - 6) / 2)); else rows=$(((rows - 4) / 2)); fi
  if [ -z "${FAKE_LAYOUT_STUCK:-}" ] && [ -f "$split" ]; then
    jq --argjson c "$cols" --argjson r "$rows" '.cols = $c | .rows = $r' "$split" > "$split.tmp" && mv "$split.tmp" "$split"
  fi
  [ -f "$FAKE_DIR/terminals/$3.json" ] || sized "$3" "$cols" "$rows"
  printf '%s\n' "$3"
}
sized() {
  jq -n --arg address "$1" --argjson cols "$2" --argjson rows "$3" \
    '{address: $address, state: "live", labels: {}, status: {app: "claude-code", state: "working", msg: null}, cols: $cols, rows: $rows}' \
    > "$FAKE_DIR/terminals/$1.json"
  printf '%s\n' "$1" >> "$FAKE_DIR/generated"
}
case "$1 ${2:-}" in
  "ls "*)
    listed='{"spaces":[]}'
    [ ! -f "$FAKE_DIR/ls.json" ] || listed="$(cat "$FAKE_DIR/ls.json")"
    if [ -n "${FAKE_LS_MADE:-}" ] && [ -f "$FAKE_DIR/made.jsonl" ]; then
      listed="$(jq -cs '.[0].spaces += .[1:] | .[0]' <(printf '%s\n' "$listed") "$FAKE_DIR/made.jsonl")"
    fi
    if [ -n "${FAKE_LS_PANES:-}" ]; then
      panes="$(for f in "$FAKE_DIR"/terminals/*.json; do jq -c 'select(.state == "live") | {terminal: .address, pane: ("p-" + .address)}' "$f"; done | jq -cs .)"
      listed="$(jq -c --argjson panes "$panes" \
        '.spaces += [{id: "sp-fake", name: "fake", tabs: [{id: "tb-fake", name: "fake", terminals: $panes}]}]' <<<"$listed")"
    fi
    printf '%s\n' "$listed" ;;
  "do space.new")
    folder="$(jq -rn '$ARGS.positional as $a | ($a | index("--folder")) as $i | if $i == null then "" else $a[$i + 1] end' --args -- "$@")"
    jq -cn --arg folder "$folder" --arg t "${FAKE_NEW_TERMINAL:-t20}" \
      '{id: "sp-new", name: "made", folder: $folder, machine: null, active: false,
        tabs: [{id: "tb-new", name: "1", active: true, settled: false,
                terminals: [{terminal: $t, pane: "p-new", status: null, app: null, name: null, sub_agents: []}]}]}' >> "$FAKE_DIR/made.jsonl"
    printf '{"space":"sp-new","tab":"tb-new","terminal":"%s"}\n' "${FAKE_NEW_TERMINAL:-t20}" ;;
  "do tab.new")
    if [ -z "${FAKE_TAB_SIZE:-}" ]; then
      printf '{"space":"sp-own","tab":"tb-made","terminal":"%s"}\n' "${FAKE_NEW_TERMINAL:-t21}"
      exit 0
    fi
    tabs=$(( $(cat "$FAKE_DIR/tabs" 2>/dev/null || echo 0) + 1 ))
    printf '%s\n' "$tabs" > "$FAKE_DIR/tabs"
    address="$(next_address)"
    sized "$address" "${FAKE_TAB_SIZE% *}" "${FAKE_TAB_SIZE#* }"
    printf '{"space":"sp-own","tab":"tb-made-%s","terminal":"%s"}\n' "$tabs" "$address" ;;
  "do pane.focus")
    focused="$(option --terminal "$@")"
    [ -z "$focused" ] || printf '%s\n' "$focused" > "$FAKE_DIR/focused"
    printf '{"ok":true}\n' ;;
  "do terminal.open")
    address="$(split_off "$(cat "$FAKE_DIR/focused")" "$(option --place "$@")" "$(next_address)")"
    printf '{"pane":"p-%s","terminal":"%s"}\n' "$address" "$address" ;;
  "do pane.split")
    [ -z "${FAKE_SPLIT_FAILS:-}" ] || exit 1
    pane="$(option --pane "$@")"
    address="$(split_off "${pane#p-}" "$(option --direction "$@")" "${FAKE_SPLIT_ADDRESS:-$(next_address)}")"
    printf '{"pane":"p-%s","terminal":"%s"}\n' "$address" "$address" ;;
  "status ")
    if [ -f "$FAKE_DIR/status.json" ]; then cat "$FAKE_DIR/status.json"; else printf '{"tab":"tb-own","focused_pane":"p-t5"}\n'; fi ;;
  "do "*) printf '{"ok":true}\n' ;;
esac
exit 0
SH
  chmod +x "$FORGE_HC" "$FORGE_HERDR_APP"
}

# Forgets the calls, and what the fakes made: the terminals they sized, their address and tab counters, the focus.
fakes_reset() {
  local address
  : > "$FAKE_CALLS"
  if [ -f "$FAKE_DIR/generated" ]; then
    while IFS= read -r address; do rm -f "$FAKE_DIR/terminals/$address.json"; done < "$FAKE_DIR/generated"
    rm -f "$FAKE_DIR/generated"
  fi
  rm -f "$FAKE_DIR/next" "$FAKE_DIR/tabs" "$FAKE_DIR/focused" "$FAKE_DIR/status.json"
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
