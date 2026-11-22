#!/usr/bin/env bash
# Smallest check that fails if a skill writes to Azure Boards without a gate: every line of a skill that posts a work
# item comment (--discussion) or hands a write to azdospec (/azdo:propose, /azdo:apply, /azdo:archive) names the gate
# the write waits for. Table rows only list the commands and are left out.
# Run: bash test/gates.test.sh
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"

failures=0
expect() {
  if [ "$2" = "$3" ]; then printf 'ok   %s\n' "$1"; else printf 'FAIL %s\n  expected: %s\n  actual:   %s\n' "$1" "$2" "$3"; failures=$((failures + 1)); fi
}

ungated="$(cd "$root" && grep -nE -- '--discussion|/azdo:(propose|apply|archive)' skills/*/SKILL.md |
  grep -vE '^[^:]+:[0-9]+:\|' | grep -v 'Gate ' | cut -d: -f1,2 | tr '\n' ' ' || true)"
expect "every skill line that writes to Azure Boards names its gate" "" "$ungated"

[ "$failures" -eq 0 ] || exit 1
