#!/usr/bin/env bash
# Starts the engram MCP server scoped to the workspace's memory project key, so every mem_* call lands in one project.
set -euo pipefail

# shellcheck source-path=SCRIPTDIR/../herdr/bin
# shellcheck source=forge-lib.sh
. "$(cd "$(dirname "$0")/../herdr/bin" && pwd)/forge-lib.sh"

exec engram mcp --tools=agent --project "$(forge_project_key "${CLAUDE_PROJECT_DIR:-$PWD}")"
