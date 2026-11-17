#!/usr/bin/env bash
# Smallest check that fails if forgerdr's side of the herdr app breaks: the forge-lib.sh functions over hc and
# herdr-app, and the scripts that open tabs, spaces and worktrees (forge-session, forge-review, forge-worktree,
# forge-worktree-remove) or write the keys (forge-setup-keys), against fake hc and herdr-app (test/fakes.sh). The real
# app is run by hand.
# Run: bash test/herdr-app.test.sh
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
bin="$root/bin"
sandbox="$(cd "$(mktemp -d)" && pwd -P)"
trap 'rm -rf "$sandbox"' EXIT
# shellcheck source=test/fakes.sh
. "$root/test/fakes.sh"
fakes_install "$sandbox/fakes"
export HOME="$sandbox/home" XDG_STATE_HOME="$sandbox/state" FORGERDR_CONFIG="$sandbox/forgerdr.toml"
mkdir -p "$HOME"
git config --global user.name forgerdr-test
git config --global user.email forgerdr-test@example.invalid
git config --global init.defaultBranch main
# shellcheck source=bin/forge-lib.sh
. "$bin/forge-lib.sh"

failures=0
expect() {
  if [ "$2" = "$3" ]; then printf 'ok   %s\n' "$1"; else printf 'FAIL %s\n  expected: %s\n  actual:   %s\n' "$1" "$2" "$3"; failures=$((failures + 1)); fi
}
exists() { [ -e "$1" ] && echo yes || echo no; }
status_of() { "$@" >/dev/null 2>&1 && echo 0 || echo $?; }
in_herdr() { HC_TERMINAL_ID=t5 "$@"; }
fake_terminal t5 live working "" herdr.space=sp-own herdr.tab=tb-own

# Where worktrees go: the herdr app's setting, ~ expanded as the app expands it.
expect "worktrees go where the app puts its own by default" "$HOME/.herdr/worktrees" "$(forge_worktrees_dir)"
mkdir -p "$sandbox/app"
printf '{"worktrees":{"directory":"~/code/trees"}}\n' > "$sandbox/app/settings.json"
expect "or where its settings say" "$HOME/code/trees" "$(HERDR_APP_HOME="$sandbox/app" forge_worktrees_dir)"
expect "a branch's worktree path" "$HOME/.herdr/worktrees/front/feature-#12-login" "$(forge_worktree_path /x/front 'feature/#12-login')"

expect "a titled claude session for the app" '["env","FORGE_SESSION_TITLE=#12 Login","claude","/forgerdr:workitem #12"]' \
  "$(forge_claude_argv "#12 Login" "/forgerdr:workitem #12")"
expect "with the words of FORGE_CLAUDE_ARGS" '["env","FORGE_SESSION_TITLE=t","claude","--settings","/tmp/a.json","go"]' \
  "$(FORGE_CLAUDE_ARGS="--settings /tmp/a.json" forge_claude_argv t go)"

fakes_reset
expect "launch prints the terminal" t9 "$(forge_launch --name n1 --cwd /w --space sp1 --tab tb1 -- claude "a b")"
# shellcheck disable=SC2016 # literal arguments
expect "through the user's shell, labelled for its tab" '["hc","run","--bg","--json","--no-notify","--name","n1","--cwd","/w","--label","herdr.space=sp1","--label","herdr.tab=tb1","--","/bin/zsh","-lic","exec \"$@\"","/bin/zsh","claude","a b"]' \
  "$(call_of hc run)"
fakes_reset
SHELL=/usr/local/bin/fish forge_launch --space "" --tab "" -- claude >/dev/null
# shellcheck disable=SC2016 # literal arguments
expect "fish takes its own form, and no labels make a sub-agent" '["hc","run","--bg","--json","--no-notify","--","/usr/local/bin/fish","-lic","exec $argv","claude"]' "$(call_of hc run)"
fakes_reset
SHELL=/opt/homebrew/bin/nu forge_launch -- claude >/dev/null
expect "a shell of another kind gives way to a login sh with this PATH" "/bin/sh -lc exec \"\$@\" sh env PATH=$PATH claude" \
  "$(call_of hc run | jq -r '(index("--")) as $i | .[$i + 1:] | join(" ")')"
expect "launch fails when hc does" 1 "$(FAKE_RUN_FAILS=1 status_of forge_launch -- claude)"
printf '#!/usr/bin/env bash\nprintf "not json\\n"\n' > "$sandbox/hc-mute"
chmod +x "$sandbox/hc-mute"
expect "and says so apart when it started a terminal it did not name" 2 "$(FORGE_HC="$sandbox/hc-mute" status_of forge_launch -- claude)"

fake_terminal t30 live working
fakes_reset
expect "an agent at work is ready" 0 "$(status_of forge_claude_ready t30)"
expect "with no key pressed" no "$(called hc keys)"
fake_terminal t31 live blocked "trust this folder"
jq -n '{address:"t31",state:"live",labels:{},status:{app:"claude-code",state:"working"}}' > "$FAKE_DIR/terminals/t31.after-keys.json"
fakes_reset
expect "a trust prompt is accepted" 0 "$(status_of forge_claude_ready t31)"
expect "with down and enter, once" 1 "$(grep -c '\["hc","keys","t31","down","enter"\]' "$FAKE_CALLS")"
fake_terminal t32 live blocked "trust this folder"
fakes_reset
forge_claude_ready t32 || true
expect "never twice, even while it shows" 1 "$(grep -c '"keys"' "$FAKE_CALLS")"
fake_terminal t33 live
printf 'Quick safety check\n Yes, I trust this folder\n' > "$FAKE_DIR/terminals/t33.screen"
fakes_reset
forge_claude_ready t33 || true
expect "a trust prompt seen on screen before any status is accepted" yes "$(called hc keys t33 down enter)"
fake_terminal t34 finished
expect "a terminal that ended is not ready" 1 "$(status_of forge_claude_ready t34)"
fake_terminal t36 live
printf 'zsh: command not found: claude\n' > "$FAKE_DIR/terminals/t36.screen"
expect "nor one where claude never reports, though the shell stays" 2 "$(status_of forge_claude_ready t36)"
expect "nor one hc does not know" 1 "$(status_of forge_claude_ready t-none)"

fake_terminal t35 live idle
fakes_reset
expect "ending a terminal waits for it to end" 0 "$(status_of forge_end_terminal t35)"
expect "then removes it" "yes yes" "$(called hc kill t35) $(called hc rm t35)"

# Whether an agent is at work in a space: anything the app's answer does not make plain counts as at work.
at_work() { printf '%s\n' "$1" > "$FAKE_DIR/ls.json"; forge_space_at_work "${2:-sp1}" && echo yes || echo no; }
expect "an idle space is not at work" no "$(at_work '{"spaces":[{"id":"sp1","folder":"/w","tabs":[{"id":"tb1","terminals":[{"terminal":"t1","status":"idle","sub_agents":[]}]}]}]}')"
expect "a working terminal is" yes "$(at_work '{"spaces":[{"id":"sp1","folder":"/w","tabs":[{"id":"tb1","terminals":[{"terminal":"t1","status":"working","sub_agents":[]}]}]}]}')"
fake_terminal t-busy-sub live blocked "Allow Bash?"
expect "so is a sub-agent that asks" yes "$(at_work '{"spaces":[{"id":"sp1","folder":"/w","tabs":[{"id":"tb1","terminals":[{"terminal":"t1","status":null,"sub_agents":["t-busy-sub"]}]}]}]}')"
expect "a space that is gone is not" no "$(at_work '{"spaces":[]}')"
expect "an answer that is not JSON counts as at work" yes "$(at_work 'oops')"
expect "so does one of another shape" yes "$(at_work '{"spaces":[{"id":"sp1","folder":"/w","panes":[]}]}')"
rm -f "$FAKE_DIR/ls.json"

# The spaces record survives a session that died holding its lock.
mkdir -p "$sandbox/locked" && touch "$sandbox/locked/file" && mkdir "$sandbox/locked/file.lock"
FORGE_READY_TRIES=2 forge_locked "$sandbox/locked/file" forge_append_line "$sandbox/locked/file" "line"
expect "a lock left behind does not block for ever" "line" "$(cat "$sandbox/locked/file")"
expect "and is released" no "$(exists "$sandbox/locked/file.lock")"

# Worktrees: a new branch from a ref, the local branch when there is one, and no upstream inherited from a base.
git init -q --bare "$sandbox/origin.git"
git clone -q "$sandbox/origin.git" "$sandbox/front" 2>/dev/null
repo="$sandbox/front"
printf '.env*\n' > "$repo/.gitignore"
git -C "$repo" add .gitignore && git -C "$repo" commit -qm init && git -C "$repo" push -q origin main
git -C "$repo" push -q origin main:feature/remote
git -C "$repo" fetch -q origin
forge_add_worktree "$repo" feature/new origin/main "$sandbox/wt/new" 2>/dev/null
expect "a new branch from the ref" "feature/new $(git -C "$repo" rev-parse origin/main)" \
  "$(git -C "$sandbox/wt/new" branch --show-current) $(git -C "$sandbox/wt/new" rev-parse HEAD)"
expect "without the base as its upstream" none "$(git -C "$sandbox/wt/new" rev-parse --abbrev-ref '@{upstream}' 2>/dev/null || echo none)"
forge_add_worktree "$repo" feature/remote origin/feature/remote "$sandbox/wt/remote" 2>/dev/null
expect "a branch from its own remote branch keeps tracking it" origin/feature/remote "$(git -C "$sandbox/wt/remote" rev-parse --abbrev-ref '@{upstream}')"
git -C "$repo" worktree remove "$sandbox/wt/new"
forge_add_worktree "$repo" feature/new origin/feature/remote "$sandbox/wt/again" 2>/dev/null
expect "an existing local branch is reused as it is" "$(git -C "$repo" rev-parse origin/main)" "$(git -C "$sandbox/wt/again" rev-parse HEAD)"

# forge-session.sh: one titled tab in this terminal's space.
expect "a session tab needs the herdr app" 1 "$(status_of bash "$bin/forge-session.sh" --title t go)"
fake_terminal t21 live working
fakes_reset
out="$(in_herdr bash "$bin/forge-session.sh" --cwd "$repo" --title "#12 Login" "/forgerdr:workitem #12")"
made="$(call_of herdr-app "do" tab.new)"
expect "a tab in this terminal's space" sp-own "$(printf '%s' "$made" | option_of --space)"
expect "named by its title, in the folder" "#12 Login|$repo" "$(printf '%s' "$made" | jq -r '[(index("--name")) as $i | .[$i + 1], (index("--folder")) as $j | .[$j + 1]] | join("|")')"
expect "running the titled session" '["env","FORGE_SESSION_TITLE=#12 Login","claude","/forgerdr:workitem #12"]' "$(printf '%s' "$made" | option_of --argv)"
expect "and shown" true "$(printf '%s' "$made" | option_of --focus)"
expect "it says what it opened" "tb-made t21" "$(printf '%s' "$out" | jq -r '"\(.tab) \(.terminal)"')"
fakes_reset
in_herdr bash "$bin/forge-session.sh" --no-agent --no-focus --title t go >/dev/null
made="$(call_of herdr-app "do" tab.new)"
expect "--no-agent opens a shell, --no-focus keeps the view" "no false" "$(printf '%s' "$made" | has_arg --argv) $(printf '%s' "$made" | option_of --focus)"

# forge-review.sh: one tab per pull request, the first one shown.
fakes_reset
out="$(in_herdr bash "$bin/forge-review.sh" --cwd "$repo" https://example.com/o/r/pull/7 https://example.com/o/r/pull/8)"
expect "one tab per pull request" 2 "$(grep -c '"tab.new"' "$FAKE_CALLS")"
expect "the first one shown, the rest not" "true false" "$(grep '"tab.new"' "$FAKE_CALLS" | while IFS= read -r line; do printf '%s' "$line" | option_of --focus; done | paste -sd ' ' -)"
expect "each running its review" '/forgerdr:review-other https://example.com/o/r/pull/8' "$(grep '"tab.new"' "$FAKE_CALLS" | tail -n 1 | option_of --argv | jq -r '.[-1]')"
expect "named by the pull request" "PR 7" "$(call_of herdr-app "do" tab.new | option_of --name)"
expect "one line each" "7 8" "$(printf '%s\n' "$out" | jq -r .pr | paste -sd ' ' -)"

# forge-worktree.sh: the worktree where the app puts its own, opened as a space, the dev server in a second tab.
printf 'A=1\n' > "$repo/.env.local"
printf '{"scripts":{"dev":"vite"}}\n' > "$repo/package.json"
touch "$repo/pnpm-lock.yaml"
git -C "$repo" add package.json pnpm-lock.yaml && git -C "$repo" commit -qm app && git -C "$repo" push -q origin main
fake_terminal t20 live working
fakes_reset
out="$(in_herdr bash "$bin/forge-worktree.sh" --repo "$repo" --port-base 3100 --branch feature/login --title "Login form" "make the login form")"
path="$HOME/.herdr/worktrees/front/feature-login"
expect "the worktree goes where the app puts its own" "feature/login" "$(git -C "$path" branch --show-current 2>/dev/null)"
expect "from the base on origin" "$(git -C "$repo" rev-parse origin/main)" "$(git -C "$path" rev-parse HEAD)"
expect "with the env files" "A=1" "$(cat "$path/.env.local")"
made="$(call_of herdr-app "do" space.new)"
expect "opened as a space in the background" "$path|Login form|false" \
  "$(printf '%s' "$made" | jq -r '[(index("--folder")) as $i | .[$i + 1], (index("--name")) as $j | .[$j + 1], (index("--focus")) as $k | .[$k + 1]] | join("|")')"
expect "its agent runs workitem on the item" "/forgerdr:workitem make the login form" "$(printf '%s' "$made" | option_of --argv | jq -r '.[-1]')"
dev="$(call_of herdr-app "do" tab.new)"
expect "the dev server in a second tab of that space" "sp-new|dev :3100|false" \
  "$(printf '%s' "$dev" | jq -r '[(index("--space")) as $i | .[$i + 1], (index("--name")) as $j | .[$j + 1], (index("--focus")) as $k | .[$k + 1]] | join("|")')"
expect "on its own port" '["env","PORT=3100","sh","-c","pnpm dev"]' "$(printf '%s' "$dev" | option_of --argv)"
expect "the space is recorded with its worktree" "$path	sp-new" "$(cat "$XDG_STATE_HOME/forgerdr/spaces.tsv")"
expect "it says what it made" "feature/login sp-new 3100 t20 true" "$(printf '%s' "$out" | jq -r '"\(.branch) \(.space) \(.port) \(.terminal) \(.agent_started)"')"
fakes_reset
expect "an item whose worktree path is taken stops before anything is made" 1 \
  "$(in_herdr status_of bash "$bin/forge-worktree.sh" --repo "$repo" --no-agent --branch feature/login-2 --title a one --branch feature/login --title b two)"
expect "no space was opened" no "$(called herdr-app "do" space.new)"
expect "no branch was made" "" "$(git -C "$repo" branch --list feature/login-2)"

# forge-worktree-remove.sh: the space closes first, the worktree goes, the branch stays.
printf '{"spaces":[{"id":"sp-new","folder":"%s","tabs":[{"id":"tb-new","terminals":[{"terminal":"t20","status":"idle","sub_agents":[]}]}]}]}\n' "$path" > "$FAKE_DIR/ls.json"
echo change > "$path/new.txt"
expect "uncommitted work is refused" 1 "$(in_herdr status_of bash "$bin/forge-worktree-remove.sh" "$path")"
rm "$path/new.txt"
expect "the main checkout is refused" 1 "$(in_herdr status_of bash "$bin/forge-worktree-remove.sh" "$repo")"
expect "so is the one this session stands in" 1 "$(cd "$path" && in_herdr status_of bash "$bin/forge-worktree-remove.sh" "$path")"
fake_terminal t5 live working "" herdr.space=sp-new herdr.tab=tb-new
expect "and the one whose space this session runs in" 1 "$(in_herdr status_of bash "$bin/forge-worktree-remove.sh" "$path")"
rm "$FAKE_DIR/terminals/t5.json"
expect "and any while hc cannot tell which space this session runs in" 1 "$(in_herdr status_of bash "$bin/forge-worktree-remove.sh" "$path")"
fake_terminal t5 live working "" herdr.space=sp-own herdr.tab=tb-own
fakes_reset
expect "a folder inside a worktree is refused" 1 "$(mkdir -p "$path/src" && in_herdr status_of bash "$bin/forge-worktree-remove.sh" "$path/src")"
expect "with no space closed" no "$(called herdr-app "do" space.close)"
git -C "$repo" worktree lock "$path"
expect "a worktree git refuses to remove stays" 1 "$(in_herdr status_of bash "$bin/forge-worktree-remove.sh" "$path")"
expect "and so does its space" no "$(called herdr-app "do" space.close)"
git -C "$repo" worktree unlock "$path"
rmdir "$path/src"
fakes_reset
in_herdr bash "$bin/forge-worktree-remove.sh" "$path" >/dev/null
expect "its space is closed" yes "$(called herdr-app "do" space.close --id sp-new --confirmed true)"
expect "the worktree is gone" no "$(exists "$path")"
expect "its branch stays" "  feature/login" "$(git -C "$repo" branch --list feature/login)"
expect "and its space is forgotten" "" "$(cat "$XDG_STATE_HOME/forgerdr/spaces.tsv")"

# forge-prompt.sh: given nothing, it closes its tab.
fakes_reset
printf '\n' | in_herdr bash "$bin/forge-prompt.sh" review >/dev/null
expect "the prompt tab closes when given nothing" yes "$(called hc kill t5)"

# forge-setup-keys.sh: two bindings that open a prompt tab, from wherever the plugin is installed.
mkdir -p "$sandbox/keys"
printf '{"global":{"cmd-t":"tab.new","cmd-alt-x":"tab.next"},"terminal":{"cmd-c":"terminal.copy"}}\n' > "$sandbox/keys/keys.json"
cache="$HOME/.claude/plugins/cache/the-forgerdr/forgerdr/9.9.9"
mkdir -p "$cache" && cp -R "$bin" "$cache/bin"
HERDR_APP_HOME="$sandbox/keys" bash "$cache/bin/forge-setup-keys.sh" --review cmd-alt-p --worktree cmd-alt-y >/dev/null
keys="$sandbox/keys/keys.json"
expect "the user's keys stay" "tab.new tab.next terminal.copy" "$(jq -r '[.global["cmd-t"], .global["cmd-alt-x"], .terminal["cmd-c"]] | join(" ")' "$keys")"
expect "each key opens a named tab" "forgerdr review|forgerdr worktree" "$(jq -r '[.global["cmd-alt-p"].args.name, .global["cmd-alt-y"].args.name] | join("|")' "$keys")"
locate="$(jq -r '.global["cmd-alt-p"].args.argv[2]' "$keys")"
prompted="$(printf '\n' | sh -c "$locate" sh review)"
expect "an installed plugin is found when the key runs" yes "$([[ "$prompted" == "forgerdr review"* ]] && echo yes || echo no)"
expect "a key in use is refused" 1 "$(HERDR_APP_HOME="$sandbox/keys" status_of bash "$bin/forge-setup-keys.sh" --review cmd-t)"
HERDR_APP_HOME="$sandbox/keys" bash "$bin/forge-setup-keys.sh" --remove >/dev/null
expect "--remove takes only its own keys away" "tab.new tab.next 0" "$(jq -r '[.global["cmd-t"], .global["cmd-alt-x"], ([.global[] | objects] | length)] | join(" ")' "$keys")"

[ "$failures" -eq 0 ] || { printf '%s failure(s)\n' "$failures"; exit 1; }
printf 'all good\n'
