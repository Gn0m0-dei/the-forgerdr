#!/usr/bin/env bash
# Smallest check that fails if agent dispatch breaks: which calls stay in-process and how a dispatched one is started
# (hooks/agent-dispatch.sh), the report reminder (hooks/agent-report.sh) and the agent panes the sweep closes
# (hooks/worktree.sh), against a fake herdr that records its calls. Real herdr and real sessions are run by hand.
# Run: bash test/agent-dispatch.test.sh
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
hook="$root/hooks/agent-dispatch.sh"
sandbox="$(cd "$(mktemp -d)" && pwd -P)"
trap 'rm -rf "$sandbox"' EXIT
# Never the real herdr or the session running this test: every herdr call goes to the fake, and each case sets the
# variables a dispatch needs.
unset HERDR_ENV HERDR_PANE_ID HERDR_TAB_ID HERDR_WORKSPACE_ID HERDR_SOCKET_PATH CLAUDE_CODE_MESSAGING_SOCKET FORGE_CLAUDE_ARGS \
  FORGE_SESSION_TITLE FORGE_REPORT_TO
export HOME="$sandbox/home" XDG_STATE_HOME="$sandbox/state" CLAUDE_PLUGIN_ROOT="$root"
export HERDR_BIN_PATH="$sandbox/herdr" FAKE_HERDR_CALLS="$sandbox/herdr-calls"
mkdir -p "$HOME"
state="$XDG_STATE_HOME/forgerdr/worktrees"
calls="$sandbox/herdr-calls"
: > "$calls"

cat > "$sandbox/herdr" <<'SH'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "$FAKE_HERDR_CALLS"
case "$1 $2" in
  "pane split") printf '{"result":{"pane":{"pane_id":"w1:p7"}}}\n' ;;
  "pane list") printf '{"result":{"panes":[{"pane_id":"w1:p1"},{"pane_id":"w1:p7"}]}}\n' ;;
  "pane layout")
    case "$4" in
      w1:p1|w1:p7|w1:p8|w1:p9|w1:p10) printf '{"result":{"layout":{"panes":[{"pane_id":"w1:p1","rect":{"width":391,"height":74}},{"pane_id":"w1:p7","rect":{"width":97,"height":74}},{"pane_id":"w1:p8","rect":{"width":195,"height":74}},{"pane_id":"w1:p9","rect":{"width":97,"height":37}}]}}}\n' ;;
      *) printf '{"error":{"code":"pane_not_found"}}\n' >&2; exit 1 ;;
    esac ;;
  "agent prompt") [ -z "${FAKE_FAIL_PROMPT:-}" ] || { printf '{"error":{"code":"agent_not_found"}}\n' >&2; exit 1; } ;;
  "tab create") printf '{"result":{"tab":{"tab_id":"w1:t5"},"root_pane":{"pane_id":"w1:p10"}}}\n' ;;
  "agent list") printf '{"result":{"agents":[{"name":"agent-done","pane_id":"w1:p2","agent_status":"idle"},{"name":"agent-busy","pane_id":"w1:p3","agent_status":"working"},{"name":"someone-else","pane_id":"w1:p4","agent_status":"idle"}]}}\n' ;;
  "pane get") printf '{"result":{"pane":{"pane_id":"w1:p7","label":"Probe task"}}}\n' ;;
  "agent read") printf 'ready\n' ;;
  *) printf '{"result":{}}\n' ;;
esac
SH
chmod +x "$sandbox/herdr"

failures=0
expect() {
  if [ "$2" = "$3" ]; then printf 'ok   %s\n' "$1"; else printf 'FAIL %s\n  expected: %s\n  actual:   %s\n' "$1" "$2" "$3"; failures=$((failures + 1)); fi
}
contains() { case "$1" in *"$2"*) echo yes ;; *) echo no ;; esac; }
call() {
  jq -cn --arg type "$1" --arg isolation "${2:-}" --arg mode "${3:-}" --arg cwd "$sandbox" --arg transcript "${TRANSCRIPT:-}" \
    '{session_id:"s1",cwd:$cwd,transcript_path:$transcript,permission_mode:$mode,tool_name:"Agent",tool_input:{subagent_type:$type,description:"Probe task",prompt:"Do the task.",isolation:$isolation}}' \
    | bash "$hook"
}
decision() { call "$@" | jq -r '.hookSpecificOutput.permissionDecision // empty'; }
in_herdr() {
  HERDR_ENV=1 HERDR_PANE_ID=w1:p1 HERDR_WORKSPACE_ID=w1 HERDR_BIN_PATH="$sandbox/herdr" \
    CLAUDE_CODE_MESSAGING_SOCKET=/tmp/cc-socks/42.sock FAKE_HERDR_CALLS="$calls" "$@"
}
logged() { grep -q -- "$1" "$state/dispatch.log" && echo yes || echo no; }

expect "outside herdr the subagent stays in-process" "" "$(decision general-purpose)"
expect "a fork stays in-process" "" "$(in_herdr decision fork)"
expect "and says why" yes "$(logged "a fork inherits")"
expect "a type with no definition exits cleanly" 0 "$(in_herdr call statusline-setup >/dev/null; echo $?)"
expect "and says why" yes "$(logged "statusline-setup has no definition")"
expect "a type that is a path is refused" "" "$(in_herdr decision ../../notes)"
expect "and says why" yes "$(logged "unexpected agent type: ../../notes")"
expect "no messaging socket, in-process" "" "$(HERDR_ENV=1 HERDR_PANE_ID=w1:p1 HERDR_WORKSPACE_ID=w1 decision general-purpose)"

: > "$calls"
printf '%s\n' '{"type":"assistant","message":{"model":"claude-haiku-5-5"}}' '{"type":"assistant","message":{"model":"<synthetic>"}}' > "$sandbox/transcript.jsonl"
expect "general-purpose is dispatched to herdr" deny "$(TRANSCRIPT="$sandbox/transcript.jsonl" in_herdr decision general-purpose "" plan)"
expect "first agent pane splits this session to the right" yes "$(grep -q 'pane split w1:p1 --direction right' "$calls" && echo yes)"
start="$(cat "$calls")"
expect "plain general-purpose session" no "$(contains "$start" "--tools ")"
expect "the session's model, never a synthetic one" yes "$(contains "$start" "--model claude-haiku-5-5")"
expect "the session's permission mode" yes "$(contains "$start" "--permission-mode plan")"
expect "the message opens with a fixed header" yes "$(contains "$start" "Task from the Claude session that dispatched you")"
expect "the message carries the report address" yes "$(contains "$start" "uds:/tmp/cc-socks/42.sock")"
expect "pane recorded for the session" 1 "$(wc -l < "$state/s1.panes" | tr -d ' ')"

: > "$calls"
in_herdr decision forgerdr:reviewer >/dev/null
start="$(cat "$calls")"
expect "next agent stacks below the last one" yes "$(contains "$start" "pane split w1:p7 --direction down")"
expect "reviewer gets its definition in a file" yes "$(grep -q -- "--append-system-prompt-file $state/s1\.prompt\.[A-Za-z0-9]*" "$calls" && grep -q "You review a diff" "$state"/s1.prompt.* && echo yes)"
expect "reviewer keeps its tool list" yes "$(contains "$start" "--tools Read,Grep,Glob,Bash,SendMessage,ToolSearch")"
expect "reviewer gets no MCP servers" yes "$(contains "$start" "--strict-mcp-config")"

: > "$calls"
in_herdr decision forgerdr:researcher >/dev/null
expect "researcher gets no Bash" yes "$(contains "$(cat "$calls")" "--tools WebSearch,WebFetch,Read,Grep,Glob,SendMessage,ToolSearch")"

printf 'w1:p8\tagent-x\n' >> "$state/s1.panes"
: > "$calls"
in_herdr decision general-purpose >/dev/null
expect "the largest agent pane is split along its longer side" yes "$(grep -q 'pane split w1:p8 --direction right' "$calls" && echo yes)"

printf 'w1:p9\tagent-small\n' > "$state/s1.panes"
: > "$calls"
expect "a full set of agent panes opens a tab of agents" deny "$(in_herdr decision general-purpose)"
expect "the tab is created in this workspace, without focus" yes "$(grep -q -- "tab create --workspace w1 .*--label agents · $(basename "$sandbox") " "$calls" && grep -q -- 'tab create .*--no-focus' "$calls" && echo yes)"
expect "no pane is split for it" no "$(grep -q 'pane split' "$calls" && echo yes || echo no)"
expect "its root pane holds the agent" yes "$(grep -q 'agent start .* --pane w1:p10' "$calls" && echo yes)"

: > "$calls"
in_herdr decision Explore >/dev/null
expect "Explore is read-only" yes "$(grep -q -- '--disallowedTools Edit,Write,NotebookEdit,MultiEdit' "$calls" && echo yes)"

reason="$(in_herdr call general-purpose | jq -r '.hookSpecificOutput.permissionDecisionReason')"
expect "the reason says it is not an error" yes "$(contains "$reason" "Not an error:")"

printf 'w1:p9\tagent-small\n' > "$state/s1.panes"
: > "$calls"
expect "a dispatch that fails after opening a tab stays in-process" "" "$(FAKE_FAIL_PROMPT=1 in_herdr decision general-purpose)"
expect "and closes that tab" yes "$(grep -q 'tab close w1:t5' "$calls" && echo yes)"
expect "and forgets its pane" no "$(grep -q 'w1:p10' "$state/s1.panes" && echo yes || echo no)"

printf 'w1:p2\tagent-dead\n' > "$state/s1.panes"
: > "$calls"
in_herdr decision general-purpose >/dev/null
expect "a dead agent pane is ignored and the session pane is halved" yes "$(grep -q 'pane split w1:p1 --direction right' "$calls" && echo yes)"

rm -f "$state/s1.panes"
expect "an unreadable layout stays in-process" "" "$(HERDR_ENV=1 HERDR_PANE_ID=w1:pZ HERDR_WORKSPACE_ID=w1 CLAUDE_CODE_MESSAGING_SOCKET=/tmp/cc-socks/42.sock decision general-purpose)"
expect "and says why" yes "$(logged "could not read the size of w1:pZ")"

report_hook="$root/hooks/agent-report.sh"
to="uds:/tmp/cc-socks/42.sock"
prompt_line='{"type":"user","message":{"content":"Do the task."}}'
report_line='{"type":"assistant","message":{"content":[{"type":"tool_use","name":"SendMessage","input":{"to":"uds:/tmp/cc-socks/42.sock","message":"Report from agent-1 (task)\nDone."}}]}}'
question_line='{"type":"assistant","message":{"content":[{"type":"tool_use","name":"SendMessage","input":{"to":"uds:/tmp/cc-socks/42.sock","message":"Which file?"}}]}}'
text_line='{"type":"assistant","message":{"content":[{"type":"text","text":"Done."}]}}'
stop() { printf '%s\n' "$@" > "$sandbox/t.jsonl"; jq -cn --arg t "$sandbox/t.jsonl" '{transcript_path:$t,stop_hook_active:false}' | FORGE_REPORT_TO="$to" bash "$report_hook" | jq -r '.decision // empty'; }
printf '%s\n' '{"type":"user","message":{"content":"Hi."}}' > "$sandbox/plain.jsonl"
expect "a non-dispatched session is never reminded" "" "$(jq -cn --arg t "$sandbox/plain.jsonl" '{transcript_path:$t,stop_hook_active:false}' | bash "$report_hook")"
expect "an agent that has not reported is reminded" block "$(stop "$prompt_line" "$text_line")"
expect "a question is not a report" block "$(stop "$prompt_line" "$question_line" "$text_line")"
expect "an agent that reported is not" "" "$(stop "$prompt_line" "$report_line" "$text_line")"
expect "nor later, when the user talks to it in its pane" "" "$(stop "$prompt_line" "$report_line" "$prompt_line" "$text_line")"
expect "the reminder is given once" "" "$(jq -cn --arg t "$sandbox/t.jsonl" '{transcript_path:$t,stop_hook_active:true}' | FORGE_REPORT_TO="$to" bash "$report_hook")"
stop_json() { printf '%s\n' "$@" > "$sandbox/t.jsonl"; jq -cn --arg t "$sandbox/t.jsonl" '{transcript_path:$t,stop_hook_active:false}' | FORGE_REPORT_TO="$to" bash "$report_hook"; }
printf '%s\n' "$prompt_line" "$report_line" "$text_line" > "$sandbox/t.jsonl"
: > "$calls"
jq -cn --arg t "$sandbox/t.jsonl" '{transcript_path:$t,stop_hook_active:false}' \
  | in_herdr env HERDR_PANE_ID=w1:p7 FORGE_REPORT_TO="$to" bash "$report_hook" >/dev/null
expect "the pane title shows the agent is done" yes "$(grep -q 'pane rename w1:p7 ✓ done · Probe task' "$calls" && echo yes)"
expect "the turn that reports says the agent can be closed" yes "$(contains "$(stop_json "$prompt_line" "$report_line" "$text_line" | jq -r '.systemMessage // empty')" "DONE")"
expect "a later turn does not repeat it" "" "$(stop_json "$prompt_line" "$report_line" "$prompt_line" "$text_line")"

printf 'w1:p2\tagent-done\nw1:p3\tagent-busy\nw1:p4\tagent-gone\n' > "$state/s9.panes"
: > "$calls"
in_herdr bash "$root/hooks/worktree.sh" sweep-session s9 "$sandbox"
expect "sweep closes a done agent's pane" yes "$(grep -q 'pane close w1:p2' "$calls" && echo yes)"
expect "sweep leaves an agent at work" no "$(grep -q 'pane close w1:p3' "$calls" && echo yes || echo no)"
expect "sweep leaves a pane its agent left" no "$(grep -q 'pane close w1:p4' "$calls" && echo yes || echo no)"
expect "sweep drops the session's agent panes" no "$([ -f "$state/s9.panes" ] && echo yes || echo no)"

[ "$failures" -eq 0 ] || { printf '%s failure(s)\n' "$failures"; exit 1; }
printf 'all good\n'
