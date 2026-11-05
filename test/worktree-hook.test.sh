#!/usr/bin/env bash
# Smallest check that fails if the worktree hook breaks, on its git path (outside herdr; the herdr path is run by
# hand inside herdr). Run: bash test/worktree-hook.test.sh
set -euo pipefail
hook="$(cd "$(dirname "$0")/.." && pwd)/hooks/worktree.sh"
sandbox="$(cd "$(mktemp -d)" && pwd -P)"
trap 'rm -rf "$sandbox"' EXIT
unset HERDR_ENV
export HOME="$sandbox/home" XDG_STATE_HOME="$sandbox/state"
mkdir -p "$HOME"
git config --global user.name forgerdr-test
git config --global user.email forgerdr-test@example.invalid
state="$XDG_STATE_HOME/forgerdr/worktrees"

failures=0
expect() {
  if [ "$2" = "$3" ]; then printf 'ok   %s\n' "$1"; else printf 'FAIL %s\n  expected: %s\n  actual:   %s\n' "$1" "$2" "$3"; failures=$((failures + 1)); fi
}
exists() { [ -e "$1" ] && echo yes || echo no; }
create() { jq -cn --arg name "$1" --arg cwd "$2" --arg session "${3:-s1}" '{session_id:$session,cwd:$cwd,hook_event_name:"WorktreeCreate",name:$name}' | bash "$hook" create; }
remove() { jq -cn --arg path "$1" '{session_id:"s1",hook_event_name:"WorktreeRemove",worktree_path:$path}' | bash "$hook" remove; }

git init -q --bare -b main "$sandbox/origin.git"
git clone -q "$sandbox/origin.git" "$sandbox/repo" 2>/dev/null
repo="$sandbox/repo"
printf '.env*\nsecrets/\n' > "$repo/.gitignore"
printf 'secrets/\n' > "$repo/.worktreeinclude"
git -C "$repo" add .gitignore .worktreeinclude && git -C "$repo" commit -qm init && git -C "$repo" push -q origin main
mkdir -p "$repo/secrets"
echo "A=1" > "$repo/.env.local"
echo "key" > "$repo/secrets/key.txt"
echo "clé" > "$repo/secrets/clé.txt"

# The main checkout falls behind origin: worktrees still start from origin, and their branches still go.
git clone -q "$sandbox/origin.git" "$sandbox/other" 2>/dev/null
git -C "$sandbox/other" commit -q --allow-empty -m "ahead on origin" && git -C "$sandbox/other" push -q origin main

path="$(create probe "$repo")"
expect "path under the main checkout" "$repo/.claude/worktrees/probe" "$path"
expect "branch worktree-<name>" "worktree-probe" "$(git -C "$path" branch --show-current)"
expect "starts from origin while the main checkout is behind" "$(git -C "$repo" rev-parse origin/main)" "$(git -C "$path" rev-parse HEAD)"
expect "no upstream" none "$(git -C "$path" rev-parse --abbrev-ref '@{upstream}' 2>/dev/null || echo none)"
expect "env file copied" "A=1" "$(cat "$path/.env.local")"
expect "worktreeinclude file copied" "key" "$(cat "$path/secrets/key.txt")"
expect "non-ASCII file name copied" "clé" "$(cat "$path/secrets/clé.txt")"
expect "excluded locally" ".claude/worktrees/" "$(grep -xF '.claude/worktrees/' "$repo/.git/info/exclude")"
expect "main checkout stays clean" "" "$(git -C "$repo" status --porcelain)"
expect "same name reopens" "$path" "$(create probe "$repo")"

nested="$(create inner "$path")"
expect "nested lands flat under the main checkout" "$repo/.claude/worktrees/inner" "$nested"

git -C "$path" commit -q --allow-empty -m "work in probe"
mkdir -p "$repo/.claude" && printf '{"worktree":{"baseRef":"head"}}' > "$repo/.claude/settings.local.json"
from_head="$(create from-head "$path")"
expect "baseRef head starts from the asking worktree" "$(git -C "$path" rev-parse HEAD)" "$(git -C "$from_head" rev-parse HEAD)"
rm "$repo/.claude/settings.local.json"

expect "invalid name refused" 1 "$(create ../escape "$repo" >/dev/null 2>&1; echo $?)"

remove "$nested"
expect "remove deletes the worktree" no "$(exists "$nested")"
expect "remove deletes its untouched branch while the main checkout is behind" "" "$(git -C "$repo" branch --list worktree-inner)"
git -C "$from_head" commit -q --allow-empty -m "own work in from-head"
remove "$from_head" 2>/dev/null
expect "remove keeps a branch with commits of its own" "  worktree-from-head" "$(git -C "$repo" branch --list worktree-from-head)"

switched="$(create switched "$repo")"
git -C "$repo" branch feature/done
git -C "$switched" switch -q feature/done
remove "$switched"
expect "remove keeps the user's branch the worktree switched to" "  feature/done" "$(git -C "$repo" branch --list feature/done)"
expect "remove deletes the worktree's own branch" "" "$(git -C "$repo" branch --list worktree-switched)"

dirty_removed="$(create dirty-removed "$repo")"
echo change > "$dirty_removed/file.txt"
expect "remove refuses uncommitted work" 1 "$(remove "$dirty_removed" >/dev/null 2>&1; echo $?)"
expect "remove leaves that worktree in place" yes "$(exists "$dirty_removed/file.txt")"

clean="$(create clean "$repo")"
dirty="$(create dirty "$repo")"
committed="$(create committed "$repo")"
here="$(create here "$repo")"
shared="$(create shared "$repo")"
expect "another session reusing a worktree gets it" "$shared" "$(create shared "$repo" s2)"
echo change > "$dirty/file.txt"
git -C "$committed" commit -q --allow-empty -m "kept work"
bash "$hook" sweep-session s1 "$here/src"
expect "sweep removes a clean worktree" no "$(exists "$clean")"
expect "sweep deletes its branch while the main checkout is behind" "" "$(git -C "$repo" branch --list worktree-clean)"
expect "sweep keeps uncommitted work" yes "$(exists "$dirty")"
expect "sweep keeps commits" yes "$(exists "$committed")"
expect "sweep keeps the worktree the session stands in" yes "$(exists "$here")"
expect "sweep keeps a worktree another session holds" yes "$(exists "$shared")"
expect "sweep keeps the earlier worktree with work" yes "$(exists "$path")"
expect "sweep drops the session state" no "$(exists "$state/s1.tsv")"

late="$(create late "$repo" s3)"
jq -cn --arg cwd "$repo" '{session_id:"s3",cwd:$cwd,hook_event_name:"SessionEnd",reason:"other"}' | bash "$hook" sweep
for _ in 1 2 3 4 5 6 7 8 9 10; do [ -e "$late" ] || break; sleep 0.5; done
expect "SessionEnd sweep runs detached and removes a clean worktree" no "$(exists "$late")"

[ "$failures" -eq 0 ] || { printf '%s failure(s)\n' "$failures"; exit 1; }
printf 'all good\n'
