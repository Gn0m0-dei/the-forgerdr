#!/usr/bin/env bash
# SessionStart: injects the rules, registers the session in engram under the workspace's memory project key,
# and after a compaction brings the project's memory context back.
# shellcheck source-path=SCRIPTDIR/..
set -euo pipefail

plugin_root="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
# shellcheck source=bin/forge-lib.sh
. "$plugin_root/bin/forge-lib.sh"
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

# The skills and instructions Claude Code does not load where this session starts (forge_skills_context): those of a
# workspace, above the git tree; those of each repository, below a workspace root; those only the main checkout has,
# in a worktree. No apostrophe in a comment here: bash 3.2 reads it as a quote inside this substitution.
forge_skills_context "$cwd"

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

# The title travels in FORGE_SESSION_TITLE, set by forge-review.sh, forge-session.sh, forge-worktree.sh and the dispatch
# hook in the environment of the claude they start, so a session carries the number of the pull request or work item it was
# opened for.
title="${FORGE_SESSION_TITLE:-}"
case "$source" in startup|resume|fork) ;; *) title="" ;; esac
jq -n --arg context "$context" --arg title "$title" \
  '{hookSpecificOutput: ({hookEventName: "SessionStart", additionalContext: $context} + (if $title == "" then {} else {sessionTitle: $title} end))}'
