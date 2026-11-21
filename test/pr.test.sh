#!/usr/bin/env bash
# Smallest check that fails if the review view's bridge breaks: bin/forge-pr.sh keeps what a review session knows of its
# pull request (the review's findings or the threads, the drafts, the stamp and the results) in a file per herdr
# terminal, which the review skill and the forgerdr mod both write, and shows it to the mod.
# Run: bash test/pr.test.sh
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
script="$root/bin/forge-pr.sh"
sandbox="$(mktemp -d)"
trap 'rm -rf "$sandbox"' EXIT
# shellcheck source=test/fakes.sh
. "$root/test/fakes.sh"
fakes_install "$sandbox"
export FORGE_REVIEWS_DIR="$sandbox/reviews"
dir="$FORGE_REVIEWS_DIR"
cd "$sandbox"

failures=0
expect() {
  if [ "$2" = "$3" ]; then printf 'ok   %s\n' "$1"; else printf 'FAIL %s\n  expected: %s\n  actual:   %s\n' "$1" "$2" "$3"; failures=$((failures + 1)); fi
}
status_of() { local status=0; "$@" >/dev/null 2>&1 || status=$?; echo "$status"; }

# The script as the review session in herdr terminal t7 runs it, and as the mod runs it (no terminal of its own).
pr() { HC_TERMINAL_ID=t7 bash "$script" "$@"; }
mod() { bash "$script" "$@"; }
field() { jq -r "$1" "$dir/t7.json"; }

cat > pr.json <<'JSON'
{"url": "https://example.com/acme/shop/pull/42", "number": 42, "title": "pane-resize-debounce",
 "source": "feature/#42-pane-resize-debounce", "target": "main", "author": "quench-dev",
 "items": ["#38 resize storms on split"], "files": 4, "additions": 96, "deletions": 21, "checks": "passing"}
JSON
cat > findings.json <<'JSON'
[{"id": "1", "severity": "blocker", "path": "src/resize.rs", "line": 48, "title": "unwrap on a full channel",
  "rule": "panics are for bugs", "happens": "try_send(size).unwrap() panics", "change": "drop the size on Full",
  "refactor": "match tx.try_send(size) {}", "context": {"start": 46, "lines": ["a", "b", "c"], "mark": 48}},
 {"id": "0", "severity": "should", "path": "", "line": null, "title": "work item named but not linked",
  "rule": "link the item", "happens": "#38 is in the text only", "change": "link #38"},
 {"id": "2", "severity": "should", "path": "src/resize.rs", "line": 22, "title": "magic 16 ms", "rule": "constants",
  "happens": "16 twice", "change": "RESIZE_DEBOUNCE", "group": "debounce"},
 {"id": "5", "severity": "nit", "path": "src/resize.rs", "line": 9, "title": "import grouping", "rule": "imports",
  "happens": "mixed", "change": "group", "discarded": true}]
JSON
cat > drafts.json <<'JSON'
[{"id": "1", "locations": [{"path": "src/resize.rs", "line": 48}], "body": "A full channel panics here.",
  "suggestion": "Ok(()) | Err(Full(_)) => {}"},
 {"id": "2-6", "locations": [{"path": "src/resize.rs", "line": 22}, {"path": "src/pane.rs", "line": 64}],
  "body": "16 is the debounce window."}]
JSON

pr open other pr.json
expect "open keeps the kind and the pull request" 'other 42 pane-resize-debounce' \
  "$(field '"\(.kind) \(.pr.number) \(.pr.title)"')"
expect "open labels the terminal, so the inbox sends its questions to the view" yes "$(called hc label t7 forge.review=other)"
expect "only its owner can read it" 700 "$(stat -c %a "$dir" 2>/dev/null || stat -f %Lp "$dir")"

pr findings findings.json
expect "findings keep the skill's order and fill what they leave out" '1 0 2 5|false true||' \
  "$(field '"\([.findings[].id] | join(" "))|\(.findings[0].discarded) \(.findings[3].discarded)|\(.findings[1].group)|\(.findings[0].group)"')"
printf '[{"id": "9", "severity": "major", "path": "", "line": null, "title": "", "rule": "", "happens": "", "change": ""}]' > bad.json
expect "a finding of an unknown severity is refused" 1 "$(status_of pr findings bad.json)"
said="$(pr findings bad.json 2>&1 || true)"
expect "and says which one" 'forgerdr: finding 9 is not one' "$said"
expect "a refused file keeps what was there" 4 "$(field '.findings | length')"
printf '[{"id": "1"' > broken.json
said="$(pr findings broken.json 2>&1 || true)"
expect "a file that is not JSON is refused, saying so" "forgerdr: not one JSON value: broken.json" "$said"
printf '[] [{"id": "x"}]' > two.json
expect "and so is one with two values" 1 "$(status_of pr findings two.json)"
printf '[{"id": "1"}, {"id": "1"}]' > twice.json
expect "two findings with one id are refused" 1 "$(status_of pr findings twice.json)"

mod pick t7 '["1","2-6"]' s1
expect "the mod keeps the picks for a terminal, and the session that asked for them" '1 2-6 s1' \
  "$(field '"\(.picked | join(" ")) \(.session)"')"
expect "picks are ids, nothing else" 1 "$(status_of mod pick t7 '[1]')"

pr drafts drafts.json
expect "the drafts keep when they were drafted, for the view to answer only a gate asked for them" true \
  "$(field '.drafted > 0')"
expect "the drafts keep their locations, a thread each" '1 2' "$(field '[.drafts[].locations | length] | join(" ")')"
printf '[{"id": "3", "locations": [], "body": "x"}]' > nowhere.json
expect "a draft with nowhere to go is refused" 1 "$(status_of pr drafts nowhere.json)"
mod edit t7 1 'A full channel takes the daemon down.'
expect "edit changes one draft's body" 'A full channel takes the daemon down.|16 is the debounce window.' \
  "$(field '"\(.drafts[0].body)|\(.drafts[1].body)"')"
expect "an unknown draft cannot be edited" 1 "$(status_of mod edit t7 7 text)"
mod drop t7 2-6
expect "drop takes a draft away" '1' "$(field '[.drafts[].id] | join(" ")')"
expect "nothing is stamped before the stamp" '' "$(pr stamped)"

expect "the skill reads the drafts as the view holds them, the human's edits included" \
  'A full channel takes the daemon down.' "$(pr drafted | jq -r '.[0].body')"
seen="$(jq -c '.drafts' "$dir/t7.json")"
expect "a stamp of drafts the view did not show is refused" 1 \
  "$(status_of mod stamp t7 '[{"id": "1", "locations": [{"path": "src/resize.rs", "line": 48}], "body": "Old text."}]')"
expect "and stamps nothing" '' "$(pr stamped)"
mod stamp t7 "$seen" >/dev/null
expect "stamp freezes the drafts as they are" 'A full channel takes the daemon down.' "$(pr stamped | jq -r '.[0].body')"
expect "a stamped draft cannot be edited" 1 "$(status_of mod edit t7 1 other)"
expect "nor dropped" 1 "$(status_of mod drop t7 1)"
pr drafts drafts.json
expect "new drafts from the skill drop the stamp" '' "$(pr stamped)"
pr drafts <(printf '[]')
expect "nothing to stamp is refused" 1 "$(status_of mod stamp t7 '[]')"

printf '[{"id": "1", "path": "src/resize.rs", "line": 48, "status": "published", "url": "https://example.com/c/1"},
  {"id": "2-6", "path": "src/resize.rs", "line": 22, "status": "duplicate"},
  {"id": "2-6", "path": "src/pane.rs", "line": 64, "status": "published"}]' > results.json
: > "$FAKE_CALLS"
pr results results.json
expect "results end the review view's hold on the terminal's questions" yes "$(called hc label t7 forge.review=)"
expect "results keep one line per thread, a grouped draft's each" 'published duplicate published' "$(field '[.results[].status] | join(" ")')"
printf '[{"id": "1", "path": "", "line": null, "status": "lost"}]' > lost.json
expect "a result of an unknown status is refused" 1 "$(status_of pr results lost.json)"

printf '[{"id": "1", "author": "tinker-ana", "path": "src/drawer.rs", "line": 88, "request": "virtualize the list",
  "proposal": "fix", "detail": "render the visible cards", "commit": "7c41e2a"}]' > threads.json
expect "threads belong to the user's own pull request" 1 "$(status_of pr threads threads.json)"
pr open own pr.json
expect "open starts the review afresh" 'own 0 0' "$(field '"\(.kind) \(.findings | length) \(.picked | length)"')"
expect "and findings to another's" 1 "$(status_of pr findings findings.json)"
pr threads threads.json
expect "threads keep their proposal and commit" 'fix 7c41e2a' "$(field '"\(.threads[0].proposal) \(.threads[0].commit)"')"
printf '[{"id": "1", "author": "a", "path": "", "line": null, "request": "", "proposal": "ignore", "detail": ""}]' > ignore.json
expect "a thread of an unknown proposal is refused" 1 "$(status_of pr threads ignore.json)"

for n in 1 2 3 4 5 6; do
  FORGE_READY_TRIES=200 mod pick t7 "[\"$n\"]" 2>>race.err &
  FORGE_READY_TRIES=200 pr threads threads.json 2>>race.err &
done
wait
expect "the skill and the mod writing at once leave a whole review" 'own 1 1' \
  "$(field '"\(.kind) \(.threads | length) \(.picked | length)"')"
expect "each waits for the other's lock" '' "$(cat race.err)"

expect "show gives the mod the review of a terminal" 'own t7' "$(mod show t7 | jq -r '"\(.kind) \(.terminal)"')"
expect "show of a terminal with no review is null" null "$(mod show t9)"
expect "list gives every review" 1 "$(mod list | jq length)"
expect "a terminal id is checked" 1 "$(status_of mod show '../x')"
expect "the skill's commands need a herdr terminal" 1 "$(status_of bash "$script" findings findings.json)"
printf 'not json' > "$dir/t8.json"
expect "a file that is not a review shows as none" null "$(mod show t8)"
expect "and is skipped in the list" 1 "$(mod list 2>/dev/null | jq length)"
jq '.updated = 0' "$dir/t7.json" > "$dir/t7.tmp" && mv "$dir/t7.tmp" "$dir/t7.json"
expect "a review a week untouched goes" 'null false' "$(mod show t7) $([ -e "$dir/t7.json" ] && echo true || echo false)"

[ "$failures" -eq 0 ] || { printf '%s failure(s)\n' "$failures"; exit 1; }
printf 'all passed\n'
