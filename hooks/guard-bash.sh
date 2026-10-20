#!/usr/bin/env bash
# PreToolUse guard for Bash: refuses the git and process commands the standards forbid, and refuses
# commit and pull request commands that attribute the work to AI.
set -euo pipefail

input="$(cat)"
command_text="$(printf '%s' "$input" | jq -r '.tool_input.command // empty')"
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

# Attribution to AI (standards): a trailer naming a model, "generated with/by <model>", or the robot emoji.
vendors='claude|anthropic|copilot|openai|chatgpt|gpt|gemini|codex|cursor|devin|aider'
export ATTR="co-authored-by:[^\n\"']*(?:$vendors|noreply\@anthropic\.com)[^\n\"']*|generated (?:with|by)[^\n\"']{0,3}(?:$vendors)[^\n\"']*|\x{1F916}[^\n\"']*"
has_attribution() { perl -CSD -0777 -ne 'exit(/$ENV{ATTR}/i ? 0 : 1)'; }
attribution_reason="Zero attributions to AI (standards): remove every Co-Authored-By trailer naming a model, every 'Generated with/by <model>' line and the robot emoji from the message or body, then retry."

if printf '%s' "$command_text" | grep -Eq '(^|[[:space:];&|(])(git[[:space:]]+commit|gh[[:space:]]+pr[[:space:]]+(create|edit)|az[[:space:]]+repos[[:space:]]+pr[[:space:]]+(create|update)|glab[[:space:]]+mr[[:space:]]+(create|update))([[:space:]]|$)'; then
  # Files passed with -F/--file/--body-file/--description-file; a path relative to the agent's cwd may not resolve here.
  while IFS= read -r file; do
    [ -n "$file" ] && [ -f "$file" ] && has_attribution < "$file" && deny "$attribution_reason"
  done <<EOF
$(printf '%s' "$command_text" | grep -oE '(^|[[:space:]])(-F|--file|--body-file|--description-file)[= ]+[^[:space:]"'"'"']+' | sed -E 's/^[[:space:]]*(-F|--file|--body-file|--description-file)[= ]+//' || true)
EOF
  printf '%s' "$command_text" | has_attribution && deny "$attribution_reason"
fi

exit 0
