#!/usr/bin/env bash
# PreToolUse Grep|Glob: adds code-graph context from codebase-memory-mcp. Never blocks; any failure is silent.
binary="$HOME/.local/bin/codebase-memory-mcp"
[ -x "$binary" ] || exit 0
"$binary" hook-augment 2>/dev/null
exit 0
