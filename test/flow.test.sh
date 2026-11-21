#!/usr/bin/env bash
# Smallest check that fails if the forge floor's bridge breaks: bin/forge-flow.sh keeps each item's flow (its cells, how
# often each was launched, its build tasks and its pull request) in a file per herdr terminal, only for that terminal's
# own session, and lists the flows for the forgerdr mod.
# Run: bash test/flow.test.sh
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
script="$root/bin/forge-flow.sh"
sandbox="$(mktemp -d)"
trap 'rm -rf "$sandbox"' EXIT
# shellcheck source=test/fakes.sh
. "$root/test/fakes.sh"
fakes_install "$sandbox"
unset FORGE_PARENT_TERMINAL FORGE_AGENT_TYPE
export FORGE_FLOWS_DIR="$sandbox/flows"
dir="$FORGE_FLOWS_DIR"
git init -q "$sandbox/repo"
cd "$sandbox/repo"

failures=0
expect() {
  if [ "$2" = "$3" ]; then printf 'ok   %s\n' "$1"; else printf 'FAIL %s\n  expected: %s\n  actual:   %s\n' "$1" "$2" "$3"; failures=$((failures + 1)); fi
}
exists() { if [ -e "$1" ]; then echo true; else echo false; fi; }

# The script as the session in herdr terminal $T (t7 by default) runs it.
flow() { HC_TERMINAL_ID="${T:-t7}" bash "$script" "$@"; }
field() { jq -r "$1" "$dir/${2:-t7}.json"; }

flow launch workitem --auto '#15 inbox keys'
expect "a work item launched in auto starts its flow on the brief" 'auto brief running 1' \
  "$(field '"\(.mode) brief \(.cells.brief.state) \(.cells.brief.runs)"')"
expect "the flow knows its terminal and its repository" "t7 $(git rev-parse --path-format=absolute --git-common-dir)" \
  "$(field '"\(.terminal) \(.repo)"')"
expect "only its owner can read it" 700 "$(stat -c %a "$dir" 2>/dev/null || stat -f %Lp "$dir")"

flow stage brief running
expect "a cell the hook launched is not counted again when the skill says it runs" 1 "$(field .cells.brief.runs)"

flow start auto feature '#15' inbox keyboard answering
expect "the brief names the item, keeping what ran" 'feature #15 inbox keyboard answering running' \
  "$(field '"\(.type) \(.key) \(.title) \(.cells.brief.state)"')"
flow stage spec running
expect "a new running cell closes the last one" 'done running' "$(field '"\(.cells.brief.state) \(.cells.spec.state)"')"
flow stage spec waiting
expect "a cell waits on its gate" waiting "$(field .cells.spec.state)"

flow stage build running
expect "the next cell launched closes the one at its gate" 'done running' "$(field '"\(.cells.spec.state) \(.cells.build.state)"')"
flow stage build "done"
flow stage build running
expect "a cell launched again counts each launch" 2 "$(field .cells.build.runs)"
expect "times are kept to the millisecond, so steps a moment apart keep their order" true \
  "$(field '.cells.build.at > .cells.spec.at and .cells.build.at % 1000 != 0 or .cells.spec.at % 1000 != 0')"
flow stage research skipped
expect "a skipped cell never ran" 'skipped 0' "$(field '"\(.cells.research.state) \(.cells.research.runs)"')"
flow stage plan "done"
expect "a cell reported done without running ran once" 1 "$(field .cells.plan.runs)"

flow task 5 8 red restore_reattaches_after_restart
flow task 4 8 green
expect "build tasks keep their marks and the failing test's name" 'null green red 8 restore_reattaches_after_restart' \
  "$(field '"\(.tasks.marks[0]) \(.tasks.marks[3]) \(.tasks.marks[4]) \(.tasks.of) \(.tasks.name)"')"

flow review forgerdr:reviewer
flow review forgerdr:security-verifier
flow review general-purpose
expect "only reviewing agents count, without closing the running cell" '2 running' \
  "$(field '"\(.cells.review.runs) \(.cells.build.state)"')"

flow pr 40 https://github.com/acme/shop/pull/40
expect "the pull request" '40 https://github.com/acme/shop/pull/40' "$(field '"\(.pr.number) \(.pr.url)"')"

flow start auto bug '#16' cart totals
expect "another item in the same session starts afresh" 'bug #16 0' "$(field '"\(.type) \(.key) \(.cells | length)"')"

T=t8 flow launch plan
expect "a command launched with no flow starts a manual one" 'manual running 1' \
  "$(field '"\(.mode) \(.cells.plan.state) \(.cells.plan.runs)"' t8)"
T=t8 flow launch review-own https://github.com/acme/shop/pull/3
T=t8 flow launch help
expect "commands that are not an item's steps are not cells" 1 "$(field '.cells | length' t8)"
T=t8 FORGE_SESSION_TITLE='cart work' flow launch workitem '#16'
expect "a work item launched by hand is manual, titled for its session" 'manual cart work running' \
  "$(field '"\(.mode) \(.title) \(.cells.workitem.state)"' t8)"
T=t8 FORGE_SESSION_TITLE='cart work' flow launch workitem --auto '#16'
expect "a work item launched again keeps its flow, counts the launch and takes the new mode" 'auto 1 1 1' \
  "$(field '"\(.mode) \(.cells.plan.runs) \(.cells.workitem.runs) \(.cells.brief.runs)"' t8)"

status=0
HC_TERMINAL_ID='' bash "$script" stage ship "done" || status=$?
expect "outside herdr it does nothing" '0 false' "$status $(exists "$dir/.json")"
FORGE_PARENT_TERMINAL=t7 T=t9 flow launch plan
expect "a dispatched agent writes no flow" false "$(exists "$dir/t9.json")"
T=t9 flow stage plan running
expect "a stage with no flow started writes nothing" false "$(exists "$dir/t9.json")"
status=0
T='../x' flow launch plan 2>/dev/null || status=$?
expect "a terminal id that is not one is refused" '1 false' "$status $(exists "$sandbox/x.json")"
status=0
flow stage build sleeping 2>/dev/null || status=$?
expect "a state that is not one is refused" 1 "$status"
status=0
flow stage lunch running 2>/dev/null || status=$?
expect "a cell that is not one is refused" 1 "$status"
status=0
flow stage "spec research" "done" 2>/dev/null || status=$?
expect "two cells in one word are not a cell" 1 "$status"
status=0
flow start "auto manual" feature '#15' x 2>/dev/null || status=$?
expect "nor two modes a mode" 1 "$status"

printf 'broken' > "$dir/t13.json"
T=t13 flow launch plan 2>/dev/null
expect "a flow file that is not JSON starts afresh rather than keeping every report out" 'manual 1' \
  "$(field '"\(.mode) \(.cells.plan.runs)"' t13)"
rm -f "$dir/t13.json"
printf 'not json' > "$dir/t10.json"
jq '.updated = 1 | .terminal = "t11"' "$dir/t8.json" > "$dir/t11.json"
jq '.terminal = "t7"' "$dir/t8.json" > "$dir/t12.json"
jq '.terminal = "t14" | .tasks = {of: 100000, marks: []}' "$dir/t8.json" > "$dir/t14.json"
expect "the list skips what is not a flow, names another terminal, or has more tasks than a plan holds" '["t7","t8"]' \
  "$(bash "$script" list | jq -c 'map(.terminal) | sort')"
expect "a flow untouched for a week goes" false "$(exists "$dir/t11.json")"

status=0
bash "$script" dismiss t8 2>/dev/null || status=$?
expect "nothing dismisses a flow by hand: it goes by itself" '1 true' "$status $(exists "$dir/t8.json")"

# hooks/flow.sh on UserPromptSubmit, as the session in terminal t20 typing the prompt, in a session titled $2.
prompt() {
  jq -cn --arg prompt "$1" --arg cwd "$sandbox/repo" '{hook_event_name: "UserPromptSubmit", prompt: $prompt, cwd: $cwd}' \
    | HC_TERMINAL_ID=t20 FORGE_SESSION_TITLE="$2" bash "$root/hooks/flow.sh" prompt
}
prompted="$(prompt '/forgerdr:workitem --auto https://github.com/acme/shop/issues/15' '#15 cart totals')"
expect "a work item in the session titled for it starts its flow" 'auto brief #15 cart totals' \
  "$(field '"\(.mode) \(.cells | keys[0]) \(.title)"' t20)"
expect "and says nothing to the model" "" "$prompted"
rm -f "$dir/t20.json"
prompt '/forgerdr:workitem #15 | #16' '#15 cart totals'
expect "several items only open their sessions: no flow here" false "$(exists "$dir/t20.json")"
prompt '/forgerdr:workitem #15' ''
expect "nor one item in a session not titled yet" false "$(exists "$dir/t20.json")"
prompt '/forgerdr:workitem #16' '#15 cart totals'
expect "nor one item in a session titled for another" false "$(exists "$dir/t20.json")"
prompt '/forgerdr:workitem #15' '#150 cart totals'
expect "nor one whose title holds a longer id" false "$(exists "$dir/t20.json")"
prompt '/forgerdr:workitem add-dark-mode' 'M7 floor'
expect "nor an OpenSpec change in a session titled for other work" false "$(exists "$dir/t20.json")"
prompt '/forgerdr:workitem auth' 'add-auth-sso'
expect "nor one whose name is only part of the title's" false "$(exists "$dir/t20.json")"
prompt '/forgerdr:workitem add-dark-mode' 'add-dark-mode'
expect "an OpenSpec change in its own session starts its flow" running "$(field .cells.workitem.state t20)"
rm -f "$dir/t20.json"
prompt '/forgerdr:workitem --auto continue the forge floor' 'M7 floor'
expect "free text works in any titled session" auto "$(field .mode t20)"
prompt '/forgerdr:security' 'M7 floor'
prompt '/forgerdr:security
with a second line' 'M7 floor'
expect "a step typed launches its cell, each time" 2 "$(field .cells.security.runs t20)"
prompt 'what does the floor show?' 'M7 floor'
prompt '/forgerdr:help' 'M7 floor'
expect "other prompts launch nothing" 2 "$(field '.cells | length' t20)"
status=0
printf '{"prompt":"/forgerdr:plan"}' | HC_TERMINAL_ID='../x' bash "$root/hooks/flow.sh" prompt 2>/dev/null || status=$?
expect "the hook never fails the prompt" 0 "$status"

missing=""
for skill in workitem spec research plan debug build security ship; do
  grep -q 'references/flows.md' "$root/skills/$skill/SKILL.md" || missing+=" $skill"
done
expect "every skill of an item's flow reports to the floor" "" "$missing"

[ "$failures" -eq 0 ] || exit 1
