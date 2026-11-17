#!/usr/bin/env bash
# One herdr app tab and one claude agent per pull request, in the space this terminal shows in; the first tab is shown.
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
    -h|--help) sed -n '2,4p' "$0"; exit 0 ;;
    *) urls+=("$1"); shift ;;
  esac
done

forge_in_herdr || forge_die "not inside the herdr app"
[ ${#urls[@]} -gt 0 ] || forge_die "no pull request URL given"

space="$(forge_terminal_label herdr.space)"
focus=true
for url in "${urls[@]}"; do
  clone="$(forge_find_clone "$base" "$(forge_url_repo "$url")")"
  title="$(forge_pr_title "$url")"
  skill="review-other"
  forge_pr_is_mine "$url" && skill="review-own"
  argv=()
  [ "$start_agent" = 1 ] && argv=(--argv "$(forge_claude_argv "$title" "/forgerdr:$skill $url")")
  made="$(forge_do tab.new ${space:+--space "$space"} --name "$title" --folder "$clone" ${argv[@]+"${argv[@]}"} --focus "$focus")" \
    || forge_die "the herdr app could not open a tab for $url"
  focus=false
  terminal="$(printf '%s' "$made" | jq -r '.terminal // empty')"
  started=false
  if [ "$start_agent" = 1 ]; then
    if forge_claude_ready "$terminal"; then started=true; else printf 'forgerdr: claude did not come up for %s; look at its tab\n' "$url" >&2; fi
  fi
  jq -cn --arg id "$(forge_url_id "$url")" --arg title "$title" --arg skill "$skill" --arg repo "$clone" \
    --arg tab "$(printf '%s' "$made" | jq -r '.tab // empty')" --arg terminal "$terminal" --argjson started "$started" \
    '{pr:$id,title:$title,skill:$skill,repo:$repo,tab:$tab,terminal:$terminal,agent_started:$started}'
done
