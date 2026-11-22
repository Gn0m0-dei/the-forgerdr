#!/usr/bin/env bash
# Smallest check that fails if agent dispatch breaks: which calls stay in-process and how a dispatched one is started
# (hooks/agent-dispatch.sh), how a later message reaches it or reopens it (hooks/agent-message.sh), its record and the
# report reminder (hooks/agent-state.sh), and the agent terminals the sweep ends (hooks/worktree.sh), against fake hc
# and herdr-app (test/fakes.sh). The real herdr app and real sessions are run by hand.
# Run: bash test/agent-dispatch.test.sh
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
hook="$root/hooks/agent-dispatch.sh"
sandbox="$(cd "$(mktemp -d)" && pwd -P)"
trap 'rm -rf "$sandbox"' EXIT
# shellcheck source=test/fakes.sh
. "$root/test/fakes.sh"
fakes_install "$sandbox/fakes"
export HOME="$sandbox/home" XDG_STATE_HOME="$sandbox/state" CLAUDE_PLUGIN_ROOT="$root"
mkdir -p "$HOME"
state="$XDG_STATE_HOME/forgerdr/worktrees"

failures=0
expect() {
  if [ "$2" = "$3" ]; then printf 'ok   %s\n' "$1"; else printf 'FAIL %s\n  expected: %s\n  actual:   %s\n' "$1" "$2" "$3"; failures=$((failures + 1)); fi
}
contains() { case "$1" in *"$2"*) echo yes ;; *) echo no ;; esac; }
call() {
  jq -cn --arg type "$1" --arg isolation "${2:-}" --arg mode "${3:-}" --arg cwd "${CWD:-$sandbox}" --arg transcript "${TRANSCRIPT:-}" \
    '{session_id:"s1",cwd:$cwd,transcript_path:$transcript,permission_mode:$mode,tool_name:"Agent",tool_input:{subagent_type:$type,description:"Probe task",prompt:"Do the task.",isolation:$isolation}}' \
    | bash "$hook"
}
decision() { call "$@" | jq -r '.hookSpecificOutput.permissionDecision // empty'; }
# A session in a pane of the herdr app (t5, in tab tb-own, 310x66), and one with no pane of its own (t6, a sub-agent).
in_herdr() { HC_TERMINAL_ID=t5 CLAUDE_CODE_MESSAGING_SOCKET=/tmp/cc-socks/42.sock "$@"; }
in_sub() { HC_TERMINAL_ID=t6 CLAUDE_CODE_MESSAGING_SOCKET=/tmp/cc-socks/42.sock "$@"; }
logged() { grep -q -- "$1" "$state/dispatch.log" && echo yes || echo no; }
# How the agent was started, as JSON: the argv of the pane the app split off for it, else the hc run call.
started() {
  local split
  split="$(call_of herdr-app "do" pane.split)"
  if [ -n "$split" ]; then printf '%s' "$split" | option_of --argv; else call_of hc run; fi
}
# The claude command line it ran, after the shell and env words.
claude_line() { started | jq -r '(index("claude")) as $i | .[$i:] | join(" ")'; }
# Each pane.split call as "pane direction".
splits() { grep '"pane.split"' "$FAKE_CALLS" | while IFS= read -r c; do printf '%s %s\n' "$(printf '%s' "$c" | option_of --pane)" "$(printf '%s' "$c" | option_of --direction)"; done | paste -sd '|' -; }
# A fresh session: no agent panes yet, its own pane back at 310x66.
fresh() {
  fakes_reset
  rm -f "$state/s1.grid" "$state/s1.area"
  fake_terminal t5 live working "" herdr.space=sp-own herdr.tab=tb-own
  jq '.cols = 310 | .rows = 66' "$FAKE_DIR/terminals/t5.json" > "$FAKE_DIR/t5.tmp" && mv "$FAKE_DIR/t5.tmp" "$FAKE_DIR/terminals/t5.json"
  # The first shell of a new tab of agents, which gives its place to the first agent.
  fake_terminal t21 live
}
export FAKE_LS_PANES=1

fresh
fake_terminal t6 live working
fake_terminal t9 live working
fake_terminal t21 live

expect "outside the herdr app the subagent stays in-process" "" "$(decision general-purpose)"
expect "and nothing is asked of hc" no "$(called hc run)"
expect "a fork stays in-process" "" "$(in_herdr decision fork)"
expect "and says why" yes "$(logged "a fork inherits")"
expect "a type with no definition exits cleanly" 0 "$(in_herdr call statusline-setup >/dev/null; echo $?)"
expect "and says why" yes "$(logged "statusline-setup has no definition")"
expect "a type that is a path is refused" "" "$(in_herdr decision ../../notes)"
expect "and says why" yes "$(logged "unexpected agent type: ../../notes")"
expect "no messaging socket, in-process" "" "$(HC_TERMINAL_ID=t5 decision general-purpose)"
expect "a claude -p run in a herdr terminal keeps its agents in-process" "" \
  "$(CLAUDE_CODE_ENTRYPOINT=sdk-cli in_herdr decision general-purpose)"
expect "and opens no pane for them" "no no" "$(called hc run) $(called herdr-app "do" pane.split)"
expect "and says why" yes "$(logged "a non-interactive run (claude -p)")"

fresh
printf '%s\n' '{"type":"assistant","message":{"model":"claude-haiku-5-5"}}' '{"type":"assistant","message":{"model":"<synthetic>"}}' > "$sandbox/transcript.jsonl"
expect "general-purpose is dispatched to the herdr app" deny "$(TRANSCRIPT="$sandbox/transcript.jsonl" in_herdr decision general-purpose "" plan)"
run="$(started)"
expect "in a tab of agents, its pane split off the tab's first shell" "p-t21 right" "$(splits)"
expect "this session's pane is never split, so the user keeps the keyboard" "" "$(call_of herdr-app "do" pane.focus)"
expect "where this session works" "$sandbox" "$(printf '%s' "$run" | jq -r '.[4]')"
# shellcheck disable=SC2016 # literal arguments
expect "through the user's login interactive shell" '/bin/zsh -lic cd "$1" && shift && exec "$@" /bin/zsh' "$(printf '%s' "$run" | jq -r '.[0:4] | join(" ")')"
agent="$(cut -f2 "$state/s1.terminals")"
expect "named as an agent" yes "$([[ "$agent" =~ ^agent-[0-9]+-probe-task$ ]] && echo yes || echo "no: $agent")"
line="$(claude_line)"
expect "plain general-purpose session" no "$(contains "$line" "--tools ")"
expect "the session's model, never a synthetic one" yes "$(contains "$line" "--model claude-haiku-5-5")"
expect "the session's permission mode" yes "$(contains "$line" "--permission-mode plan")"
expect "the message opens with a fixed header" yes "$(contains "$line" "Task from the Claude session that dispatched you")"
expect "the message carries the report address" yes "$(contains "$line" "uds:/tmp/cc-socks/42.sock")"
expect "the agent knows where to report" yes "$(printf '%s' "$run" | has_arg "FORGE_REPORT_TO=uds:/tmp/cc-socks/42.sock")"
expect "and carries its task as the session title" yes "$(printf '%s' "$run" | has_arg "FORGE_SESSION_TITLE=Probe task")"
expect "and the terminal of the session that dispatched it" yes "$(printf '%s' "$run" | has_arg "FORGE_PARENT_TERMINAL=t5")"
expect "terminal recorded for the session" "t40	$agent" "$(cat "$state/s1.terminals")"
record="$state/s1.agents/$agent.json"
expect "the agent knows its record" yes "$(printf '%s' "$run" | has_arg "FORGE_AGENT_RECORD=$record")"
expect "the record keeps what reopening it needs" "general-purpose|Probe task|working|t40|$sandbox|--model claude-haiku-5-5 --permission-mode plan" \
  "$(jq -r '[.type, .title, .state, .terminal, .workdir, (.args | join(" "))] | join("|")' "$record")"
reason="$(TRANSCRIPT="$sandbox/transcript.jsonl" in_herdr call general-purpose | jq -r '.hookSpecificOutput.permissionDecisionReason')"
expect "the reason says it is not an error" yes "$(contains "$reason" "Not an error:")"
expect "the reason says how to give it another task" yes "$(contains "$reason" "SendMessage to \"agent-")"
expect "and where the user finds it" yes "$(contains "$reason" "tab of agents")"

# The grid: the first agent opens a tab of agents in the background, at the size of this session's pane, and the next
# ones split the largest agent pane there that keeps 80x15; this session's own pane is never split.
fresh
for _ in 1 2 3 4; do in_herdr decision general-purpose >/dev/null; done
expect "a tab of agents, then its agent panes as an even grid" "p-t21 right|p-t40 right|p-t40 down|p-t41 down" "$(splits)"
expect "all four in one tab of agents" 1 "$(grep -c '"tab.new"' "$FAKE_CALLS")"
made="$(call_of herdr-app "do" tab.new)"
expect "the tab of agents opens in this session's space, in the background" "sp-own false" \
  "$(printf '%s %s' "$(printf '%s' "$made" | option_of --space)" "$(printf '%s' "$made" | option_of --focus)")"
expect "named after this session" yes "$(contains "$(printf '%s' "$made" | option_of --name)" "agents · ")"
expect "its first shell gives its place to the agent" yes "$(called hc kill t21)"
expect "the user's pane keeps the keyboard: no split in their tab" 0 "$(grep -c '"pane.focus"' "$FAKE_CALLS")"
expect "the grid keeps the agent panes" "t40 t41 t42 t43" "$(cut -f1 "$state/s1.grid" | paste -sd ' ' -)"
fake_terminal t21 live

fresh
fake_terminal t39 finished
printf 't39\tp-t39\ttb-own\t152\t66\n' > "$state/s1.grid"
in_herdr decision general-purpose >/dev/null
expect "once its agent panes are gone, a new tab of agents opens" "p-t21 right" "$(splits)"

# A tab of agents opens in the background, where its panes have no real size: it is taken at the size of this session's
# whole tab, two panes side by side making it twice as wide, so its agents sit side by side first.
fresh
fake_terminal t7 live working "" herdr.space=sp-own herdr.tab=tb-own
jq '.cols = 310 | .rows = 66' "$FAKE_DIR/terminals/t7.json" > "$FAKE_DIR/t7.tmp" && mv "$FAKE_DIR/t7.tmp" "$FAKE_DIR/terminals/t7.json"
jq -n '{spaces: [{id: "sp-own", name: "own", tabs: [{id: "tb-own", name: "1",
  terminals: [{terminal: "t5", pane: "p-t5"}, {terminal: "t7", pane: "p-t7"}]}]}]}' > "$FAKE_DIR/ls.json"
in_herdr decision general-purpose >/dev/null
expect "a tab of agents is taken at the size of this session's whole tab" "621 66" "$(cat "$state/s1.area")"
rm -f "$FAKE_DIR/ls.json"
fake_terminal t7 finished

fresh
fake_terminal t38 live working
printf 't38\tp-t38\ttb-own\t152\t66\n' > "$state/s1.grid"
in_herdr decision general-purpose >/dev/null
expect "an agent pane in this session's own tab is not split: a tab of agents opens" "p-t21 right" "$(splits)"

fresh
expect "a pane the app cannot split leaves the agent in-process" "" "$(FAKE_SPLIT_FAILS=1 in_herdr decision general-purpose)"
expect "and says why" yes "$(logged "could not open the agent's pane in its tab of agents")"

# A session with no pane of its own starts its agents as sub-agents of its terminal.
fresh
expect "a session with no pane dispatches too" deny "$(in_sub decision general-purpose)"
run="$(call_of hc run)"
expect "in a terminal of its own, with no note about it typed into this one" yes "$(printf '%s' "$run" | has_arg --no-notify)"
expect "as a sub-agent of this session: no space or tab" no "$(printf '%s' "$run" | jq -e 'any(.[]; startswith("herdr."))' >/dev/null && echo yes || echo no)"
expect "where this session works" "$sandbox" "$(printf '%s' "$run" | option_of --cwd)"
# shellcheck disable=SC2016 # literal arguments
expect "through the user's login interactive shell" '/bin/zsh -lic exec "$@" /bin/zsh env' "$(printf '%s' "$run" | jq -r '(index("--")) as $i | .[$i + 1:$i + 6] | join(" ")')"
expect "named as an agent" yes "$([[ "$(printf '%s' "$run" | option_of --name)" =~ ^agent-[0-9]+-probe-task$ ]] && echo yes || echo no)"
expect "and the user finds it in the Agents sidebar" yes "$(contains "$(in_sub call general-purpose | jq -r '.hookSpecificOutput.permissionDecisionReason')" "Agents sidebar")"

fresh
flows="$XDG_STATE_HOME/forgerdr/flows"
HC_TERMINAL_ID=t5 bash "$root/bin/forge-flow.sh" launch build
in_herdr decision forgerdr:reviewer >/dev/null
line="$(claude_line)"
expect "a reviewer counts on the forge floor's review cell" 1 "$(jq .cells.review.runs "$flows/t5.json")"
expect "and its golem knows what agent it is" yes "$(started | has_arg "FORGE_AGENT_TYPE=forgerdr:reviewer")"
expect "reviewer gets its definition in a file" yes "$(grep -q "You review a diff" "$(printf '%s' "$line" | sed -nE 's/.*--append-system-prompt-file ([^ ]+).*/\1/p')" && echo yes)"
expect "reviewer keeps its tool list" yes "$(contains "$line" "--tools Read,Grep,Glob,Bash,SendMessage,ToolSearch")"
expect "reviewer gets no MCP servers" yes "$(contains "$line" "--strict-mcp-config")"

fresh
in_herdr decision forgerdr:researcher >/dev/null
expect "researcher gets no Bash" yes "$(contains "$(claude_line)" "--tools WebSearch,WebFetch,Read,Grep,Glob,SendMessage,ToolSearch")"

fresh
in_herdr decision Explore >/dev/null
expect "Explore is read-only" yes "$(contains "$(claude_line)" "--disallowedTools Edit,Write,NotebookEdit,MultiEdit")"

fresh
FORGE_CLAUDE_ARGS="--settings /tmp/try.json" in_herdr decision general-purpose >/dev/null
expect "FORGE_CLAUDE_ARGS reaches claude" yes "$(contains "$(claude_line)" "claude --settings /tmp/try.json")"

# The folder trust prompt is accepted once, and the agent is up after it.
fake_terminal t9 live blocked "trust this folder"
jq -n '{address:"t9",state:"live",labels:{},status:{app:"claude-code",state:"working"}}' > "$FAKE_DIR/terminals/t9.after-keys.json"
fresh
export FAKE_SPLIT_ADDRESS=t9
expect "a trust prompt does not stop the dispatch" deny "$(in_herdr decision general-purpose)"
expect "it is accepted" yes "$(called hc keys t9 down enter)"
expect "once" 1 "$(grep -c '"keys"' "$FAKE_CALLS")"

# A terminal that ends before the agent is up: in-process, and the terminal is removed.
fake_terminal t9 finished
rm -f "$state/s1.terminals"
fresh
expect "an agent that ends before it starts stays in-process" "" "$(in_herdr decision general-purpose)"
expect "and says why" yes "$(logged "ended in terminal t9 before it started")"
expect "and its terminal is removed" yes "$(called hc rm t9)"
expect "and forgotten" "" "$(cat "$state/s1.terminals")"
fake_terminal t9 live working

fresh
expect "hc failing to start it stays in-process" "" "$(FAKE_RUN_FAILS=1 in_sub decision general-purpose)"
expect "and says why" yes "$(logged "hc could not start a terminal")"

# isolation "worktree": a git worktree under .claude/worktrees, opened as a space; the agent is a pane of it.
git init -q -b main "$sandbox/repo"
git -C "$sandbox/repo" -c user.name=t -c user.email=t@example.invalid commit -q --allow-empty -m init
fakes_reset
expect "an isolated agent is dispatched" deny "$(CWD="$sandbox/repo" FAKE_LS_MADE=1 in_herdr decision general-purpose worktree)"
expect "its worktree is opened as a space that does not take the focus" yes "$(call_of herdr-app "do" space.new | has_arg false)"
run="$(started)"
expect "the agent is a pane of that space's tab" "herdr.space=sp-new herdr.tab=tb-new" \
  "$(printf '%s' "$run" | jq -r '[.[] | select(startswith("herdr."))] | join(" ")')"
workdir="$(printf '%s' "$run" | option_of --cwd)"
expect "working in the worktree" yes "$([[ "$workdir" == "$sandbox/repo/.claude/worktrees/agent-"* ]] && echo yes || echo "no: $workdir")"
expect "told not to commit" yes "$(contains "$(claude_line)" "Do not commit")"

# An isolated agent that does not come up: in-process, its worktree removed and its space closed.
fake_terminal t9 finished
fakes_reset
expect "an isolated agent that ends before it starts stays in-process" "" "$(CWD="$sandbox/repo" FAKE_LS_MADE=1 in_herdr decision general-purpose worktree)"
made="$(call_of herdr-app "do" space.new | option_of --folder)"
expect "its worktree is removed" no "$([ -e "$made" ] && echo yes || echo no)"
expect "and its space closed" yes "$(called herdr-app "do" space.close --id sp-new --confirmed true)"
fake_terminal t9 live working

# A terminal that cannot be ended is not run a second time in-process.
fake_terminal t9 live
fresh
reason="$(FAKE_KILL_IGNORED=1 in_herdr call general-purpose | jq -r '.hookSpecificOutput | "\(.permissionDecision) \(.permissionDecisionReason)"')"
expect "an agent that reports nothing and cannot be ended is refused, not run twice" yes "$(contains "$reason" "deny The general-purpose agent may still be running in herdr terminal t9")"
expect "and says why" yes "$(logged "reported nothing while it was awaited")"
fake_terminal t9 live working
unset FAKE_SPLIT_ADDRESS

# hc starts a terminal but prints no address: it is ended by the agent's name.
fresh
printf '#!/usr/bin/env bash\nprintf "not json\\n"\n' > "$sandbox/hc-mute"
chmod +x "$sandbox/hc-mute"
expect "a terminal hc did not name is ended by the agent's name" "" "$(FORGE_HC="$sandbox/hc-mute" in_sub decision general-purpose)"
expect "and says why" yes "$(logged "without printing its terminal")"
rm -f "$FAKE_DIR/ls.json"

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
  jq -n --arg state "$1" '{name:"agent-1",type:"general-purpose",title:"Probe task",state:$state,terminal:"t9",workdir:"/tmp",worktree:"",note:"",claude_session:"",socket:"",args:[]}' > "$agent_record"
}
# Runs the agent hook for an event over a transcript of the given lines, as a dispatched agent in terminal t9.
hook() {
  local event="$1" active="$2"
  shift 2
  printf '%s\n' "$@" > "$sandbox/t.jsonl"
  jq -cn --arg t "$sandbox/t.jsonl" --argjson active "$active" '{session_id:"agent-session",transcript_path:$t,stop_hook_active:$active}' \
    | HC_TERMINAL_ID=t9 FORGE_REPORT_TO="$to" FORGE_AGENT_RECORD="$agent_record" CLAUDE_CODE_MESSAGING_SOCKET=/tmp/cc-socks/77.sock \
      bash "$state_hook" "$event"
}
stop() { hook stop false "$@" | jq -r '.decision // empty'; }
recorded_state() { jq -r .state "$agent_record"; }

printf '%s\n' '{"type":"user","message":{"content":"Hi."}}' > "$sandbox/plain.jsonl"
expect "a non-dispatched session is never reminded" "" "$(jq -cn --arg t "$sandbox/plain.jsonl" '{transcript_path:$t,stop_hook_active:false}' | bash "$state_hook" stop)"
new_record working
expect "an agent that has not reported is reminded" block "$(stop "$task_line" "$text_line")"
expect "a question is not a report" block "$(stop "$task_line" "$question_line" "$text_line")"
expect "reminded once, it is left alone" "" "$(hook stop true "$task_line" "$text_line")"
expect "and stays working" working "$(recorded_state)"
expect "the turn that reports says the agent can be ended" yes "$(contains "$(hook stop false "$task_line" "$report_line" "$text_line" | jq -r '.systemMessage // empty')" DONE)"
expect "and its record says done" "done" "$(recorded_state)"
expect "a question from the user afterwards brings no reminder" "" "$(stop "$task_line" "$report_line" "$prompt_line" "$text_line")"
expect "nor a second done message" "" "$(hook stop false "$task_line" "$report_line" "$prompt_line" "$text_line" | jq -r '.systemMessage // empty')"
expect "a note from Claude Code does not open a turn" yes "$(contains "$(hook stop false "$task_line" "$report_line" "$meta_line" "$text_line" | jq -r '.systemMessage // empty')" DONE)"
expect "a new task from the session that dispatched it needs its own report" block "$(stop "$task_line" "$report_line" "$peer_task_line" "$text_line")"
expect "and once reported, it is done again" yes "$(contains "$(hook stop false "$task_line" "$report_line" "$peer_task_line" "$report_line" "$text_line" | jq -r '.systemMessage // empty')" DONE)"

new_record "done"
expect "a claude -p run started from the agent's Bash is not the agent: never reminded" "" \
  "$(CLAUDE_CODE_ENTRYPOINT=sdk-cli hook stop false "$task_line" "$text_line")"
CLAUDE_CODE_ENTRYPOINT=sdk-cli hook session false "$task_line" >/dev/null
CLAUDE_CODE_ENTRYPOINT=sdk-cli hook prompt false "$task_line" >/dev/null
expect "nor does it take over the agent's record" "done  " \
  "$(jq -r '"\(.state) \(.claude_session) \(.socket)"' "$agent_record")"

new_record "done"
fakes_reset
hook prompt false "$task_line" >/dev/null
expect "talked to, a done agent is working" working "$(recorded_state)"
jq '.terminal = ""' "$agent_record" > "$agent_record.tmp" && mv "$agent_record.tmp" "$agent_record"
hook session false "$task_line" >/dev/null
expect "its session, address and terminal are recorded when it starts" "agent-session|/tmp/cc-socks/77.sock|t9" \
  "$(jq -r '[.claude_session, .socket, .terminal] | join("|")' "$agent_record")"
expect "nothing is asked of hc or the app on the way" no "$(called herdr-app "do")"

message_hook="$root/hooks/agent-message.sh"
mkdir -p "$state/s1.agents"
fake_terminal t-done live idle
jq -n --arg dir "$sandbox" '{name:"agent-done",type:"forgerdr:reviewer",title:"Review task 1",state:"done",terminal:"t-done",workdir:$dir,
  worktree:"",note:"",claude_session:"sess-1",socket:"/tmp/cc-socks/77.sock",args:["--model","m1"]}' > "$state/s1.agents/agent-done.json"
send_input() {
  jq -cn --arg to "$1" --arg summary "$2" --arg cwd "$sandbox" \
    '{session_id:"s1",cwd:$cwd,transcript_path:"",permission_mode:"auto",tool_name:"SendMessage",tool_input:{to:$to,summary:$summary,message:"Check the fixes."}}'
}
send() { send_input "$@" | in_herdr bash "$message_hook"; }
expect "a message to any other session is left alone" "" "$(send feature-x-3c "Hello")"
expect "and so is every message outside the herdr app" "" "$(send_input agent-done "Hello" | bash "$message_hook")"
routed="$(send agent-done "Re-review task 1")"
expect "a message to a live agent goes to its session" "uds:/tmp/cc-socks/77.sock|allow" \
  "$(printf '%s' "$routed" | jq -r '[.hookSpecificOutput.updatedInput.to, .hookSpecificOutput.permissionDecision] | join("|")')"
expect "as a task that says where to report" yes \
  "$(contains "$(printf '%s' "$routed" | jq -r .hookSpecificOutput.updatedInput.message)" 'beginning with the line "Report from agent-done (Re-review task 1)"')"
expect "keeping the rest of the call" "Re-review task 1" "$(printf '%s' "$routed" | jq -r .hookSpecificOutput.updatedInput.summary)"
expect "its record names the new task" "working|Re-review task 1" "$(jq -r '[.state, .title] | join("|")' "$state/s1.agents/agent-done.json")"
expect "a reviewer given another task counts again" 2 "$(jq .cells.review.runs "$flows/t5.json")"
answer="$(send agent-done "Use the main branch")"
expect "to an agent still on its task, a message goes as it is" "uds:/tmp/cc-socks/77.sock|Check the fixes." \
  "$(printf '%s' "$answer" | jq -r '[.hookSpecificOutput.updatedInput.to, .hookSpecificOutput.updatedInput.message] | join("|")')"
expect "and its task keeps its name" "Re-review task 1" "$(jq -r .title "$state/s1.agents/agent-done.json")"
expect "an answer to a reviewer on its task is no new review" 2 "$(jq .cells.review.runs "$flows/t5.json")"

closed="$state/s1.agents/agent-gone.json"
jq -n --arg dir "$sandbox" '{name:"agent-gone",type:"general-purpose",title:"Fix task 1",state:"done",terminal:"t-gone",workdir:$dir,
  worktree:"",note:"",claude_session:"sess-9",socket:"/tmp/cc-socks/78.sock",args:["--model","m1"]}' > "$closed"
fake_terminal t-gone finished
rm -f "$state/s1.terminals"
fresh
reopened="$(send agent-gone "Second fix pass")"
expect "an agent whose terminal ended is reopened instead" deny "$(printf '%s' "$reopened" | jq -r .hookSpecificOutput.permissionDecision)"
expect "and the reason says so" yes "$(contains "$(printf '%s' "$reopened" | jq -r .hookSpecificOutput.permissionDecisionReason)" "reopened")"
expect "its ended terminal gives its name back first" yes "$(called hc rm t-gone)"
expect "in a tab of agents" "p-t21 right" "$(splits)"
expect "resuming its Claude session with its own arguments" yes "$(contains "$(claude_line)" "claude --model m1 --resume sess-9")"
expect "with the message as its task" yes "$(contains "$(claude_line)" 'Task from the Claude session that dispatched you (general-purpose agent agent-gone, "Second fix pass")')"
expect "and the sweep knows its terminal" yes "$(grep -q "^t40	agent-gone$" "$state/s1.terminals" && echo yes)"
jq -n --arg dir "$sandbox" '{name:"agent-rgone",type:"forgerdr:reviewer",title:"Review task 2",state:"done",terminal:"t-rgone",
  workdir:$dir,worktree:"",note:"",claude_session:"sess-8",socket:"/tmp/cc-socks/79.sock",args:[]}' > "$state/s1.agents/agent-rgone.json"
fake_terminal t-rgone finished
fresh
send agent-rgone "Re-review task 2" >/dev/null
expect "a reviewer reopened counts once" 3 "$(jq .cells.review.runs "$flows/t5.json")"
jq '.claude_session = "" | .terminal = "t-gone"' "$closed" > "$closed.tmp" && mv "$closed.tmp" "$closed"
expect "an agent with no session to resume is not reopened" yes \
  "$(contains "$(send agent-gone "Third pass" | jq -r .hookSpecificOutput.permissionDecisionReason)" "could not be reopened")"
jq --arg dir "$sandbox/gone" '.claude_session = "sess-9" | .terminal = "t-gone" | .worktree = $dir | .workdir = $dir' "$closed" > "$closed.tmp" && mv "$closed.tmp" "$closed"
expect "nor one whose worktree is gone" yes \
  "$(contains "$(send agent-gone "Third pass" | jq -r .hookSpecificOutput.permissionDecisionReason)" "could not be reopened")"

fake_terminal t-idle live idle
fake_terminal t-busy live working
fake_terminal t-asks live blocked "Allow Bash?"
fake_terminal t-left live
fake_terminal t-ended finished
printf 't-idle\tagent-a\nt-busy\tagent-b\nt-asks\tagent-c\nt-left\tagent-d\nt-ended\tagent-e\nt-unknown\tagent-f\n' > "$state/s9.terminals"
mkdir -p "$state/s9.agents" && printf '{}\n' > "$state/s9.agents/agent-a.json"
fakes_reset
HC_TERMINAL_ID=t5 bash "$root/hooks/worktree.sh" sweep-session s9 "$sandbox"
expect "sweep ends a done agent" "yes yes" "$(called hc kill t-idle) $(called hc rm t-idle)"
expect "sweep leaves an agent at work" no "$(called hc kill t-busy)"
expect "sweep leaves an agent that asks" no "$(called hc kill t-asks)"
expect "sweep leaves a terminal its agent left" no "$(called hc kill t-left)"
expect "sweep removes an ended terminal" "no yes" "$(called hc kill t-ended) $(called hc rm t-ended)"
expect "sweep drops the session's agent terminals" no "$([ -f "$state/s9.terminals" ] && echo yes || echo no)"
expect "and its agents' records" no "$([ -d "$state/s9.agents" ] && echo yes || echo no)"

[ "$failures" -eq 0 ] || { printf '%s failure(s)\n' "$failures"; exit 1; }
printf 'all good\n'
