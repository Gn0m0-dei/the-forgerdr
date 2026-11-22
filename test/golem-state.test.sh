#!/usr/bin/env bash
# Smallest check that fails if hooks/golem-state.sh breaks: a turn that ends in an API error marks the session's herdr
# terminal cracked, with the error's kind; a prompt or a new session mends it, and a new session forgets the security
# triage of the one before it; outside herdr nothing is marked.
# Run: bash test/golem-state.test.sh
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
hook="$root/hooks/golem-state.sh"
sandbox="$(mktemp -d)"
trap 'rm -rf "$sandbox"' EXIT
# shellcheck source=test/fakes.sh
. "$root/test/fakes.sh"
fakes_install "$sandbox"
# A session dispatched by another runs with its dispatcher's terminal; the hook must not see it here.
unset FORGE_PARENT_TERMINAL FORGE_AGENT_TYPE
export FORGE_SECURITY_DIR="$sandbox/security"
mkdir -p "$FORGE_SECURITY_DIR"

failures=0
expect() {
  if [ "$2" = "$3" ]; then printf 'ok   %s\n' "$1"; else printf 'FAIL %s\n  expected: %s\n  actual:   %s\n' "$1" "$2" "$3"; failures=$((failures + 1)); fi
}
exists() { [ -e "$1" ] && echo true || echo false; }
# The last hc label call, with each timestamp put as <ms>.
calls() { jq -c 'select(.[1] == "label") | map(sub("=[0-9]{13}$"; "=<ms>"))' "$FAKE_CALLS" | tail -n 1; }

printf '{"hook_event_name":"StopFailure","error":"rate_limit"}' | HC_TERMINAL_ID=t7 bash "$hook" crack
expect "an API error cracks the session's golem" '["hc","label","t7","forge.state=cracked","forge.error=rate_limit","forge.stopped=<ms>"]' "$(calls)"

printf '{"hook_event_name":"StopFailure"}' | HC_TERMINAL_ID=t7 bash "$hook" crack
expect "with the error's kind, or unknown" '["hc","label","t7","forge.state=cracked","forge.error=unknown","forge.stopped=<ms>"]' "$(calls)"

printf '{"hook_event_name":"Stop"}' | HC_TERMINAL_ID=t7 bash "$hook" rest
expect "a turn's end is when its task stopped" '["hc","label","t7","forge.stopped=<ms>"]' "$(calls)"

printf '{"hook_event_name":"UserPromptSubmit"}' | HC_TERMINAL_ID=t7 bash "$hook" mend
expect "writing to it again mends it and starts a task" '["hc","label","t7","forge.state=","forge.error=","forge.stopped=","forge.started=<ms>"]' "$(calls)"

printf '{"hook_event_name":"SessionStart"}' | HC_TERMINAL_ID=t8 FORGE_PARENT_TERMINAL=t5 bash "$hook" born
expect "a dispatched agent's golem is tied to its session" '["hc","label","t8","forge.state=","forge.error=","forge.stopped=","forge.started=<ms>","forge.review=","forge.view=","forge.parent=t5"]' "$(calls)"
printf '{"hook_event_name":"SessionStart"}' | HC_TERMINAL_ID=t8 FORGE_PARENT_TERMINAL=t5 FORGE_AGENT_TYPE=forgerdr:reviewer bash "$hook" born
expect "and says what agent it is" '["hc","label","t8","forge.state=","forge.error=","forge.stopped=","forge.started=<ms>","forge.review=","forge.view=","forge.parent=t5","forge.agent=forgerdr:reviewer"]' "$(calls)"
printf '{"hook_event_name":"SessionStart"}' | HC_TERMINAL_ID=t5 bash "$hook" born
expect "a session of its own mends, and forgets the review or security view of the session before it" '["hc","label","t5","forge.state=","forge.error=","forge.stopped=","forge.started=<ms>","forge.review=","forge.view="]' "$(calls)"
printf '{}' > "$FORGE_SECURITY_DIR/t5.json"
printf '{"hook_event_name":"SessionStart","source":"compact"}' | HC_TERMINAL_ID=t5 bash "$hook" born
expect "a session compacted, or resumed, keeps its review or security view" '["hc","label","t5","forge.state=","forge.error=","forge.stopped=","forge.started=<ms>"]' "$(calls)"
expect "and its security triage" true "$(exists "$FORGE_SECURITY_DIR/t5.json")"
printf '{"hook_event_name":"SessionStart","source":"clear"}' | HC_TERMINAL_ID=t5 bash "$hook" born
expect "a /clear forgets the security triage of the session before it, which the view then calls over" false "$(exists "$FORGE_SECURITY_DIR/t5.json")"
printf '{}' > "$FORGE_SECURITY_DIR/t5.json"
printf '{"hook_event_name":"SessionStart","source":"startup"}' | HC_TERMINAL_ID=t5 bash "$hook" born
expect "and so does claude started again in the terminal" false "$(exists "$FORGE_SECURITY_DIR/t5.json")"

: > "$FAKE_CALLS"
printf '{"error":"rate_limit"}' | bash "$hook" crack
expect "outside herdr nothing is marked" "" "$(calls)"
printf '{"hook_event_name":"Stop"}' | HC_TERMINAL_ID=t7 CLAUDE_CODE_ENTRYPOINT=sdk-cli bash "$hook" rest
expect "nor by a claude -p run in a herdr terminal, which no golem stands for" "" "$(calls)"

[ "$failures" -eq 0 ] || { printf '%s failure(s)\n' "$failures"; exit 1; }
printf 'all good\n'
