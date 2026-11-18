#!/usr/bin/env bash
# Smallest check that fails if the forgerdr mod's pixel art drifts from the design exports it is generated from: runs
# herdr/tools/sprites.mts into a sandbox and compares it with herdr/mods/forgerdr/img, file by file.
# Run: bash test/herdr-sprites.test.sh
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
sandbox="$(mktemp -d)"
trap 'rm -rf "$sandbox"' EXIT

node "$root/herdr/tools/sprites.mts" --out "$sandbox/img" >/dev/null
if ! diff -r "$sandbox/img" "$root/herdr/mods/forgerdr/img" >/dev/null; then
  diff -rq "$sandbox/img" "$root/herdr/mods/forgerdr/img" || true
  printf 'FAIL the committed img/ is not what herdr/tools/sprites.mts makes: run it and commit the result\n'
  exit 1
fi
printf 'ok   img/ matches herdr/tools/sprites.mts (%s files)\n' "$(find "$sandbox/img" -type f | wc -l | tr -d ' ')"
printf 'all good\n'
