#!/usr/bin/env bash
# Stop, for an agent hooks/agent-dispatch.sh started in a herdr pane (FORGE_REPORT_TO is set in its pane): while it has
# never sent its "Report from" report to the session that dispatched it, a turn that ends is followed by one reminder
# that a reply typed in its pane reaches nobody. A finished agent then reports; one waiting for agents of its own ends
# the turn again. The turn that sends the report ends with a clear "done" message in the pane and a "✓ done" pane
# title in herdr, so the user knows it can be closed; talking to it afterwards brings neither again.
set -euo pipefail

readonly TRANSCRIPT_TAIL=5000
readonly REPORT_PREFIX="Report from"
readonly DONE_TITLE_PREFIX="✓ done ·"

[ -n "${FORGE_REPORT_TO:-}" ] || exit 0
input="$(cat)"
[ "$(printf '%s' "$input" | jq -r '.stop_hook_active // false')" != true ] || exit 0
transcript="$(printf '%s' "$input" | jq -r '.transcript_path // empty')"
[ -f "$transcript" ] || exit 0

# "never", "earlier" or "now": when this agent sent its report, if it did. "now" is the turn since the last prompt.
reported="$(tail -n "$TRANSCRIPT_TAIL" "$transcript" | jq -rs --arg to "$FORGE_REPORT_TO" --arg prefix "$REPORT_PREFIX" '
  def is_prompt: .type == "user"
    and ((.message.content | type) == "string" or ([.message.content[]? | .type] | index("tool_result") | not));
  def reports: [.[] | select(.type == "assistant") | .message.content[]?
    | select(.type == "tool_use" and .name == "SendMessage" and .input.to == $to
      and ((.input.message // "") | startswith($prefix)))];
  (to_entries | map(select(.value | is_prompt)) | last | .key // -1) as $start
  | if (.[$start + 1:] | reports | length) > 0 then "now"
    elif (reports | length) > 0 then "earlier"
    else "never" end')"

case "$reported" in
  earlier) exit 0 ;;
  now)
    if [ "${HERDR_ENV:-}" = 1 ] && [ -n "${HERDR_PANE_ID:-}" ]; then
      herdr="${HERDR_BIN_PATH:-herdr}"
      title="$("$herdr" pane get "$HERDR_PANE_ID" | jq -r '.result.pane.label // empty')" || title=""
      case "$title" in
        "$DONE_TITLE_PREFIX"*) ;;
        *) "$herdr" pane rename "$HERDR_PANE_ID" "$DONE_TITLE_PREFIX ${title:-agent}" >/dev/null \
             || printf 'forgerdr: could not mark pane %s done\n' "$HERDR_PANE_ID" >&2 ;;
      esac
    fi
    jq -cn '{systemMessage: "✅ DONE: report delivered to the session that dispatched this agent. You can close this pane now; it stays open only in case you want to ask this agent something."}' ;;
  *)
    jq -cn --arg to "$FORGE_REPORT_TO" --arg prefix "$REPORT_PREFIX" '{decision: "block", reason: ("You were dispatched by another Claude session and have not sent it your report yet: a reply typed in this pane reaches nobody. If your task is done, send your complete final report now with SendMessage to \"" + $to + "\", beginning with the line \"" + $prefix + " <your agent name> (<your task>)\". If you are still waiting for agents of your own, end your turn again.")}' ;;
esac
