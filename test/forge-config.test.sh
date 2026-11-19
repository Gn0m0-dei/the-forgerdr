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
"$bin" set spec "openspec:team-specs" other >/dev/null
expect "global set" openspec "$("$bin" get spec)"
expect "project override" azure "$("$bin" get spec acme)"
expect "project with store" "openspec:team-specs" "$("$bin" get spec other)"
expect "project falls back to global" openspec "$("$bin" get spec zzz)"
"$bin" set spec chat acme >/dev/null
expect "project overwritten" chat "$("$bin" get spec acme)"
expect "other project untouched" "openspec:team-specs" "$("$bin" get spec other)"
expect "one projects table" 1 "$(grep -c '^\[spec.projects\]' "$FORGERDR_CONFIG")"
expect "rejects unknown mode" 1 "$("$bin" set spec bogus >/dev/null 2>&1; echo $?)"

# The forge mode: a spec mode, or GitHub or GitLab, whose design stays in the chat.
"$bin" set spec azure other2 >/dev/null
expect "the mode is the spec mode when unset" azure "$("$bin" get mode other2)"
expect "and the global one for a project without any" openspec "$("$bin" get mode nobody)"
"$bin" set mode github web >/dev/null
expect "a github forge" github "$("$bin" get mode web)"
expect "keeps its design in the chat" chat "$("$bin" get spec web)"
"$bin" set mode "openspec:team-specs" specs >/dev/null
expect "an OpenSpec store sets the spec mode too" "openspec:team-specs openspec:team-specs" "$("$bin" get mode specs) $("$bin" get spec specs)"
"$bin" set spec openspec web >/dev/null
expect "a spec mode set since wins over the mode" openspec "$("$bin" get mode web)"
"$bin" set mode gitlab web >/dev/null
expect "and the mode set again wins back" "gitlab chat" "$("$bin" get mode web) $("$bin" get spec web)"
expect "rejects an unknown mode" 1 "$("$bin" set mode jira web >/dev/null 2>&1; echo $?)"

# Where a forge's work comes from when it is not its repository.
expect "no backlog by default" "" "$("$bin" get backlog shop)"
"$bin" set backlog "https://dev.azure.com/other-org/Shop Platform" shop >/dev/null
expect "a backlog of its own" "https://dev.azure.com/other-org/Shop Platform" "$("$bin" get backlog shop)"
"$bin" set backlog - shop >/dev/null
expect "unset again" "" "$("$bin" get backlog shop)"
"$bin" set backlog https://gitlab.example.com/shop/issues web >/dev/null
expect "a GitLab project, as well" "https://gitlab.example.com/shop/issues" "$("$bin" get backlog web)"
expect "rejects what is not a URL" 1 "$("$bin" set backlog shop/issues web >/dev/null 2>&1; echo $?)"
expect "the settings stay apart" "1 1 1" \
  "$(grep -c '^\[spec.projects\]' "$FORGERDR_CONFIG") $(grep -c '^\[mode.projects\]' "$FORGERDR_CONFIG") $(grep -c '^\[backlog.projects\]' "$FORGERDR_CONFIG")"

[ "$failures" -eq 0 ] || { printf '%s failure(s)\n' "$failures"; exit 1; }
printf 'all good\n'
