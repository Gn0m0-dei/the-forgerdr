#!/usr/bin/env bash
# Smallest check that fails if the worktree hook breaks: its git path outside the herdr app, and inside it the spaces
# it opens, closes with their worktrees and closes as orphans, against fake hc and herdr-app (test/fakes.sh). The real
# app is run by hand.
# Run: bash test/worktree-hook.test.sh
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
hook="$root/hooks/worktree.sh"
sandbox="$(cd "$(mktemp -d)" && pwd -P)"
trap 'rm -rf "$sandbox"' EXIT
# shellcheck source=test/fakes.sh
. "$root/test/fakes.sh"
fakes_install "$sandbox/fakes"
export HOME="$sandbox/home" XDG_STATE_HOME="$sandbox/state"
# git config --global below must land in the sandbox whatever XDG_CONFIG_HOME holds.
export GIT_CONFIG_GLOBAL="$HOME/.gitconfig"
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

# A worktree with submodules: git refuses to remove it even when clean, so the hook forces it once it has looked inside
# each one, where the superproject's status does not reach.
git config --global protocol.file.allow always
git init -q --bare -b main "$sandbox/core.git"
git clone -q "$sandbox/core.git" "$sandbox/core" 2>/dev/null
echo core > "$sandbox/core/core.txt"
git -C "$sandbox/core" add core.txt && git -C "$sandbox/core" commit -qm init && git -C "$sandbox/core" push -q origin main
git -C "$sandbox/other" pull -q origin main
git -C "$sandbox/other" submodule --quiet add "$sandbox/core.git" core
git -C "$sandbox/other" commit -qm "add core" && git -C "$sandbox/other" push -q origin main
with_core="$(create with-core "$repo")"
expect "create fills the worktree's submodules, which git leaves empty" yes "$(exists "$with_core/core/core.txt")"
echo more >> "$with_core/core/core.txt"
git -C "$with_core/core" commit -qam local
git -C "$with_core" commit -qam "bump core"
expect "the superproject sees nothing of a submodule's commit no remote has" "" "$(git -C "$with_core" status --porcelain)"
remove "$with_core" >/dev/null 2>&1 || true
expect "remove leaves in place a submodule's commit no remote has" "local" "$(git -C "$with_core/core" log -1 --format=%s 2>/dev/null)"
git -C "$with_core/core" push -q origin HEAD:main
remove "$with_core" 2>/dev/null || true
expect "remove takes a worktree whose submodules hold no work" no "$(exists "$with_core")"

clean="$(create clean "$repo")"
dirty="$(create dirty "$repo")"
committed="$(create committed "$repo")"
here="$(create here "$repo")"
shared="$(create shared "$repo")"
expect "another session reusing a worktree gets it" "$shared" "$(create shared "$repo" s2)"
echo change > "$dirty/file.txt"
git -C "$committed" commit -q --allow-empty -m "kept work"
# The sweep forces git past a worktree's submodules, so it looks inside them first: a stash there is nowhere else.
expect "a worktree to sweep has its submodule" yes "$(exists "$clean/core/core.txt")"
stashed="$(create stashed "$repo")"
echo more >> "$stashed/core/core.txt"
git -C "$stashed/core" stash -q
mv "$sandbox/core.git" "$sandbox/core-away.git"
unfilled="$(create unfilled "$repo" s9 2>"$sandbox/create.err")"
mv "$sandbox/core-away.git" "$sandbox/core.git"
expect "create keeps a worktree whose submodules did not come, and says so" "yes yes" \
  "$(exists "$unfilled/.gitmodules") $(grep -c 'git submodule update --init --recursive' "$sandbox/create.err" | sed 's/^1$/yes/')"
bash "$hook" sweep-session s1 "$here/src"
expect "sweep removes a clean worktree" no "$(exists "$clean")"
expect "sweep deletes its branch while the main checkout is behind" "" "$(git -C "$repo" branch --list worktree-clean)"
expect "sweep keeps uncommitted work" yes "$(exists "$dirty")"
expect "sweep keeps a stash inside a submodule" yes "$(exists "$stashed/core/core.txt")"
expect "sweep keeps commits" yes "$(exists "$committed")"
expect "sweep keeps the worktree the session stands in" yes "$(exists "$here")"
expect "sweep keeps a worktree another session holds" yes "$(exists "$shared")"
expect "sweep keeps the earlier worktree with work" yes "$(exists "$path")"
expect "sweep drops the session state" no "$(exists "$state/s1.tsv")"

late="$(create late "$repo" s3)"
jq -cn --arg cwd "$repo" '{session_id:"s3",cwd:$cwd,hook_event_name:"SessionEnd",reason:"other"}' | bash "$hook" sweep
for _ in 1 2 3 4 5 6 7 8 9 10; do [ -e "$late" ] || break; sleep 0.5; done
expect "SessionEnd sweep runs detached and removes a clean worktree" no "$(exists "$late")"

expect "outside the herdr app nothing is asked of it" no "$(called herdr-app)"

# Inside the herdr app: each worktree opens as a space that does not take the focus, and the space goes with it.
spaces="$XDG_STATE_HOME/forgerdr/spaces.tsv"
in_herdr() { HC_TERMINAL_ID=t5 "$@"; }
fake_terminal t5 live working "" herdr.space=sp-here herdr.tab=tb-here
fakes_reset
opened="$(in_herdr create opened "$repo")"
made="$(call_of herdr-app "do" space.new)"
expect "a worktree opens as a space" "$opened" "$(printf '%s' "$made" | option_of --folder)"
expect "named after it" opened "$(printf '%s' "$made" | option_of --name)"
expect "that does not take the focus" false "$(printf '%s' "$made" | option_of --focus)"
expect "and is recorded" "$opened	sp-new" "$(grep -F "$opened" "$spaces")"
printf '{"spaces":[{"id":"sp-new","folder":"%s","tabs":[{"id":"tb-new","terminals":[{"terminal":"t20","status":null,"sub_agents":[]}]}]},{"id":"sp-here","folder":"%s","tabs":[]}]}\n' "$opened" "$repo" > "$FAKE_DIR/ls.json"
fakes_reset
expect "reopened, it keeps its space" "$opened" "$(in_herdr create opened "$repo")"
expect "and opens no other" no "$(called herdr-app "do" space.new)"
fakes_reset
jq -cn --arg path "$opened" '{session_id:"s1",hook_event_name:"WorktreeRemove",worktree_path:$path}' | in_herdr bash "$hook" remove
expect "removing it closes its space first" yes "$(called herdr-app "do" space.close --id sp-new --confirmed true)"
expect "and removes it" no "$(exists "$opened")"
expect "and forgets the space" "" "$(grep -F "$opened" "$spaces" || true)"

busy="$(in_herdr create busy "$repo")"
printf '{"spaces":[{"id":"sp-new","folder":"%s","tabs":[{"id":"tb-new","terminals":[{"terminal":"t20","status":"working","sub_agents":[]}]}]}]}\n' "$busy" > "$FAKE_DIR/ls.json"
fakes_reset
expect "a worktree whose space has an agent at work is not removed" 1 "$(jq -cn --arg path "$busy" '{session_id:"s1",worktree_path:$path}' | in_herdr bash "$hook" remove >/dev/null 2>&1; echo $?)"
expect "and its space stays open" no "$(called herdr-app "do" space.close)"
expect "and so does the worktree" yes "$(exists "$busy")"
printf '{"spaces":[{"id":"sp-new","folder":"%s","tabs":[{"id":"tb-new","terminals":[{"terminal":"t20","status":"idle","sub_agents":["t-sub"]}]}]}]}\n' "$busy" > "$FAKE_DIR/ls.json"
fake_terminal t-sub live working
expect "a sub-agent at work counts too" 1 "$(jq -cn --arg path "$busy" '{session_id:"s1",worktree_path:$path}' | in_herdr bash "$hook" remove >/dev/null 2>&1; echo $?)"
fake_terminal t-sub live idle
FAKE_APP_DOWN=1 in_herdr create quiet "$repo" >/dev/null 2>"$sandbox/quiet.err"
expect "with the app closed a worktree is still made" yes "$(exists "$repo/.claude/worktrees/quiet")"
expect "and says the space did not open" yes "$(grep -q "did not open a space" "$sandbox/quiet.err" && echo yes)"

# Spaces of worktrees removed where no hook sees it (git or rm from Bash, the user's terminal).
gone="$sandbox/gone"
printf '%s\n' "$gone/agent-gone	sp-gone" "$gone/agent-busy	sp-busy" "$gone/agent-asks	sp-asks" "$gone/agent-sub	sp-sub" \
  "$gone/agent-here	sp-here" "$path	sp-alive" "$gone/agent-closed	sp-closed" > "$spaces"
space_json() { printf '{"id":"%s","folder":"%s","tabs":[{"id":"tb","terminals":[{"terminal":"t%s","status":%s,"sub_agents":%s}]}]}' "$1" "$2" "$1" "$3" "${4:-[]}"; }
printf '{"spaces":[%s,%s,%s,%s,%s,%s]}\n' "$(space_json sp-gone "$gone/agent-gone" '"idle"')" "$(space_json sp-busy "$gone/agent-busy" '"working"')" \
  "$(space_json sp-asks "$gone/agent-asks" '"blocked"')" "$(space_json sp-sub "$gone/agent-sub" null '["t-sub2"]')" \
  "$(space_json sp-here "$gone/agent-here" null)" "$(space_json sp-alive "$path" null)" > "$FAKE_DIR/ls.json"
fake_terminal t-sub2 live working
closed() { called herdr-app "do" space.close --id "$1"; }

printf '%s\n' "$gone/agent-reused	sp-alive" >> "$spaces"
fakes_reset
in_herdr bash "$hook" orphans </dev/null
expect "closes the space of a removed worktree" yes "$(closed sp-gone)"
expect "never a space that took over a recorded id on another folder" no "$(closed sp-alive)"
expect "whose record goes" "" "$(grep -F "agent-reused" "$spaces" || true)"
expect "and forgets it" "" "$(grep -F "agent-gone" "$spaces" || true)"
expect "leaves one where an agent is working" no "$(closed sp-busy)"
expect "leaves one where an agent asks" no "$(closed sp-asks)"
expect "leaves one where a sub-agent is working" no "$(closed sp-sub)"
expect "and remembers them" 3 "$(grep -cE "agent-(busy|asks|sub)" "$spaces")"
expect "leaves the one this session stands in" no "$(closed sp-here)"
expect "leaves one whose worktree is still there" no "$(closed sp-alive)"
expect "forgets one the user closed already" "no " "$(closed sp-closed) $(grep -F "agent-closed" "$spaces" || true)"

printf '%s\n' "$gone/agent-gone	sp-gone" >> "$spaces"
fakes_reset
expect "SessionStart prints nothing into the context" "" "$(jq -cn --arg cwd "$repo" '{session_id:"s4",cwd:$cwd,hook_event_name:"SessionStart",source:"startup"}' | in_herdr bash "$hook" orphans)"
expect "and closes them" yes "$(closed sp-gone)"

printf '%s\n' "$gone/agent-gone	sp-gone" >> "$spaces"
fakes_reset
in_herdr bash "$hook" sweep-session s5 "$repo"
expect "a session's sweep closes them too, with no worktree of its own" yes "$(closed sp-gone)"

printf '%s\n' "$gone/agent-gone	sp-gone" >> "$spaces"
fakes_reset
jq -cn --arg path "$gone/agent-gone" '{session_id:"s1",hook_event_name:"WorktreeRemove",worktree_path:$path}' | in_herdr bash "$hook" remove
expect "removing a worktree already gone closes its space" yes "$(closed sp-gone)"

printf '%s\n' "$gone/agent-gone	sp-gone" >> "$spaces"
fakes_reset
FAKE_APP_DOWN=1 in_herdr bash "$hook" orphans </dev/null 2>"$sandbox/down.err"
expect "with the app closed nothing is closed" no "$(closed sp-gone)"
expect "and it is remembered for later" yes "$(grep -qF "agent-gone	sp-gone" "$spaces" && echo yes)"

printf '%s\n' "$gone/agent-gone	sp-gone" >> "$spaces"
rm "$FAKE_DIR/terminals/t5.json"
fakes_reset
in_herdr bash "$hook" orphans </dev/null 2>/dev/null
expect "while hc cannot tell which space this session runs in, nothing is closed" no "$(closed sp-gone)"
fake_terminal t5 live working "" herdr.space=sp-here herdr.tab=tb-here

fakes_reset
bash "$hook" orphans </dev/null
expect "outside the herdr app nothing is asked of it" "" "$(cat "$FAKE_CALLS")"

[ "$failures" -eq 0 ] || { printf '%s failure(s)\n' "$failures"; exit 1; }
printf 'all good\n'
