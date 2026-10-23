#!/usr/bin/env bash
# One herdr worktree, env files, dev server and claude agent per item and repository.
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
    -h|--help) sed -n '2,4p' "$0"; exit 0 ;;
    *)
      [ -n "$next_branch" ] || [ -z "$next_title" ] || forge_die "--title $next_title needs --branch"
      [ -z "$next_branch" ] || [ -n "$next_title" ] || forge_die "--branch $next_branch needs --title"
      items+=("$1"); item_branches+=("$next_branch"); item_titles+=("$next_title")
      next_branch=""; next_title=""; shift ;;
  esac
done

[ -z "$next_branch$next_title" ] || forge_die "--branch and --title must come before an item"
[ "${HERDR_ENV:-}" = 1 ] || forge_die "not inside a herdr pane"
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
      branch="$(forge_branch_for_id "$repo" "$id")"
      [ -n "$branch" ] || branch="$(forge_branch_name "$kind" "$id" "$slug" "$(forge_project_key "$repo")")"
    fi
    busy="$(forge_checked_out_at "$repo" "$branch")"
    [ -z "$busy" ] || forge_die "$branch is checked out at $busy; free it there or work the item in that clone"
    plan_items+=("$index"); plan_repos+=("$repo"); plan_branches+=("$branch")
  done
done

created=0
for step in "${!plan_items[@]}"; do
  index="${plan_items[$step]}"
  item="${items[$index]}"
  id="${item_ids[$index]}"
  title="${item_titles[$index]}"
  repo="${plan_repos[$step]}"
  branch="${plan_branches[$step]}"
  base="${base_override:-$(forge_base_branch "$repo")}"
  forge_herdr worktree create --cwd "$repo" --branch "$branch" --base "$(forge_start_ref "$repo" "$branch" "$base")" --label "${item_labels[$index]}" --no-focus >/dev/null
  worktree="$(forge_worktree_of "$repo" "$branch")"
  path="$(printf '%s' "$worktree" | cut -f1)"
  workspace="$(printf '%s' "$worktree" | cut -f2)"
  [ -n "$path" ] || forge_die "worktree for $branch not found in $repo"
  git -C "$path" branch --unset-upstream >/dev/null 2>&1 || true
  env_count="$(forge_copy_env "$repo" "$path")"
  change_copied=false
  [ "$(forge_spec_mode "$(forge_project_key "$repo")")" != openspec ] || change_copied="$(forge_copy_change "$repo" "$path" "$item")"
  root_pane="$(forge_root_pane "$workspace")"
  dev_command="${dev_override:-$(forge_dev_command "$path")}"
  dev_pane=""
  dev_port=""
  if [ -n "$dev_command" ]; then
    dev_port="$port"
    dev_pane="$(forge_herdr pane split "$root_pane" --direction down --ratio 0.7 --cwd "$path" --env "PORT=$dev_port" --no-focus | jq -r '.result.pane.pane_id')"
    forge_herdr pane rename "$dev_pane" "dev :$dev_port" >/dev/null
    forge_herdr pane run "$dev_pane" "$dev_command" >/dev/null
    port=$((port + 1))
  fi
  agent=""
  agent_pane=""
  if [ "$start_agent" = 1 ]; then
    # The agent gets its own pane so the session title can travel in its environment; the root pane stays a shell.
    agent_pane="$(forge_herdr pane split "$root_pane" --direction right --ratio 0.35 --cwd "$path" --env "FORGE_SESSION_TITLE=$title" --focus | jq -r '.result.pane.pane_id')"
    forge_herdr pane rename "$agent_pane" "$title" >/dev/null
    # An id names the agent; without one the branch does, plus the item's position, since names may share a prefix.
    agent="item-${id:-$(forge_slug "$branch")-$index}-$(forge_slug "$(basename "$repo")" | cut -c1-12)"
    forge_start_claude "$agent" "$agent_pane" "/forgerdr:workitem ${flow_flag}$item"
  fi
  jq -cn --arg item "${id:-$item}" --arg repo "$repo" --arg branch "$branch" --arg path "$path" --arg workspace "$workspace" \
    --arg port "$dev_port" --arg dev "$dev_command" --argjson env "$env_count" --argjson change_copied "$change_copied" \
    --arg agent "$agent" --arg title "$title" \
    '{item:$item,title:$title,repo:$repo,branch:$branch,path:$path,workspace:$workspace,port:$port,dev:$dev,env_files:$env,change_copied:$change_copied,agent:$agent}'
  created=$((created + 1))
done

forge_herdr notification show "forgerdr" --body "$created worktree(s) ready" --sound "done" >/dev/null 2>&1 || true
