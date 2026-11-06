#!/usr/bin/env bash
# Smallest check that fails if agent-dispatch.sh breaks: which calls stay in-process and how a dispatched one is started,
# against a fake herdr that records its calls (the real herdr and real sessions are run by hand).
# Run: bash test/agent-dispatch.test.sh
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
hook="$root/hooks/agent-dispatch.sh"
sandbox="$(cd "$(mktemp -d)" && pwd -P)"
trap 'rm -rf "$sandbox"' EXIT
export HOME="$sandbox/home" XDG_STATE_HOME="$sandbox/state" CLAUDE_PLUGIN_ROOT="$root"
mkdir -p "$HOME"
calls="$sandbox/herdr-calls"

cat > "$sandbox/herdr" <<'SH'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "$FAKE_HERDR_CALLS"
case "$1 $2" in
  "pane split") printf '{"result":{"pane":{"pane_id":"w1:p7"}}}\n' ;;
  "pane list") printf '{"result":{"panes":[{"pane_id":"w1:p1"},{"pane_id":"w1:p7"}]}}\n' ;;
  "pane layout") printf '{"result":{"layout":{"panes":[{"pane_id":"w1:p1","rect":{"height":74}},{"pane_id":"w1:p7","rect":{"height":18}},{"pane_id":"w1:p8","rect":{"height":37}}]}}}\n' ;;
  "agent read") printf 'ready\n' ;;
  *) printf '{"result":{}}\n' ;;
esac
SH
chmod +x "$sandbox/herdr"

failures=0
expect() {
  if [ "$2" = "$3" ]; then printf 'ok   %s\n' "$1"; else printf 'FAIL %s\n  expected: %s\n  actual:   %s\n' "$1" "$2" "$3"; failures=$((failures + 1)); fi
}
call() {
  jq -cn --arg type "$1" --arg prompt "${2:-Do the task.}" --arg isolation "${3:-}" --arg cwd "$sandbox" \
    '{session_id:"s1",cwd:$cwd,transcript_path:"",tool_name:"Agent",tool_input:{subagent_type:$type,description:"Probe task",prompt:$prompt,isolation:$isolation}}' \
    | bash "$hook"
}
decision() { call "$@" | jq -r '.hookSpecificOutput.permissionDecision // empty'; }
contains() { case "$1" in *"$2"*) echo yes ;; *) echo no ;; esac; }
in_herdr() {
  HERDR_ENV=1 HERDR_PANE_ID=w1:p1 HERDR_WORKSPACE_ID=w1 HERDR_BIN_PATH="$sandbox/herdr" \
    CLAUDE_CODE_MESSAGING_SOCKET=/tmp/cc-socks/42.sock FAKE_HERDR_CALLS="$calls" "$@"
}

unset HERDR_ENV
expect "outside herdr the subagent stays in-process" "" "$(decision general-purpose)"
expect "a fork stays in-process" "" "$(in_herdr decision fork)"
expect "a built-in type it cannot reproduce stays in-process" "" "$(in_herdr decision statusline-setup)"
expect "no messaging socket, in-process" "" "$(HERDR_ENV=1 HERDR_PANE_ID=w1:p1 decision general-purpose)"

: > "$calls"
expect "general-purpose is dispatched to herdr" deny "$(in_herdr decision general-purpose)"
expect "first agent pane splits this session to the right" "pane split w1:p1 --direction right" "$(grep -o 'pane split w1:p1 --direction right' "$calls")"
start="$(cat "$calls")"
expect "plain general-purpose session" "no" "$( [ "$(contains "$start" --append-system-prompt-file)$(contains "$start" --disallowedTools)" = nono ] && echo no || echo yes)"
expect "prompt carries the report address" yes "$(grep -q 'uds:/tmp/cc-socks/42.sock' "$calls" && echo yes)"
expect "pane recorded for the session" 1 "$(wc -l < "$XDG_STATE_HOME/forgerdr/worktrees/s1.panes" | tr -d ' ')"

: > "$calls"
in_herdr decision forgerdr:reviewer >/dev/null
expect "next agent stacks below the last one" yes "$(grep -q 'pane split w1:p7 --direction down' "$calls" && echo yes)"
start="$(cat "$calls")"
expect "reviewer gets its definition in a file" yes "$(grep -q -- "--append-system-prompt-file $XDG_STATE_HOME/forgerdr/worktrees/s1\.prompt\.[A-Za-z0-9]*" "$calls" && grep -q "You review a diff" "$XDG_STATE_HOME"/forgerdr/worktrees/s1.prompt.* && echo yes)"
expect "reviewer loses the write tools" yes "$(contains "$start" "--disallowedTools Edit,Write,NotebookEdit,MultiEdit")"

printf 'w1:p8\tagent-x\n' >> "$XDG_STATE_HOME/forgerdr/worktrees/s1.panes"
: > "$calls"
in_herdr decision general-purpose >/dev/null
expect "the tallest agent pane of the session is split" yes "$(grep -q 'pane split w1:p8 --direction down' "$calls" && echo yes)"

: > "$calls"
in_herdr decision Explore >/dev/null
expect "Explore is read-only" yes "$(grep -q -- '--disallowedTools Edit,Write,NotebookEdit,MultiEdit' "$calls" && echo yes)"

reason="$(in_herdr call general-purpose | jq -r '.hookSpecificOutput.permissionDecisionReason')"
expect "the reason says it is not an error" yes "$(contains "$reason" "Not an error:")"

report_hook="$root/hooks/agent-report.sh"
to="uds:/tmp/cc-socks/42.sock"
prompt_line='{"type":"user","message":{"content":"Do the task."}}'
sent_line='{"type":"assistant","message":{"content":[{"type":"tool_use","name":"SendMessage","input":{"to":"uds:/tmp/cc-socks/42.sock","message":"Report"}}]}}'
text_line='{"type":"assistant","message":{"content":[{"type":"text","text":"Done."}]}}'
stop() { printf '%s\n' "$@" > "$sandbox/t.jsonl"; jq -cn --arg t "$sandbox/t.jsonl" '{transcript_path:$t,stop_hook_active:false}' | FORGE_REPORT_TO="$to" bash "$report_hook" | jq -r '.decision // empty'; }
expect "a non-dispatched session is never reminded" "" "$(printf '{}' | bash "$report_hook")"
expect "a turn without a report is reminded" block "$(stop "$prompt_line" "$text_line")"
expect "a turn that reported is not" "" "$(stop "$prompt_line" "$sent_line" "$text_line")"
expect "a report from an earlier turn does not count" block "$(stop "$prompt_line" "$sent_line" "$prompt_line" "$text_line")"
expect "the reminder is given once" "" "$(jq -cn --arg t "$sandbox/t.jsonl" '{transcript_path:$t,stop_hook_active:true}' | FORGE_REPORT_TO="$to" bash "$report_hook")"

[ "$failures" -eq 0 ] || { printf '%s failure(s)\n' "$failures"; exit 1; }
printf 'all good\n'
