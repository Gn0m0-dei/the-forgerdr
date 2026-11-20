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

expect "a command it does not know" 1 "$(bash "$bin" list "$github" >/dev/null 2>&1; echo $?)"

[ "$failures" -eq 0 ] || { printf '%s failure(s)\n' "$failures"; exit 1; }
printf 'all good\n'
