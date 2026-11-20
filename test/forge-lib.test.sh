#!/usr/bin/env bash
# Smallest check that fails if the pure functions of forge-lib.sh break. Run: bash test/forge-lib.test.sh
set -euo pipefail

# shellcheck source-path=SCRIPTDIR/../bin
# shellcheck source=forge-lib.sh
. "$(cd "$(dirname "$0")/.." && pwd)/bin/forge-lib.sh"

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
expect "slug accents" "cafe-menu-hides-the-jalapeno-badge" "$(forge_slug 'Café menu hides the jalapeño badge')"
expect "slug trailing" "a-b" "$(forge_slug '--A  b!!')"
expect "slug short" "short-title" "$(forge_slug 'Short title')"
expect "a release's slug keeps its version's dots" "v1.2.0" "$(forge_slug 'v1.2.0' .)"
expect "and still makes the rest a branch name" "spring-release-2.0.1" "$(forge_slug ' Spring release 2.0..1. ' .)"
expect "a long one cut short never ends in a dot" "abcdefghij-abcdefghij-abcdefghij-v1.2" "$(forge_slug 'abcdefghij abcdefghij abcdefghij v1.2. xyzwvutsr' .)"
# The herdr app runs its mods' commands with no UTF-8 locale.
expect "slug of plain words with no UTF-8 locale" "empty-state-on-orders" "$(LC_ALL=C forge_slug 'Empty state on orders' 2>&1)"
expect "slug accents with no UTF-8 locale" "cafe-menu-hides-the-jalapeno-badge" "$(LC_ALL=C forge_slug 'Café menu hides the jalapeño badge' 2>&1)"

expect "provider azure" azure "$(forge_provider 'https://dev.azure.com/org/proj/_workitems/edit/1')"
expect "provider azure ssh" azure "$(forge_provider 'git@ssh.dev.azure.com:v3/org/proj/repo')"
expect "provider azure through an ssh alias" azure "$(forge_provider 'git@azure-client:v3/org/My%20Proj/repo')"
expect "provider github" github "$(forge_provider 'https://github.com/o/r/pull/3')"
expect "provider gitlab" gitlab "$(forge_provider 'https://gitlab.example.com/g/r/-/merge_requests/9')"

expect "url repo azure" "MY.Repo" "$(forge_url_repo 'https://dev.azure.com/org/proj/_git/MY.Repo/pullrequest/4242')"
expect "url repo github" "repo" "$(forge_url_repo 'https://github.com/owner/repo/pull/12')"
expect "url repo gitlab" "repo" "$(forge_url_repo 'https://gitlab.com/group/sub/repo/-/merge_requests/4')"
expect "url id" "4242" "$(forge_url_id 'https://dev.azure.com/org/proj/_git/R/pullrequest/4242?_a=files')"
expect "url id trailing slash" "1234" "$(forge_url_id 'https://dev.azure.com/org/proj/_workitems/edit/1234/')"
expect "azure org" "https://dev.azure.com/acme" "$(forge_azure_org 'https://dev.azure.com/acme/P/_workitems/edit/1')"
expect "azure org legacy host" "https://dev.azure.com/acme" "$(forge_azure_org 'https://acme.visualstudio.com/P/_workitems/edit/1')"
expect "azure org https remote" "https://dev.azure.com/acme" "$(forge_azure_org 'https://Acme@dev.azure.com/Acme/My%20Project/_git/repo')"
expect "azure org ssh remote" "https://dev.azure.com/acme" "$(forge_azure_org 'git@ssh.dev.azure.com:v3/acme/My%20Project/repo')"
expect "azure org ssh alias remote" "https://dev.azure.com/acme" "$(forge_azure_org 'git@azure-work:v3/acme/My%20Project/repo')"
expect "azure org github remote" "" "$(forge_azure_org 'git@github.com:acme/repo.git')"
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
mkdir -p "$sandbox/workspace/back/.claude/skills/back-rules"
printf -- '---\nname: back-rules\ndescription: Backend conventions\n---\n' > "$sandbox/workspace/back/.claude/skills/back-rules/SKILL.md"
expect "child repo skills from the workspace root" "back	back-rules" "$(forge_child_repo_skills "$sandbox/workspace" | cut -f1,2)"
expect "child repo skills none inside a repo" "" "$(forge_child_repo_skills "$sandbox/workspace/back")"
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

git -C "$sandbox/workspace/front" update-ref "refs/remotes/origin/feature/#42-render" HEAD
expect "start ref from the remote branch" "origin/feature/#42-render" "$(forge_start_ref "$sandbox/workspace/front" "feature/#42-render" develop)"
expect "start ref from the base" "origin/develop" "$(forge_start_ref "$sandbox/workspace/front" "feature/new" develop)"
expect "branch for id on origin" "feature/#42-render" "$(forge_branch_for_id "$sandbox/workspace/front" 42)"
git -C "$sandbox/workspace/front" branch "fix/AB42-render-again"
expect "branch for id local first" "fix/AB42-render-again" "$(forge_branch_for_id "$sandbox/workspace/front" 42)"
expect "branch for id is not a longer id" "" "$(forge_branch_for_id "$sandbox/workspace/front" 4)"
git -C "$sandbox/workspace/front" branch "fix/EXT-77-checkout"
expect "branch for an external id" "fix/EXT-77-checkout" "$(forge_branch_for_id "$sandbox/workspace/front" 77)"
git -C "$sandbox/workspace/back" remote set-url origin git@azure-work:v3/contoso/Web%20Portal/portal
external() { forge_item_external "$1" "${2:-$sandbox/workspace/back}" && echo external || echo own; }
expect "item of the remote's organization" own "$(external 'https://dev.azure.com/Contoso/Web%20Portal/_workitems/edit/12')"
expect "item of another organization" external "$(external 'https://dev.azure.com/fabrikam/Delivery/_workitems/edit/12')"
expect "issue of another provider" own "$(external 'https://github.com/fabrikam/portal/issues/12')"
git -C "$sandbox/lonely" remote add origin git@github.com:fabrikam/portal.git
expect "azure item for a github remote" external "$(external 'https://dev.azure.com/fabrikam/Delivery/_workitems/edit/12' "$sandbox/lonely")"
git -C "$sandbox/workspace/back" remote set-url origin git@ssh.dev.azure.com:v3/org/proj/MY.Repo
expect "agent name from an id" "item-1234-front" "$(forge_agent_name item 1234 front)"
long_one="$(forge_agent_name item "feature/add-search-filters-to-results-page" "a-very-long-repository-name")"
long_two="$(forge_agent_name item "feature/add-search-filters-to-results-api" "a-very-long-repository-name")"
expect "agent names hc accepts" "" "$(printf '%s\n' "$long_one" "$long_two" "$(forge_agent_name session '#12 Café menu hides the jalapeño badge on the résumé page')" | grep -vE '^[a-z][a-z0-9_-]{0,31}$' || true)"
expect "agent names differ on a shared prefix" yes "$([ "$long_one" != "$long_two" ] && echo yes)"
expect "branch checked out in a worktree" "$sandbox/elsewhere/front-feature" "$(forge_checked_out_at "$sandbox/workspace/front" feature)"
expect "branch free" "" "$(forge_checked_out_at "$sandbox/workspace/front" "fix/AB42-render-again")"

mkdir -p "$sandbox/workspace/front/openspec/changes/add-renderer" "$sandbox/change-target"
touch "$sandbox/workspace/front/openspec/changes/add-renderer/proposal.md"
expect "copy change missing in the worktree" true "$(forge_copy_change "$sandbox/workspace/front" "$sandbox/change-target" add-renderer)"
expect "copy change placed" yes "$([ -f "$sandbox/change-target/openspec/changes/add-renderer/proposal.md" ] && echo yes)"
expect "copy change already there" false "$(forge_copy_change "$sandbox/workspace/front" "$sandbox/change-target" add-renderer)"
expect "copy change not a change name" false "$(forge_copy_change "$sandbox/workspace/front" "$sandbox/change-target" 'https://github.com/o/r/issues/1')"
expect "copy change unknown" false "$(forge_copy_change "$sandbox/workspace/front" "$sandbox/change-target" other-change)"

expect "main checkout from a linked worktree" "$sandbox/workspace/front" "$(forge_main_checkout "$sandbox/elsewhere/front-feature")"
forge_exclude_local "$sandbox/workspace/front" ".claude/worktrees/"
forge_exclude_local "$sandbox/workspace/front" ".claude/worktrees/"
expect "exclude added once" 1 "$(grep -cxF '.claude/worktrees/' "$sandbox/workspace/front/.git/info/exclude")"
expect "no worktreeinclude, nothing listed" "" "$(forge_worktree_includes "$sandbox/workspace/front")"
mkdir -p "$sandbox/listed-target"
expect "copy listed non-ASCII name" "1" "$(touch "$sandbox/workspace/front/.env.clé" && printf '.env.clé\n' | forge_copy_listed "$sandbox/workspace/front" "$sandbox/listed-target")"
# A worktree's branch can carry a symlink where the clone keeps an ignored env file: the copy never goes through one.
mkdir -p "$sandbox/outside" "$sandbox/linked"
printf 'victim\n' > "$sandbox/outside/victim"
ln -s "$sandbox/outside/victim" "$sandbox/linked/.env.local"
ln -s "$sandbox/outside" "$sandbox/linked/apps"
copied="$(printf '.env.local\napps/a/env/.env.local\n.env.clé\n' | forge_copy_listed "$sandbox/workspace/front" "$sandbox/linked" 2>"$sandbox/skipped")"
expect "an env file is not copied through a symlink" victim "$(cat "$sandbox/outside/victim")"
expect "nor into a folder a symlink leads to" no "$([ -e "$sandbox/outside/a" ] && echo yes || echo no)"
expect "the rest is copied and counted" "1 yes" "$copied $([ -f "$sandbox/linked/.env.clé" ] && echo yes)"
expect "and what was skipped is named" 2 "$(grep -c 'symlink' "$sandbox/skipped")"
expect "env files unquoted" yes "$(forge_env_files "$sandbox/workspace/front" | grep -qxF '.env.clé' && echo yes)"
expect "claude base ref falls back to HEAD without origin" "$(git -C "$sandbox/workspace/front" rev-parse HEAD)" "$(HOME="$sandbox" forge_claude_base_ref "$sandbox/workspace/front" "$sandbox/workspace/front")"

printf -- '---\nname: probe\ntools: Read, Grep\nmodel: "haiku"\n---\n\nBody line one.\n---\nAfter a rule.\n' > "$sandbox/agent.md"
expect "frontmatter field" "Read, Grep" "$(forge_frontmatter_field "$sandbox/agent.md" tools)"
expect "frontmatter field unquoted" "haiku" "$(forge_frontmatter_field "$sandbox/agent.md" model)"
expect "frontmatter body without leading blank lines" "Body line one.
---
After a rule." "$(forge_frontmatter_body "$sandbox/agent.md")"
printf -- '---\nname: listy\ntools:\n  - Read\n  - "Grep"\nmodel: haiku\n---\nBody.\n' > "$sandbox/listy.md"
printf -- '---\nname: flow\ntools: [Read, Glob]\n---\nBody.\n' > "$sandbox/flow.md"
expect "frontmatter list inline" "Read,Grep" "$(forge_frontmatter_list "$sandbox/agent.md" tools)"
expect "frontmatter list as YAML items" "Read,Grep" "$(forge_frontmatter_list "$sandbox/listy.md" tools)"
expect "frontmatter list in flow style" "Read,Glob" "$(forge_frontmatter_list "$sandbox/flow.md" tools)"
expect "frontmatter list absent" "" "$(forge_frontmatter_list "$sandbox/flow.md" model)"
expect "plugin agent definition" "$(cd "$(dirname "$0")/.." && pwd)/agents/reviewer.md" "$(forge_agent_definition forgerdr:reviewer "$sandbox")"
expect "built-in type has no definition" "" "$(forge_agent_definition Explore "$sandbox")"

export FORGERDR_CONFIG="$sandbox/forgerdr.toml"
expect "branch default" "feature/#1234-login-button" "$(forge_branch_name feature 1234 login-button acme)"
"$(cd "$(dirname "$0")/.." && pwd)/bin/forge-config.sh" set spec azure acme >/dev/null
expect "branch azure" "fix/AB1234-login-button" "$(forge_branch_name fix 1234 login-button acme)"
expect "branch other project" "feature/#1234-login-button" "$(forge_branch_name feature 1234 login-button other)"
expect "branch external in azure" "fix/EXT-1234-login-button" "$(forge_branch_name fix 1234 login-button acme external)"
expect "branch external elsewhere" "feature/EXT-1234-login-button" "$(forge_branch_name feature 1234 login-button other external)"

expect "item id from a URL" 1234 "$(forge_item_id 'https://dev.azure.com/org/proj/_workitems/edit/1234')"
expect "item id from #12" 12 "$(forge_item_id '#12')"
expect "item id from AB#12" 12 "$(forge_item_id 'AB#12')"
expect "item id from ab#12, as typed" 12 "$(forge_item_id 'ab#12')"
expect "item id from EXT-231, an item of an external backlog" 231 "$(forge_item_id 'EXT-231')"
expect "item id from a bare number" 12 "$(forge_item_id ' 12 ')"
expect "no item id in free text" "" "$(forge_item_id 'make the login form')"
expect "no item id in nothing" "" "$(forge_item_id '')"

[ "$failures" -eq 0 ] || { printf '%s failure(s)\n' "$failures"; exit 1; }
printf 'all good\n'
