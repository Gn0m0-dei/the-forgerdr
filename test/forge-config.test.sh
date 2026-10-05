#!/usr/bin/env bash
# Smallest check that fails if forge-config.sh breaks. Run: bash test/forge-config.test.sh
set -euo pipefail
bin="$(cd "$(dirname "$0")/.." && pwd)/bin/forge-config.sh"
sandbox="$(mktemp -d)"
trap 'rm -rf "$sandbox"' EXIT
export FORGERDR_CONFIG="$sandbox/config.toml"

failures=0
expect() {
  if [ "$2" = "$3" ]; then printf 'ok   %s\n' "$1"; else printf 'FAIL %s\n  expected: %s\n  actual:   %s\n' "$1" "$2" "$3"; failures=$((failures + 1)); fi
}

expect "default without file" chat "$("$bin" get spec)"
expect "project without file" chat "$("$bin" get spec acme)"
"$bin" set spec openspec >/dev/null
"$bin" set spec azure acme >/dev/null
"$bin" set spec "openspec:/srv/specs" other >/dev/null
expect "global set" openspec "$("$bin" get spec)"
expect "project override" azure "$("$bin" get spec acme)"
expect "project with path" "openspec:/srv/specs" "$("$bin" get spec other)"
expect "project falls back to global" openspec "$("$bin" get spec zzz)"
"$bin" set spec chat acme >/dev/null
expect "project overwritten" chat "$("$bin" get spec acme)"
expect "other project untouched" "openspec:/srv/specs" "$("$bin" get spec other)"
expect "one projects table" 1 "$(grep -c '^\[spec.projects\]' "$FORGERDR_CONFIG")"
expect "rejects unknown mode" 1 "$("$bin" set spec bogus >/dev/null 2>&1; echo $?)"

[ "$failures" -eq 0 ] || { printf '%s failure(s)\n' "$failures"; exit 1; }
printf 'all good\n'
