#!/usr/bin/env bash
# Smallest check that fails if the pure functions of forge-lib.sh break. Run: bash test/forge-lib.test.sh
set -euo pipefail

# shellcheck source-path=SCRIPTDIR/../herdr/bin
# shellcheck source=forge-lib.sh
. "$(cd "$(dirname "$0")/.." && pwd)/herdr/bin/forge-lib.sh"

failures=0
expect() {
  local label="$1" expected="$2" actual="$3"
  if [ "$expected" = "$actual" ]; then
    printf 'ok   %s\n' "$label"
  else
    printf 'FAIL %s\n  expected: %s\n  actual:   %s\n' "$label" "$expected" "$actual"
    failures=$((failures + 1))
  fi
}

expect "slug ascii" "search-page-filters-do-not-keep-the" "$(forge_slug 'Search page - filters do not keep the selection after navigating back')"
expect "slug accents" "boton-de-accion-no-visible" "$(forge_slug 'Botón de acción no visible')"
expect "slug trailing" "a-b" "$(forge_slug '--A  b!!')"
expect "slug short" "short-title" "$(forge_slug 'Short title')"

expect "provider azure" azure "$(forge_provider 'https://dev.azure.com/org/proj/_workitems/edit/1')"
expect "provider azure ssh" azure "$(forge_provider 'git@ssh.dev.azure.com:v3/org/proj/repo')"
expect "provider github" github "$(forge_provider 'https://github.com/o/r/pull/3')"
expect "provider gitlab" gitlab "$(forge_provider 'https://gitlab.example.com/g/r/-/merge_requests/9')"

expect "url repo azure" "MY.Repo" "$(forge_url_repo 'https://dev.azure.com/org/proj/_git/MY.Repo/pullrequest/4242')"
expect "url repo github" "repo" "$(forge_url_repo 'https://github.com/owner/repo/pull/12')"
expect "url repo gitlab" "repo" "$(forge_url_repo 'https://gitlab.com/group/sub/repo/-/merge_requests/4')"
expect "url id" "4242" "$(forge_url_id 'https://dev.azure.com/org/proj/_git/R/pullrequest/4242?_a=files')"
expect "url id trailing slash" "1234" "$(forge_url_id 'https://dev.azure.com/org/proj/_workitems/edit/1234/')"
expect "azure org" "https://dev.azure.com/acme" "$(forge_azure_org 'https://dev.azure.com/acme/P/_workitems/edit/1')"
expect "url project github" "owner/repo" "$(forge_url_project 'https://github.com/owner/repo/issues/5')"
expect "url project gitlab" "group/sub/repo" "$(forge_url_project 'https://gitlab.com/group/sub/repo/-/issues/5')"

sandbox="$(cd "$(mktemp -d)" && pwd -P)"
trap 'rm -rf "$sandbox"' EXIT
mkdir -p "$sandbox/workspace/.claude" "$sandbox/workspace/front" "$sandbox/workspace/back" "$sandbox/lonely"
git -C "$sandbox/workspace/front" init -q
git -C "$sandbox/workspace/back" init -q
git -C "$sandbox/lonely" init -q
git -C "$sandbox/workspace/back" remote add origin git@ssh.dev.azure.com:v3/org/proj/MY.Repo

expect "project key workspace" "workspace" "$(forge_project_key "$sandbox/workspace/front")"
expect "project key workspace root" "workspace" "$(forge_project_key "$sandbox/workspace")"
expect "project key lonely repo" "lonely" "$(forge_project_key "$sandbox/lonely")"
git -C "$sandbox/workspace/front" -c user.email=t@t -c user.name=t commit -q --allow-empty -m init
git -C "$sandbox/workspace/front" worktree add -q "$sandbox/elsewhere/front-feature" -b feature 2>/dev/null
expect "project key linked worktree" "workspace" "$(forge_project_key "$sandbox/elsewhere/front-feature")"
mkdir -p "$sandbox/workspace/.claude/skills/shared-rules"
printf -- '---\nname: shared-rules\ndescription: "Rules every repo of the workspace follows"\n---\n' > "$sandbox/workspace/.claude/skills/shared-rules/SKILL.md"
expect "workspace skills from a repo" "shared-rules$(printf '\t')$sandbox/workspace/.claude/skills/shared-rules/SKILL.md$(printf '\t')Rules every repo of the workspace follows" "$(forge_workspace_skills "$sandbox/workspace/front")"
expect "workspace skills from a worktree" "shared-rules" "$(forge_workspace_skills "$sandbox/elsewhere/front-feature" | cut -f1)"
expect "workspace skills none in a lonely repo" "" "$(forge_workspace_skills "$sandbox/lonely")"
expect "find clone by name" "$sandbox/workspace/front" "$(forge_find_clone "$sandbox/workspace" front)"
expect "find clone by remote" "$sandbox/workspace/back" "$(forge_find_clone "$sandbox/workspace" MY.Repo)"
expect "find clone fallback" "$sandbox/workspace" "$(forge_find_clone "$sandbox/workspace" nothing)"
expect "detect repos children" "$sandbox/workspace/back
$sandbox/workspace/front" "$(forge_detect_repos "$sandbox/workspace")"
expect "detect repos self" "$(cd "$sandbox/lonely" && pwd -P)" "$(forge_detect_repos "$sandbox/lonely")"

printf '{"scripts":{"dev":"next dev"}}' > "$sandbox/workspace/front/package.json"
touch "$sandbox/workspace/front/pnpm-lock.yaml"
expect "dev command pnpm" "pnpm dev" "$(forge_dev_command "$sandbox/workspace/front")"
expect "dev command none" "" "$(forge_dev_command "$sandbox/workspace/back")"

printf 'node_modules\n.env*\n' > "$sandbox/workspace/front/.gitignore"
mkdir -p "$sandbox/workspace/front/apps/a/env" "$sandbox/workspace/front/node_modules/x"
touch "$sandbox/workspace/front/.env.local" "$sandbox/workspace/front/apps/a/env/.env.local" "$sandbox/workspace/front/node_modules/x/.env"
git -C "$sandbox/workspace/front" add .gitignore package.json && git -C "$sandbox/workspace/front" -c user.email=t@t -c user.name=t commit -qm init
expect "env files" ".env.local
apps/a/env/.env.local" "$(forge_env_files "$sandbox/workspace/front")"
mkdir -p "$sandbox/target"
expect "copy env count" "2" "$(forge_copy_env "$sandbox/workspace/front" "$sandbox/target")"
expect "copy env placed" "yes" "$([ -f "$sandbox/target/apps/a/env/.env.local" ] && echo yes)"

[ "$failures" -eq 0 ] || { printf '%s failure(s)\n' "$failures"; exit 1; }
printf 'all good\n'
