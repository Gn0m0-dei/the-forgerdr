#!/usr/bin/env bash
# One herdr pane and one claude agent per pull request, in a new tab of the current workspace.
# A pull request authored by the signed-in user gets /forgerdr:review-own; any other gets /forgerdr:review-other.
# Usage: forge-review.sh [--cwd PATH] [--no-agent] <pr-url>...
set -euo pipefail

# shellcheck source-path=SCRIPTDIR
# shellcheck source=forge-lib.sh
. "$(cd "$(dirname "$0")" && pwd)/forge-lib.sh"

base="$PWD"
start_agent=1
urls=()
while [ $# -gt 0 ]; do
  case "$1" in
    --cwd) base="$(cd "$2" && pwd -P)"; shift 2 ;;
    --no-agent) start_agent=0; shift ;;
    -h|--help) sed -n '2,3p' "$0"; exit 0 ;;
    *) urls+=("$1"); shift ;;
  esac
done

[ "${HERDR_ENV:-}" = 1 ] || forge_die "not inside a herdr pane"
[ ${#urls[@]} -gt 0 ] || forge_die "no pull request URL given"

clones=()
titles=()
for url in "${urls[@]}"; do
  clones+=("$(forge_find_clone "$base" "$(forge_url_repo "$url")")")
  titles+=("$(forge_pr_title "$url")")
done

count=${#urls[@]}
columns=1
while [ $((columns * columns)) -lt "$count" ]; do columns=$((columns + 1)); done
rows=$(((count + columns - 1) / columns))

tab="$(forge_herdr tab create ${HERDR_WORKSPACE_ID:+--workspace "$HERDR_WORKSPACE_ID"} --cwd "${clones[0]}" --env "FORGE_SESSION_TITLE=${titles[0]}" --label "review" --focus)"
root="$(printf '%s' "$tab" | jq -r '.result.root_pane.pane_id')"

# Grid in row-major order: pane i sits at column i % columns, row i / columns.
# Column heads are split to the right of the previous head; rows are split down inside each column.
# Every split takes an equal share of what is left, so panes end up the same size.
panes=("$root")
column=1
while [ "$column" -lt "$columns" ]; do
  ratio="$(awk -v c="$column" -v n="$columns" 'BEGIN { printf "%.4f", 1 - 1 / (n - c + 1) }')"
  panes+=("$(forge_herdr pane split "${panes[$((column - 1))]}" --direction right --ratio "$ratio" --cwd "${clones[$column]}" --env "FORGE_SESSION_TITLE=${titles[$column]}" --no-focus | jq -r '.result.pane.pane_id')")
  column=$((column + 1))
done
row=1
while [ "$row" -lt "$rows" ]; do
  column=0
  while [ "$column" -lt "$columns" ] && [ $((row * columns + column)) -lt "$count" ]; do
    index=$((row * columns + column))
    rows_in_column=$(((count - column + columns - 1) / columns))
    ratio="$(awk -v r="$row" -v n="$rows_in_column" 'BEGIN { printf "%.4f", 1 - 1 / (n - r + 1) }')"
    panes+=("$(forge_herdr pane split "${panes[$((index - columns))]}" --direction down --ratio "$ratio" --cwd "${clones[$index]}" --env "FORGE_SESSION_TITLE=${titles[$index]}" --no-focus | jq -r '.result.pane.pane_id')")
    column=$((column + 1))
  done
  row=$((row + 1))
done

index=0
for url in "${urls[@]}"; do
  pane="${panes[$index]}"
  id="$(forge_url_id "$url")"
  agent="review-$id"
  forge_herdr pane rename "$pane" "${titles[$index]}" >/dev/null
  skill="review-other"
  forge_pr_is_mine "$url" && skill="review-own"
  [ "$start_agent" = 1 ] && forge_start_claude "$agent" "$pane" "/forgerdr:$skill $url"
  jq -cn --arg id "$id" --arg title "${titles[$index]}" --arg skill "$skill" --arg repo "${clones[$index]}" --arg pane "$pane" --arg agent "$agent" '{pr:$id,title:$title,skill:$skill,repo:$repo,pane:$pane,agent:$agent}'
  index=$((index + 1))
done

forge_herdr notification show "forgerdr" --body "$count review(s) started" --sound "done" >/dev/null 2>&1 || true
