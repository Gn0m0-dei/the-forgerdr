#!/usr/bin/env bash
# One git worktree per item and repository, opened as a herdr app space that does not take the focus: the main clone's
# env files copied in, a titled claude agent in its first tab, the dev server in a second tab on the first free PORT.
# Usage: forge-worktree.sh [--plan] [--repo PATH]... [--base BRANCH] [--dev COMMAND] [--no-dev] [--port-base N] [--auto] [--no-agent] [--no-submodules] [--branch NAME --title TEXT | --kind KIND --title TEXT] <item> [...]
# An item is a work item URL, or with --branch and --title before it anything /forgerdr:workitem takes. With --kind and
# --title before it, the branch is named from them and the item's id (a URL, #12, AB#12, EXT-12, 12, or "" for none)
# without asking the provider; KIND is feature, fix, chore, release (from the base) or hotfix (from the production
# branch), and a release's title is its version, dots kept. A worktree's submodules are filled, each cloned anew for
# it, unless --no-submodules. --plan prints what a run would make, one JSON line per worktree, and makes nothing.
set -euo pipefail

# shellcheck source-path=SCRIPTDIR
# shellcheck source=forge-lib.sh
. "$(cd "$(dirname "$0")" && pwd)/forge-lib.sh"

repos=()
items=()
item_branches=()
item_titles=()
item_kinds=()
next_branch=""
next_title=""
next_kind=""
base_override=""
dev_override=""
port=3000
start_agent=1
start_dev=1
init_submodules=1
flow_flag=""
plan=""

while [ $# -gt 0 ]; do
  case "$1" in
    --plan) plan=1; shift ;;
    --repo) repos+=("$2"); shift 2 ;;
    --base) base_override="$2"; shift 2 ;;
    --dev) dev_override="$2"; shift 2 ;;
    --port-base) port="$2"; shift 2 ;;
    --no-agent) start_agent=0; shift ;;
    --no-dev) start_dev=0; shift ;;
    --no-submodules) init_submodules=0; shift ;;
    --auto) flow_flag="--auto "; shift ;;
    --branch) next_branch="$2"; shift 2 ;;
    --title) next_title="$2"; shift 2 ;;
    --kind) next_kind="$2"; shift 2 ;;
    -h|--help) sed -n '2,9p' "$0"; exit 0 ;;
    *)
      [ -n "$next_branch$next_kind" ] || [ -z "$next_title" ] || forge_die "--title $next_title needs --branch or --kind"
      [ -z "$next_branch" ] || [ -n "$next_title" ] || forge_die "--branch $next_branch needs --title"
      [ -z "$next_kind" ] || [ -n "$next_title" ] || forge_die "--kind $next_kind needs --title"
      [ -z "$next_branch" ] || [ -z "$next_kind" ] || forge_die "--branch and --kind name the same branch; pass one"
      case "$next_kind" in ''|feature|fix|chore|hotfix|release) ;; *) forge_die "--kind is feature, fix, chore, hotfix or release, not $next_kind" ;; esac
      items+=("$1"); item_branches+=("$next_branch"); item_titles+=("$next_title"); item_kinds+=("$next_kind")
      next_branch=""; next_title=""; next_kind=""; shift ;;
  esac
done

[ -z "$next_branch$next_title$next_kind" ] || forge_die "--branch, --kind and --title must come before an item"
# A herdr app mod runs this with no terminal of its own: what it needs is an app that answers.
[ -n "$plan" ] || forge_app_answers || forge_die "the herdr app does not answer"
[ ${#items[@]} -gt 0 ] || forge_die "no item given"
if [ ${#repos[@]} -eq 0 ]; then
  while IFS= read -r repo; do repos+=("$repo"); done <<EOT
$(forge_detect_repos "$PWD")
EOT
fi
[ ${#repos[@]} -gt 0 ] || forge_die "no git repository under $PWD; pass --repo"
# A worktree's folder stands for its repository: worktrees go by the main checkout's name and copy its env files.
# A bare repository's worktree has no main checkout: its top stands for it.
for index in "${!repos[@]}"; do
  given="${repos[$index]}"
  repos[index]="$(forge_main_checkout "$given" 2>/dev/null || git -C "$given" rev-parse --show-toplevel 2>/dev/null)" \
    || forge_die "$given is not in a git repository"
done

[ -n "$plan" ] || for repo in "${repos[@]}"; do git -C "$repo" fetch origin --quiet; done

# Resolve every branch first, so a branch checked out elsewhere stops the run before anything is created.
plan_items=()
plan_repos=()
plan_branches=()
planned=""
item_ids=()
item_labels=()
for index in "${!items[@]}"; do
  id=""
  label="${item_titles[$index]}"
  if [ -n "${item_kinds[$index]}" ]; then
    id="$(forge_item_id "${items[$index]}")"
    kind="${item_kinds[$index]}"
    keep=""
    [ "$kind" != release ] || keep=.
    slug="$(forge_slug "${item_titles[$index]}" "$keep")"
    [ -n "$slug" ] || forge_die "the title ${item_titles[$index]} gives the branch no name"
    label="${id:+#$id }$slug"
    item_titles[index]="${id:+#$id }${item_titles[$index]}"
  elif [ -z "${item_branches[$index]}" ]; then
    meta="$(forge_item_meta "${items[$index]}")"
    id="$(printf '%s' "$meta" | cut -f1)"
    kind="$(printf '%s' "$meta" | cut -f2)"
    slug="$(forge_slug "$(printf '%s' "$meta" | cut -f3)")"
    item_titles[index]="#$id $(printf '%s' "$meta" | cut -f3)"
    label="#$id $slug"
  fi
  item_ids+=("$id")
  item_labels+=("$label")
  for repo in "${repos[@]}"; do
    branch="${item_branches[$index]}"
    if [ -z "$branch" ]; then
      backlog=own
      ! forge_item_external "${items[$index]}" "$repo" || backlog=external
      [ -z "$id" ] || branch="$(forge_branch_for_id "$repo" "$id" "$backlog")"
      if [ -z "$branch" ] && [ -n "$id" ]; then
        branch="$(forge_branch_name "$kind" "$id" "$slug" "$(forge_project_key "$repo")" "$backlog")"
      fi
      [ -n "$branch" ] || branch="$kind/$slug"
    fi
    git check-ref-format --branch "$branch" >/dev/null 2>&1 || forge_die "$branch is not a branch name git takes; change its title"
    busy="$(forge_checked_out_at "$repo" "$branch")"
    [ -z "$busy" ] || forge_die "$branch is checked out at $busy; free it there or work the item in that clone"
    [ ! -e "$(forge_worktree_path "$repo" "$branch")" ] \
      || forge_die "$(forge_worktree_path "$repo" "$branch") already exists; remove it or work the item there"
    ! grep -qxF "$repo	$branch" <<<"$planned" || forge_die "two items resolve to $branch in $repo"
    planned="$planned$repo	$branch"$'\n'
    plan_items+=("$index"); plan_repos+=("$repo"); plan_branches+=("$branch")
  done
done

# The ref a worktree for a branch starts from: the local branch when there is one, else the one forge_start_ref says.
start_of() {
  if git -C "$1" show-ref --verify --quiet "refs/heads/$2"; then printf '%s\n' "$2"; else forge_start_ref "$@"; fi
}

if [ -n "$plan" ]; then
  for step in "${!plan_items[@]}"; do
    index="${plan_items[$step]}"
    repo="${plan_repos[$step]}"
    branch="${plan_branches[$step]}"
    base="${base_override:-$(forge_base_for_kind "$repo" "${item_kinds[$index]}")}"
    dev_command=""
    [ "$start_dev" = 0 ] || dev_command="${dev_override:-$(forge_dev_command "$repo")}"
    dev_port=""
    if [ -n "$dev_command" ]; then dev_port="$(forge_free_port "$port")"; port=$((dev_port + 1)); fi
    jq -cn --arg item "${item_ids[$index]:-${items[$index]}}" --arg title "${item_titles[$index]}" --arg repo "$repo" \
      --arg branch "$branch" --arg path "$(forge_worktree_path "$repo" "$branch")" --arg base "$base" \
      --arg from "$(start_of "$repo" "$branch" "$base")" --arg dev "$dev_command" --arg port "$dev_port" \
      --argjson worktrees "$(( $(git -C "$repo" worktree list --porcelain | grep -c '^worktree ') + step ))" \
      '{item:$item,title:$title,repo:$repo,branch:$branch,path:$path,base:$base,from:$from,dev:$dev,port:$port,worktrees:$worktrees}'
  done
  exit 0
fi

for step in "${!plan_items[@]}"; do
  index="${plan_items[$step]}"
  item="${items[$index]}"
  id="${item_ids[$index]}"
  title="${item_titles[$index]}"
  repo="${plan_repos[$step]}"
  branch="${plan_branches[$step]}"
  base="${base_override:-$(forge_base_for_kind "$repo" "${item_kinds[$index]}")}"
  path="$(forge_worktree_path "$repo" "$branch")"
  forge_add_worktree "$repo" "$branch" "$(forge_start_ref "$repo" "$branch" "$base")" "$path"
  submodules=false
  if [ "$init_submodules" = 1 ] && [ -f "$path/.gitmodules" ]; then
    if forge_init_submodules "$path"; then submodules=true
    else printf 'forgerdr: the submodules of %s did not come; run git submodule update --init --recursive there\n' "$path" >&2; fi
  fi
  env_count="$(forge_copy_env "$repo" "$path")"
  change_copied=false
  [ "$(forge_spec_mode "$(forge_project_key "$repo")")" != openspec ] || change_copied="$(forge_copy_change "$repo" "$path" "$item")"
  argv=""
  tab=""
  [ "$start_agent" = 0 ] || { argv="$(forge_claude_argv "$title" "/forgerdr:workitem ${flow_flag}$item")"; tab="$title"; }
  made="$(forge_open_space "${item_labels[$index]}" "$path" "$tab" "$argv")" \
    || forge_die "the herdr app could not open a space for $path; the worktree stays there"
  space="$(printf '%s' "$made" | jq -r '.space // empty')"
  terminal="$(printf '%s' "$made" | jq -r '.terminal // empty')"
  dev_command=""
  [ "$start_dev" = 0 ] || dev_command="${dev_override:-$(forge_dev_command "$path")}"
  dev_port=""
  if [ -n "$dev_command" ]; then
    dev_port="$(forge_free_port "$port")"
    forge_do tab.new --space "$space" --name "dev :$dev_port" --folder "$path" \
      --argv "$(jq -cn --arg port "PORT=$dev_port" --arg command "$dev_command" '["env", $port, "sh", "-c", $command]')" --focus false >/dev/null \
      || printf 'forgerdr: the dev server of %s did not start; run %s there\n' "$path" "$dev_command" >&2
    port=$((dev_port + 1))
  fi
  started=false
  if [ "$start_agent" = 1 ]; then
    if forge_claude_ready "$terminal"; then started=true; else printf 'forgerdr: claude did not come up in %s; look at its space\n' "$path" >&2; fi
  fi
  jq -cn --arg item "${id:-$item}" --arg repo "$repo" --arg branch "$branch" --arg path "$path" --arg space "$space" \
    --arg port "$dev_port" --arg dev "$dev_command" --argjson env "$env_count" --argjson change_copied "$change_copied" \
    --arg terminal "$terminal" --arg title "$title" --argjson started "$started" --argjson submodules "$submodules" \
    '{item:$item,title:$title,repo:$repo,branch:$branch,path:$path,space:$space,port:$port,dev:$dev,env_files:$env,change_copied:$change_copied,submodules:$submodules,terminal:$terminal,agent_started:$started}'
done
