#!/usr/bin/env bash
# The forge floor's flows (forge_flows_dir): the flow of the item a Claude session works, in a file named for the herdr
# terminal it runs in, which only that session writes. The forgerdr skills report what only they know, the hooks what
# they see (hooks/flow.sh, hooks/agent-dispatch.sh), and the forgerdr mod lists them. Outside herdr, and in an agent
# forgerdr dispatched (FORGE_PARENT_TERMINAL), it writes nothing. The cells and what reports them: references/flows.md.
#   start <auto|manual> <feature|bug|content|change> <key> <title...>
#                       names the item once its brief knows it; a flow of another key starts afresh.
#   stage <cell> <running|waiting|done|failed|skipped>
#                       a cell's state. Running launches it, counted, unless it already runs (the hook counted the
#                       command that launched it), and closes the cell that ran before it as done.
#   task <n> <of> <red|green|reviewed> [name]
#                       a build task's mark, and the name of the test it is on.
#   pr <number> <url>   the item's pull request.
#   launch <command> [args...]
#                       /forgerdr:<command> typed in the session: a work item launches its flow's brief with --auto, its
#                       workitem cell without, in that mode; an item's step launches its cell; either starts the flow
#                       when there is none, or when FORGE_SESSION_ID names another Claude session than the flow's (a
#                       new session in the same terminal works another item); anything else is not a cell.
#   review <agent-type> a reviewing agent dispatched: counted on the review cell.
#   list                every flow, oldest first, as one JSON array; a file that is not a flow, or names another
#                       terminal, is skipped, and a flow a week untouched goes.
# shellcheck source-path=SCRIPTDIR/..
# shellcheck disable=SC2016 # jq filters, in single quotes
set -euo pipefail

plugin_root="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=bin/forge-lib.sh
. "$plugin_root/bin/forge-lib.sh"

flows="$(forge_flows_dir)"
readonly MODES=(auto manual)
readonly TYPES=(feature bug content change)
readonly STATES=(running waiting "done" failed skipped)
readonly CELLS=(workitem brief reproduce root-cause proposal fix spec research debug plan build review security ship verdict comment)
readonly MARKS=(red green reviewed)
# The forgerdr commands that launch the cell of their own name.
readonly STEPS=(spec research debug plan build security ship)
readonly REVIEW_AGENTS=(forgerdr:reviewer forgerdr:security-auditor forgerdr:security-verifier)
readonly TERMINAL_PATTERN='^[A-Za-z0-9_-]{1,64}$'
readonly TASKS_MAX=99
readonly TITLE_MAX=120
readonly WEEK_MS=604800000

# Whether $1 is, whole, one of the words after it.
one_of() {
  local word="$1" each
  shift
  for each in "$@"; do [ "$word" != "$each" ] || return 0; done
  return 1
}

# The jq list of a set of words, for the list's checks.
json_words() {
  jq -cn '$ARGS.positional' --args -- "$@"
}

# The flow file of this session's terminal, or nothing when this session keeps no flow.
own_flow() {
  local terminal="${HC_TERMINAL_ID:-}"
  [ -n "$terminal" ] && [ -z "${FORGE_PARENT_TERMINAL:-}" ] || return 0
  [[ "$terminal" =~ $TERMINAL_PATTERN ]] || forge_die "not a herdr terminal id: $terminal"
  printf '%s/%s.json\n' "$flows" "$terminal"
}

# A flow as jq makes it, and how a cell is launched: the cells that ran or waited at their gate before it are over.
readonly FLOW_DEFS='
  def fresh($mode): {v: 1, terminal: $terminal, session: $session, mode: $mode, type: "", key: "", title: $title,
    repo: $repo, cwd: $cwd, created: $now, cells: {}};
  def same_session: if . == null or $session == "" or (.session // "") == "" or .session == $session then .
    else null end;
  def own_session: if $session == "" then . else .session = $session end;
  def launch($cell): .cells |= with_entries(if .value.state | IN("running", "waiting") then .value.state = "done"
      else . end)
    | .cells[$cell] = {state: "running", runs: ((.cells[$cell].runs // 0) + 1), at: $now};
  def run($cell): if .cells[$cell].state == "running" then . else launch($cell) end;'

# Applies a jq filter to this session's flow (null when it has none) and keeps the result, atomically, under its lock;
# a filter that answers null keeps nothing.
change() {
  local file="$1" filter="$2"
  shift 2
  [ -d "$flows" ] || { mkdir -p "$flows" && chmod 700 "$flows"; }
  forge_locked "$file" rewrite "$file" "$filter" "$@"
}

# Runs under the lock, where set -e does not reach: every failure is returned. A flow file that is not JSON is
# replaced, so one bad write never keeps the item's reports out for good. Times are in milliseconds, so two reports a
# moment apart keep their order.
rewrite() {
  local file="$1" filter="$2" current=null repo now
  shift 2
  if [ -f "$file" ]; then
    current="$(cat "$file")" || return 1
    if ! jq -e 'type == "object"' <<<"$current" >/dev/null 2>&1; then
      printf 'forgerdr: %s was not a flow; it starts afresh\n' "$file" >&2
      current=null
    fi
  fi
  repo="$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null || true)"
  now="$(jq -n 'now * 1000 | floor')" || return 1
  if ! jq -c --argjson now "$now" --arg terminal "$(basename "$file" .json)" --arg repo "$repo" --arg cwd "$PWD" \
    --arg session "${FORGE_SESSION_ID:-}" "$@" \
    "$FLOW_DEFS ($filter) | if . == null then empty else .updated = \$now end" <<<"$current" > "$file.tmp"; then
    rm -f "$file.tmp"
    printf 'forgerdr: %s was not changed\n' "$file" >&2
    return 1
  fi
  if [ -s "$file.tmp" ]; then mv "$file.tmp" "$file"; else rm -f "$file.tmp"; fi
}

# The title as kept: one line, cut by characters, not bytes.
title_of() {
  jq -rn --arg title "$*" --argjson max "$TITLE_MAX" '$title | gsub("[\\n\\r\\t]"; " ") | .[:$max]'
}

start() {
  local mode="${1:-}" type="${2:-}" key="${3:-}" file
  if ! { one_of "$mode" "${MODES[@]}" && one_of "$type" "${TYPES[@]}" && [ -n "$key" ] && [ $# -ge 4 ]; }; then
    forge_die "usage: forge-flow.sh start <auto|manual> <feature|bug|content|change> <key> <title...>"
  fi
  file="$(own_flow)"
  [ -n "$file" ] || return 0
  change "$file" \
    'if . == null or (.key != "" and .key != $key) then fresh($mode) else . end
      | .mode = $mode | .type = $type | .key = $key | .title = $title' \
    --arg mode "$mode" --arg type "$type" --arg key "$key" --arg title "$(title_of "${@:4}")"
}

stage() {
  local cell="${1:-}" state="${2:-}" file
  if ! { one_of "$cell" "${CELLS[@]}" && one_of "$state" "${STATES[@]}"; }; then
    forge_die "usage: forge-flow.sh stage <cell> <running|waiting|done|failed|skipped>; cells: ${CELLS[*]}"
  fi
  file="$(own_flow)"
  [ -n "$file" ] || return 0
  change "$file" \
    'if . == null then null
      elif $state == "running" then run($cell)
      else .cells[$cell] = {state: $state, at: $now,
        runs: ((.cells[$cell].runs // 0) | if . == 0 and $state != "skipped" then 1 else . end)} end' \
    --arg cell "$cell" --arg state "$state" --arg title ""
}

task() {
  local number="${1:-}" of="${2:-}" mark="${3:-}" name="${4:-}" file
  if ! { [[ "$number" =~ ^[0-9]+$ && "$of" =~ ^[0-9]+$ ]] && [ "$number" -ge 1 ] && [ "$number" -le "$of" ] &&
    [ "$of" -le "$TASKS_MAX" ] && one_of "$mark" "${MARKS[@]}"; }; then
    forge_die "usage: forge-flow.sh task <n> <of> <red|green|reviewed> [name], 1 <= n <= of <= $TASKS_MAX"
  fi
  file="$(own_flow)"
  [ -n "$file" ] || return 0
  change "$file" \
    'if . == null then null
      else .tasks.of = $of | .tasks.marks = ((.tasks.marks // []) | .[$number - 1] = $mark | .[:$of])
        | if $mark != "red" then . elif $name == "" then del(.tasks.name) else .tasks.name = $name end end' \
    --argjson number "$number" --argjson of "$of" --arg mark "$mark" --arg name "$(title_of "$name")" --arg title ""
}

pr() {
  local number="${1:-}" url="${2:-}" file
  [[ "$number" =~ ^[0-9]+$ && "$url" =~ ^https://[^[:space:]]+$ ]] || forge_die "usage: forge-flow.sh pr <number> <https url>"
  file="$(own_flow)"
  [ -n "$file" ] || return 0
  change "$file" 'if . == null then null else .pr = {number: $number, url: $url} end' \
    --argjson number "$number" --arg url "$url" --arg title ""
}

launch() {
  local command="${1:-}" file mode=manual cell title
  [ -n "$command" ] || forge_die "usage: forge-flow.sh launch <command> [args...]"
  shift
  file="$(own_flow)"
  [ -n "$file" ] || return 0
  title="$(title_of "${FORGE_SESSION_TITLE:-$*}")"
  if [ "$command" = workitem ]; then
    cell=workitem
    if [[ " $* " == *" --auto "* ]]; then mode=auto cell=brief; fi
    [ -n "${FORGE_SESSION_TITLE:-}" ] || title="$(title_of "$(printf ' %s ' "$*" | sed 's/ --auto / /g')")"
    change "$file" \
      'same_session | (. // fresh($mode)) | own_session | .mode = $mode
        | (if .title == "" then .title = $title else . end) | launch($cell)' \
      --arg mode "$mode" --arg cell "$cell" --arg title "$title"
  elif one_of "$command" "${STEPS[@]}"; then
    change "$file" 'same_session | (. // fresh("manual")) | own_session | launch($cell)' \
      --arg cell "$command" --arg title "$title"
  fi
}

review() {
  local type="${1:-}" file
  one_of "$type" "${REVIEW_AGENTS[@]}" || return 0
  file="$(own_flow)"
  [ -n "$file" ] || return 0
  change "$file" \
    'if . == null then null else .cells.review = {state: "done", runs: ((.cells.review.runs // 0) + 1), at: $now} end' \
    --arg title ""
}

# A flow as the mod reads it, from its file; nothing when it is a week untouched, and an error when it is not one.
readonly ENTRY_FILTER='
  def text: type == "string";
  def number: type == "number";
  def cell: type == "object" and (.state | IN($states[])) and (.runs | number) and (.at | number);
  def tasks: . == null or (type == "object" and (.of | number and . >= 1 and . <= $tasks_max and floor == .)
    and (.marks | type) == "array" and (.marks | length) <= .of
    and all(.marks[]; . == null or IN($marks[])) and (.name == null or (.name | text)));
  def pr: . == null or (type == "object" and (.number | number) and (.url | text));
  def flow: type == "object" and .v == 1 and .terminal == $terminal and (.mode | IN($modes[]))
    and (.type == "" or (.type | IN($types[]))) and (.key | text) and (.title | text) and (.repo | text)
    and (.cwd | text) and (.session == null or (.session | text)) and (.created | number) and (.updated | number)
    and (.cells | type) == "object"
    and all(.cells | to_entries[]; (.key | IN($cells[])) and (.value | cell)) and (.tasks | tasks) and (.pr | pr);
  if flow | not then error("not a flow") elif $now - .updated >= $week then empty else . end'

list() {
  local now file terminal entry modes types states cells marks
  [ -d "$flows" ] || { mkdir -p "$flows" && chmod 700 "$flows"; }
  now=$(($(date +%s) * 1000))
  modes="$(json_words "${MODES[@]}")" types="$(json_words "${TYPES[@]}")" states="$(json_words "${STATES[@]}")"
  cells="$(json_words "${CELLS[@]}")" marks="$(json_words "${MARKS[@]}")"
  for file in "$flows"/*.json; do
    [ -f "$file" ] && [ ! -L "$file" ] || continue
    terminal="$(basename "$file" .json)"
    [[ "$terminal" =~ $TERMINAL_PATTERN ]] || continue
    if ! entry="$(jq -c --arg terminal "$terminal" --argjson now "$now" --argjson week "$WEEK_MS" \
      --argjson modes "$modes" --argjson types "$types" --argjson states "$states" --argjson cells "$cells" \
      --argjson marks "$marks" --argjson tasks_max "$TASKS_MAX" "$ENTRY_FILTER" "$file" 2>/dev/null)"; then
      printf 'forgerdr: skipped %s: not a flow of terminal %s\n' "$file" "$terminal" >&2
      continue
    fi
    if [ -z "$entry" ]; then rm -f "$file"; else printf '%s\n' "$entry"; fi
  done | jq -cs 'sort_by(.created)'
}

command="${1:-}"
[ $# -eq 0 ] || shift
case "$command" in
  start) start "$@" ;;
  stage) stage "$@" ;;
  task) task "$@" ;;
  pr) pr "$@" ;;
  launch) launch "$@" ;;
  review) review "$@" ;;
  list) list ;;
  *) forge_die "usage: forge-flow.sh start | stage | task | pr | launch | review | list" ;;
esac
