#!/usr/bin/env bash
# Opens a new tab of the herdr app, in the space this terminal shows in, with a titled claude session running one prompt.
# Usage: forge-session.sh [--cwd PATH] [--no-agent] [--no-focus] --title TITLE <prompt>
set -euo pipefail

# shellcheck source-path=SCRIPTDIR
# shellcheck source=forge-lib.sh
. "$(cd "$(dirname "$0")" && pwd)/forge-lib.sh"

cwd="$PWD"
title=""
start_agent=1
focus=true
prompt=""
while [ $# -gt 0 ]; do
  case "$1" in
    --cwd) cwd="$(cd "$2" && pwd -P)"; shift 2 ;;
    --title) title="$2"; shift 2 ;;
    --no-agent) start_agent=0; shift ;;
    --no-focus) focus=false; shift ;;
    -h|--help) sed -n '2,3p' "$0"; exit 0 ;;
    *) prompt="$1"; shift ;;
  esac
done

forge_in_herdr || forge_die "not inside the herdr app"
[ -n "$title" ] || forge_die "--title is required"
[ -n "$prompt" ] || forge_die "a prompt is required"

space="$(forge_terminal_label herdr.space)"
argv=()
[ "$start_agent" = 1 ] && argv=(--argv "$(forge_claude_argv "$title" "$prompt")")
made="$(forge_do tab.new ${space:+--space "$space"} --name "$title" --folder "$cwd" ${argv[@]+"${argv[@]}"} --focus "$focus")" \
  || forge_die "the herdr app could not open a tab for $title"
terminal="$(printf '%s' "$made" | jq -r '.terminal // empty')"
[ "$start_agent" = 0 ] || forge_claude_ready "$terminal" || forge_die "claude did not come up in terminal $terminal; look at its tab"
jq -cn --arg title "$title" --arg cwd "$cwd" --arg tab "$(printf '%s' "$made" | jq -r '.tab // empty')" --arg terminal "$terminal" \
  '{title:$title,cwd:$cwd,tab:$tab,terminal:$terminal}'
