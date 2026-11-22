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
expect "with variables of its own before claude" '["env","FORGE_SESSION_TITLE=PR 3","FORGE_REVIEW_VIEW=1","claude","/forgerdr:review-own x"]' \
  "$(forge_claude_argv "PR 3" "/forgerdr:review-own x" FORGE_REVIEW_VIEW=1)"
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

# Tab groups: which pane of a tab the next session splits, and which way.
expect "a wide pane splits to the right" "t1 right" "$(printf 't1 310 66\n' | forge_pick_split)"
expect "one too narrow for two halves side by side splits down" "t1 down" "$(printf 't1 152 66\n' | forge_pick_split)"
expect "a tall pane splits down" "t1 down" "$(printf 't1 100 80\n' | forge_pick_split)"
expect "the largest pane that halves is split" "t2 down" "$(printf 't1 152 31\nt2 152 66\n' | forge_pick_split)"
expect "none when no half would keep 80x15" "" "$(printf 't1 152 31\nt2 152 31\n' | forge_pick_split)"

# forge-review.sh: a tab per pull request in this terminal's space, named for it, its review view beside its agent.
fakes_reset
mkdir -p "$sandbox/bin"
cat > "$sandbox/bin/gh" <<'SH'
#!/usr/bin/env bash
case "$*" in
  *"--json author"*) echo dev ;;
  "api user"*) echo Dev ;;
esac
SH
chmod +x "$sandbox/bin/gh"
urls=(https://example.com/o/r/pull/2 https://github.com/o/r/pull/3)
out="$(PATH="$sandbox/bin:$PATH" FAKE_TAB_SIZE="310 66" FAKE_LS_PANES=1 in_herdr bash "$bin/forge-review.sh" --cwd "$repo" "${urls[@]}")"
each() { grep "\"$1\"" "$FAKE_CALLS" | while IFS= read -r line; do "${@:2}" <<<"$line"; done | paste -sd '|' -; }
expect "a tab each in this terminal's space, named for its pull request: another's, then the user's own" \
  "sp-own #2 review|sp-own #3 mine" "$(each tab.new jq -r '"\(.[(index("--space")) + 1]) \(.[(index("--name")) + 1])"')"
# shellcheck disable=SC2016 # a jq filter
expect "each agent in its clone, running its review, told its view is beside it" \
  "$repo /forgerdr:review-other https://example.com/o/r/pull/2 true|$repo /forgerdr:review-own https://github.com/o/r/pull/3 true" \
  "$(each tab.new jq -r '(.[(index("--argv")) + 1] | fromjson) as $argv
    | "\(.[(index("--folder")) + 1] | rtrimstr("/")) \($argv[-1]) \($argv | index("FORGE_REVIEW_VIEW=1") != null)"')"
expect "the view splits off its agent's pane, the forgerdr mod told the agent's terminal" \
  'p-t40 right forgerdr {"role":"review","terminal":"t40"}|p-t42 right forgerdr {"role":"review","terminal":"t42"}' \
  "$(each pane.split jq -r '"\(.[(index("--pane")) + 1]) \(.[(index("--direction")) + 1]) \(.[(index("--mod")) + 1]) \(.[(index("--props")) + 1])"')"
expect "and its agent is parked out of sight, the view alone in the tab" "t40|t42" \
  "$(each terminal.park jq -r '.[(index("--terminal")) + 1]')"
expect "the agent knows its view's tab, for the inbox to take the human there" "yes yes" \
  "$(called hc label t40 forge.tab=tb-made-1) $(called hc label t42 forge.tab=tb-made-2)"
expect "one line each, with its agent's terminal and tab" "2 t40 tb-made-1 true|3 t42 tb-made-2 true" \
  "$(printf '%s\n' "$out" | jq -r '"\(.pr) \(.terminal) \(.tab) \(.agent_started)"' | paste -sd '|' -)"
expect "the first one shown at the end" '["herdr-app","do","tab.select","--id","tb-made-1"]' "$(tail -n 1 "$FAKE_CALLS")"
fakes_reset
FAKE_TAB_SIZE="310 66" FAKE_LS_PANES=1 in_herdr bash "$bin/forge-review.sh" --no-agent --mod forgerdr-dev --cwd "$repo" "${urls[0]}" >/dev/null
expect "--mod picks the copy the view runs in" forgerdr-dev "$(call_of herdr-app "do" pane.split | option_of --mod)"
expect "--no-agent opens a shell beside the view" no "$(call_of herdr-app "do" tab.new | has_arg --argv)"
fakes_reset
expect "a view the app cannot split off fails, saying so" 1 \
  "$(FAKE_TAB_SIZE="310 66" FAKE_LS_PANES=1 FAKE_SPLIT_FAILS=1 status_of in_herdr bash "$bin/forge-review.sh" --no-agent --cwd "$repo" "${urls[0]}")"
expect "outside herdr there is nothing to open" 1 "$(status_of bash "$bin/forge-review.sh" "${urls[0]}")"

# forge-session.sh --group: several sessions in tabs of the group.
fakes_reset
out="$(FAKE_TAB_SIZE="160 40" in_herdr bash "$bin/forge-session.sh" --cwd "$repo" --group "Work items" \
  --title "#1 A" "/forgerdr:workitem #1" --title "#2 B" "/forgerdr:workitem #2" --title "#3 C" "/forgerdr:workitem #3")"
expect "a pane too narrow for two side by side takes one below, then the group goes on in a new tab" "tb-made-1 tb-made-1 tb-made-2" \
  "$(printf '%s\n' "$out" | jq -r .tab | paste -sd ' ' -)"
expect "the tabs named after the group" "Work items|Work items 2" \
  "$(grep '"tab.new"' "$FAKE_CALLS" | while IFS= read -r line; do printf '%s' "$line" | option_of --name; done | paste -sd '|' -)"
expect "each pane running its own titled session" '["env","FORGE_SESSION_TITLE=#2 B","claude","/forgerdr:workitem #2"]' \
  "$(call_of herdr-app "do" terminal.open | option_of --argv)"
expect "several sessions take --group" 1 "$(status_of in_herdr bash "$bin/forge-session.sh" --title a x --title b y)"
expect "each title takes one prompt" 1 "$(status_of in_herdr bash "$bin/forge-session.sh" --group g --title a x --title b)"
expect "a group's tabs are shown while they fill" 1 "$(status_of in_herdr bash "$bin/forge-session.sh" --no-focus --group g --title a x)"

# A dev server's port: the first one nothing listens on, on any address of this machine.
listen() {
  python3 -c 'import socket, sys, time
family = socket.AF_INET6 if sys.argv[1] == "::1" else socket.AF_INET
s = socket.socket(family)
s.bind((sys.argv[1], 0))
s.listen()
print(s.getsockname()[1], flush=True)
time.sleep(60)' "$1" > "$sandbox/port" 2>/dev/null &
  listener=$!
  for _ in $(seq 1 50); do [ -s "$sandbox/port" ] && break; ! kill -0 "$listener" 2>/dev/null && break; sleep 0.1; done
}
: > "$sandbox/port"
listen 127.0.0.1
busy="$(cat "$sandbox/port")"
expect "a port something listens on is skipped" yes "$([ "$(forge_free_port "$busy")" -gt "$busy" ] && echo yes || echo no)"
kill "$listener"; wait "$listener" 2>/dev/null || true
expect "a free port is taken as it is" "$busy" "$(forge_free_port "$busy")"
: > "$sandbox/port"
listen ::1
if [ -s "$sandbox/port" ]; then
  busy="$(cat "$sandbox/port")"
  expect "so is one that listens on ::1 only" yes "$([ "$(forge_free_port "$busy")" -gt "$busy" ] && echo yes || echo no)"
fi
kill "$listener" 2>/dev/null; wait "$listener" 2>/dev/null || true

expect "the app answers" 0 "$(status_of forge_app_answers)"
expect "or not" 1 "$(FAKE_APP_DOWN=1 status_of forge_app_answers)"
printf '{"spaces":[{"id":"sp-top","folder":"/w/tree","machine":null},{"id":"sp-in","folder":"/w/tree/src"},{"id":"sp-next","folder":"/w/tree-2"},{"id":"sp-far","folder":"/w/tree","machine":"box"}]}\n' > "$FAKE_DIR/ls.json"
expect "the spaces on a worktree are this machine's on its folder or inside it" "sp-top sp-in" "$(forge_spaces_of /w/tree | paste -sd ' ' -)"
rm "$FAKE_DIR/ls.json"

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

# The New worktree dialog's way: --plan says what a run would make and makes nothing; --kind names the branch from the
# kind, the item's id and the title, without asking the provider.
fakes_reset
plan="$(bash "$bin/forge-worktree.sh" --plan --repo "$repo" --kind feature --title "Empty state on orders" '#1234')"
expect "the plan names the branch from the kind, the id and the title" "feature/#1234-empty-state-on-orders" "$(jq -r .branch <<<"$plan")"
expect "where it goes" "$HOME/.herdr/worktrees/front/feature-#1234-empty-state-on-orders" "$(jq -r .path <<<"$plan")"
expect "its base and the ref it starts from" "main origin/main" "$(jq -r '"\(.base) \(.from)"' <<<"$plan")"
expect "its dev server" "pnpm dev" "$(jq -r .dev <<<"$plan")"
expect "on a port from 3000" yes "$([ "$(jq -r .port <<<"$plan")" -ge 3000 ] && echo yes || echo no)"
expect "which worktree of the forge it is" 4 "$(jq -r .worktrees <<<"$plan")"
expect "nothing was made" "no" "$(exists "$(jq -r .path <<<"$plan")")$(git -C "$repo" branch --list 'feature/#1234-*')"
expect "no space was opened" no "$(called herdr-app "do" space.new)"
expect "a worktree's folder stands for its repository" "$HOME/.herdr/worktrees/front/fix-#7-crash" \
  "$(bash "$bin/forge-worktree.sh" --plan --repo "$path" --kind fix --title Crash 7 | jq -r .path)"
expect "an item of another Azure DevOps organization is EXT" "feature/EXT-55-login-button" \
  "$(bash "$bin/forge-worktree.sh" --plan --repo "$repo" --kind feature --title "Login button" https://dev.azure.com/other/P/_workitems/edit/55 | jq -r .branch)"
expect "an item typed EXT-<id> is of an external backlog, whatever the mode" "fix/EXT-231-login-button" \
  "$(bash "$bin/forge-worktree.sh" --plan --repo "$repo" --kind fix --title "Login button" ext-231 | jq -r .branch)"
git -C "$repo" branch -q 'feature/#12-our-own' origin/main
git -C "$repo" branch -q 'fix/EXT-13-theirs' origin/main
expect "an EXT item never reuses the branch of our own item with its number" "feature/EXT-12-x" \
  "$(bash "$bin/forge-worktree.sh" --plan --repo "$repo" --kind feature --title x EXT-12 | jq -r .branch)"
expect "nor ours an EXT one's" "feature/#13-x" "$(bash "$bin/forge-worktree.sh" --plan --repo "$repo" --kind feature --title x 13 | jq -r .branch)"
expect "while each still reuses its own" "feature/#12-our-own fix/EXT-13-theirs" \
  "$(bash "$bin/forge-worktree.sh" --plan --repo "$repo" --kind feature --title x 12 | jq -r .branch) $(bash "$bin/forge-worktree.sh" --plan --repo "$repo" --kind feature --title x EXT-13 | jq -r .branch)"
git -C "$repo" branch -q -D 'feature/#12-our-own' 'fix/EXT-13-theirs'
expect "EXT- with more than a number is no item of an external backlog" 1 "$(status_of forge_item_external 'EXT-12 x' "$repo")"
expect "with no item, the kind and the title" "feature/tidy-the-docs" \
  "$(bash "$bin/forge-worktree.sh" --plan --repo "$repo" --kind feature --title "Tidy the docs" "" | jq -r .branch)"
git -C "$repo" branch -q 'fix/#42-old-name' origin/main
plan="$(bash "$bin/forge-worktree.sh" --plan --repo "$repo" --kind feature --title "New name" 42)"
expect "a branch that carries the id is reused, from itself" "fix/#42-old-name fix/#42-old-name" "$(jq -r '"\(.branch) \(.from)"' <<<"$plan")"
git -C "$repo" branch -q -D 'fix/#42-old-name'
expect "--no-dev starts no dev server" '"" ""' "$(bash "$bin/forge-worktree.sh" --plan --no-dev --repo "$repo" --kind fix --title a 1 | jq -c '.dev, .port' | paste -sd ' ' -)"
: > "$sandbox/port"
listen 127.0.0.1
busy="$(cat "$sandbox/port")"
expect "a port something listens on is skipped" yes \
  "$([ "$(bash "$bin/forge-worktree.sh" --plan --port-base "$busy" --repo "$repo" --kind fix --title a 1 | jq -r .port)" -gt "$busy" ] && echo yes || echo no)"
kill "$listener"; wait "$listener" 2>/dev/null || true
git clone -q --bare "$sandbox/origin.git" "$sandbox/bare.git"
git -C "$sandbox/bare.git" worktree add -q "$sandbox/bare-main" main 2>/dev/null
expect "a worktree of a bare repository stands for itself" "$HOME/.herdr/worktrees/bare-main/fix-#3-x" \
  "$(bash "$bin/forge-worktree.sh" --plan --repo "$sandbox/bare-main" --kind fix --title x 3 | jq -r .path)"
mkdir -p "$sandbox/plain" "$sandbox/bare-main/src"
expect "a folder outside git is refused" "1 yes" \
  "$(status_of bash "$bin/forge-worktree.sh" --plan --repo "$sandbox/plain" --kind fix --title x 3) $( (bash "$bin/forge-worktree.sh" --plan --repo "$sandbox/plain" --kind fix --title x 3 2>&1 || true) | grep -q 'is not in a git repository' && echo yes)"
expect "and a folder inside a bare repository's worktree stands for that worktree" "$HOME/.herdr/worktrees/bare-main/fix-#3-x" \
  "$(bash "$bin/forge-worktree.sh" --plan --repo "$sandbox/bare-main/src" --kind fix --title x 3 | jq -r .path)"
expect "a title that gives no slug is refused" 1 "$(status_of bash "$bin/forge-worktree.sh" --plan --repo "$repo" --kind fix --title '!!!' 1)"
expect "a kind forgerdr does not name is refused" 1 "$(status_of bash "$bin/forge-worktree.sh" --plan --repo "$repo" --kind docs --title a 1)"
# The production branch a hotfix starts from: origin's main, else its master.
git init -q "$sandbox/prod" && git -C "$sandbox/prod" commit -q --allow-empty -m init
git -C "$sandbox/prod" update-ref refs/remotes/origin/master HEAD
expect "with no main, the production branch is master" master "$(forge_production_branch "$sandbox/prod")"
git -C "$sandbox/prod" update-ref refs/remotes/origin/main HEAD
expect "main when there is one" main "$(forge_production_branch "$sandbox/prod")"
# The kinds' bases: chore and release from develop, as feature and fix; hotfix from the production branch.
git -C "$repo" update-ref refs/remotes/origin/develop origin/main
plan_of() { bash "$bin/forge-worktree.sh" --plan --repo "$repo" --kind "$1" --title "$2" "$3" | jq -r '"\(.branch) \(.base)"'; }
expect "a chore, from develop" "chore/#7-update-dependencies develop" "$(plan_of chore "Update dependencies" 7)"
expect "a hotfix, from the production branch" "hotfix/#8-login-crash main" "$(plan_of hotfix "Login crash" 8)"
expect "where it starts" "origin/main" "$(bash "$bin/forge-worktree.sh" --plan --repo "$repo" --kind hotfix --title "Login crash" 8 | jq -r .from)"
expect "a release with an item carries its id" "release/#12-v1.2.0 develop" "$(plan_of release v1.2.0 12)"
expect "a branch name git refuses shows in the plan" "1 yes" \
  "$(status_of bash "$bin/forge-worktree.sh" --plan --repo "$repo" --kind release --title 1.2.lock "") $( (bash "$bin/forge-worktree.sh" --plan --repo "$repo" --kind release --title 1.2.lock "" 2>&1 || true) | grep -q 'not a branch name git takes' && echo yes)"
expect "a release, from develop and named by its version" "release/v1.2.0 develop" "$(plan_of release v1.2.0 "")"
expect "a feature still from develop" "feature/#9-x develop" "$(plan_of feature x 9)"
git -C "$repo" update-ref -d refs/remotes/origin/develop
expect "and --kind without --title" 1 "$(status_of bash "$bin/forge-worktree.sh" --plan --repo "$repo" --kind fix 1)"
fakes_reset
out="$(bash "$bin/forge-worktree.sh" --repo "$repo" --no-agent --no-dev --kind fix --title "Crash on save" 9)"
expect "out of the app's terminals, as its mods run it, it makes one too" "fix/#9-crash-on-save" "$(jq -r .branch <<<"$out")"
expect "with no dev server when told" no "$(called herdr-app "do" tab.new)"
expect "its space named after the item" "#9 crash-on-save" "$(call_of herdr-app "do" space.new | option_of --name)"
expect "with a shell tab named by the app" no "$(call_of herdr-app "do" space.new | has_arg --tab)"
expect "but not while the app does not answer" 1 \
  "$(FAKE_APP_DOWN=1 status_of bash "$bin/forge-worktree.sh" --repo "$repo" --no-agent --kind fix --title Other 10)"
expect "and then makes no branch" "" "$(git -C "$repo" branch --list 'fix/#10-*')"
made_path="$(jq -r .path <<<"$out")"

# forge-worktree-remove.sh: the space closes first, the worktree goes, the branch stays.
# The Remove worktree dialog's way: --plan says which worktree a folder is in, its branch and its uncommitted files.
echo change > "$made_path/new file.txt"
mkdir -p "$made_path/src"
plan="$(bash "$bin/forge-worktree-remove.sh" --plan "$made_path/src")"
expect "the plan names the worktree a folder is in, and its branch" "$made_path fix/#9-crash-on-save" "$(jq -r '"\(.path) \(.branch)"' <<<"$plan")"
expect "and its uncommitted files" '["new file.txt"]' "$(jq -c .changes <<<"$plan")"
expect "the main checkout has no plan" 1 "$(status_of bash "$bin/forge-worktree-remove.sh" --plan "$repo")"
rm "$made_path/new file.txt"
rmdir "$made_path/src"
expect "a clean worktree has none" '[]' "$(bash "$bin/forge-worktree-remove.sh" --plan "$made_path" | jq -c .changes)"
expect "a plan is told from inside the worktree too, as the dialog asks it" '[]' \
  "$(cd "$made_path" && bash "$bin/forge-worktree-remove.sh" --plan . | jq -c .changes)"
printf '{"spaces":[{"id":"sp-made","folder":"%s","tabs":[{"id":"tb-made","terminals":[{"terminal":"t21","status":"idle","sub_agents":[]}]}]}]}\n' "$made_path" > "$FAKE_DIR/ls.json"
echo change > "$made_path/new.txt"
printf '{"spaces":[{"id":"sp-made","folder":"%s","tabs":[{"id":"tb-made","terminals":[{"terminal":"t21","status":"working","sub_agents":[]}]}]}]}\n' "$made_path" > "$FAKE_DIR/ls.json"
fakes_reset
expect "--discard throws uncommitted work away, but not while an agent is at work there" 1 \
  "$(status_of bash "$bin/forge-worktree-remove.sh" --discard "$made_path")"
expect "which keeps the worktree and its space" "yes no" "$(exists "$made_path") $(called herdr-app "do" space.close)"
printf '{"spaces":[{"id":"sp-made","folder":"%s","tabs":[{"id":"tb-made","terminals":[{"terminal":"t21","status":"idle","sub_agents":[]}]}]}]}\n' "$made_path" > "$FAKE_DIR/ls.json"
fakes_reset
bash "$bin/forge-worktree-remove.sh" --discard "$made_path" >/dev/null
expect "out of the app's terminals, as its mods run it, its spaces still close" yes "$(called herdr-app "do" space.close --id sp-made --confirmed true)"
expect "and its uncommitted work went with it" no "$(exists "$made_path")"
expect "and are forgotten" "" "$(grep -F "$made_path" "$XDG_STATE_HOME/forgerdr/spaces.tsv" || true)"
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
fakes_reset
(cd "$repo" && FAKE_TAB_SIZE="310 66" FAKE_LS_PANES=1 in_herdr bash "$bin/forge-prompt.sh" review https://example.com/o/r/pull/7) </dev/null >/dev/null
expect "given the URLs, it opens their reviews without asking" "/forgerdr:review-other https://example.com/o/r/pull/7" \
  "$(call_of herdr-app "do" tab.new | jq -r '(index("--argv")) as $j | .[$j + 1] | fromjson | .[-1]')"
expect "and closes its tab once they are open" yes "$(called hc kill t5)"
fakes_reset
(cd "$repo" && FAKE_TAB_SIZE="310 66" FAKE_LS_PANES=1 in_herdr bash "$bin/forge-prompt.sh" review --mod forgerdr-dev https://example.com/o/r/pull/7) </dev/null >/dev/null
expect "it passes on the copy of the mod that opened it" forgerdr-dev "$(call_of herdr-app "do" pane.split | option_of --mod)"
fakes_reset
out="$(cd "$repo" && FAKE_APP_DOWN=1 in_herdr bash "$bin/forge-prompt.sh" review https://example.com/o/r/pull/7 </dev/null 2>&1 || true)"
expect "a review that fails keeps the tab until Enter, to say why" yes \
  "$([[ "$out" == *"Press Enter to close this tab."* ]] && echo yes || echo no)"
fakes_reset
(cd "$repo" && FAKE_TAB_SIZE="310 66" FAKE_LS_PANES=1 in_herdr bash "$bin/forge-prompt.sh" security --mod forgerdr-dev --cwd "$repo" --item '#18') </dev/null >/dev/null
made="$(call_of herdr-app "do" tab.new)"
expect "security launches the security session of the folder given, for the item, in the mod copy given" \
  "Security #18|$repo|forgerdr-dev" \
  "$(printf '%s' "$made" | jq -r '[.[(index("--name")) + 1, (index("--folder")) + 1]] | join("|")')|$(call_of herdr-app "do" pane.split | option_of --mod)"
expect "with nobody waiting for its report" "/forgerdr:security the branch diff (git diff origin/main...HEAD) The work item is #18." \
  "$(printf '%s' "$made" | option_of --argv | jq -r '.[-1]')"
expect "and closes its tab once it is open" yes "$(called hc kill t5)"
fakes_reset
out="$(cd "$repo" && FAKE_APP_DOWN=1 in_herdr bash "$bin/forge-prompt.sh" security --mod forgerdr </dev/null 2>&1 || true)"
expect "a security launch that fails keeps the tab until Enter, to say why" yes \
  "$([[ "$out" == *"cannot open the security session"*"Press Enter to close this tab."* ]] && echo yes || echo no)"
# A claude that does not come up (hc no longer knows its terminal) keeps the tab until Enter, to say so.
cat > "$sandbox/hc-no-claude" <<'SH'
#!/usr/bin/env bash
[ "$1 ${2:-}" != "get t40" ] || exit 3
exec "$FAKE_DIR/hc" "$@"
SH
chmod +x "$sandbox/hc-no-claude"
fakes_reset
out="$(cd "$repo" && FORGE_HC="$sandbox/hc-no-claude" FAKE_TAB_SIZE="310 66" FAKE_LS_PANES=1 in_herdr bash "$bin/forge-prompt.sh" security --mod forgerdr </dev/null 2>&1 || true)"
expect "a security session whose claude did not come up keeps the tab until Enter, to say so" yes \
  "$([[ "$out" == *"claude did not come up"*"Press Enter to close this tab."* ]] && echo yes || echo no)"

# forge-setup-keys.sh: two bindings that open a prompt tab, from wherever the plugin is installed, and the forgerdr
# layout's own keys in a section only that layout reads, skipping a key already in use.
mkdir -p "$sandbox/keys"
# The layout's keys take the platform's modifier, as the script does.
case "$(uname -s)" in Darwin) mod=cmd-alt ;; *) mod=ctrl-alt ;; esac
printf '{"global":{"cmd-t":"tab.new","cmd-alt-x":"tab.next","%s-l":"app.lock"},"terminal":{"cmd-c":"terminal.copy"}}\n' "$mod" > "$sandbox/keys/keys.json"
cache="$HOME/.claude/plugins/cache/the-forgerdr/forgerdr/9.9.9"
mkdir -p "$cache" && cp -R "$bin" "$cache/bin"
HERDR_APP_HOME="$sandbox/keys" bash "$cache/bin/forge-setup-keys.sh" --review cmd-alt-p --worktree cmd-alt-y >/dev/null
keys="$sandbox/keys/keys.json"
expect "the user's keys stay" "tab.new tab.next terminal.copy" "$(jq -r '[.global["cmd-t"], .global["cmd-alt-x"], .terminal["cmd-c"]] | join(" ")' "$keys")"
expect "each key opens a named tab" "forgerdr review|forgerdr worktree" "$(jq -r '[.global["cmd-alt-p"].args.name, .global["cmd-alt-y"].args.name] | join("|")' "$keys")"
locate="$(jq -r '.global["cmd-alt-p"].args.argv[2]' "$keys")"
prompted="$(printf '\n' | sh -c "$locate" sh review)"
expect "an installed plugin is found when the key runs" yes "$([[ "$prompted" == "forgerdr review"* ]] && echo yes || echo no)"
expect "the forgerdr layout's keys run the mod's commands" \
  "$mod-/=forgerdr.manual $mod-f=forgerdr.floor $mod-i=forgerdr.inbox $mod-m=forgerdr.mode $mod-s=forgerdr.start" \
  "$(jq -r '.["layout:forgerdr"] | to_entries | sort_by(.key) | map("\(.key)=\(.value)") | join(" ")' "$keys")"
expect "a layout key the user already uses is left out and theirs kept" "app.lock" "$(jq -r --arg key "$mod-l" '.global[$key]' "$keys")"
HERDR_APP_HOME="$sandbox/keys" bash "$bin/forge-setup-keys.sh" --review cmd-alt-p --worktree cmd-alt-y >/dev/null
expect "running it again keeps one key each" 5 "$(jq '.["layout:forgerdr"] | length' "$keys")"
expect "a key in use is refused" 1 "$(HERDR_APP_HOME="$sandbox/keys" status_of bash "$bin/forge-setup-keys.sh" --review cmd-t)"
HERDR_APP_HOME="$sandbox/keys" bash "$bin/forge-setup-keys.sh" --remove >/dev/null
expect "--remove takes only its own keys away" "tab.new tab.next 0" "$(jq -r '[.global["cmd-t"], .global["cmd-alt-x"], ([.global[] | objects] | length)] | join(" ")' "$keys")"
expect "--remove takes the forgerdr layout's keys away" false "$(jq 'has("layout:forgerdr")' "$keys")"

[ "$failures" -eq 0 ] || { printf '%s failure(s)\n' "$failures"; exit 1; }
printf 'all good\n'
