#!/usr/bin/env bash
# Smallest check that fails if the forgerdr mod's pixel art drifts from the design exports it is generated from: runs
# herdr/tools/sprites.mts into a sandbox and compares it with herdr/mods/forgerdr/img, file by file; then checks that
# every golem and icon kit/sprites.js names has its files, and that the custom golems keep iron's chest, where the
# crucible fills, in their art and in CHEST.
# Run: bash test/herdr-sprites.test.sh
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
img="$root/herdr/mods/forgerdr/img"
sprites="$root/herdr/mods/forgerdr/kit/sprites.js"
parts="$root/herdr/tools/design/golem-parts.txt"
sandbox="$(mktemp -d)"
trap 'rm -rf "$sandbox"' EXIT
failures=0
fail() {
  printf 'FAIL %s\n' "$1"
  failures=$((failures + 1))
}

node "$root/herdr/tools/sprites.mts" --out "$sandbox/img" >/dev/null
if ! diff -r "$sandbox/img" "$img" >/dev/null; then
  diff -rq "$sandbox/img" "$img" || true
  printf 'FAIL the committed img/ is not what herdr/tools/sprites.mts makes: run it and commit the result\n'
  exit 1
fi
printf 'ok   img/ matches herdr/tools/sprites.mts (%s files)\n' "$(find "$sandbox/img" -type f | wc -l | tr -d ' ')"

# The entries of a frozen object of kit/sprites.js that match a pattern, one per line; fails when the object is not
# there in the shape this test reads (a reformat).
entries() { tr -d '\n' <"$sprites" | grep -o "export const $1 = Object.freeze({[^}]*})" | grep -oE "$2"; }

before=$failures
roles="$(entries GOLEM '[a-z]+: [0-9]+' | cut -d: -f1)" ||
  fail "kit/sprites.js has no GOLEM read as export const GOLEM = Object.freeze({ <role>: <side>, ... })"
for role in $roles; do
  for mood in forging waiting "done" cracked idle; do
    file="$img/golem/$role-$mood"
    if [ ! -f "$file.svg" ]; then
      fail "golem $role has no $mood layer: add its grid to golem-parts.txt and its role to sprites.mts"
    elif ! grep -q '<path' "$file-tone.svg" 2>/dev/null; then
      fail "golem $role $mood has no toned eyes"
    fi
  done
done
[ "$failures" -gt "$before" ] || printf 'ok   every golem has its layers in every mood (%s)\n' "$(echo "$roles" | paste -sd, -)"

before=$failures
icons="$(entries ICON '"[^"]+"' | tr -d '"')" ||
  fail "kit/sprites.js has no ICON read as export const ICON = Object.freeze({ <name>: \"<file>\", ... })"
for name in $icons; do
  [ -f "$img/icon/$name.svg" ] || fail "ICON.$name has no img/icon/$name.svg: add it to icons.json"
done
[ "$failures" -gt "$before" ] || printf 'ok   every icon has its file (%s)\n' "$(echo "$icons" | wc -l | tr -d ' ')"

# Columns 4-7 of rows 5-8 of a 12x12 grid of golem-parts.txt, by its title: the chest CHEST in kit/sprites.js fills.
chest() {
  awk -v title="$1" '
    $0 == title || index($0, title " (") == 1 { found = 1; next }
    found && length($0) == 12 && /^[.A-Za-z]+$/ { row++; if (row >= 6 && row <= 9) printf "%s", substr($0, 5, 4); if (row == 12) exit }
  ' "$parts"
}
# The value CHEST in kit/sprites.js gives a golem.
chestOf() { sed -n "/^const CHEST = {\$/,/^};\$/s/^  $1: \(.*\),\$/\1/p" "$sprites"; }
before=$failures
shared="$(chestOf iron)"
[ -n "$shared" ] || fail "kit/sprites.js has no CHEST entry for iron read as const CHEST = { iron: <chest>, ... }"
for role in reviewer warden; do
  [ -z "$shared" ] || [ "$(chestOf "$role")" = "$shared" ] ||
    fail "CHEST gives $role a chest of its own, not iron's ($shared): its crucible could drift off its art"
done
for role in REVIEWER WARDEN; do
  for mood in FORGING WAITING DONE CRACKED IDLE; do
    iron="$(chest "IRON $mood")"
    [ -n "$iron" ] && [ "$(chest "$role $mood")" = "$iron" ] ||
      fail "$role $mood's chest is not iron's: its crucible would land off it"
  done
done
[ "$failures" -gt "$before" ] || printf 'ok   reviewer and warden keep iron'\''s chest, in their art in every mood and in CHEST (%s)\n' "$shared"

[ "$failures" -eq 0 ] || exit 1
printf 'all good\n'
