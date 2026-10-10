#!/usr/bin/env bash
# Smoke test of the OpenSpec CLI contract the spec, plan, build and ship skills rely on.
# Runs the real CLI in a throwaway HOME. Skips when openspec is missing, unless FORGE_REQUIRE_OPENSPEC=1.
# Run: bash test/openspec.test.sh
set -euo pipefail

if ! command -v openspec >/dev/null 2>&1; then
  [ "${FORGE_REQUIRE_OPENSPEC:-}" = 1 ] && { printf 'FAIL openspec CLI not installed\n'; exit 1; }
  printf 'skip openspec CLI not installed\n'
  exit 0
fi

sandbox="$(cd "$(mktemp -d)" && pwd -P)"
trap 'rm -rf "$sandbox"' EXIT
export HOME="$sandbox/home" XDG_CONFIG_HOME="$sandbox/home/.config" OPENSPEC_NO_UPDATE_CHECK=1 OPENSPEC_NO_ANIMATION=1
mkdir -p "$HOME"
# OpenSpec commits when it sets up a store; CI runners have no git identity, so give the throwaway HOME one.
git config --global user.name forgerdr-test
git config --global user.email forgerdr-test@example.invalid

failures=0
expect() {
  if [ "$2" = "$3" ]; then printf 'ok   %s\n' "$1"; else printf 'FAIL %s\n  expected: %s\n  actual:   %s\n' "$1" "$2" "$3"; failures=$((failures + 1)); fi
}

repo="$sandbox/repo"
mkdir -p "$repo" && cd "$repo" && git init -q
openspec init --tools none >/dev/null 2>&1
expect "init creates openspec/" yes "$([ -d openspec/specs ] && echo yes)"

change="1234-search-filters"
openspec new change "$change" --json >/dev/null
dir="openspec/changes/$change"
expect "new change scaffolds the folder" yes "$([ -f "$dir/.openspec.yaml" ] && echo yes)"
expect "status lists the artifacts in order" "proposal specs design tasks" "$(openspec status --change "$change" --json | jq -r '[.artifacts[].id] | join(" ")')"
for artifact in proposal specs design tasks; do
  expect "instructions $artifact give template and output path" yes \
    "$(openspec instructions "$artifact" --change "$change" --json | jq -r 'if (.template | length) > 0 and (.instruction | length) > 0 and (.outputPath | length) > 0 then "yes" else "no" end')"
done

cat > "$dir/proposal.md" <<'MD'
# Proposal

## Why

Search filters are lost when the user navigates back to the results.

## What Changes

- Keep the selected search filters in the URL.

## Capabilities

### New Capabilities
- `search-filters`: the filters a user applies to search results and how long they persist.

### Modified Capabilities

## Impact

Search page. Work item: https://example.com/items/1234
MD
mkdir -p "$dir/specs/search-filters"
cat > "$dir/specs/search-filters/spec.md" <<'MD'
# Spec Delta

## Purpose

Search filters let a user narrow the results and keep that selection while navigating.

## ADDED Requirements

### Requirement: Filters survive back navigation
The system SHALL restore the filters a user applied when the user navigates back to the results.

#### Scenario: Back from a result restores the filters
- **WHEN** a user applies a filter, opens a result and navigates back
- **THEN** the results show the same filter applied
MD
printf '# Design\n\n## Decision\n\nKeep the filters in the URL query string.\n' > "$dir/design.md"
printf '# Tasks\n\n## 1. Filters in the URL\n\n- [x] 1.1 Failing test for restoring filters\n- [x] 1.2 Read and write filters through the URL\n' > "$dir/tasks.md"

expect "validate --strict passes" 0 "$(openspec validate "$change" --strict >/dev/null 2>&1; echo $?)"
expect "status complete" true "$(openspec status --change "$change" --json | jq -r '.isComplete')"
openspec archive "$change" --yes >/dev/null 2>&1
expect "archive applies the delta to specs" yes "$(grep -q 'Filters survive back navigation' openspec/specs/search-filters/spec.md && echo yes)"
expect "archive moves the change" 1 "$(find openspec/changes/archive -maxdepth 1 -name "*-$change" | wc -l | tr -d ' ')"

store="$sandbox/specs-store"
mkdir -p "$store" && git -C "$store" init -q
output="$(openspec store setup team-specs --path "$store" 2>&1)" || { printf 'FAIL store setup\n%s\n' "$output"; exit 1; }
expect "store is registered" team-specs "$(openspec store list --json | jq -r '.stores[0].id')"
openspec new change 77-store-demo --store team-specs --json >/dev/null
expect "change lands in the store" yes "$([ -d "$store/openspec/changes/77-store-demo" ] && echo yes)"

[ "$failures" -eq 0 ] || { printf '%s failure(s)\n' "$failures"; exit 1; }
printf 'all good\n'
