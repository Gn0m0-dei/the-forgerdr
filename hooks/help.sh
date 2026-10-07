#!/usr/bin/env bash
# UserPromptSubmit: answers "/forgerdr:help" with the cheat sheet without sending the prompt to the model.
set -euo pipefail
plugin_root="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
prompt="$(jq -r '.prompt // empty')"
case "$prompt" in
  "/forgerdr:help"|"/forgerdr:help "*|"/help forgerdr")
    jq -n --rawfile sheet "$plugin_root/references/cheatsheet.txt" '{decision: "block", reason: $sheet}' ;;
esac
exit 0
