#!/usr/bin/env bash
# Stop, for an agent hooks/agent-dispatch.sh started in a herdr pane (FORGE_REPORT_TO is set in its pane): while it has
# never sent its "Report from" report to the session that dispatched it, a turn that ends is followed by one reminder
# that a reply typed in its pane reaches nobody. A finished agent then reports; one waiting for agents of its own ends
# the turn again. Once it has reported, talking to it in its pane brings no reminder.
set -euo pipefail

readonly TRANSCRIPT_TAIL=5000
readonly REPORT_PREFIX="Report from"

[ -n "${FORGE_REPORT_TO:-}" ] || exit 0
input="$(cat)"
[ "$(printf '%s' "$input" | jq -r '.stop_hook_active // false')" != true ] || exit 0
transcript="$(printf '%s' "$input" | jq -r '.transcript_path // empty')"
[ -f "$transcript" ] || exit 0

reported="$(tail -n "$TRANSCRIPT_TAIL" "$transcript" | jq -s --arg to "$FORGE_REPORT_TO" --arg prefix "$REPORT_PREFIX" '
  [.[] | select(.type == "assistant") | .message.content[]?
    | select(.type == "tool_use" and .name == "SendMessage" and .input.to == $to
      and ((.input.message // "") | startswith($prefix)))]
  | length > 0')"
[ "$reported" != true ] || exit 0

jq -cn --arg to "$FORGE_REPORT_TO" --arg prefix "$REPORT_PREFIX" '{decision: "block", reason: ("You were dispatched by another Claude session and have not sent it your report yet: a reply typed in this pane reaches nobody. If your task is done, send your complete final report now with SendMessage to \"" + $to + "\", beginning with the line \"" + $prefix + " <your agent name> (<your task>)\". If you are still waiting for agents of your own, end your turn again.")}'
