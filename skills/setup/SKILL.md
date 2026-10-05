---
name: setup
description: "Verifies and completes the forgerdr environment on this machine after install.sh: tools on PATH, engram server, MCP servers reaching through the plugin, herdr plugins, keybindings and integration, provider sign-ins, Claude Code settings, and the leftovers the plugin now replaces. Idempotent. Use on /forgerdr:setup, 'configura el entorno', 'instala forgerdr'."
---

# Setup

`install.sh` (`curl -fsSL https://raw.githubusercontent.com/Gn0m0-dei/the-forgerdr/main/install.sh | bash`) puts the tools on the machine. This skill checks every piece, completes what is left, and reports one table: piece → ok / done now / skipped (why). Ask before anything that needs credentials or a package manager. Run it again any time.

## Tools (from install.sh)

| Piece | Check | Missing |
|---|---|---|
| git, jq, node, pnpm, az, gh, glab, engram, herdr, claude | `command -v <tool>` | run `install.sh`; on another distro, install them by hand (README lists them) |
| azure-devops extension | `az extension show --name azure-devops` | `az extension add --name azure-devops` |
| codebase-memory-mcp binary | `test -x ~/.local/bin/codebase-memory-mcp` | `curl -fsSL https://raw.githubusercontent.com/DeusData/codebase-memory-mcp/main/install.sh \| bash -s -- --skip-config` |

## Memory and MCP (from the plugin)

| Piece | Check | Missing |
|---|---|---|
| engram server | `curl -sf http://127.0.0.1:7437/health` | `engram serve &` (the session hook starts it too); `engram --version` older than the latest release: suggest `brew upgrade engram` or rerunning `install.sh` |
| MCP servers | `claude mcp list` shows `plugin:forgerdr:engram`, `plugin:forgerdr:codebase-memory`, `plugin:forgerdr:context7`, `plugin:forgerdr:chrome-devtools` connected | a server down: read its line, fix the binary or the network, never register it again by hand |
| context7 key (optional) | `CONTEXT7_API_KEY` exported in the shell | tell the user where to export it; without it context7 works rate-limited |

## herdr

| Piece | Check | Missing |
|---|---|---|
| plugins | `herdr plugin list` shows `jhochenbaum.hunkdiff`, `herdr-agent-usage`, `gn0m0dei.forgerdr` | `herdr plugin install jhochenbaum/herdr-hunk-diff --yes`; `herdr plugin install <owner>/herdr-agent-usage --yes`; `herdr plugin install Gn0m0-dei/the-forgerdr/herdr --yes` (local checkout: `herdr plugin link "${CLAUDE_PLUGIN_ROOT}/herdr"`) |
| keybindings | `grep -q 'BEGIN gn0m0dei.forgerdr' ~/.config/herdr/config.toml` | `herdr plugin action invoke gn0m0dei.forgerdr.setup-keys` |
| claude integration | `test -f ~/.claude/hooks/herdr-agent-state.sh` | `herdr integration install claude` |

## Sign-ins (the user runs them)

`az login`, `gh auth login`, `glab auth login` (skip glab when the user has no GitLab projects). Checks: `az account show`, `gh auth status`, `glab auth status`. Tell the user to run each with the `!` prefix in the prompt and continue when they confirm.

## Claude Code

| Piece | Check | Missing |
|---|---|---|
| language | `~/.claude/settings.json` has `"language": "Español"` | merge the key |
| plugins the user keeps | `claude plugin list` shows `typescript-lsp@claude-plugins-official` and `azdo@azdospec` | `claude plugin marketplace add Gn0m0-dei/azdospec && claude plugin install azdo@azdospec`; `claude plugin install typescript-lsp@claude-plugins-official` (ask first: optional) |

## Leftovers the plugin replaces

Report each one found; remove only on request:

- plugins `caveman`, `ponytail`, `engram` (`claude plugin uninstall <name>@<marketplace>`): the rules and the hooks replace them;
- `~/.claude/skills/my-personal-skill` and its line in `~/.claude/CLAUDE.md`: `rules/standards.md` replaces them;
- user-scope MCP servers `codebase-memory-mcp`, `context7`, `chrome-devtools` (`claude mcp remove -s user <name>`): the plugin declares them;
- `~/.claude/hooks/cbm-*` and their entries in `~/.claude/settings.json`: `hooks/graph-augment.sh` and the rules replace them.

Final: the table, then `mem_save` what was installed on this machine and the date.
