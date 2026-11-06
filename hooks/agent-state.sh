#!/usr/bin/env bash
# Hooks of an agent hooks/agent-dispatch.sh started in a herdr pane (FORGE_REPORT_TO and FORGE_AGENT_RECORD are set in
# its pane). Its current task starts at the last message that gave it one: its first prompt, or a later message from
# the session that dispatched it (hooks/agent-message.sh). Its pane label follows it:
#   session  SessionStart: records its Claude session, its message address and its pane, so it can be reached and resumed.
#   prompt   UserPromptSubmit: "▶ working · <task>".
#   ask      PermissionRequest, and PreToolUse for AskUserQuestion: "⏸ waiting · <task>" until it works again.
#   stop     Stop: while the task has no "Report from" report to the session that dispatched it, one reminder that a
#            reply typed in its pane reaches nobody; an agent that ends its turn again (waiting for agents of its own or
#            for an answer) is "⏸ waiting". The turn that sends the report ends with a "done" message in the pane and the
#            label "✓ done · <task>"; a question typed in its pane afterwards brings neither again.
# shellcheck source-path=SCRIPTDIR/..
set -euo pipefail

plugin_root="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
# shellcheck source=herdr/bin/forge-lib.sh
. "$plugin_root/herdr/bin/forge-lib.sh"

readonly TRANSCRIPT_TAIL=5000
# How long a waiting agent is watched for herdr to see it blocked on the question, then working again.
readonly BLOCKED_WAIT_MS=15000
readonly WORKING_WAIT_MS=3600000

record="${FORGE_AGENT_RECORD:-}"
in_herdr() { [ "${HERDR_ENV:-}" = 1 ] && [ -n "$record" ] && [ -f "$record" ]; }

# Back to working once herdr sees the agent take up its work again after a question, unless its state moved on.
watch() {
  local name
  name="$(jq -r .name "$record")"
  forge_herdr agent wait "$name" --until blocked --timeout "$BLOCKED_WAIT_MS" >/dev/null 2>&1 || true
  forge_herdr agent wait "$name" --until working --timeout "$WORKING_WAIT_MS" >/dev/null 2>&1 || return 0
  [ "$(jq -r .state "$record")" != waiting ] || forge_agent_mark "$record" working
}

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
      if [ "$active" = true ]; then
        ! in_herdr || forge_agent_mark "$record" waiting
      else
        jq -cn --arg to "$FORGE_REPORT_TO" --arg prefix "$FORGE_REPORT_PREFIX" '{decision: "block", reason: ("You were dispatched by another Claude session and have not sent it your report on your current task yet: a reply typed in this pane reaches nobody. If your task is done, send your complete final report now with SendMessage to \"" + $to + "\", beginning with the line \"" + $prefix + " <your agent name> (<your task>)\". If you are still waiting for agents of your own, end your turn again.")}'
      fi ;;
    now)
      ! in_herdr || forge_agent_mark "$record" "done"
      jq -cn '{systemMessage: "✅ DONE: report delivered to the session that dispatched this agent. You can close this pane now; it stays open only in case you want to ask this agent something."}' ;;
    earlier) ! in_herdr || forge_agent_mark "$record" "done" ;;
  esac
}

case "${1:-}" in
  session)
    in_herdr || exit 0
    # shellcheck disable=SC2016 # a jq filter
    forge_json_update "$record" --arg session "$(jq -r '.session_id // empty')" --arg socket "${CLAUDE_CODE_MESSAGING_SOCKET:-}" \
      --arg pane "${HERDR_PANE_ID:-}" '.claude_session = $session | .socket = $socket | .pane = $pane' ;;
  prompt) in_herdr && forge_agent_mark "$record" working || exit 0 ;;
  ask)
    in_herdr || exit 0
    forge_agent_mark "$record" waiting
    # Detached, so the question is not held up; it outlives this hook.
    perl -MPOSIX -e 'exit 0 if fork; POSIX::setsid(); exec @ARGV' "$0" watch </dev/null >/dev/null 2>&1 ;;
  watch) watch ;;
  stop) stop ;;
  *) forge_die "usage: agent-state.sh session|prompt|ask|stop" ;;
esac
