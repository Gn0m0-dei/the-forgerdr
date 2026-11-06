#!/usr/bin/env bash
# Stop, for an agent hooks/agent-dispatch.sh started in a herdr pane (FORGE_REPORT_TO is set in its pane): when a turn
# ends without a SendMessage to the session that dispatched it, the agent is reminded once that a reply typed in its
# pane reaches nobody. A finished agent then sends its report; one waiting for agents of its own ends the turn again.
set -euo pipefail

[ -n "${FORGE_REPORT_TO:-}" ] || exit 0
input="$(cat)"
[ "$(printf '%s' "$input" | jq -r '.stop_hook_active // false')" != true ] || exit 0
transcript="$(printf '%s' "$input" | jq -r '.transcript_path // empty')"
[ -f "$transcript" ] || exit 0

# Entries since the last prompt (a user entry that is not a tool result): did one of them send to the dispatcher?
reported="$(tail -n 2000 "$transcript" | jq -s --arg to "$FORGE_REPORT_TO" '
  def is_prompt: .type == "user"
    and ((.message.content | type) == "string" or ([.message.content[]? | .type] | index("tool_result") | not));
  (to_entries | map(select(.value | is_prompt)) | last | .key // -1) as $start
  | [.[$start + 1:][] | select(.type == "assistant") | .message.content[]?
      | select(.type == "tool_use" and .name == "SendMessage" and .input.to == $to)]
  | length > 0')"
[ "$reported" != true ] || exit 0

jq -cn --arg to "$FORGE_REPORT_TO" '{decision: "block", reason: ("You were dispatched by another Claude session and this turn sent it nothing: a reply typed in this pane reaches nobody. If your task is done, send your complete final report now with SendMessage to \"" + $to + "\", beginning with the line \"Report from <your agent name> (<your task>)\". If you are still waiting for agents of your own, end your turn again.")}'
