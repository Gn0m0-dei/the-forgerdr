#!/usr/bin/env bash
# Smallest check that fails if forge-start.sh breaks: the origin it reads (GitHub, GitLab with groups, Azure DevOps by
# https and ssh, none), the forge's mode and backlog, the OpenSpec changes and stores it reads and makes through a fake
# OpenSpec CLI, and why it cannot. Run: bash test/forge-start.test.sh
set -euo pipefail
bin="$(cd "$(dirname "$0")/.." && pwd)/bin/forge-start.sh"
sandbox="$(mktemp -d)"
trap 'rm -rf "$sandbox"' EXIT
export FORGERDR_CONFIG="$sandbox/config.toml" GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_NOSYSTEM=1
calls="$sandbox/calls"
: > "$calls"

failures=0
expect() {
  if [ "$2" = "$3" ]; then printf 'ok   %s\n' "$1"; else printf 'FAIL %s\n  expected: %s\n  actual:   %s\n' "$1" "$2" "$3"; failures=$((failures + 1)); fi
}

# A repository with an origin, in a folder of its own.
repo() {
  git init -q "$sandbox/$1"
  [ -z "${2:-}" ] || git -C "$sandbox/$1" remote add origin "$2"
  printf '%s\n' "$sandbox/$1"
}

# A fake OpenSpec CLI: logs its arguments; lists the stores in $sandbox/stores.json and the changes in
# $sandbox/changes.json; registers a folder named unhealthy* as OpenSpec refuses one without its openspec/ files.
mkdir -p "$sandbox/bin"
cat > "$sandbox/bin/openspec" <<SH
#!/usr/bin/env bash
printf 'openspec %s\n' "\$*" >> "$calls"
case "\$*" in
  --version) printf '1.14.1\n' ;;
  "store list --json") cat "$sandbox/stores.json" 2>/dev/null || printf '{"stores":[],"status":[]}\n' ;;
  "store register "*unhealthy*) printf '{"store":null,"status":[{"severity":"error","code":"store_register_root_unhealthy","message":"Missing openspec/config.yaml.","fix":"Run openspec store setup."}]}\n'; exit 1 ;;
  "store register "*) jq -cn --arg id "\$(basename "\$3")" '{store: {id: \$id}, registry: {registered: true}, status: []}' ;;
  "store setup "*) jq -cn --arg id "\$3" '{store: {id: \$id}, status: []}' ;;
  "list --changes --sort name --store gone --json") printf '{"changes":[],"status":[{"severity":"error","code":"unknown_store","message":"Unknown store gone.","fix":"Pass a registered store id."}]}\n'; exit 1 ;;
  "list --changes --sort name"*) cat "$sandbox/changes.json" ;;
esac
SH
chmod +x "$sandbox/bin/openspec"
tools="$sandbox/tools"
mkdir -p "$tools"
for tool in jq git awk sed grep basename dirname cat mktemp; do ln -sf "$(command -v "$tool")" "$tools/$tool"; done
export PATH="$sandbox/bin:$tools:/usr/bin:/bin"

info() { bash "$bin" info "$1" | jq -r "$2"; }

# The origin, whatever its form.
github="$(repo github https://github.com/northwind/orders.git)"
expect "github origin" "github northwind/orders orders" "$(info "$github" '"\(.provider) \(.project) \(.repo)"')"
gitlab="$(repo gitlab git@gitlab.example.com:shop/web/storefront.git)"
expect "gitlab origin with groups" "gitlab gitlab.example.com shop/web/storefront" \
  "$(info "$gitlab" '"\(.provider) \(.host) \(.project)"')"
azure="$(repo azure 'https://acme@dev.azure.com/acme/Shop%20Platform/_git/Check.Out')"
expect "azure origin by https" "azure https://dev.azure.com/acme|Shop Platform|Check.Out" \
  "$(info "$azure" '"\(.provider) \(.org)|\(.azure_project)|\(.repo)"')"
azure_ssh="$(repo azure-ssh git@ssh.dev.azure.com:v3/acme/Shop%20Platform/Check.Out)"
expect "azure origin by ssh" "https://dev.azure.com/acme|Shop Platform|Check.Out" \
  "$(info "$azure_ssh" '"\(.org)|\(.azure_project)|\(.repo)"')"
azure_alias="$(repo azure-alias 'git@azure-client:v3/acme/Shop%20Platform/Check.Out')"
expect "azure origin through an ssh alias of ~/.ssh/config" "azure https://dev.azure.com/acme|Shop Platform|Check.Out" \
  "$(info "$azure_alias" '"\(.provider) \(.org)|\(.azure_project)|\(.repo)"')"
expect "no azdospec backlog by default" "" "$(info "$azure_alias" '.azdospec_backlog')"
git -C "$azure_alias" config --local azdospec.organization other-org
git -C "$azure_alias" config --local azdospec.project 'Back Office'
expect "the backlog /azdo:init keeps in the clone's git config" "https://dev.azure.com/other-org/Back%20Office" \
  "$(info "$azure_alias" '.azdospec_backlog')"
bash "$bin" azdospec "$azure_alias" "https://dev.azure.com/third/Front%20Desk" >/dev/null
expect "the mode dialog changes it there" "third|Front Desk" \
  "$(git -C "$azure_alias" config --local azdospec.organization)|$(git -C "$azure_alias" config --local azdospec.project)"
expect "and nothing else of azdospec's" "" "$(git -C "$azure_alias" config --local --get azdospec.spec-store || true)"
expect "a clone without /azdo:init is left alone" "this clone has no azdospec settings: /azdo:init sets them up" \
  "$(bash "$bin" azdospec "$azure_ssh" "https://dev.azure.com/third/X" | jq -r '.error')"
expect "with no azdospec settings made" "" "$(git -C "$azure_ssh" config --local --get azdospec.organization || true)"
expect "a URL that is no Azure DevOps project is refused" "not an Azure DevOps project: https://github.com/a/b" \
  "$(bash "$bin" azdospec "$azure_alias" "https://github.com/a/b" | jq -r '.error')"
lonely="$(repo lonely)"
expect "no origin" "none" "$(info "$lonely" '.provider')"
expect "a checkout's root from a folder inside it" "$(cd "$github" && pwd -P)" \
  "$(mkdir -p "$github/src/deep" && bash "$bin" info "$github/src/deep" | jq -r '.root' | xargs -I{} sh -c 'cd {} && pwd -P')"
mkdir -p "$sandbox/plain"
expect "outside git" "" "$(info "$sandbox/plain" '.root')"
expect "the spec mode is chat by default" chat "$(info "$github" '.spec')"
printf '[spec.projects]\norders = "openspec"\n' > "$FORGERDR_CONFIG"
mv "$github" "$sandbox/orders"
github="$sandbox/orders"
expect "and the project's own when set" openspec "$(info "$github" '.spec')"

# The forge's mode and backlog.
expect "a forge's mode, its spec mode and no backlog" "orders openspec openspec " \
  "$(info "$github" '"\(.key) \(.mode) \(.spec) \(.backlog)"')"
printf '[mode.projects]\nazure = "azure"\n[spec.projects]\nazure = "azure"\norders = "openspec"\n[backlog.projects]\nazure = "https://dev.azure.com/other/Backlog"\n' > "$FORGERDR_CONFIG"
expect "an Azure DevOps forge with a backlog of its own" "azure https://dev.azure.com/other/Backlog" \
  "$(info "$azure" '"\(.mode) \(.backlog)"')"
printf '[mode.projects]\ngitlab = "gitlab"\n[spec.projects]\ngitlab = "chat"\norders = "openspec"\n' > "$FORGERDR_CONFIG"
expect "a GitLab forge keeps its design in the chat" "gitlab chat" "$(info "$gitlab" '"\(.mode) \(.spec)"')"

# The OpenSpec changes, of the repository or of its store.
printf '{"changes":[{"name":"fix-scroll","completedTasks":0,"totalTasks":0,"status":"no-tasks"},{"name":"add-inbox","completedTasks":2,"totalTasks":3,"status":"in-progress"}],"root":"x","status":[]}\n' \
  > "$sandbox/changes.json"
expect "the changes with their tasks" "fix-scroll 0/0 no-tasks|add-inbox 2/3 in-progress" \
  "$(bash "$bin" changes "$github" | jq -r 'map("\(.name) \(.done)/\(.total) \(.status)") | join("|")')"
expect "read in the repository" "openspec list --changes --sort name --json" "$(tail -n 1 "$calls")"
# The OpenSpec changes of a parent folder: its store's, read from the folder; with OpenSpec in each repository, the
# changes of the repositories that have it, each told by its repository.
mkdir -p "$sandbox/folder"
git init -q "$sandbox/folder/api"
git init -q "$sandbox/folder/web"
config="$(dirname "$bin")/forge-config.sh"
bash "$config" set spec openspec:shared folder >/dev/null
expect "a parent folder reads its store's changes" "fix-scroll|add-inbox" "$(bash "$bin" changes "$sandbox/folder" | jq -r 'map(.name) | join("|")')"
expect "from the folder, with its store" "openspec list --changes --sort name --store shared --json" "$(tail -n 1 "$calls")"
bash "$config" set spec openspec folder >/dev/null
expect "with OpenSpec in no repository, it says so" "no repository of this folder has OpenSpec" "$(bash "$bin" changes "$sandbox/folder" | jq -r .error)"
mkdir -p "$sandbox/folder/api/openspec" "$sandbox/folder/web/openspec"
expect "else the changes of each repository, told by it" "api:fix-scroll|api:add-inbox|web:fix-scroll|web:add-inbox" \
  "$(bash "$bin" changes "$sandbox/folder" | jq -r 'map("\(.repo):\(.name)") | join("|")')"

expect "not in OpenSpec mode" "this forge's mode is gitlab, not OpenSpec" "$(bash "$bin" changes "$gitlab" | jq -r '.error')"
printf '[spec.projects]\norders = "openspec:team-specs"\n' > "$FORGERDR_CONFIG"
bash "$bin" changes "$github" >/dev/null
expect "of a store" "openspec list --changes --sort name --store team-specs --json" "$(tail -n 1 "$calls")"
printf '[spec.projects]\norders = "openspec:gone"\n' > "$FORGERDR_CONFIG"
expect "a store OpenSpec does not know says why and how" "Unknown store gone.|Pass a registered store id." \
  "$(bash "$bin" changes "$github" | jq -r '"\(.error)|\(.fix)"')"

# The OpenSpec store in a folder.
mkdir -p "$sandbox/team-specs" "$sandbox/unhealthy-specs" "$sandbox/New Specs"
jq -cn --arg root "$(cd "$sandbox/team-specs" && pwd -P)" '{stores: [{id: "team", root: $root}], status: []}' > "$sandbox/stores.json"
expect "a folder registered already is its store" team "$(bash "$bin" register "$sandbox/team-specs" | jq -r '.id')"
rm "$sandbox/stores.json"
expect "one not registered yet is registered" team-specs "$(bash "$bin" register "$sandbox/team-specs" | jq -r '.id')"
expect "with no question asked" yes "$(grep -q "store register $(cd "$sandbox/team-specs" && pwd -P) --yes --json" "$calls" && echo yes || echo no)"
expect "a folder without OpenSpec in it offers to make a store" "true Missing openspec/config.yaml." \
  "$(bash "$bin" register "$sandbox/unhealthy-specs" | jq -r '"\(.setup) \(.error)"')"
expect "which setup makes, named after the folder, git left alone" new-specs "$(bash "$bin" setup "$sandbox/New Specs" | jq -r '.id')"
expect "so" yes "$(tail -n 1 "$calls" | grep -q -- "store setup new-specs --path .*New Specs --no-init-git --json" && echo yes || echo no)"

# Without the OpenSpec CLI.
rm "$sandbox/bin/openspec"
expect "says how to get it" "the OpenSpec CLI is not installed|/forgerdr:setup installs it" \
  "$(bash "$bin" register "$sandbox/team-specs" | jq -r '"\(.error)|\(.fix)"')"

# The repositories of a parent folder, as the sidebar shows them under it: its first-level children that hold a .git
# directory; a linked worktree or a submodule checkout (.git is a file) is not one, and a folder inside git has none.
mkdir -p "$sandbox/many/notes" "$sandbox/many/linked"
git init -q "$sandbox/many/web"
git init -q "$sandbox/many/api"
printf 'gitdir: elsewhere\n' > "$sandbox/many/linked/.git"
many="$(cd "$sandbox/many" && pwd -P)"
expect "the repositories of a parent folder, by name" "$many|$many/api,$many/web" \
  "$(bash "$bin" repos "$sandbox/many" | jq -r '"\(.root)|\(.repos | join(","))"')"
# A repository joined to its parent folder is read with the folder's key, mode and backlog.
bash "$config" set mode azure folder >/dev/null
bash "$config" set backlog https://dev.azure.com/acme/Shop folder >/dev/null
expect "a repository read alone has its own key, mode and backlog" "api|chat|" "$(bash "$bin" info "$sandbox/folder/api" | jq -r '"\(.key)|\(.mode)|\(.backlog)"')"
git -C "$sandbox/folder/api" config --local forgerdr.workspace "$sandbox/folder"
expect "joined to its folder, the folder's" "folder|azure|https://dev.azure.com/acme/Shop" \
  "$(bash "$bin" info "$sandbox/folder/api" | jq -r '"\(.key)|\(.mode)|\(.backlog)"')"
git -C "$sandbox/folder/api" config --local --unset forgerdr.workspace

# Indexing a forge: its repositories are joined to their parent folder (recorded in each one's own git config) and its
# code is indexed as one project from the forge's root, through the code index's command line (a fake here, which
# logs what it is asked and answers a project named after the folder).
export XDG_STATE_HOME="$sandbox/state"
cat > "$sandbox/bin/codeindex" <<SH
#!/usr/bin/env bash
printf 'codeindex %s\n' "\$*" >> "$calls"
[ ! -f "$sandbox/codeindex.wait" ] || sleep 3
# As the real program fails: a root it refuses, in plain words; a run that breaks, as JSON with its status and a hint.
[ ! -f "$sandbox/codeindex.refuse" ] || { printf '%s: path is too broad to index as one root\n' "\${*: -1}"; exit 1; }
[ ! -f "$sandbox/codeindex.fail" ] || { printf '{"project":"x","status":"error","hint":"Pipeline failed."}\n'; exit 0; }
# A run that goes well may still say something on its errors' side.
[ ! -f "$sandbox/codeindex.warn" ] || printf 'warning: 3 files were skipped\n' >&2
jq -cn --arg project "fake-\$(basename "\${*: -1}")" '{project: \$project, nodes: 3}'
SH
chmod +x "$sandbox/bin/codeindex"
export FORGE_CODE_INDEX="$sandbox/bin/codeindex"
state_of() { bash "$bin" indexed "$1" | jq -r "${2:-.state}"; }
real_folder="$(cd "$sandbox/folder" && pwd -P)"
expect "a parent folder nobody indexed" "none|0/2" "$(state_of "$sandbox/folder" '"\(.state)|\(.joined)/\(.repos)"')"
expect "nor are its repositories" "none" "$(state_of "$sandbox/folder/api")"
expect "indexing it answers its state" "ready|fake-folder|2/2" "$(bash "$bin" index "$sandbox/folder" | jq -r '"\(.state)|\(.project)|\(.joined)/\(.repos)"')"
expect "the code is indexed from the folder, as one project" "codeindex cli --quiet index_repository --repo-path $real_folder" "$(tail -n 1 "$calls")"
expect "each repository records its folder" "$real_folder $real_folder" \
  "$(git -C "$sandbox/folder/api" config --local forgerdr.workspace) $(git -C "$sandbox/folder/web" config --local forgerdr.workspace)"
expect "and is read with the folder's key from then on" "folder" "$(bash "$bin" info "$sandbox/folder/web" | jq -r .key)"
expect "the folder is indexed" "ready" "$(state_of "$sandbox/folder")"
# shellcheck source=bin/forge-lib.sh
. "$(dirname "$bin")/forge-lib.sh"
expect "a session in one of its repositories is told the project that covers the folder" yes \
  "$(forge_index_note "$sandbox/folder/web" | grep -c "project .fake-folder. covers $real_folder" | sed 's/^1$/yes/')"
expect "one in a forge nobody indexed is told nothing" "" "$(forge_index_note "$sandbox/many")"
expect "seen from any of its repositories too, as the folder's" "ready|$real_folder" "$(state_of "$sandbox/folder/api" '"\(.state)|\(.root)"')"
git init -q "$sandbox/folder/late"
expect "a repository added later makes it not indexed again" "none|2/3" "$(state_of "$sandbox/folder" '"\(.state)|\(.joined)/\(.repos)"')"
rm -rf "$sandbox/folder/late"
touch "$sandbox/codeindex.wait"
bash "$bin" index "$sandbox/folder" >/dev/null &
sleep 1
expect "while it runs, from another process, it is indexing" "indexing" "$(state_of "$sandbox/folder")"
wait
rm "$sandbox/codeindex.wait"
expect "and ready once done" "ready" "$(state_of "$sandbox/folder")"
# The app starts it and goes on: the run is on its own, and the state is asked meanwhile.
touch "$sandbox/codeindex.wait"
expect "started for the app, it answers at once that it is indexing" "indexing" "$(bash "$bin" index-start "$sandbox/folder" | jq -r .state)"
expect "a second start while it runs starts nothing" "indexing 1" \
  "$(bash "$bin" index-start "$sandbox/folder" | jq -r .state) $(grep -c "index_repository --repo-path $real_folder" "$calls" | awk '{print ($1 == 3) ? 1 : $1}')"
for _ in 1 2 3 4 5 6 7 8; do [ "$(state_of "$sandbox/folder")" = indexing ] || break; sleep 1; done
rm "$sandbox/codeindex.wait"
expect "and is ready once its run ends" "ready" "$(state_of "$sandbox/folder")"
# What goes wrong is kept with the state, so the app can say it: a run that breaks, a root the program refuses.
bash "$bin" unindex "$sandbox/folder" >/dev/null
touch "$sandbox/codeindex.fail"
expect "a code index that breaks says why, and the folder is not indexed" "the code index failed: Pipeline failed.|none|the code index failed: Pipeline failed." \
  "$(bash "$bin" index "$sandbox/folder" | jq -r .error)|$(state_of "$sandbox/folder")|$(state_of "$sandbox/folder" .failed)"
rm "$sandbox/codeindex.fail"
touch "$sandbox/codeindex.refuse"
expect "a root the program refuses, in its own words" "the code index failed: $real_folder: path is too broad to index as one root" \
  "$(bash "$bin" index "$sandbox/folder" | jq -r .error)"
rm "$sandbox/codeindex.refuse"
expect "the next good run clears what went wrong" "ready|" "$(bash "$bin" index "$sandbox/folder" | jq -r '"\(.state)|\(.failed)"')"
expect "and its answer is no error for whoever reads it" false "$(bash "$bin" indexed "$sandbox/folder" | jq 'has("error")')"
touch "$sandbox/codeindex.warn"
expect "a run that goes well with a warning on the side is a good run" "ready|fake-folder|" "$(bash "$bin" index "$sandbox/folder" | jq -r '"\(.state)|\(.project)|\(.failed)"')"
rm "$sandbox/codeindex.warn"
# Undoing waits for a run to end: it would be joined again under it.
touch "$sandbox/codeindex.wait"
bash "$bin" index-start "$sandbox/folder" >/dev/null
expect "a forge that is indexing is not undone" "a run is indexing this forge|2/2" \
  "$(bash "$bin" unindex "$sandbox/folder" | jq -r .error)|$(bash "$bin" indexed "$sandbox/folder" | jq -r '"\(.joined)/\(.repos)"')"
for _ in 1 2 3 4 5 6 7 8; do [ "$(state_of "$sandbox/folder")" = indexing ] || break; sleep 1; done
rm "$sandbox/codeindex.wait"
# A record that cannot be read, or a run that died without a word, never leave the state unanswered or stuck.
record="$(find "$XDG_STATE_HOME/forgerdr/index" -name '*.json' | head -n 1)"
printf 'not json' > "$record"
expect "a record that cannot be read is no record" "none" "$(state_of "$sandbox/folder")"
printf '999999\n' > "$record.running"
expect "a run that is gone is not a run" "none" "$(state_of "$sandbox/folder")"
printf '%s\n' "$$" > "$record.running"
expect "nor is another program that got its process id" "none" "$(state_of "$sandbox/folder")"
bash "$bin" index "$sandbox/folder" >/dev/null
# From inside one of its repositories, the forge indexed and undone is the folder's.
expect "asked from inside a repository, it is the folder that is undone" "none|0/2|$real_folder" \
  "$(bash "$bin" unindex "$sandbox/folder/api" | jq -r '"\(.state)|\(.joined)/\(.repos)|\(.root)"')"
# A child that is a link to a repository elsewhere is not the folder's to join: it is left alone and does not keep the
# folder from being indexed.
git init -q "$sandbox/outside-repo"
ln -s "$sandbox/outside-repo" "$sandbox/folder/linked"
expect "a linked repository is not joined, and the folder is indexed without it" "ready|2/2|" \
  "$(bash "$bin" index "$sandbox/folder" | jq -r '"\(.state)|\(.joined)/\(.repos)"')|$(git -C "$sandbox/outside-repo" config --local forgerdr.workspace || true)"
rm "$sandbox/folder/linked"
expect "undone, its repositories are on their own again" "none|api" \
  "$(bash "$bin" unindex "$sandbox/folder" | jq -r .state)|$(bash "$bin" info "$sandbox/folder/api" | jq -r .key)"
expect "a repository on its own is indexed alone, with nothing recorded in it" "ready|fake-orders|" \
  "$(bash "$bin" index "$github" | jq -r '"\(.state)|\(.project)"')|$(git -C "$github" config --local forgerdr.workspace || true)"
expect "without the code index, indexing still joins the repositories" "ready|false|2/2" \
  "$(FORGE_CODE_INDEX="$sandbox/bin/none" bash "$bin" index "$sandbox/folder" | jq -r '"\(.state)|\(.code)|\(.joined)/\(.repos)"')"
bash "$bin" unindex "$sandbox/folder" >/dev/null

# Start work on a parent folder takes the issues of any of its repositories: info names the origin of each.
git -C "$sandbox/many/api" remote add origin https://github.com/acme/shop-api.git
git -C "$sandbox/many/web" remote add origin git@gitlab.com:acme/front/shop-web.git
expect "a parent folder's info names its repositories' origins" "none|github:acme/shop-api,gitlab:acme/front/shop-web" \
  "$(bash "$bin" info "$sandbox/many" | jq -r '"\(.provider)|\(.repos | map("\(.provider):\(.project)") | join(","))"')"
expect "a repository's info names none" "[]" "$(bash "$bin" info "$sandbox/many/api" | jq -c .repos)"
git -C "$sandbox/many/api" remote remove origin
git -C "$sandbox/many/web" remote remove origin

# A child that is a link to a repository elsewhere is named as git names it, so its spaces are found under the folder.
git init -q "$sandbox/elsewhere-repo"
ln -s "$sandbox/elsewhere-repo" "$sandbox/many/linked-repo"
expect "a linked repository, by its real path" "$(cd "$sandbox/elsewhere-repo" && pwd -P)" \
  "$(bash "$bin" repos "$sandbox/many" | jq -r '.repos[] | select(endswith("elsewhere-repo"))')"
rm "$sandbox/many/linked-repo"
expect "a folder inside git has none" "[]" "$(bash "$bin" repos "$sandbox/many/api" | jq -c .repos)"
expect "nor has a folder with no repository" "[]" "$(bash "$bin" repos "$sandbox/many/notes" | jq -c .repos)"

expect "a command it does not know" 1 "$(bash "$bin" list "$github" >/dev/null 2>&1; echo $?)"

[ "$failures" -eq 0 ] || { printf '%s failure(s)\n' "$failures"; exit 1; }
printf 'all good\n'
