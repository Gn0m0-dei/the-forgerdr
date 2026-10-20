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
bytes() { printf '%b' "$1" | od -An -v -tx1 | tr -d ' \n'; }

f="$sandbox/a.ts"; printf 'const a = 1;​const b = 2;\n‮evil\n' > "$f"
expect "zero width and bidi removed" "$(bytes 'const a = 1;const b = 2;\nevil\n')" "$( run "$f" >/dev/null; hex "$f")"
printf 'const a = 1;​const b = 2;\n‮evil\n' > "$f"
expect "report names code points and lines" "forgerdr scrub: $f: removed U+200B (line 1), U+202E (line 2)." "$(context "$f")"
f="$sandbox/bom.ts"; printf '﻿export {};\n﻿x\n' > "$f"
run "$f" >/dev/null
expect "leading bom kept, inner bom removed" "$(bytes '﻿export {};\nx\n')" "$(hex "$f")"
f="$sandbox/crlf.cs"; printf 'a⁠b\r\nc\r\n' > "$f"
run "$f" >/dev/null
expect "crlf preserved" "$(bytes 'ab\r\nc\r\n')" "$(hex "$f")"
f="$sandbox/clean.py"; printf 'print(1)\n' > "$f"
expect "clean file silent" "" "$(run "$f")"
f="$sandbox/bin.dat"; printf 'a\0​b' > "$f"
expect "binary skipped" "$(bytes 'a\0​b')" "$( run "$f" >/dev/null; hex "$f")"
f="$sandbox/bad.txt"; printf 'a\xff​b\n' > "$f"
expect "invalid utf-8 skipped" "$(bytes 'a\xff​b\n')" "$( run "$f" >/dev/null; hex "$f")"
expect "missing file silent" "" "$(run "$sandbox/nope")"
chmod 755 "$sandbox/a.ts"; printf 'x​\n' > "$sandbox/a.ts"; run "$sandbox/a.ts" >/dev/null
expect "mode preserved" 755 "$(stat -f %Lp "$sandbox/a.ts" 2>/dev/null || stat -c %a "$sandbox/a.ts")"

f="$sandbox/zwj.md"; printf 'family 👨‍👩‍👧 ok\nab‍‍cd\n' > "$f"
run "$f" >/dev/null
expect "emoji zwj kept, ascii zwj run removed" "$(bytes 'family 👨‍👩‍👧 ok\nabcd\n')" "$(hex "$f")"
f="$sandbox/fa.txt"; printf 'می‌خواهم\n' > "$f"
run "$f" >/dev/null
expect "zwnj between non-ascii kept" "$(bytes 'می‌خواهم\n')" "$(hex "$f")"
f="$sandbox/nbsp.html"; printf 'a b\n​c　d\n' > "$f"
expect "spaces reported not removed" "forgerdr scrub: $f: removed U+200B (line 2); kept U+00A0 (line 1), U+3000 (line 2): use an escape such as \\u00a0 or &nbsp; if intended." "$(context "$f")"
expect "nbsp bytes untouched" "$(bytes 'a b\nc　d\n')" "$(hex "$f")"
f="$sandbox/only-kept.txt"; printf 'a b\n' > "$f"
expect "kept alone still reported" "forgerdr scrub: $f: kept U+00A0 (line 1): use an escape such as \\u00a0 or &nbsp; if intended." "$(context "$f")"

f="$sandbox/dup.ts"; printf 'a​b​c​d\n' > "$f"
expect "line listed once per code point" "forgerdr scrub: $f: removed U+200B (line 1)." "$(context "$f")"
f="$sandbox/ñandú.ts"; printf 'a​b\n' > "$f"
expect "non-ascii path reported as is" "forgerdr scrub: $f: removed U+200B (line 1)." "$(context "$f")"
mkdir "$sandbox/rodir"; f="$sandbox/rodir/ro.ts"; printf 'a​b\n' > "$f"; chmod 555 "$sandbox/rodir"
expect "unwritable directory reported, not silently skipped" "forgerdr scrub: $f: could not write the file; still contains U+200B (line 1)." "$(context "$f")"
expect "unwritable directory leaves the file untouched" "$(bytes 'a​b\n')" "$(hex "$f")"
chmod 755 "$sandbox/rodir"

[ "$failures" -eq 0 ] || { printf '%s failure(s)\n' "$failures"; exit 1; }
printf 'all good\n'
