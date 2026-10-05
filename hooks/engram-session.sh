#!/usr/bin/env bash
# Stop: closes the engram session. SubagentStop: captures the subagent's output as a passive observation.
# Usage: engram-session.sh stop|subagent  (hook JSON on stdin)
# shellcheck source-path=SCRIPTDIR/..
set -euo pipefail

plugin_root="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
# shellcheck source=herdr/bin/forge-lib.sh
. "$plugin_root/herdr/bin/forge-lib.sh"
# shellcheck source=hooks/engram-lib.sh
. "$plugin_root/hooks/engram-lib.sh"

input="$(cat)"
session_id="$(printf '%s' "$input" | jq -r '.session_id // empty')"
[ -n "$session_id" ] || exit 0
engram_ensure_serve || exit 0

case "${1:-}" in
  stop) engram_end_session "$session_id" ;;
  subagent)
    output="$(printf '%s' "$input" | jq -r '.stdout // empty')"
    [ -n "$output" ] || exit 0
    cwd="$(printf '%s' "$input" | jq -r '.cwd // empty')"
    engram_capture "$session_id" "$(forge_project_key "${cwd:-$PWD}")" "$output" subagent-stop ;;
esac
exit 0
