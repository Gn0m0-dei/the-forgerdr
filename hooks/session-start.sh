#!/usr/bin/env bash
# SessionStart: injects the rules, registers the session in engram under the workspace's memory project key,
# and after a compaction brings the project's memory context back.
# shellcheck source-path=SCRIPTDIR/..
set -euo pipefail

plugin_root="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
# shellcheck source=herdr/bin/forge-lib.sh
. "$plugin_root/herdr/bin/forge-lib.sh"
# shellcheck source=hooks/engram-lib.sh
. "$plugin_root/hooks/engram-lib.sh"

input="$(cat)"
session_id="$(printf '%s' "$input" | jq -r '.session_id // empty')"
cwd="$(printf '%s' "$input" | jq -r '.cwd // empty')"
source="$(printf '%s' "$input" | jq -r '.source // "startup"')"
[ -n "$cwd" ] || cwd="${CLAUDE_PROJECT_DIR:-$PWD}"
key="$(forge_project_key "$cwd")"

language="$(jq -r '.language // empty' "$HOME/.claude/settings.json" 2>/dev/null || true)"

context="$(
printf 'FORGERDR ACTIVE. Memory project key: %s. Spec mode: %s. Reply language: %s.\n\n' "$key" "$("$plugin_root/bin/forge-config.sh" get spec "$key")" "${language:-the language the user writes in}"
for rule in standards communication build memory; do
  cat "$plugin_root/rules/$rule.md"
  printf '\n'
done

# A multi-repository workspace keeps shared skills and instructions above the git tree, where Claude Code
# does not look. List them so the agent reads them by path when they apply.
root="$(forge_workspace_root "$cwd")"
top="$(git -C "$cwd" rev-parse --show-toplevel 2>/dev/null || true)"
if [ -n "$top" ] && [ "$root" != "$top" ]; then
  skills="$(forge_workspace_skills "$cwd")"
  if [ -n "$skills" ]; then
    printf '# Workspace skills\n\nShared by the repositories of %s and outside this repository, so they are not in the skill list: when one applies, Read its SKILL.md at the path and follow it as a loaded skill.\n\n' "$root"
    printf '%s\n' "$skills" | awk -F'\t' '{ printf "- **%s** (`%s`): %s\n", $1, $2, $3 }'
    printf '\n'
  fi
  if [ -f "$root/CLAUDE.md" ]; then
    printf '# Workspace instructions (%s/CLAUDE.md)\n\n' "$root"
    cat "$root/CLAUDE.md"
    printf '\n'
  fi
fi

if engram_ensure_serve; then
  engram_merge_split_projects "$cwd" "$key"
  [ -n "$session_id" ] && engram_register_session "$session_id" "$key" "$cwd"
  if [ "$source" = compact ]; then
    printf '\n## Memory context after compaction\n\n'
    engram_context "$key"
    printf '\nFirst action after this compaction: mem_session_summary with the content of the compacted summary, then mem_context, then continue the task.\n'
  fi
else
  printf 'engram: binary or server unavailable, memory tools will not work this session.\n'
fi
)"

# The title travels in FORGE_SESSION_TITLE, set by forge-review.sh and forge-work.sh on the pane they start the
# agent in, so a session carries the number of the pull request or work item it was opened for.
title="${FORGE_SESSION_TITLE:-}"
case "$source" in startup|resume|fork) ;; *) title="" ;; esac
jq -n --arg context "$context" --arg title "$title" \
  '{hookSpecificOutput: ({hookEventName: "SessionStart", additionalContext: $context} + (if $title == "" then {} else {sessionTitle: $title} end))}'
