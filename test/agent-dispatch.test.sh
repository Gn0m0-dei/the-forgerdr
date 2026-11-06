#!/usr/bin/env bash
# Smallest check that fails if agent dispatch breaks: which calls stay in-process and how a dispatched one is started
# (hooks/agent-dispatch.sh), how a later message reaches it or reopens it (hooks/agent-message.sh), its pane label
# and the report reminder (hooks/agent-state.sh), and the agent panes the sweep closes (hooks/worktree.sh), against a
# fake herdr that records its calls. Real herdr and real sessions are run by hand.
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
  "agent wait") exit 1 ;;
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
expect "its pane shows it working on its task" yes "$(grep -q 'pane rename w1:p7 ▶ working · Probe task' "$calls" && echo yes)"
first_agent="$(cut -f2 "$state/s1.panes")"
record="$state/s1.agents/$first_agent.json"
expect "the agent knows its record" yes "$(contains "$start" "--env FORGE_AGENT_RECORD=$record")"
expect "the record keeps what reopening it needs" "general-purpose|Probe task|working|w1:p7|$sandbox|--model claude-haiku-5-5 --permission-mode plan" \
  "$(jq -r '[.type, .title, .state, .pane, .workdir, (.args | join(" "))] | join("|")' "$record")"
expect "the reason says how to give it another task" yes "$(contains "$(TRANSCRIPT="$sandbox/transcript.jsonl" in_herdr call general-purpose | jq -r '.hookSpecificOutput.permissionDecisionReason')" "SendMessage to \"agent-")"
printf 'w1:p7\t%s\n' "$first_agent" > "$state/s1.panes"

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

state_hook="$root/hooks/agent-state.sh"
to="uds:/tmp/cc-socks/42.sock"
task_line='{"type":"user","message":{"content":"Task from the Claude session that dispatched you (general-purpose agent agent-1, \"Probe task\"):\n\nDo the task."}}'
prompt_line='{"type":"user","message":{"content":"What did you change?"}}'
peer_task_line='{"type":"user","isMeta":true,"origin":{"kind":"peer","from":"uds:/tmp/cc-socks/42.sock"},"message":{"content":"Another Claude session sent a message: a second pass."}}'
meta_line='{"type":"user","isMeta":true,"message":{"content":"[Usage limit reached]"}}'
report_line='{"type":"assistant","message":{"content":[{"type":"tool_use","name":"SendMessage","input":{"to":"uds:/tmp/cc-socks/42.sock","message":"Report from agent-1 (task)\nDone."}}]}}'
question_line='{"type":"assistant","message":{"content":[{"type":"tool_use","name":"SendMessage","input":{"to":"uds:/tmp/cc-socks/42.sock","message":"Which file?"}}]}}'
text_line='{"type":"assistant","message":{"content":[{"type":"text","text":"Done."}]}}'
agent_record="$sandbox/agent.json"
new_record() {
  jq -n --arg state "$1" '{name:"agent-1",type:"general-purpose",title:"Probe task",state:$state,pane:"w1:p7",workdir:"/tmp",worktree:"",note:"",claude_session:"",socket:"",args:[]}' > "$agent_record"
}
# Runs the agent hook for an event over a transcript of the given lines, as a dispatched agent in pane w1:p7.
hook() {
  local event="$1" active="$2"
  shift 2
  printf '%s\n' "$@" > "$sandbox/t.jsonl"
  jq -cn --arg t "$sandbox/t.jsonl" --argjson active "$active" '{session_id:"agent-session",transcript_path:$t,stop_hook_active:$active}' \
    | in_herdr env HERDR_PANE_ID=w1:p7 FORGE_REPORT_TO="$to" FORGE_AGENT_RECORD="$agent_record" \
      CLAUDE_CODE_MESSAGING_SOCKET=/tmp/cc-socks/77.sock bash "$state_hook" "$event"
}
stop() { hook stop false "$@" | jq -r '.decision // empty'; }
renamed() { grep -q -- "pane rename w1:p7 $1" "$calls" && echo yes || echo no; }

printf '%s\n' '{"type":"user","message":{"content":"Hi."}}' > "$sandbox/plain.jsonl"
expect "a non-dispatched session is never reminded" "" "$(jq -cn --arg t "$sandbox/plain.jsonl" '{transcript_path:$t,stop_hook_active:false}' | bash "$state_hook" stop)"
new_record working
expect "an agent that has not reported is reminded" block "$(stop "$task_line" "$text_line")"
expect "a question is not a report" block "$(stop "$task_line" "$question_line" "$text_line")"
: > "$calls"
expect "reminded once, it is left waiting" "" "$(hook stop true "$task_line" "$text_line")"
expect "and its pane shows it" yes "$(renamed '⏸ waiting · Probe task')"
: > "$calls"
expect "the turn that reports says the agent can be closed" yes "$(contains "$(hook stop false "$task_line" "$report_line" "$text_line" | jq -r '.systemMessage // empty')" DONE)"
expect "its pane shows it done" yes "$(renamed '✓ done · Probe task')"
expect "and so does its record" "done" "$(jq -r .state "$agent_record")"
: > "$calls"
expect "a question from the user afterwards brings no reminder" "" "$(stop "$task_line" "$report_line" "$prompt_line" "$text_line")"
expect "nor a second done message" "" "$(hook stop false "$task_line" "$report_line" "$prompt_line" "$text_line" | jq -r '.systemMessage // empty')"
expect "a note from Claude Code does not open a turn" yes "$(contains "$(hook stop false "$task_line" "$report_line" "$meta_line" "$text_line" | jq -r '.systemMessage // empty')" DONE)"
expect "a pane already done is not renamed" no "$(renamed '✓ done')"
expect "a new task from the session that dispatched it needs its own report" block "$(stop "$task_line" "$report_line" "$peer_task_line" "$text_line")"
expect "and once reported, it is done again" yes "$(contains "$(hook stop false "$task_line" "$report_line" "$peer_task_line" "$report_line" "$text_line" | jq -r '.systemMessage // empty')" DONE)"

new_record "done"
: > "$calls"
hook prompt false "$task_line" >/dev/null
expect "talked to, a done agent shows it working" yes "$(renamed '▶ working · Probe task')"
: > "$calls"
hook prompt false "$task_line" >/dev/null
expect "an agent already working is not renamed" no "$(renamed '▶ working')"
: > "$calls"
hook ask false "$task_line" >/dev/null
expect "an agent that asks for permission shows it waiting" yes "$(renamed '⏸ waiting · Probe task')"
hook session false "$task_line" >/dev/null
expect "its session, address and pane are recorded when it starts" "agent-session|/tmp/cc-socks/77.sock|w1:p7" \
  "$(jq -r '[.claude_session, .socket, .pane] | join("|")' "$agent_record")"

message_hook="$root/hooks/agent-message.sh"
mkdir -p "$state/s1.agents"
jq -n --arg dir "$sandbox" '{name:"agent-done",type:"forgerdr:reviewer",title:"Review task 1",state:"done",pane:"w1:p2",workdir:$dir,
  worktree:"",note:"",claude_session:"sess-1",socket:"/tmp/cc-socks/77.sock",args:["--model","m1"]}' > "$state/s1.agents/agent-done.json"
send_input() {
  jq -cn --arg to "$1" --arg summary "$2" --arg cwd "$sandbox" \
    '{session_id:"s1",cwd:$cwd,transcript_path:"",permission_mode:"auto",tool_name:"SendMessage",tool_input:{to:$to,summary:$summary,message:"Check the fixes."}}'
}
send() { send_input "$@" | in_herdr bash "$message_hook"; }
expect "a message to any other session is left alone" "" "$(send feature-x-3c "Hello")"
expect "and so is every message outside herdr" "" "$(send_input agent-done "Hello" | bash "$message_hook")"
: > "$calls"
routed="$(send agent-done "Re-review task 1")"
expect "a message to a live agent goes to its session" "uds:/tmp/cc-socks/77.sock|allow" \
  "$(printf '%s' "$routed" | jq -r '[.hookSpecificOutput.updatedInput.to, .hookSpecificOutput.permissionDecision] | join("|")')"
expect "as a task that says where to report" yes \
  "$(contains "$(printf '%s' "$routed" | jq -r .hookSpecificOutput.updatedInput.message)" 'beginning with the line "Report from agent-done (Re-review task 1)"')"
expect "keeping the rest of the call" "Re-review task 1" "$(printf '%s' "$routed" | jq -r .hookSpecificOutput.updatedInput.summary)"
expect "its pane shows the new task" yes "$(grep -q 'pane rename w1:p2 ▶ working · Re-review task 1' "$calls" && echo yes)"
: > "$calls"
answer="$(send agent-done "Use the main branch")"
expect "to an agent still on its task, a message goes as it is" "uds:/tmp/cc-socks/77.sock|Check the fixes." \
  "$(printf '%s' "$answer" | jq -r '[.hookSpecificOutput.updatedInput.to, .hookSpecificOutput.updatedInput.message] | join("|")')"
expect "and its task keeps its name" no "$(grep -q 'pane rename' "$calls" && echo yes || echo no)"

closed="$state/s1.agents/agent-gone.json"
jq -n --arg dir "$sandbox" '{name:"agent-gone",type:"general-purpose",title:"Fix task 1",state:"done",pane:"w1:p4",workdir:$dir,
  worktree:"",note:"",claude_session:"sess-9",socket:"/tmp/cc-socks/78.sock",args:["--model","m1"]}' > "$closed"
rm -f "$state/s1.panes"
: > "$calls"
reopened="$(send agent-gone "Second fix pass")"
expect "a closed agent is reopened instead" deny "$(printf '%s' "$reopened" | jq -r .hookSpecificOutput.permissionDecision)"
expect "and the reason says so" yes "$(contains "$(printf '%s' "$reopened" | jq -r .hookSpecificOutput.permissionDecisionReason)" "reopened")"
expect "resuming its Claude session with its own arguments" yes \
  "$(grep -q -- 'agent start agent-gone --kind claude --pane w1:p7 -- --model m1 --resume sess-9' "$calls" && echo yes)"
expect "with the message as its task" yes "$(grep -q 'Task from the Claude session that dispatched you (general-purpose agent agent-gone, "Second fix pass")' "$calls" && echo yes)"
expect "its new pane shows it working" yes "$(grep -q 'pane rename w1:p7 ▶ working · Second fix pass' "$calls" && echo yes)"
expect "and the sweep knows the pane" yes "$(grep -q "^w1:p7	agent-gone$" "$state/s1.panes" && echo yes)"
jq '.claude_session = ""' "$closed" > "$closed.tmp" && mv "$closed.tmp" "$closed"
expect "an agent with no session to resume is not reopened" yes \
  "$(contains "$(send agent-gone "Third pass" | jq -r .hookSpecificOutput.permissionDecisionReason)" "could not be reopened")"
jq --arg dir "$sandbox/gone" '.claude_session = "sess-9" | .worktree = $dir | .workdir = $dir' "$closed" > "$closed.tmp" && mv "$closed.tmp" "$closed"
expect "nor one whose worktree is gone" yes \
  "$(contains "$(send agent-gone "Third pass" | jq -r .hookSpecificOutput.permissionDecisionReason)" "could not be reopened")"


printf 'w1:p2\tagent-done\nw1:p3\tagent-busy\nw1:p4\tagent-gone\n' > "$state/s9.panes"
mkdir -p "$state/s9.agents" && printf '{}\n' > "$state/s9.agents/agent-done.json"
: > "$calls"
in_herdr bash "$root/hooks/worktree.sh" sweep-session s9 "$sandbox"
expect "sweep closes a done agent's pane" yes "$(grep -q 'pane close w1:p2' "$calls" && echo yes)"
expect "sweep leaves an agent at work" no "$(grep -q 'pane close w1:p3' "$calls" && echo yes || echo no)"
expect "sweep leaves a pane its agent left" no "$(grep -q 'pane close w1:p4' "$calls" && echo yes || echo no)"
expect "sweep drops the session's agent panes" no "$([ -f "$state/s9.panes" ] && echo yes || echo no)"
expect "and its agents' records" no "$([ -d "$state/s9.agents" ] && echo yes || echo no)"

[ "$failures" -eq 0 ] || { printf '%s failure(s)\n' "$failures"; exit 1; }
printf 'all good\n'
