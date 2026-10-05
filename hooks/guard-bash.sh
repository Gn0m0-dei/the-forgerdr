#!/usr/bin/env bash
# PreToolUse guard for Bash: refuses the git and process commands the standards forbid.
set -euo pipefail

command_text="$(jq -r '.tool_input.command // empty')"
[ -n "$command_text" ] || exit 0

deny() {
  jq -cn --arg reason "$1" '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:$reason}}'
  exit 0
}

case "$command_text" in
  *"git checkout -b "*origin/*|*"git switch -c "*origin/*)
    case "$command_text" in
      *--no-track*) ;;
      *) deny "The new branch would track the shared base branch. Use: git switch -c <branch> --no-track origin/<base>" ;;
    esac ;;
esac

case "$command_text" in
  *"git reset --hard"*|*"git reset --mixed"*)
    deny "Never reset hard or mixed. Undo a commit with git reset --soft HEAD~<n>, which keeps everything staged." ;;
  *"git push --force "*|*"git push -f "*|*"git push --force"|*"git push -f")
    deny "Never force push. If a rewrite is really needed, ask and use --force-with-lease on the branch itself." ;;
  *"pkill -f"*|*"killall "*)
    deny "Never kill processes by pattern. Find the exact PID or container name and ask before stopping it." ;;
esac

exit 0
