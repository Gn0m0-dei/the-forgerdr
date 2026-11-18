#!/usr/bin/env bash
# Opens titled claude sessions, each running one prompt, in the space this terminal shows in: one in a new tab named
# after it; with --group, each in new tabs named after the group, as many panes to a tab as fit (forge_group_open),
# the first one shown.
# Usage: forge-session.sh [--cwd PATH] [--no-agent] [--no-focus] --title TITLE <prompt>
#        forge-session.sh [--cwd PATH] [--no-agent] --group NAME --title TITLE <prompt> [--title TITLE <prompt>...]
set -euo pipefail

# shellcheck source-path=SCRIPTDIR
# shellcheck source=forge-lib.sh
. "$(cd "$(dirname "$0")" && pwd)/forge-lib.sh"

cwd="$PWD"
group=""
titles=()
prompts=()
start_agent=1
focus=true
while [ $# -gt 0 ]; do
  case "$1" in
    --cwd) cwd="$(cd "$2" && pwd -P)"; shift 2 ;;
    --group) group="$2"; shift 2 ;;
    --title) titles+=("$2"); shift 2 ;;
    --no-agent) start_agent=0; shift ;;
    --no-focus) focus=false; shift ;;
    -h|--help) sed -n '2,6p' "$0"; exit 0 ;;
    *) prompts+=("$1"); shift ;;
  esac
done

forge_in_herdr || forge_die "not inside the herdr app"
[ ${#titles[@]} -gt 0 ] || forge_die "--title is required"
[ ${#prompts[@]} -eq ${#titles[@]} ] || forge_die "each --title takes one prompt"
[ -n "$group" ] || [ ${#titles[@]} -eq 1 ] || forge_die "several sessions take --group"
[ -z "$group" ] || [ "$focus" = true ] || forge_die "--no-focus does not go with --group, whose tabs are shown while they fill"

space="$(forge_terminal_label herdr.space)"
[ -z "$group" ] || forge_group_start "$group" "$space"
for i in "${!titles[@]}"; do
  title="${titles[$i]}"
  argv=""
  [ "$start_agent" = 1 ] && argv="$(forge_claude_argv "$title" "${prompts[$i]}")"
  if [ -n "$group" ]; then
    forge_group_open "$cwd" "$argv" || forge_die "the herdr app could not open a pane for $title"
    tab="$FORGE_GROUP_TAB"
    terminal="$FORGE_GROUP_MADE"
  else
    made="$(forge_do tab.new ${space:+--space "$space"} --name "$title" --folder "$cwd" ${argv:+--argv "$argv"} --focus "$focus")" \
      || forge_die "the herdr app could not open a tab for $title"
    tab="$(printf '%s' "$made" | jq -r '.tab // empty')"
    terminal="$(printf '%s' "$made" | jq -r '.terminal // empty')"
  fi
  [ "$start_agent" = 0 ] || forge_claude_ready "$terminal" || forge_die "claude did not come up in terminal $terminal; look at its pane"
  jq -cn --arg title "$title" --arg cwd "$cwd" --arg tab "$tab" --arg terminal "$terminal" \
    '{title:$title,cwd:$cwd,tab:$tab,terminal:$terminal}'
done
[ -z "$group" ] || forge_group_show
