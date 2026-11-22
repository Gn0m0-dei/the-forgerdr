#!/usr/bin/env bash
# Hooks of an agent hooks/agent-dispatch.sh started in a herdr terminal (FORGE_REPORT_TO and FORGE_AGENT_RECORD are set
# in its environment). Its current task starts at the last message that gave it one: its first prompt, or a later
# message from the session that dispatched it (hooks/agent-message.sh). Its record follows it; the herdr app shows its
# status itself, from what Claude Code reports:
#   session  SessionStart: records its Claude session, its message address and its terminal, so it can be reached and
#            resumed.
#   prompt   UserPromptSubmit: working.
#   stop     Stop: while the task has no "Report from" report to the session that dispatched it, one reminder that a
#            reply typed in its terminal reaches nobody; an agent that ends its turn again (waiting for agents of its own
#            or for an answer) is left alone. The turn that sends the report ends with a "done" message and the record
#            done; a question typed to it afterwards brings neither again.
# shellcheck source-path=SCRIPTDIR/..
set -euo pipefail

plugin_root="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
# shellcheck source=bin/forge-lib.sh
. "$plugin_root/bin/forge-lib.sh"

# A claude -p run started from an agent's Bash carries its FORGE_REPORT_TO and FORGE_AGENT_RECORD, but is not the agent.
forge_attended || exit 0

readonly TRANSCRIPT_TAIL=5000

record="${FORGE_AGENT_RECORD:-}"
dispatched() { [ -n "$record" ] && [ -f "$record" ]; }

# "pending", "now" or "earlier": whether the current task still lacks its report, got it in this turn (since the last
# prompt), or before.
report_state() {
  tail -n "$TRANSCRIPT_TAIL" "$1" | jq -rs --arg to "$FORGE_REPORT_TO" --arg prefix "$FORGE_REPORT_PREFIX" --arg header "$FORGE_TASK_HEADER" '
    def text: .message.content | if type == "string" then . else ([.[]? | select(.type == "text") | .text] | join("\n")) end;
    def is_prompt: .type == "user" and (.isMeta != true or .origin.kind == "peer")
      and ((.message.content | type) == "string" or ([.message.content[]? | .type] | index("tool_result") | not));
    def is_task: is_prompt and ((.origin.from // "") == $to or (text | contains($header)));
    def reports: [.[] | select(.type == "assistant") | .message.content[]?
      | select(.type == "tool_use" and .name == "SendMessage" and .input.to == $to
        and ((.input.message // "") | startswith($prefix)))];
    (to_entries | map(select(.value | is_task)) | last | .key // -1) as $task
    | (to_entries | map(select(.value | is_prompt)) | last | .key // -1) as $turn
    | if (.[$task + 1:] | reports | length) == 0 then "pending"
      elif (.[$turn + 1:] | reports | length) > 0 then "now"
      else "earlier" end'
}

stop() {
  local input transcript active
  [ -n "${FORGE_REPORT_TO:-}" ] || exit 0
  input="$(cat)"
  transcript="$(printf '%s' "$input" | jq -r '.transcript_path // empty')"
  active="$(printf '%s' "$input" | jq -r '.stop_hook_active // false')"
  [ -f "$transcript" ] || exit 0
  case "$(report_state "$transcript")" in
    pending)
      if [ "$active" != true ]; then
        jq -cn --arg to "$FORGE_REPORT_TO" --arg prefix "$FORGE_REPORT_PREFIX" '{decision: "block", reason: ("You were dispatched by another Claude session and have not sent it your report on your current task yet: a reply typed in this terminal reaches nobody. If your task is done, send your complete final report now with SendMessage to \"" + $to + "\", beginning with the line \"" + $prefix + " <your agent name> (<your task>)\". If you are still waiting for agents of your own, end your turn again.")}'
      fi ;;
    now)
      ! dispatched || forge_agent_mark "$record" "done"
      jq -cn '{systemMessage: "✅ DONE: report delivered to the session that dispatched this agent. You can end it now; it stays only in case you want to ask it something."}' ;;
    earlier) ! dispatched || forge_agent_mark "$record" "done" ;;
  esac
}

case "${1:-}" in
  session)
    dispatched || exit 0
    # shellcheck disable=SC2016 # a jq filter
    forge_json_update "$record" --arg session "$(jq -r '.session_id // empty')" --arg socket "${CLAUDE_CODE_MESSAGING_SOCKET:-}" \
      --arg terminal "${HC_TERMINAL_ID:-}" '.claude_session = $session | .socket = $socket | .terminal = (if $terminal == "" then .terminal else $terminal end)' ;;
  prompt) dispatched && forge_agent_mark "$record" working || exit 0 ;;
  stop) stop ;;
  *) forge_die "usage: agent-state.sh session|prompt|stop" ;;
esac
