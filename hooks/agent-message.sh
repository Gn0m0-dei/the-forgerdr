#!/usr/bin/env bash
# PreToolUse for SendMessage: inside the herdr app, a message to an agent this session dispatched (hooks/agent-dispatch.sh),
# addressed by its agent name, goes to that agent's session. To an agent that is done it is its next task, worded with the
# same report instructions as its first one and named by the message's summary; to one still on its task (an answer to
# its question), it goes as it is. When the agent's terminal ended, hooks/agent-dispatch.sh reopens it, resuming its
# Claude session, with the message as its task. Any other message is left alone.
# shellcheck source-path=SCRIPTDIR/..
set -euo pipefail

plugin_root="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
# shellcheck source=bin/forge-lib.sh
. "$plugin_root/bin/forge-lib.sh"
state_dir="${XDG_STATE_HOME:-$HOME/.local/state}/forgerdr/worktrees"
# The names forge_agent_name gives an agent; anything else is not one of this session's agents.
readonly AGENT_NAME_PATTERN='^[a-z][a-z0-9_-]{0,31}$'

forge_in_herdr && [ -n "${CLAUDE_CODE_MESSAGING_SOCKET:-}" ] || exit 0
input="$(cat)"
session="$(printf '%s' "$input" | jq -r '.session_id // empty')"
to="$(printf '%s' "$input" | jq -r '.tool_input.to // empty')"
[[ "$to" =~ $AGENT_NAME_PATTERN ]] || exit 0
record="$state_dir/$session.agents/$to.json"
[ -n "$session" ] && [ -f "$record" ] || exit 0

# A reviewing agent given another task counts again on the forge floor's review cell (bin/forge-flow.sh).
review_again() {
  "$plugin_root/bin/forge-flow.sh" review "$(jq -r .type "$record")" || true
}

terminal="$(jq -r '.terminal // empty' "$record")"
if [ -z "$terminal" ] || [ "$(forge_hc get "$terminal" --json 2>/dev/null | jq -r '.state // empty')" != live ]; then
  review_again
  printf '%s' "$input" | FORGE_RESUME_AGENT="$to" "$plugin_root/hooks/agent-dispatch.sh"
  exit 0
fi
socket="$(jq -r '.socket // empty' "$record")"
if [ -z "$socket" ]; then
  jq -cn --arg reason "$to is still starting and has no message address yet. Send the message again in a moment." \
    '{hookSpecificOutput: {hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: $reason}}'
  exit 0
fi

# To a done agent the message is a new task, named by its summary; to one still on its task, part of that task.
message="$(printf '%s' "$input" | jq -r '.tool_input.message // empty')"
if [ "$(jq -r .state "$record")" = "done" ]; then
  review_again
  forge_agent_mark "$record" working "$(printf '%s' "$input" | jq -r '.tool_input.summary // empty | gsub("[[:cntrl:]]+"; " ")')"
  message="$(forge_agent_task "$(jq -r .type "$record")" "$to" "$(jq -r .title "$record")" "$message" \
    "uds:$CLAUDE_CODE_MESSAGING_SOCKET" "$(jq -r '.note // empty' "$record")")"
else
  forge_agent_mark "$record" working
fi
# Auto mode reviews the input Claude wrote, so a changed input needs this hook's own approval to run.
printf '%s' "$input" | jq -c --arg to "uds:$socket" --arg message "$message" '.tool_input
  | .to = $to | .message = $message
  | if has("recipient") then .recipient = $to else . end
  | if has("content") then .content = $message else . end
  | {hookSpecificOutput: {hookEventName: "PreToolUse", permissionDecision: "allow", updatedInput: .}}'
