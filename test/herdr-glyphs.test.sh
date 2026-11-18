#!/usr/bin/env bash
# Smallest check that fails if the forgerdr mod's motion font drifts from the frames it is made from: runs
# herdr/tools/glyphs.mts into a sandbox and compares the font and its module with the committed ones, byte for byte.
# Run: bash test/herdr-glyphs.test.sh
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
sandbox="$(mktemp -d)"
trap 'rm -rf "$sandbox"' EXIT
mod="$root/herdr/mods/forgerdr"

node "$root/herdr/tools/glyphs.mts" --out "$sandbox" >/dev/null
fail=0
for file in fonts/ForgerdrGlyphs.ttf kit/motion-glyphs.js; do
  if cmp -s "$sandbox/$file" "$mod/$file"; then
    printf 'ok   %s matches herdr/tools/glyphs.mts\n' "$file"
  else
    printf 'FAIL %s is not what herdr/tools/glyphs.mts makes: run it and commit the result\n' "$file"
    fail=1
  fi
done
# A TrueType font's whole-file checksum comes to B1B0AFBA once head.checkSumAdjustment is right.
sum="$(node -e '
  const data = require("node:fs").readFileSync(process.argv[1]);
  let sum = 0;
  for (let at = 0; at < data.length; at += 4) sum = (sum + data.readUInt32BE(at)) >>> 0;
  console.log(sum.toString(16).toUpperCase().padStart(8, "0"));
' "$mod/fonts/ForgerdrGlyphs.ttf")"
if [[ "$sum" == "B1B0AFBA" ]]; then
  printf 'ok   the font checksums as TrueType asks\n'
else
  printf 'FAIL the font checksums to %s, not B1B0AFBA\n' "$sum"
  fail=1
fi
[[ "$fail" == 0 ]] && printf 'all good\n'
exit "$fail"
