#!/usr/bin/env bash
# Smallest check that fails if hooks/golem-state.sh breaks: a turn that ends in an API error marks the session's herdr
# terminal cracked, with the error's kind; a prompt or a new session mends it; outside herdr nothing is marked.
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
unset FORGE_PARENT_TERMINAL

failures=0
expect() {
  if [ "$2" = "$3" ]; then printf 'ok   %s\n' "$1"; else printf 'FAIL %s\n  expected: %s\n  actual:   %s\n' "$1" "$2" "$3"; failures=$((failures + 1)); fi
}
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
expect "a dispatched agent's golem is tied to its session" '["hc","label","t8","forge.state=","forge.error=","forge.stopped=","forge.started=<ms>","forge.parent=t5"]' "$(calls)"
printf '{"hook_event_name":"SessionStart"}' | HC_TERMINAL_ID=t5 bash "$hook" born
expect "a session of its own only mends" '["hc","label","t5","forge.state=","forge.error=","forge.stopped=","forge.started=<ms>"]' "$(calls)"

: > "$FAKE_CALLS"
printf '{"error":"rate_limit"}' | bash "$hook" crack
expect "outside herdr nothing is marked" "" "$(calls)"

[ "$failures" -eq 0 ] || { printf '%s failure(s)\n' "$failures"; exit 1; }
printf 'all good\n'
