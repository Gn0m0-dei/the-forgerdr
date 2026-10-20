#!/usr/bin/env bash
# Smallest check that fails if scrub-unicode.sh breaks. Run: bash test/scrub-unicode.test.sh
set -euo pipefail
hook="$(cd "$(dirname "$0")/.." && pwd)/hooks/scrub-unicode.sh"
sandbox="$(mktemp -d)"
trap 'rm -rf "$sandbox"' EXIT

failures=0
expect() {
  if [ "$2" = "$3" ]; then printf 'ok   %s\n' "$1"; else printf 'FAIL %s\n  expected: %s\n  actual:   %s\n' "$1" "$2" "$3"; failures=$((failures + 1)); fi
}
run() { jq -nc --arg p "$1" '{tool_input:{file_path:$p}}' | bash "$hook"; }
context() { run "$1" | jq -r '.hookSpecificOutput.additionalContext // empty'; }
hex() { od -An -v -tx1 "$1" | tr -d ' \n'; }
# Fixtures are written with placeholders so this file holds no invisible character the hook would strip:
# {U+200B} a code point, {x FF} a raw byte, {LF}, {CR}, {NUL}.
raw() { printf '%s' "$1" | perl -pe 's/[{]U[+]([0-9A-Fa-f]{4,6})[}]/do { my $c = chr hex $1; utf8::encode($c); $c }/ge; s/[{]x ([0-9A-Fa-f]{2})[}]/chr hex $1/ge; s/[{]LF[}]/chr 10/ge; s/[{]CR[}]/chr 13/ge; s/[{]NUL[}]/chr 0/ge'; }
bytes() { raw "$1" | od -An -v -tx1 | tr -d ' \n'; }
mode() { perl -e 'printf "%o", (stat $ARGV[0])[2] & 07777' "$1"; }
listing() { find "$1" -mindepth 1 -exec basename {} \; | paste -sd " " -; }
esc="$(printf '%b' '\0134')"

f="$sandbox/a.ts"; raw 'const a = 1;{U+200B}const b = 2;{LF}{U+202E}evil{LF}' > "$f"
expect "zero width and bidi removed" "$(bytes 'const a = 1;const b = 2;{LF}evil{LF}')" "$( run "$f" >/dev/null; hex "$f")"
raw 'const a = 1;{U+200B}const b = 2;{LF}{U+202E}evil{LF}' > "$f"
expect "report names code points and lines" "forgerdr scrub: $f: removed U+200B (line 1), U+202E (line 2)." "$(context "$f")"
f="$sandbox/bom.ts"; raw '{U+FEFF}export {};{LF}{U+FEFF}x{LF}' > "$f"
run "$f" >/dev/null
expect "leading bom kept, inner bom removed" "$(bytes '{U+FEFF}export {};{LF}x{LF}')" "$(hex "$f")"
f="$sandbox/crlf.cs"; raw 'a{U+2060}b{CR}{LF}c{CR}{LF}' > "$f"
run "$f" >/dev/null
expect "crlf preserved" "$(bytes 'ab{CR}{LF}c{CR}{LF}')" "$(hex "$f")"
f="$sandbox/clean.py"; raw 'print(1){LF}' > "$f"
expect "clean file silent" "" "$(run "$f")"
f="$sandbox/bin.dat"; raw 'a{NUL}{U+200B}b' > "$f"
expect "binary skipped" "$(bytes 'a{NUL}{U+200B}b')" "$( run "$f" >/dev/null; hex "$f")"
f="$sandbox/bad.txt"; raw 'a{x ff}{U+200B}b{LF}' > "$f"
expect "invalid utf-8 skipped" "$(bytes 'a{x ff}{U+200B}b{LF}')" "$( run "$f" >/dev/null; hex "$f")"
expect "missing file silent" "" "$(run "$sandbox/nope")"
chmod 755 "$sandbox/a.ts"; raw 'x{U+200B}{LF}' > "$sandbox/a.ts"; run "$sandbox/a.ts" >/dev/null
expect "mode preserved" 755 "$(mode "$sandbox/a.ts")"

f="$sandbox/zwj.md"; raw 'family {U+1F468}{U+200D}{U+1F469}{U+200D}{U+1F467} ok{LF}ab{U+200D}{U+200D}cd{LF}' > "$f"
run "$f" >/dev/null
expect "emoji zwj kept, ascii zwj run removed" "$(bytes 'family {U+1F468}{U+200D}{U+1F469}{U+200D}{U+1F467} ok{LF}abcd{LF}')" "$(hex "$f")"
f="$sandbox/fa.txt"; raw '{U+0645}{U+06CC}{U+200C}{U+062E}{U+0648}{U+0627}{U+0647}{U+0645}{LF}' > "$f"
run "$f" >/dev/null
expect "zwnj between non-ascii kept" "$(bytes '{U+0645}{U+06CC}{U+200C}{U+062E}{U+0648}{U+0627}{U+0647}{U+0645}{LF}')" "$(hex "$f")"
f="$sandbox/nbsp.html"; raw 'a{U+00A0}b{LF}{U+200B}c{U+3000}d{LF}' > "$f"
expect "spaces reported not removed" "forgerdr scrub: $f: removed U+200B (line 2); kept U+00A0 (line 1), U+3000 (line 2): use an escape such as ${esc}u00a0 or &nbsp; if intended." "$(context "$f")"
expect "nbsp bytes untouched" "$(bytes 'a{U+00A0}b{LF}c{U+3000}d{LF}')" "$(hex "$f")"
f="$sandbox/only-kept.txt"; raw 'a{U+00A0}b{LF}' > "$f"
expect "kept alone still reported" "forgerdr scrub: $f: kept U+00A0 (line 1): use an escape such as ${esc}u00a0 or &nbsp; if intended." "$(context "$f")"

f="$sandbox/dup.ts"; raw 'a{U+200B}b{U+200B}c{U+200B}d{LF}' > "$f"
expect "line listed once per code point" "forgerdr scrub: $f: removed U+200B (line 1)." "$(context "$f")"
f="$sandbox/ñandú.ts"; raw 'a{U+200B}b{LF}' > "$f"
expect "non-ascii path reported as is" "forgerdr scrub: $f: removed U+200B (line 1)." "$(context "$f")"
# root ignores directory permissions, so the write-failure path is only observable as a normal user.
if [ "$(id -u)" -ne 0 ]; then
mkdir "$sandbox/rodir"; f="$sandbox/rodir/ro.ts"; raw 'a{U+200B}b{LF}' > "$f"; chmod 555 "$sandbox/rodir"
expect "unwritable directory reported with the reason" "forgerdr scrub: $f: could not write the file (cannot create a temporary file in $(cd "$sandbox" && pwd -P)/rodir: Permission denied); still contains U+200B (line 1)." "$(context "$f")"
expect "unwritable directory leaves the file untouched" "$(bytes 'a{U+200B}b{LF}')" "$(hex "$f")"
expect "no temporary file left behind" "ro.ts" "$(listing "$sandbox/rodir")"
chmod 755 "$sandbox/rodir"
fi
mkdir "$sandbox/real"; raw 'a{U+200B}b{LF}' > "$sandbox/real/t.ts"; chmod 640 "$sandbox/real/t.ts"; ln -s "$sandbox/real/t.ts" "$sandbox/link.ts"
run "$sandbox/link.ts" >/dev/null
expect "symlink kept and its target scrubbed" "link:$(bytes 'ab{LF}')" "$([ -L "$sandbox/link.ts" ] && printf link:; hex "$sandbox/real/t.ts")"
expect "target mode preserved through the symlink" 640 "$(mode "$sandbox/real/t.ts")"
expect "no temporary file next to the target" "t.ts" "$(listing "$sandbox/real")"

[ "$failures" -eq 0 ] || { printf '%s failure(s)\n' "$failures"; exit 1; }
printf 'all good\n'
