#!/usr/bin/env bash
# One git worktree per item and repository, opened as a herdr app space that does not take the focus: the main clone's
# env files copied in, a titled claude agent in its first tab, the dev server in a second tab with its own PORT.
# Usage: forge-worktree.sh [--repo PATH]... [--base BRANCH] [--dev COMMAND] [--port-base N] [--auto] [--no-agent] [--branch NAME --title TEXT] <item> [[--branch NAME --title TEXT] <item>]...
# An item is a work item URL, or with --branch and --title before it anything /forgerdr:workitem takes.
set -euo pipefail

# shellcheck source-path=SCRIPTDIR
# shellcheck source=forge-lib.sh
. "$(cd "$(dirname "$0")" && pwd)/forge-lib.sh"

repos=()
items=()
item_branches=()
item_titles=()
next_branch=""
next_title=""
base_override=""
dev_override=""
port=3000
start_agent=1
flow_flag=""

while [ $# -gt 0 ]; do
  case "$1" in
    --repo) repos+=("$(cd "$2" && pwd -P)"); shift 2 ;;
    --base) base_override="$2"; shift 2 ;;
    --dev) dev_override="$2"; shift 2 ;;
    --port-base) port="$2"; shift 2 ;;
    --no-agent) start_agent=0; shift ;;
    --auto) flow_flag="--auto "; shift ;;
    --branch) next_branch="$2"; shift 2 ;;
    --title) next_title="$2"; shift 2 ;;
    -h|--help) sed -n '2,5p' "$0"; exit 0 ;;
    *)
      [ -n "$next_branch" ] || [ -z "$next_title" ] || forge_die "--title $next_title needs --branch"
      [ -z "$next_branch" ] || [ -n "$next_title" ] || forge_die "--branch $next_branch needs --title"
      items+=("$1"); item_branches+=("$next_branch"); item_titles+=("$next_title")
      next_branch=""; next_title=""; shift ;;
  esac
done

[ -z "$next_branch$next_title" ] || forge_die "--branch and --title must come before an item"
forge_in_herdr || forge_die "not inside the herdr app"
[ ${#items[@]} -gt 0 ] || forge_die "no item given"
if [ ${#repos[@]} -eq 0 ]; then
  while IFS= read -r repo; do repos+=("$repo"); done <<EOT
$(forge_detect_repos "$PWD")
EOT
fi
[ ${#repos[@]} -gt 0 ] || forge_die "no git repository under $PWD; pass --repo"

for repo in "${repos[@]}"; do git -C "$repo" fetch origin --quiet; done

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
  if [ -z "${item_branches[$index]}" ]; then
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
      branch="$(forge_branch_for_id "$repo" "$id")"
      [ -n "$branch" ] || branch="$(forge_branch_name "$kind" "$id" "$slug" "$(forge_project_key "$repo")" "$backlog")"
    fi
    busy="$(forge_checked_out_at "$repo" "$branch")"
    [ -z "$busy" ] || forge_die "$branch is checked out at $busy; free it there or work the item in that clone"
    [ ! -e "$(forge_worktree_path "$repo" "$branch")" ] \
      || forge_die "$(forge_worktree_path "$repo" "$branch") already exists; remove it or work the item there"
    ! grep -qxF "$repo	$branch" <<<"$planned" || forge_die "two items resolve to $branch in $repo"
    planned="$planned$repo	$branch"$'\n'
    plan_items+=("$index"); plan_repos+=("$repo"); plan_branches+=("$branch")
  done
done

for step in "${!plan_items[@]}"; do
  index="${plan_items[$step]}"
  item="${items[$index]}"
  id="${item_ids[$index]}"
  title="${item_titles[$index]}"
  repo="${plan_repos[$step]}"
  branch="${plan_branches[$step]}"
  base="${base_override:-$(forge_base_branch "$repo")}"
  path="$(forge_worktree_path "$repo" "$branch")"
  forge_add_worktree "$repo" "$branch" "$(forge_start_ref "$repo" "$branch" "$base")" "$path"
  env_count="$(forge_copy_env "$repo" "$path")"
  change_copied=false
  [ "$(forge_spec_mode "$(forge_project_key "$repo")")" != openspec ] || change_copied="$(forge_copy_change "$repo" "$path" "$item")"
  argv=""
  [ "$start_agent" = 0 ] || argv="$(forge_claude_argv "$title" "/forgerdr:workitem ${flow_flag}$item")"
  made="$(forge_open_space "${item_labels[$index]}" "$path" "$title" "$argv")" \
    || forge_die "the herdr app could not open a space for $path; the worktree stays there"
  space="$(printf '%s' "$made" | jq -r '.space // empty')"
  terminal="$(printf '%s' "$made" | jq -r '.terminal // empty')"
  dev_command="${dev_override:-$(forge_dev_command "$path")}"
  dev_port=""
  if [ -n "$dev_command" ]; then
    dev_port="$port"
    forge_do tab.new --space "$space" --name "dev :$dev_port" --folder "$path" \
      --argv "$(jq -cn --arg port "PORT=$dev_port" --arg command "$dev_command" '["env", $port, "sh", "-c", $command]')" --focus false >/dev/null \
      || printf 'forgerdr: the dev server of %s did not start; run %s there\n' "$path" "$dev_command" >&2
    port=$((port + 1))
  fi
  started=false
  if [ "$start_agent" = 1 ]; then
    if forge_claude_ready "$terminal"; then started=true; else printf 'forgerdr: claude did not come up in %s; look at its space\n' "$path" >&2; fi
  fi
  jq -cn --arg item "${id:-$item}" --arg repo "$repo" --arg branch "$branch" --arg path "$path" --arg space "$space" \
    --arg port "$dev_port" --arg dev "$dev_command" --argjson env "$env_count" --argjson change_copied "$change_copied" \
    --arg terminal "$terminal" --arg title "$title" --argjson started "$started" \
    '{item:$item,title:$title,repo:$repo,branch:$branch,path:$path,space:$space,port:$port,dev:$dev,env_files:$env,change_copied:$change_copied,terminal:$terminal,agent_started:$started}'
done
