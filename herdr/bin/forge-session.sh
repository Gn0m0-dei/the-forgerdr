#!/usr/bin/env bash
# Opens a new herdr tab with a titled claude session running one prompt.
# Usage: forge-session.sh [--cwd PATH] [--no-agent] --title TITLE <prompt>
set -euo pipefail

# shellcheck source-path=SCRIPTDIR
# shellcheck source=forge-lib.sh
. "$(cd "$(dirname "$0")" && pwd)/forge-lib.sh"

cwd="$PWD"
title=""
start_agent=1
prompt=""
while [ $# -gt 0 ]; do
  case "$1" in
    --cwd) cwd="$(cd "$2" && pwd -P)"; shift 2 ;;
    --title) title="$2"; shift 2 ;;
    --no-agent) start_agent=0; shift ;;
    -h|--help) sed -n '2,3p' "$0"; exit 0 ;;
    *) prompt="$1"; shift ;;
  esac
done

[ "${HERDR_ENV:-}" = 1 ] || forge_die "not inside a herdr pane"
[ -n "$title" ] || forge_die "--title is required"
[ -n "$prompt" ] || forge_die "a prompt is required"

tab="$(forge_herdr tab create ${HERDR_WORKSPACE_ID:+--workspace "$HERDR_WORKSPACE_ID"} --cwd "$cwd" --env "FORGE_SESSION_TITLE=$title" --label "$title" --focus)"
pane="$(printf '%s' "$tab" | jq -r '.result.root_pane.pane_id')"
agent=""
if [ "$start_agent" = 1 ]; then
  agent="session-$(forge_slug "$title" | cut -c1-24)"
  forge_start_claude "$agent" "$pane" "$prompt"
fi
jq -cn --arg title "$title" --arg cwd "$cwd" --arg pane "$pane" --arg agent "$agent" '{title:$title,cwd:$cwd,pane:$pane,agent:$agent}'
