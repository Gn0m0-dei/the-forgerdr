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

printf 'FORGERDR ACTIVE. Memory project key: %s. Spec mode: %s.\n\n' "$key" "$("$plugin_root/bin/forge-config.sh" get spec "$key")"
for rule in standards communication build memory; do
  cat "$plugin_root/rules/$rule.md"
  printf '\n'
done

engram_ensure_serve || { printf 'engram: binary or server unavailable, memory tools will not work this session.\n'; exit 0; }
engram_merge_split_projects "$cwd" "$key"
[ -n "$session_id" ] && engram_register_session "$session_id" "$key" "$cwd"

if [ "$source" = compact ]; then
  printf '\n## Memory context after compaction\n\n'
  engram_context "$key"
  printf '\nFirst action after this compaction: mem_session_summary with the content of the compacted summary, then mem_context, then continue the task.\n'
fi
