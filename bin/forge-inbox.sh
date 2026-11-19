#!/usr/bin/env bash
# The approval inbox (forge_inbox_dir) for the forgerdr mod, which cannot list a folder: what waits in it, and the
# answers the human gives there. hooks/inbox.sh writes each request and turns its answer into Claude Code's decision.
#   list                every request waiting, oldest first, as one JSON array, each as its hook wrote it with any text
#                       over 20000 characters cut, and `cut` saying whether one was, so the mod never offers to
#                       approve what it cannot show whole. A request a day old goes: its hook has given up; so does an
#                       answer whose request is gone. A file that is not a request of the shape its hook writes, or
#                       that names another one, is skipped.
#   answer <id> <json>  the answer to request <id> (one JSON object), for its hook to take or throw away. Fails when
#                       there is no such request.
# shellcheck source-path=SCRIPTDIR/..
set -euo pipefail

plugin_root="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=bin/forge-lib.sh
. "$plugin_root/bin/forge-lib.sh"

inbox="$(forge_inbox_dir)"
readonly DAY_MS=86400000

# A request as the mod reads it, from its file; nothing when it is a day old, and an error when it is not one.
# shellcheck disable=SC2016 # a jq filter
readonly ENTRY_FILTER='
  def text: type == "string";
  def maybe_text: . == null or type == "string";
  def question: type == "object" and (.question | text) and (.header | maybe_text)
    and (.multiSelect == null or (.multiSelect | type) == "boolean") and (.options | type) == "array"
    and all(.options[]; type == "object" and (.label | text) and (.description | maybe_text) and (.preview | maybe_text));
  def request: type == "object" and .id == $id and (.created | type) == "number" and (.terminal | text)
    and (.tool_name | text) and (.tool_input | type) == "object"
    and (.kind | IN("permission", "question", "plan", "gate"))
    and (if .kind == "question" or .kind == "gate" then (.tool_input.questions | type) == "array"
      and all(.tool_input.questions[]; question) else true end);
  if request | not then error("not a request")
  elif $now - .created >= $day then empty
  else ([.. | strings | select(length > 20000)] | length > 0) as $cut
    | walk(if type == "string" and length > 20000 then .[:20000] + "…" else . end) + {cut: $cut} end'

list() {
  local now request id entry answer
  # Made the user's alone when it is made, not on every list: the mod lists on every change in the folder.
  [ -d "$inbox" ] || { mkdir -p "$inbox" && chmod 700 "$inbox"; }
  for answer in "$inbox"/????????????????.answer.json; do
    [ ! -e "$answer" ] || [ -e "${answer%.answer.json}.json" ] || rm -f "$answer"
  done
  now=$(($(date +%s) * 1000))
  for request in "$inbox"/????????????????.json; do
    [ -f "$request" ] && [ ! -L "$request" ] || continue
    id="$(basename "$request" .json)"
    entry="$(jq -c --arg id "$id" --argjson now "$now" --argjson day "$DAY_MS" "$ENTRY_FILTER" "$request" 2>/dev/null)" || continue
    if [ -z "$entry" ]; then rm -f "$request"; else printf '%s\n' "$entry"; fi
  done | jq -cs 'sort_by(.created)'
}

answer() {
  local id="${1:-}" json="${2:-}"
  [[ "$id" =~ ^[0-9a-f]{16}$ ]] && [ -f "$inbox/$id.json" ] || forge_die "no request $id waits in the inbox"
  jq -se 'length == 1 and (.[0] | type) == "object"' <<<"$json" >/dev/null 2>&1 || forge_die "an answer is one JSON object: $json"
  printf '%s' "$json" > "$inbox/$id.answer.tmp"
  mv "$inbox/$id.answer.tmp" "$inbox/$id.answer.json"
  jq -cn --arg id "$id" '{answered: $id}'
}

case "${1:-}" in
  list) list ;;
  answer) answer "${2:-}" "${3:-}" ;;
  *) forge_die "usage: forge-inbox.sh list | answer <id> <json>" ;;
esac
