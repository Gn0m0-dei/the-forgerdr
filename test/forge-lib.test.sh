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
# A child folder named with the character a sed script would end at, as a worktree's folder is (feature-#12-login).
mkdir -p "$sandbox/trees/feature-#12-login/.claude/skills/tree-rules"
printf 'gitdir: elsewhere\n' > "$sandbox/trees/feature-#12-login/.git"
printf -- '---\nname: tree-rules\ndescription: d\n---\n' > "$sandbox/trees/feature-#12-login/.claude/skills/tree-rules/SKILL.md"
expect "a child folder with a # in its name is named whole" "feature-#12-login	tree-rules" "$(forge_child_repo_skills "$sandbox/trees" | cut -f1,2)"
expect "child repo skills none inside a repo" "" "$(forge_child_repo_skills "$sandbox/workspace/back")"
# A folder outside git is its own root, whatever sits above it; and the home folder is never a workspace because of the
# .claude Claude Code keeps there.
mkdir -p "$sandbox/workspace/notes" "$sandbox/userhome/.claude" "$sandbox/userhome/shop"
git init -q "$sandbox/userhome/tool"
expect "a folder outside git, inside a workspace, is its own root" "notes" "$(forge_project_key "$sandbox/workspace/notes")"
expect "a parent folder right under the home is its own root" "shop" "$(HOME="$sandbox/userhome" forge_project_key "$sandbox/userhome/shop")"
expect "a repository right under the home keeps its own key" "tool" "$(HOME="$sandbox/userhome" forge_project_key "$sandbox/userhome/tool")"

# A parent folder with no .claude, CLAUDE.md or AGENTS.md: a repository under it keeps its own key until the folder's
# forge is indexed, which records the folder in the repository's own git config; then it, and its worktrees wherever
# they live, take the folder's key, mode and backlog. The record only counts while the folder is right above it.
mkdir -p "$sandbox/plain"
git init -q "$sandbox/plain/svc"
git -C "$sandbox/plain/svc" -c user.email=t@t -c user.name=t commit -q --allow-empty -m init
git -C "$sandbox/plain/svc" worktree add -q "$sandbox/elsewhere/svc-next" -b next 2>/dev/null
expect "a repository under a plain folder keeps its own key" "svc" "$(forge_project_key "$sandbox/plain/svc")"
git -C "$sandbox/plain/svc" config --local forgerdr.workspace "$sandbox/plain"
expect "joined to its folder, it takes the folder's" "plain" "$(forge_project_key "$sandbox/plain/svc")"
expect "its worktrees too, wherever they live" "plain" "$(forge_project_key "$sandbox/elsewhere/svc-next")"
expect "joined by an indexing alone, with no file of the folder saying so" yes "$(forge_joined_only "$sandbox/elsewhere/svc-next" && echo yes)"
expect "a repository of a folder that says so itself is not" no "$(forge_joined_only "$sandbox/workspace/front" && echo yes || echo no)"
# The memories of a repository are folded into its folder's only when the folder says it is a workspace: a submodule of
# a joined repository is joined by the indexing alone too, and a folder that is both joined and marked folds.
git init -q "$sandbox/plain/dep"
git -C "$sandbox/plain/dep" -c user.email=t@t -c user.name=t commit -q --allow-empty -m init
git -C "$sandbox/plain/svc" -c protocol.file.allow=always submodule --quiet add "$sandbox/plain/dep" libs/dep 2>/dev/null
expect "a submodule of a joined repository has the folder's key" "plain" "$(forge_project_key "$sandbox/plain/svc/libs/dep")"
expect "and is joined by the indexing alone, as its holder" yes "$(forge_joined_only "$sandbox/plain/svc/libs/dep" && echo yes || echo no)"
touch "$sandbox/plain/CLAUDE.md"
expect "a folder joined and marked is a workspace for everybody" no "$(forge_joined_only "$sandbox/plain/svc" && echo yes || echo no)"
rm "$sandbox/plain/CLAUDE.md"
git -C "$sandbox/plain/svc" config --local forgerdr.workspace "$sandbox/elsewhere"
expect "a record that names another folder does not count" "svc" "$(forge_project_key "$sandbox/plain/svc")"
git -C "$sandbox/plain/svc" config --local --unset forgerdr.workspace

# What a session is told of the skills Claude Code does not load for it, in each place it can start: at the workspace
# root, in a repository and in a worktree outside the workspace. Nothing is copied: each is named with its path.
skill() { mkdir -p "$1/.claude/skills/$2" && printf -- '---\nname: %s\ndescription: d\n---\n' "$2" > "$1/.claude/skills/$2/SKILL.md"; }
# shellcheck disable=SC2016 # a sed pattern with backticks
told() { forge_skills_context "$1" | sed -n 's/^- \*\*\([^*]*\)\*\* (`\([^`]*\)`).*/\1/p' | paste -sd, -; }
headed() { forge_skills_context "$1" | sed -n 's/^# //p' | paste -sd, -; }
front="$sandbox/workspace/front"
skill "$front" front-rules
git -C "$front" add .claude && git -C "$front" -c user.email=t@t -c user.name=t commit -qm skills
skill "$front" front-local
printf '.claude/skills/front-local/\n' >> "$front/.git/info/exclude"
git -C "$front" worktree add -q "$sandbox/elsewhere/front-next" -b next 2>/dev/null
expect "at the workspace root, the skills inside each repository" "back-rules,front-local,front-rules" "$(told "$sandbox/workspace")"
expect "under their own heading" "Repository skills" "$(headed "$sandbox/workspace")"
expect "in a repository, the workspace's" "shared-rules" "$(told "$front")"
expect "in a worktree, the workspace's and the ones only its main checkout has" "shared-rules,front-local" "$(told "$sandbox/elsewhere/front-next")"
expect "each under its heading" "Workspace skills,Main checkout skills" "$(headed "$sandbox/elsewhere/front-next")"
expect "the main checkout's, by its path there" yes \
  "$(forge_skills_context "$sandbox/elsewhere/front-next" | grep -cF "($(printf '\140')$front/.claude/skills/front-local/SKILL.md$(printf '\140'))" | sed 's/^1$/yes/')"
skill "$sandbox/lonely" lonely-local
git -C "$sandbox/lonely" -c user.email=t@t -c user.name=t commit -q --allow-empty -m init
git -C "$sandbox/lonely" worktree add -q "$sandbox/elsewhere/lonely-next" -b next 2>/dev/null
expect "a worktree of a repository with no workspace gets its main checkout's alone" "Main checkout skills|lonely-local" \
  "$(headed "$sandbox/elsewhere/lonely-next")|$(told "$sandbox/elsewhere/lonely-next")"
expect "a repository with no workspace is told nothing" "" "$(forge_skills_context "$sandbox/lonely")"
printf 'Shared rules of the workspace.\n' > "$sandbox/workspace/CLAUDE.md"
expect "the workspace's instructions reach a worktree outside it" yes \
  "$(forge_skills_context "$sandbox/elsewhere/front-next" | grep -c 'Shared rules of the workspace.' | sed 's/^1$/yes/')"
rm "$sandbox/workspace/CLAUDE.md"
# The hook that tells it builds its text inside one command substitution, where the system bash of macOS (3.2) reads
# an apostrophe in a comment as an open quote.
expect "the session-start hook parses under the system bash" 0 \
  "$(/bin/bash -n "$(dirname "$0")/../hooks/session-start.sh" >/dev/null 2>&1; echo $?)"

# A space inside a submodule belongs to the repository that holds it: its key, and the skills it is told of.
git -C "$sandbox/lonely" -c protocol.file.allow=always submodule --quiet add "$front" inner 2>/dev/null
expect "project key of a submodule is its superproject's" "lonely" "$(forge_project_key "$sandbox/lonely/inner")"
expect "a session inside a submodule is told its superproject's skills, as such" "Superproject skills|lonely-local" \
  "$(headed "$sandbox/lonely/inner")|$(told "$sandbox/lonely/inner")"

# A submodule's work is listed a line each: a path that does not fit in one (a newline in it), in a submodule the
# superproject's status is told to ignore, must never read as a worktree with no work.
odd=$'odd\npath'
git -C "$sandbox/lonely" -c protocol.file.allow=always submodule --quiet add --name odd "$front" "$odd" 2>/dev/null
git -C "$sandbox/lonely" config -f .gitmodules submodule.odd.ignore all
echo work > "$sandbox/lonely/$odd/untracked.txt"
expect "a submodule whose path holds a newline is never taken for clean" refused \
  "$(listed="$(forge_submodule_work "$sandbox/lonely" 2>/dev/null)" && [ -z "$listed" ] && echo clean || echo refused)"
rm -f "$sandbox/lonely/$odd/untracked.txt"
expect "nor when it holds no work: what cannot be listed is not read" 1 \
  "$(forge_submodule_work "$sandbox/lonely" >/dev/null 2>&1; echo $?)"

# Nor a path made so that its line breaks into rows that each look whole: a tab, a newline, a name, a tab.
git init -q "$sandbox/rows"
git -C "$sandbox/rows" -c user.email=t@t -c user.name=t commit -q --allow-empty -m init
rows=$'x\t\nA\t'
git -C "$sandbox/rows" -c protocol.file.allow=always submodule --quiet add --name rows "$front" "$rows" 2>/dev/null
git -C "$sandbox/rows" config -f .gitmodules submodule.rows.ignore all
echo work > "$sandbox/rows/$rows/untracked.txt"
expect "the submodule is there, with work the superproject does not show" "yes|" \
  "$([ -f "$sandbox/rows/$rows/.git" ] && echo yes)|$(git -C "$sandbox/rows" status --porcelain --untracked-files=no | grep -v gitmodules | grep -c untracked | grep -v '^0$')"
expect "a submodule path of control characters is refused, however its line breaks" 1 \
  "$(forge_submodule_work "$sandbox/rows" >/dev/null 2>&1; echo $?)"

# A submodule the branch no longer has, its folder ignored from then on: git leaves the folder as it was, and neither
# the superproject's status nor its submodules show the files left uncommitted in it.
git init -q "$sandbox/dropped"
git -C "$sandbox/dropped" -c user.email=t@t -c user.name=t commit -q --allow-empty -m init
git -C "$sandbox/dropped" -c protocol.file.allow=always submodule --quiet add "$front" lib 2>/dev/null
git -C "$sandbox/dropped" -c user.email=t@t -c user.name=t commit -q -m "add lib"
expect "a submodule with no work is not named" "" "$(forge_submodule_work "$sandbox/dropped" 2>&1)"
echo work > "$sandbox/dropped/lib/untracked.txt"
git -C "$sandbox/dropped" rm -q --cached lib
git -C "$sandbox/dropped" config -f .gitmodules --remove-section submodule.lib
echo "lib/" > "$sandbox/dropped/.gitignore"
git -C "$sandbox/dropped" add .gitmodules .gitignore
git -C "$sandbox/dropped" -c user.email=t@t -c user.name=t commit -q -m "lib is generated now"
expect "the superproject shows nothing of it" "" "$(git -C "$sandbox/dropped" status --porcelain)"
expect "the files left in a submodule the branch dropped are still its work" "lib" "$(forge_submodule_work "$sandbox/dropped" 2>&1)"
rm -f "$sandbox/dropped/lib/untracked.txt"
expect "and with none left it holds no work" "" "$(forge_submodule_work "$sandbox/dropped" 2>&1)"

expect "find clone by name" "$sandbox/workspace/front" "$(forge_find_clone "$sandbox/workspace" front)"
expect "find clone by remote" "$sandbox/workspace/back" "$(forge_find_clone "$sandbox/workspace" MY.Repo)"
# Asked from inside a repository or one of its worktrees, a sibling repository of the same folder is found too: a
# review of its pull request starts in its clone, with its skills, not in the one the session stands in.
expect "find a sibling clone from inside a repository" "$sandbox/workspace/back" "$(forge_find_clone "$sandbox/workspace/front" MY.Repo)"
expect "and from a worktree outside the folder" "$sandbox/workspace/back" "$(forge_find_clone "$sandbox/elsewhere/front-feature" MY.Repo)"
expect "a sibling by its folder's name" "$sandbox/workspace/front" "$(forge_find_clone "$sandbox/workspace/back" front)"
git -C "$sandbox/workspace/front" remote add origin https://example.com/acme/shop-front.git
expect "its own repository, by its remote, where the session stands" "$sandbox/elsewhere/front-feature" "$(forge_find_clone "$sandbox/elsewhere/front-feature" shop-front)"
git -C "$sandbox/workspace/front" remote remove origin
# A name is matched at the end of a remote, never in its middle: on Azure DevOps a project's first repository is named
# after the project, which every other repository of it carries in its URL.
mkdir -p "$sandbox/azure"
for name in Shop Shop-web admin; do git init -q "$sandbox/azure/$name"; done
git -C "$sandbox/azure/Shop" remote add origin https://dev.azure.com/codehost/Shop/_git/Shop
git -C "$sandbox/azure/Shop-web" remote add origin https://dev.azure.com/codehost/Shop/_git/Shop-web
git -C "$sandbox/azure/admin" remote add origin https://dev.azure.com/codehost/Shop/_git/Backoffice
expect "the repository named after its project, from a sibling" "$sandbox/azure/Shop" "$(forge_find_clone "$sandbox/azure/Shop-web" Shop)"
mv "$sandbox/azure/Shop" "$sandbox/azure/core"
expect "and cloned under another name, by its remote alone" "$sandbox/azure/core" "$(forge_find_clone "$sandbox/azure" Shop)"
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

# The JSON state files: a JSON file a script is given, and a state file read back checked, unless it is a symlink or a
# week untouched.
mkdir -p "$sandbox/states" "$sandbox/outside"
printf '{"a": 1}' > "$sandbox/given.json"
expect "a JSON file given is printed whole" '{"a": 1}' "$(forge_json_given "$sandbox/given.json")"
expect "or read from stdin" '[2]' "$(forge_json_given - <<<'[2]')"
printf '1 2' > "$sandbox/two.json"
expect "one with two values is refused" "forgerdr: not one JSON value: $sandbox/two.json" \
  "$(forge_json_given "$sandbox/two.json" 2>&1)"
expect "and so is none" "forgerdr: no JSON file given" "$(forge_json_given 2>&1)"
now="$(jq -n 'now * 1000 | floor')"
# shellcheck disable=SC2016 # a jq filter
thing='.terminal == $terminal and .kind == $kind'
printf '{"terminal": "t7", "updated": %s, "kind": "thing"}' "$now" > "$sandbox/states/t7.json"
expect "a state file read back is printed, checked by its shape with the arguments given" t7 \
  "$(forge_json_entry "$sandbox/states/t7.json" thing "$thing" --arg kind thing | jq -r .terminal)"
printf '{"terminal": "t6", "updated": %s, "kind": "thing"}' "$now" > "$sandbox/outside/t6.json"
ln -s "$sandbox/outside/t6.json" "$sandbox/states/t6.json"
expect "one that is a symlink is none" '' "$(forge_json_entry "$sandbox/states/t6.json" thing "$thing" --arg kind thing)"
expect "one of another shape is none, skipped saying so" "forgerdr: skipped $sandbox/states/t7.json: not a thing" \
  "$(forge_json_entry "$sandbox/states/t7.json" thing "$thing" --arg kind other 2>&1)"
printf '{"terminal": "t5", "updated": 0, "kind": "thing"}' > "$sandbox/states/t5.json"
expect "one a week untouched is none, and goes" '|false' \
  "$(forge_json_entry "$sandbox/states/t5.json" thing "$thing" --arg kind thing)|$([ -e "$sandbox/states/t5.json" ] && echo true || echo false)"
expect "a file that is not there is none" '' "$(forge_json_entry "$sandbox/states/t4.json" thing "$thing" --arg kind thing)"

[ "$failures" -eq 0 ] || { printf '%s failure(s)\n' "$failures"; exit 1; }
printf 'all good\n'
