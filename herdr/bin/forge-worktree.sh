#!/usr/bin/env bash
# One herdr worktree, env files, dev server and claude agent per backlog item and repository.
# Usage: forge-worktree.sh [--repo PATH]... [--base BRANCH] [--dev COMMAND] [--port-base N] [--auto] [--no-agent] <item-url>...
set -euo pipefail

# shellcheck source-path=SCRIPTDIR
# shellcheck source=forge-lib.sh
. "$(cd "$(dirname "$0")" && pwd)/forge-lib.sh"

repos=()
items=()
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
    -h|--help) sed -n '2,3p' "$0"; exit 0 ;;
    *) items+=("$1"); shift ;;
  esac
done

[ "${HERDR_ENV:-}" = 1 ] || forge_die "not inside a herdr pane"
[ ${#items[@]} -gt 0 ] || forge_die "no item URL given"
if [ ${#repos[@]} -eq 0 ]; then
  while IFS= read -r repo; do repos+=("$repo"); done <<EOT
$(forge_detect_repos "$PWD")
EOT
fi
[ ${#repos[@]} -gt 0 ] || forge_die "no git repository under $PWD; pass --repo"

created=0
for url in "${items[@]}"; do
  meta="$(forge_item_meta "$url")"
  id="$(printf '%s' "$meta" | cut -f1)"
  kind="$(printf '%s' "$meta" | cut -f2)"
  slug="$(forge_slug "$(printf '%s' "$meta" | cut -f3)")"
  branch="$kind/#$id-$slug"
  for repo in "${repos[@]}"; do
    base="${base_override:-$(forge_base_branch "$repo")}"
    git -C "$repo" fetch origin --quiet
    forge_herdr worktree create --cwd "$repo" --branch "$branch" --base "origin/$base" --label "#$id $slug" --no-focus >/dev/null
    worktree="$(forge_worktreetree_of "$repo" "$branch")"
    path="$(printf '%s' "$worktree" | cut -f1)"
    workspace="$(printf '%s' "$worktree" | cut -f2)"
    [ -n "$path" ] || forge_die "worktree for $branch not found in $repo"
    git -C "$path" branch --unset-upstream >/dev/null 2>&1 || true
    env_count="$(forge_copy_env "$repo" "$path")"
    root_pane="$(forge_root_pane "$workspace")"
    title="#$id $(printf '%s' "$meta" | cut -f3)"
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
      agent="item-$id-$(forge_slug "$(basename "$repo")" | cut -c1-12)"
      forge_start_claude "$agent" "$agent_pane" "/forgerdr:workitem ${flow_flag}$url"
    fi
    jq -cn --arg item "$id" --arg repo "$repo" --arg branch "$branch" --arg path "$path" --arg workspace "$workspace" \
      --arg port "$dev_port" --arg dev "$dev_command" --argjson env "$env_count" --arg agent "$agent" --arg title "$title" \
      '{item:$item,title:$title,repo:$repo,branch:$branch,path:$path,workspace:$workspace,port:$port,dev:$dev,env_files:$env,agent:$agent}'
    created=$((created + 1))
  done
done

forge_herdr notification show "forgerdr" --body "$created worktree(s) ready" --sound "done" >/dev/null 2>&1 || true
