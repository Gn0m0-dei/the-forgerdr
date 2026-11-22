#!/usr/bin/env bash
# Smallest check that fails if a skill hands a write to Azure Boards without naming a gate: every line of a skill that
# posts a work item comment (--discussion) or runs an azdospec procedure (/azdo:propose, /azdo:apply, /azdo:archive,
# with or without the slash) names a gate. It checks lines, not writes: a line that names one gate passes whole, so it
# catches a line that names none. Table rows only list the commands and are left out.
# Run: bash test/gates.test.sh
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"

failures=0
expect() {
  if [ "$2" = "$3" ]; then printf 'ok   %s\n' "$1"; else printf 'FAIL %s\n  expected: %s\n  actual:   %s\n' "$1" "$2" "$3"; failures=$((failures + 1)); fi
}

writes="$(cd "$root" && grep -HnE -- '--discussion|/?azdo:(propose|apply|archive)' skills/*/SKILL.md |
  grep -vE '^[^:]+:[0-9]+:\|' || true)"
expect "the skills still hand writes to Azure Boards" true "$([ -n "$writes" ] && echo true || echo false)"
ungated="$(printf '%s\n' "$writes" | grep -v 'Gate ' | cut -d: -f1,2 | tr '\n' ' ' || true)"
expect "every skill line that writes to Azure Boards names a gate" "" "$ungated"

[ "$failures" -eq 0 ] || exit 1
