#!/usr/bin/env bash
# Smallest check that fails if review rounds break: bin/forge-round.sh snapshots what an agent's worktree holds into git
# commits pinned under refs/forgerdr/rounds/<terminal>/, never touching the user's index, HEAD or stash, and keeps each
# terminal's base, rounds and comments for the forgerdr mod.
# Run: bash test/round.test.sh
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
script="$root/bin/forge-round.sh"
sandbox="$(mktemp -d)"
trap 'rm -rf "$sandbox"' EXIT
# shellcheck source=test/fakes.sh
. "$root/test/fakes.sh"
fakes_install "$sandbox"
export FORGE_ROUNDS_DIR="$sandbox/rounds" GIT_CONFIG_GLOBAL="$sandbox/gitconfig"
dir="$FORGE_ROUNDS_DIR"
git config --global user.name tester
git config --global user.email tester@example.com
git config --global init.defaultBranch main

failures=0
expect() {
  if [ "$2" = "$3" ]; then printf 'ok   %s\n' "$1"; else printf 'FAIL %s\n  expected: %s\n  actual:   %s\n' "$1" "$2" "$3"; failures=$((failures + 1)); fi
}
status_of() { local status=0; "$@" >/dev/null 2>&1 || status=$?; echo "$status"; }

# The SessionStart hook in herdr terminal $T (t7 by default), for Claude session $S (s1), in the current folder.
base() { printf '{"session_id":"%s","cwd":"%s"}' "${S:-s1}" "$PWD" | HC_TERMINAL_ID="${T:-t7}" bash "$script" base; }
round() { bash "$script" "$@"; }
field() { jq -r "$1" "$dir/${2:-t7}.json"; }
refs() { git for-each-ref --format='%(refname)' "refs/forgerdr/rounds/${1:-t7}/" | sed "s|refs/forgerdr/rounds/${1:-t7}/||" | tr '\n' ' '; }

repo="$sandbox/repo"
git init -q "$repo"
cd "$repo"
printf 'one\n' > a.txt
printf 'keep\n' > gone.txt
git add a.txt gone.txt
git commit -qm first
git stash list > "$sandbox/stash.before"
printf 'staged\n' > a.txt
git add a.txt
printf 'loose\n' > b.txt
head_before="$(git rev-parse HEAD)"

base
expect "the base is pinned for the terminal" 'base ' "$(refs)"
expect "the user's index is untouched" 'a.txt' "$(git diff --cached --name-only)"
expect "nor their HEAD" "$head_before" "$(git rev-parse HEAD)"
expect "nor their stash" "$(cat "$sandbox/stash.before")" "$(git stash list)"
expect "the base holds the worktree as it is, untracked files too" 'staged loose' \
  "$(git show refs/forgerdr/rounds/t7/base:a.txt) $(git show refs/forgerdr/rounds/t7/base:b.txt)"
expect "the state knows its session, its repository and its base" "s1 $(git rev-parse --show-toplevel) $(git rev-parse refs/forgerdr/rounds/t7/base)" \
  "$(field '"\(.session_id) \(.repo) \(.base)"')"
expect "only its owner can read it" 700 "$(stat -c %a "$dir" 2>/dev/null || stat -f %Lp "$dir")"

printf 'loose\nmore\n' > b.txt
rm gone.txt
printf 'new\n' > c.txt
round snap t7 "$PWD" > "$sandbox/snap.json"
expect "a snap makes round 1 from the base" "1 open $(git rev-parse refs/forgerdr/rounds/t7/base)" \
  "$(jq -r '"\(.n) \(.status) \(.from)"' "$sandbox/snap.json")"
expect "and pins it" '1 base ' "$(refs)"
round diff t7 1 > "$sandbox/diff1"
expect "its diff goes from the base to its head, with a/ and b/ prefixes" 'b/b.txt b/c.txt a/gone.txt' \
  "$(grep -E '^(\+\+\+ b/|--- a/gone)' "$sandbox/diff1" | sed -E 's/^(\+\+\+|---) //' | tr '\n' ' ' | sed 's/ $//')"
expect "a second snap with nothing new says so" 3 "$(status_of round snap t7 "$PWD")"
expect "and makes no round" 1 "$(field '.rounds | length')"
expect "but prints the last one, for its rounds to be shown" 1 "$(round snap t7 "$PWD" 2>/dev/null | jq '.n' || true)"

printf 'loose\nmore\nagain\n' > b.txt
round snap t7 >/dev/null
expect "round 2 goes from round 1's head" "$(git rev-parse refs/forgerdr/rounds/t7/1)" "$(field '.rounds[1].from')"
expect "its diff is only what changed since round 1" 'b/b.txt' "$(grep '^+++ ' <(round diff t7 2) | sed 's/^+++ //' | tr '\n' ' ' | sed 's/ $//')"
expect "all of it goes from the base" 3 "$(grep -c '^+++ ' <(round diff t7 2 all))"
expect "an unknown round has no diff" 1 "$(status_of round diff t7 9)"

git gc -q --prune=now 2>/dev/null
expect "rounds survive git gc" yes "$(git cat-file -e refs/forgerdr/rounds/t7/1 2>/dev/null && echo yes || echo no)"

S=s1 base
expect "the same session resumed keeps its rounds" '1 2 base ' "$(refs)"
CLAUDE_CODE_ENTRYPOINT=sdk-cli S=s3 base
expect "a claude -p run started from the session's Bash leaves them alone" 's1 1 2 base ' \
  "$(field '.session_id') $(refs)"
S=s2 base
expect "another session in the terminal starts afresh" 'base ' "$(refs)"
expect "with no rounds" 0 "$(field '.rounds | length')"

git -c user.name=t -c user.email=t@example.com commit -qam second
git worktree add -q "$sandbox/wt" -b side
(cd "$sandbox/wt" && printf 'side\n' > a.txt && git add a.txt && printf 'wt\n' > w.txt && T=t8 base)
expect "a worktree's snapshot holds its own files" 'side wt' \
  "$(git show refs/forgerdr/rounds/t8/base:a.txt) $(git show refs/forgerdr/rounds/t8/base:w.txt)"
expect "and leaves its index alone" 'a.txt' "$(cd "$sandbox/wt" && git diff --cached --name-only)"

(cd "$sandbox" && printf '{"session_id":"s1","cwd":"%s"}' "$sandbox" | HC_TERMINAL_ID=t9 bash "$script" base)
expect "outside git the hook does nothing" false "$([ -e "$dir/t9.json" ] && echo true || echo false)"
expect "outside herdr the hook does nothing" 0 "$(printf '{}' | status_of bash "$script" base)"

printf 'fresh\n' > a.txt
round snap t10 "$PWD" >/dev/null
expect "a snap with no base starts from HEAD" "1 $(git rev-parse HEAD)" "$(field '"\(.rounds[0].n) \(.base)"' t10)"
expect "a snap with no base needs the folder" 1 "$(status_of round snap t11)"
expect "a terminal id is checked" 1 "$(status_of round snap '../x' "$PWD")"

big="$sandbox/big"
git init -q "$big"
(cd "$big" && git commit -q --allow-empty -m empty && seq 1 30000 > n.txt && FORGE_ROUND_DIFF_MAX=100 bash "$script" snap t12 "$PWD" >/dev/null)
expect "a long diff is cut and says so" '101 \ forgerdr: cut at 100 lines' \
  "$(FORGE_ROUND_DIFF_MAX=100 round diff t12 1 | wc -l | tr -d ' ') $(FORGE_ROUND_DIFF_MAX=100 round diff t12 1 | tail -n 1)"

# The human's side, on terminal t7's new session: comments, views, a request and an approval.
cd "$repo"
printf 'later\n' > d.txt
round snap t7 >/dev/null
printf 'later\nstill\n' > d.txt
round snap t7 >/dev/null
expect "a comment gets its id" c1 \
  "$(round comment t7 '{"round": 1, "path": "d.txt", "side": "new", "line": 1, "text": "later", "body": "Why later?"}')"
round comment t7 '{"round": 2, "path": "d.txt", "side": "new", "line": 2, "text": "still", "body": "Drop this."}' >/dev/null
expect "comments start open and unsent" 'c1 c2 false false false' \
  "$(field '"\([.comments[].id] | join(" ")) \(.comments[0].resolved) \(.comments[0].sent) \(.comments[1].sent)"')"
expect "a comment with an unknown side is refused" 1 \
  "$(status_of round comment t7 '{"round": 1, "path": "d.txt", "side": "up", "line": 1, "text": "", "body": "x"}')"
expect "a comment on a round that is not there is refused" 1 \
  "$(status_of round comment t7 '{"round": 9, "path": "d.txt", "side": "new", "line": 1, "text": "", "body": "x"}')"
expect "an empty comment is refused" 1 \
  "$(status_of round comment t7 '{"round": 1, "path": "d.txt", "side": "new", "line": 1, "text": "", "body": "  "}')"

round viewed t7 2 d.txt on
expect "a file is marked viewed in its round" 'd.txt' "$(field '.rounds[1].viewed | join(" ")')"
round viewed t7 2 d.txt on
round viewed t7 2 d.txt off
expect "and unmarked" 0 "$(field '.rounds[1].viewed | length')"

round request t7 1
expect "a request marks its round and sends the open comments up to it" 'changes open true false' \
  "$(field '"\(.rounds[0].status) \(.rounds[1].status) \(.comments[0].sent) \(.comments[1].sent)"')"
round resolve t7 c1
expect "a comment is resolved" true "$(field '.comments[0].resolved')"
round uncomment t7 c2
expect "a comment is taken away" c1 "$(field '[.comments[].id] | join(" ")')"
expect "an unknown comment says so" 1 "$(status_of round resolve t7 c9)"

round approve t7 2
approved="$(git rev-parse refs/forgerdr/rounds/t7/2)"
expect "an approval moves the base to the round's head" "$approved $approved" \
  "$(git rev-parse refs/forgerdr/rounds/t7/base) $(field .base)"
expect "and marks the round" approved "$(field '.rounds[1].status')"
printf 'later\nstill\nmore\n' > d.txt
round snap t7 >/dev/null
expect "the next round's whole diff starts at the approval" 1 "$(grep -c '^+++ ' <(round diff t7 3 all))"

expect "show gives the mod a terminal's rounds" 3 "$(round show t7 | jq '.rounds | length')"
expect "show of a terminal with none is null" null "$(round show t99)"

# What sessions leave goes once it is a week untouched, when another session starts; until then a resume finds it.
touch -t 202001010000 "$dir/t10.json"
T=t13 base
expect "a terminal's rounds a week untouched go when a session starts" 'false 0' \
  "$([ -e "$dir/t10.json" ] && echo true || echo false) $(git for-each-ref refs/forgerdr/rounds/t10/ | wc -l | tr -d ' ')"

[ "$failures" -eq 0 ] || { printf '%s failure(s)\n' "$failures"; exit 1; }
printf 'all passed\n'
