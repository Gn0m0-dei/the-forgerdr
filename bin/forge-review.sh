#!/usr/bin/env bash
# One tab per pull request in the herdr app space this terminal shows in, named for it: "#42 review" for another's,
# "#40 mine" for the user's own. It shows the forgerdr mod's review view (role review, told the agent's terminal) alone:
# the claude agent that reviews it (/forgerdr:review-other or /forgerdr:review-own, told by FORGE_REVIEW_VIEW that the
# view is there) is parked out of sight once the view has split off its pane, labelled with the tab (forge.tab). The view
# peeks at it to talk; the sidebar ends it once the tab is gone, and quitting the app keeps it. The first tab is shown at
# the end.
# Usage: forge-review.sh [--cwd PATH] [--mod NAME] [--no-agent] <pr-url>...
#   --mod      the copy of the forgerdr mod the views run in (forgerdr, or forgerdr-dev from its layout).
#   --no-agent a shell, parked as the agent would be, instead of the agent.
set -euo pipefail

# shellcheck source-path=SCRIPTDIR
# shellcheck source=forge-lib.sh
. "$(cd "$(dirname "$0")" && pwd)/forge-lib.sh"

base="$PWD"
mod=forgerdr
start_agent=1
urls=()
while [ $# -gt 0 ]; do
  case "$1" in
    --cwd) base="$(cd "$2" && pwd -P)"; shift 2 ;;
    --mod) mod="$2"; shift 2 ;;
    --no-agent) start_agent=0; shift ;;
    -h|--help) sed -n '2,8p' "$0"; exit 0 ;;
    *) urls+=("$1"); shift ;;
  esac
done

forge_in_herdr || forge_die "not inside the herdr app"
[ ${#urls[@]} -gt 0 ] || forge_die "no pull request URL given"
[[ "$mod" =~ ^[A-Za-z0-9_-]+$ ]] || forge_die "not a mod name: $mod"

space="$(forge_terminal_label herdr.space)"
first=""
for url in "${urls[@]}"; do
  clone="$(forge_find_clone "$base" "$(forge_url_repo "$url")")"
  title="$(forge_pr_title "$url")"
  id="$(forge_url_id "$url")"
  skill="review-other"
  name="#$id review"
  if forge_pr_is_mine "$url"; then skill="review-own" name="#$id mine"; fi
  argv=""
  [ "$start_agent" = 1 ] && argv="$(forge_claude_argv "$title" "/forgerdr:$skill $url" FORGE_REVIEW_VIEW=1)"
  made="$(forge_do tab.new ${space:+--space "$space"} --name "$name" --folder "$clone" ${argv:+--argv "$argv"} --focus true)" \
    || forge_die "the herdr app could not open a tab for $url"
  tab="$(printf '%s' "$made" | jq -r '.tab // empty')"
  terminal="$(printf '%s' "$made" | jq -r '.terminal // empty')"
  [ -n "$tab" ] && [ -n "$terminal" ] || forge_die "the herdr app opened no terminal for $url"
  agent_pane="$(forge_pane_of "$terminal")"
  [ -n "$agent_pane" ] || forge_die "the herdr app lists no pane for $url"
  view="$(forge_do pane.split --pane "$agent_pane" --direction right --mod "$mod" \
    --props "$(jq -cn --arg terminal "$terminal" '{role: "review", terminal: $terminal}')")" \
    || forge_die "the herdr app could not open the review view of $url"
  [ -n "$(printf '%s' "$view" | jq -r '.pane // empty')" ] || forge_die "the herdr app opened no review view for $url"
  forge_do terminal.park --terminal "$terminal" >/dev/null || printf 'forgerdr: the agent of %s stays in sight\n' "$url" >&2
  # The inbox takes the human to the view's tab from the session's questions (inbox.js reviewTabOf).
  forge_hc label "$terminal" "forge.tab=$tab" >/dev/null || printf 'forgerdr: the inbox cannot reach the review of %s\n' "$url" >&2
  [ -n "$first" ] || first="$tab"
  started=false
  if [ "$start_agent" = 1 ]; then
    if forge_claude_ready "$terminal"; then started=true; else printf 'forgerdr: claude did not come up for %s; Discuss in its view shows it\n' "$url" >&2; fi
  fi
  jq -cn --arg id "$id" --arg title "$title" --arg skill "$skill" --arg repo "$clone" \
    --arg tab "$tab" --arg terminal "$terminal" --argjson started "$started" \
    '{pr:$id,title:$title,skill:$skill,repo:$repo,tab:$tab,terminal:$terminal,agent_started:$started}'
done
forge_do tab.select --id "$first" >/dev/null || true
