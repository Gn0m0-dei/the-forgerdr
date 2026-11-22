#!/usr/bin/env bash
# Marks a Claude session's golem in the herdr terminal it runs in (HC_TERMINAL_ID), with labels the forgerdr look reads
# (the sidebar's CRACKED chip, the golem lanes): when its current task started and stopped, whether its turn ended in an
# API error, and, for an agent forgerdr dispatched, the session it belongs to. A session outside herdr has nothing to mark.
#   crack  StopFailure: forge.state=cracked, forge.error=<the error's kind: rate_limit, server_error, ...>, and stopped.
#   rest   Stop: forge.stopped=<now, ms>.
#   mend   UserPromptSubmit: a task starts (forge.started=<now, ms>); the cracked mark and the stop go.
#   born   SessionStart: mends it, forgets the review or security view a session before it had (forge.review and
#          forge.view, bin/forge-pr.sh and bin/forge-security.sh) unless the session is the same one resumed or
#          compacted, and ties an agent's golem to the session that dispatched it (forge.parent, from
#          FORGE_PARENT_TERMINAL, which hooks/agent-dispatch.sh sets), so the lanes and the sidebar list it under it,
#          saying what agent it is (forge.agent, from FORGE_AGENT_TYPE), so the forge floor lights its review cell.
# shellcheck source-path=SCRIPTDIR/..
set -euo pipefail

plugin_root="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
# shellcheck source=bin/forge-lib.sh
. "$plugin_root/bin/forge-lib.sh"

terminal="${HC_TERMINAL_ID:-}"
[ -n "$terminal" ] || exit 0

now_ms=$(($(date +%s) * 1000))
case "${1:-}" in
  crack)
    error="$(jq -r '.error // "unknown"' 2>/dev/null || printf 'unknown')"
    forge_hc label "$terminal" forge.state=cracked "forge.error=$error" "forge.stopped=$now_ms" >/dev/null 2>&1 || true ;;
  rest)
    forge_hc label "$terminal" "forge.stopped=$now_ms" >/dev/null 2>&1 || true ;;
  mend)
    forge_hc label "$terminal" forge.state= forge.error= forge.stopped= "forge.started=$now_ms" >/dev/null 2>&1 || true ;;
  born)
    view=(forge.review= forge.view=)
    case "$(jq -r '.source // "startup"' 2>/dev/null || printf startup)" in resume|compact) view=() ;; esac
    forge_hc label "$terminal" forge.state= forge.error= forge.stopped= "forge.started=$now_ms" ${view[@]+"${view[@]}"} \
      ${FORGE_PARENT_TERMINAL:+"forge.parent=$FORGE_PARENT_TERMINAL"} ${FORGE_AGENT_TYPE:+"forge.agent=$FORGE_AGENT_TYPE"} \
      >/dev/null 2>&1 || true ;;
  *) forge_die "usage: golem-state.sh crack|rest|mend|born" ;;
esac
