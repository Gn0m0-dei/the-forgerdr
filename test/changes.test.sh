#!/usr/bin/env bash
# Smallest check that fails if the Changes panel's reads break: bin/forge-changes.sh lists the checkouts of each
# repository with what they hold uncommitted, and prints a checkout's diff from its HEAD, new files included, without
# touching the user's index.
# Run: bash test/changes.test.sh
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
script="$root/bin/forge-changes.sh"
sandbox="$(cd "$(mktemp -d)" && pwd -P)"
trap 'rm -rf "$sandbox"' EXIT
export GIT_CONFIG_GLOBAL="$sandbox/gitconfig"
git config --global user.name tester
git config --global user.email tester@example.com
git config --global init.defaultBranch main
git config --global protocol.file.allow always

failures=0
expect() {
  if [ "$2" = "$3" ]; then printf 'ok   %s\n' "$1"; else printf 'FAIL %s\n  expected: %s\n  actual:   %s\n' "$1" "$2" "$3"; failures=$((failures + 1)); fi
}
status_of() { local status=0; "$@" >/dev/null 2>&1 || status=$?; echo "$status"; }
changes() { bash "$script" "$@"; }
# The files a diff names, in its order.
named() { grep -E '^diff --git ' | sed -E 's/^diff --git "?a\/(.*)"? "?b\/.*$/\1/' | tr '\n' ',' | sed 's/,$//'; }

repo="$sandbox/api"
git init -q "$repo"
cd "$repo"
printf 'one\ntwo\n' > a.txt
printf 'keep\n' > gone.txt
printf 'skip\n' > .gitignore
printf '\0\1\2' > logo.bin
git add .
git commit -qm first

expect "a clean checkout has nothing" '' "$(changes diff "$repo")"
expect "and counts no file" 0 "$(changes tree "$repo" | jq '.[0].worktrees[0].files')"

printf 'one\ntwo\nthree\n' > a.txt
rm gone.txt
printf 'fresh\nfile\n' > 'new file.txt'
printf 'ignored\n' > skip
printf '\0\3\4' > logo.bin
printf 'staged\n' > staged.txt
git add staged.txt
git status --porcelain > "$sandbox/status.before"
cp .git/index "$sandbox/index.before"

changes diff "$repo" > "$sandbox/diff"
expect "the diff holds what changed, then the new files, and nothing ignored" 'a.txt,gone.txt,logo.bin,staged.txt,new file.txt' \
  "$(named < "$sandbox/diff")"
expect "a new file shows whole" '+fresh +file' "$(sed -n '/new file.txt/,$p' "$sandbox/diff" | grep -E '^\+(fresh|file)$' | tr '\n' ' ' | sed 's/ $//')"
expect "a changed line shows as added" '+three' "$(grep -E '^\+three$' "$sandbox/diff")"
expect "a binary file is named as one" 1 "$(grep -c '^Binary files ' "$sandbox/diff")"
expect "the user's index is untouched" same "$(cmp -s .git/index "$sandbox/index.before" && echo same || echo changed)"
expect "and so is what git says of the checkout" "$(cat "$sandbox/status.before")" "$(git status --porcelain)"
expect "the tree counts its files" 5 "$(changes tree "$repo" | jq '.[0].worktrees[0].files')"
expect "names the repository" "api $repo" "$(changes tree "$repo" | jq -r '.[0] | "\(.name) \(.repo)"')"
expect "and its main checkout and branch" "$repo main true" "$(changes tree "$repo" | jq -r '.[0].worktrees[0] | "\(.top) \(.branch) \(.main)"')"

# git trusts a file's size and time over its content when the index is as new as the file: the copy keeps its time.
printf 'aaa\n' > same.txt
git add same.txt
git commit -qm same
printf 'bbb\n' > same.txt
expect "a file changed in the second of the last commit, to the same size, still shows" '+bbb' \
  "$(changes diff "$repo" | grep -E '^\+bbb$' || true)"
git checkout -q -- same.txt

git gc -q --prune=now 2>/dev/null
find .git -type f | sort > "$sandbox/git.before"
touch "$sandbox/mark"
sleep 1
changes diff "$repo" >/dev/null
expect "reading a diff writes nothing under .git, which the panel watches" '' \
  "$( { find .git -type f | sort | diff "$sandbox/git.before" - || true; find .git -newer "$sandbox/mark"; } | tr '\n' ' ')"

printf '%s\n' "$(head -c 300000 /dev/zero | tr '\0' x)" > long.js
expect "a line too long to read is cut" 0 "$(changes diff "$repo" | awk 'length($0) > 5000' | wc -l | tr -d ' ')"
expect "and says so" 1 "$(changes diff "$repo" | grep -c '… (line cut)$')"
expect "a diff too big for the panel is cut by size too" '\ forgerdr: cut at 2000 bytes' "$(FORGE_CHANGES_DIFF_BYTES=2000 changes diff "$repo" | tail -1)"
rm long.js
printf '%s\n' "$(head -c 9000 /dev/zero | tr '\0' e | sed 's/e/é/g')" > accents.js
expect "a long line of accents is cut between two of them, never inside one" ok \
  "$(changes diff "$repo" | iconv -f UTF-8 -t UTF-8 >/dev/null 2>&1 && echo ok || echo broken)"
rm accents.js
for n in 1 2 3 4; do printf 'new\n' > "extra$n.txt"; done
expect "past so many new files the rest are left out, saying so" '\ forgerdr: cut at 2 new files' \
  "$(FORGE_CHANGES_NEW_MAX=2 changes diff "$repo" | tail -1)"
expect "and no more than those are read" 2 "$(FORGE_CHANGES_NEW_MAX=2 changes diff "$repo" | grep -c '^+++ b/extra')"
rm extra?.txt

expect "a long diff is cut, saying so" '\ forgerdr: cut at 5 lines' "$(FORGE_CHANGES_DIFF_MAX=5 changes diff "$repo" | tail -1)"

linked="$sandbox/api-refunds"
git worktree add -q -b feature/refunds "$linked"
printf 'refund\n' > "$linked/refund.txt"
expect "a worktree is listed after the main checkout" "$linked feature/refunds false 1" \
  "$(changes tree "$repo" | jq -r '.[0].worktrees[1] | "\(.top) \(.branch) \(.main) \(.files)"')"
expect "its diff is its own" 'refund.txt' "$(changes diff "$linked" | named)"
expect "a folder inside a checkout answers for the checkout" 'refund.txt' "$(mkdir -p "$linked/deep" && changes diff "$linked/deep" | named)"

library="$sandbox/library"
git init -q "$library"
printf 'lib\n' > "$library/lib.txt"
git -C "$library" add lib.txt
git -C "$library" commit -qm lib
git submodule --quiet add "$library" vendor/library
git commit -qam submodule
git -C "$linked" checkout -q -- . 2>/dev/null || true
expect "a clean submodule is not listed" 0 "$(changes tree "$repo" | jq '.[0].worktrees[0].submodules | length')"
before="$(changes tree "$repo" | jq '.[0].worktrees[0].files')"
printf 'lib\nmore\n' > vendor/library/lib.txt
expect "a submodule with changes is listed under its checkout" "vendor/library $repo/vendor/library 1" \
  "$(changes tree "$repo" | jq -r '.[0].worktrees[0].submodules[0] | "\(.name) \(.top) \(.files)"')"
expect "and its files are not counted twice" "$before" "$(changes tree "$repo" | jq '.[0].worktrees[0].files')"
expect "its diff is read in its own folder" 'lib.txt' "$(changes diff "$repo/vendor/library" | named)"
expect "and not in its superproject's" '' "$(changes diff "$repo" | named | tr ',' '\n' | grep vendor || true)"

young="$sandbox/young"
git init -q "$young"
printf 'first\n' > "$young/first.txt"
expect "a repository with no commit yet shows its files as new" 'first.txt' "$(changes diff "$young" | named)"
expect "and counts them" 1 "$(changes tree "$young" | jq '.[0].worktrees[0].files')"

expect "several repositories come in the order given" 'young api' "$(changes tree "$young" "$repo" | jq -r 'map(.name) | join(" ")')"
expect "a folder that is no repository is left out of the tree" 'api' "$(changes tree "$sandbox" "$repo" | jq -r 'map(.name) | join(" ")')"
expect "no repository at all is an empty tree" '[]' "$(changes tree)"
expect "the diff of a folder outside git fails" 1 "$(status_of changes diff "$sandbox")"
expect "saying why" "forgerdr: not in a git repository: $sandbox" "$(changes diff "$sandbox" 2>&1 >/dev/null || true)"
expect "an unknown command fails" 1 "$(status_of changes nonsense)"

# What git cannot read is told in the diff, and never hides what comes after it.
locked="$sandbox/locked"
git init -q "$locked"
printf 'a\n' > "$locked/a_first.txt"
printf 'm\n' > "$locked/m_locked.txt"
printf 'z\n' > "$locked/z_last.txt"
git -C "$locked" add -A
git -C "$locked" commit -qm base
printf 'a2\n' > "$locked/a_first.txt"
printf 'm2\n' > "$locked/m_locked.txt"
printf 'z2\n' > "$locked/z_last.txt"
chmod 000 "$locked/m_locked.txt"
printf 'new\n' > "$locked/new_aa.txt"
printf 'new\n' > "$locked/new_zz.txt"
chmod 000 "$locked/new_aa.txt"
git init -q "$locked/nested"
printf 'in\n' > "$locked/nested/in.txt"
mkfifo "$sandbox/pipe"
ln -s "$sandbox/pipe" "$locked/new_pipe"
# A read that hangs on the pipe is ended here, and fails the checks below.
shown="$(changes diff "$locked" & reader=$!; ( sleep 10; kill "$reader" 2>/dev/null ) & wait "$reader" 2>/dev/null || true)"
chmod 644 "$locked/m_locked.txt" "$locked/new_aa.txt"
if [ "$(id -u)" -eq 0 ]; then
  printf 'skip the unreadable files: root reads them all\n'
else
  expect "a tracked file git cannot read hides none of the others" 'a_first.txt,z_last.txt,new_zz.txt' "$(printf '%s\n' "$shown" | named)"
  expect "what is not shown is told, tracked or new" 'm_locked.txt,nested/,new_aa.txt,new_pipe' \
    "$(printf '%s\n' "$shown" | sed -n 's/^\\ forgerdr: not shown: //p' | sort | tr '\n' ',' | sed 's/,$//')"
fi
expect "a link to a pipe is told, not read" 1 "$(printf '%s\n' "$shown" | grep -c '^\\ forgerdr: not shown: new_pipe$')"
expect "nor is a folder with a repository of its own" 1 "$(printf '%s\n' "$shown" | grep -c '^\\ forgerdr: not shown: nested/$')"

# Nor does a folder this user cannot enter: what it holds is told as not shown, not as gone.
shut="$sandbox/shut"
git init -q "$shut"
mkdir "$shut/closed" "$shut/tracked-only"
printf 'in\n' > "$shut/closed/in.txt"
printf 'only\n' > "$shut/tracked-only/only.txt"
printf 'out\n' > "$shut/out.txt"
git -C "$shut" add -A
git -C "$shut" commit -qm base
printf 'in2\n' > "$shut/closed/in.txt"
printf 'new\n' > "$shut/closed/new.txt"
printf 'only2\n' > "$shut/tracked-only/only.txt"
printf 'out2\n' > "$shut/out.txt"
printf 'new\n' > "$shut/zz_new.txt"
chmod 000 "$shut/closed" "$shut/tracked-only"
shown="$(changes diff "$shut")"
chmod 755 "$shut/closed" "$shut/tracked-only"
if [ "$(id -u)" -eq 0 ]; then
  printf 'skip the closed folders: root enters them all\n'
else
  expect "a folder that cannot be entered is told" 'closed/,tracked-only/' \
    "$(printf '%s\n' "$shown" | sed -n 's/^\\ forgerdr: not shown: //p' | sort | tr '\n' ',' | sed 's/,$//')"
  expect "its files do not read as deleted" 0 "$(printf '%s\n' "$shown" | grep -c '^deleted file' || true)"
  expect "and the files outside it are all there" 'out.txt,zz_new.txt' "$(printf '%s\n' "$shown" | named)"
fi

# The comments kept by the panel hold lines of code: their folder is the user's alone, as forgerdr's other state.
kept="$sandbox/state/forgerdr/changes"
# Whether a folder is closed to everybody but its owner.
closed() { [ -z "$(find "$1" -maxdepth 0 -perm 700)" ] && echo no || echo yes; }
changes own "$kept"
expect "the comments folder is made the user's alone" yes "$(closed "$kept")"
chmod 755 "$kept"
expect "a folder open to others is told" no "$(closed "$kept")"
changes own "$kept"
expect "and one made open before is closed" yes "$(closed "$kept")"
expect "own without a folder fails" 1 "$(status_of changes own)"

[ "$failures" -eq 0 ] || { printf '%s failed\n' "$failures"; exit 1; }
printf 'all passed\n'
