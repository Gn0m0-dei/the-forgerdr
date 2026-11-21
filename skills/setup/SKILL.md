---
name: setup
description: "Verifies and completes the forgerdr environment on this machine after install.sh: tools on PATH, engram server, MCP servers reaching through the plugin, the herdr app and its keys, provider sign-ins, Claude Code settings, and the leftovers the plugin now replaces. Idempotent. Use on /forgerdr:setup."
---

# Setup

`install.sh` (`curl -fsSL https://raw.githubusercontent.com/Gn0m0-dei/the-forgerdr/main/install.sh | bash`) puts the tools, the plugins, the herdr look and the status line on the machine, and `uninstall.sh` takes the ones ticked away. Claude Code, the herdr app and git are prerequisites they never install or remove. This skill checks every piece, completes what is left, and reports one table: piece → ok / done now / skipped (why). Ask, as the standards say (Gates), before anything that needs credentials or a package manager and wherever a row says so. Run it again any time.

## Tools (from install.sh)

| Piece | Check | Missing |
|---|---|---|
| jq, node, pnpm, az, gh, glab, engram, openspec | `command -v <tool>` | run `install.sh`; on another distro, install them by hand (README lists them) |
| herdr-app, hc, claude, git | `command -v <tool>` | prerequisites: the user installs Claude Code, the herdr app and git (README links them) |
| azure-devops extension | `az extension show --name azure-devops` | `az extension add --name azure-devops` |
| codebase-memory-mcp binary | `test -x ~/.local/bin/codebase-memory-mcp` | `curl -fsSL https://raw.githubusercontent.com/DeusData/codebase-memory-mcp/main/install.sh \| bash -s -- --skip-config` |

## Memory and MCP (from the plugin)

| Piece | Check | Missing |
|---|---|---|
| engram server | `curl -sf http://127.0.0.1:7437/health` | `engram serve &` (the session hook starts it too); `engram --version` older than the latest release: suggest `brew upgrade engram` or rerunning `install.sh` |
| MCP servers | `claude mcp list` shows `plugin:forgerdr:engram`, `plugin:forgerdr:codebase-memory`, `plugin:forgerdr:context7`, `plugin:forgerdr:chrome-devtools` connected | a server down: read its line, fix the binary or the network, never register it again by hand |
| context7 key (optional) | `CONTEXT7_API_KEY` exported in the shell | tell the user where to export it; without it context7 works rate-limited |

## herdr app

The desktop app (`herdr-app`) shows spaces, tabs and panes; herdr-core (`hc`) runs every terminal and agent in them. The forgerdr fan-outs and agent dispatch work inside the app's terminals (`HC_TERMINAL_ID` set). Claude Code reports its status to the app by itself: no integration to install.

| Piece | Check | Missing |
|---|---|---|
| app and core | `herdr-app --version`, `hc --version`, `hc server status` | `curl -fsSL https://releases.herdr.dev/app/install.sh \| sh` (installs herdr-core too), then open the app once; it updates itself |
| inside the app | `test -n "${HC_TERMINAL_ID:-}"` and `herdr-app status` answers | say so: the fan-outs and the agent dispatch need a session started in a terminal of the app |
| layout | `test -f ~/.local/state/forgerdr/herdr-installed.json` | optional; ask first: `"${CLAUDE_PLUGIN_ROOT}/bin/forge-herdr-install.sh"` installs the forgerdr layout, the forge-night theme and the forgerdr mod (`ctrl-shift-l` switches to it). Once installed, run it on every setup without asking: it updates what it installed and names what the user changed, which it leaves; say those names |
| forge sounds | `jq -r '.sounds.blocked // empty' ~/.config/herdr-app/settings.json` starts `mods/forgerdr/sounds/` | optional, after the layout; ask first, naming the alert sounds they have now (`jq .sounds ~/.config/herdr-app/settings.json`): `"${CLAUDE_PLUGIN_ROOT}/bin/forge-herdr-install.sh" --sounds` makes them the forge's (blocked, the hammer on the anvil; done, the quench), keeping a sound of their own unless they ask for `--force`; `--remove` takes them away with the rest. The mod plays a golem's crack itself, while sounds are on |
| keys | `jq -e '[.global[]? \| objects \| select((.args.name? // "") \| startswith("forgerdr "))] \| length == 2' ~/.config/herdr-app/keys.json` | optional; ask first, saying that once `keys.json` is edited the app stops adding its new default keys to it: `"${CLAUDE_PLUGIN_ROOT}/bin/forge-setup-keys.sh"` (Cmd+Alt+P and Cmd+Alt+T on macOS, Ctrl+Alt on Linux; `--review` and `--worktree` pick others, `--remove` takes them away) |

## Spec mode

| Piece | Check | Missing |
|---|---|---|
| mode | `"${CLAUDE_PLUGIN_ROOT}/bin/forge-config.sh" get spec <project-key>` | `chat` by default; `/forgerdr:mode spec <value> [--project]` to change it |
| `azure`: azdospec plugin | `claude plugin list` shows `azdo@azdospec` | recommend `claude plugin marketplace add Gn0m0-dei/azdospec && claude plugin install azdo@azdospec`, then `/azdo:init` in the project; without it forgerdr uses its own `az` commands |
| `openspec`: CLI | `openspec --version` | required in the `openspec` modes: `npm install -g @fission-ai/openspec` |
| `openspec:<store>`: store | `openspec store list --json` lists it | `openspec store register <path>` on the store's checkout |
| `openspec`: repository initialized | `openspec/` exists in the repository | propose `openspec init --tools claude` on the base branch; the user commits it |

## Sign-ins (the user runs them)

`az login`, `gh auth login`, `glab auth login` (skip glab when the user has no GitLab projects). Checks: `az account show`, `gh auth status`, `glab auth status`. Tell the user, in a plain line and not with `AskUserQuestion`, to run each with the `!` prefix in the prompt; their next message is the confirmation. An Azure DevOps organization the `az login` identity cannot reach (a guest account, a client's organization) takes a personal access token for that organization alone: `az devops login --organization https://dev.azure.com/<org>`, the token pasted when asked.

## Claude Code

| Piece | Check | Missing |
|---|---|---|
| reply language | `~/.claude/settings.json` has a `language` key | optional: without it the reply language is the one the user writes in; `/config` sets it |
| usage bar's data | `"${CLAUDE_PLUGIN_ROOT}/bin/forge-statusline.sh" status` says `installed: yes` | optional; ask first, naming the status line they have now (`jq .statusLine ~/.claude/settings.json`), which stays what they see: `"${CLAUDE_PLUGIN_ROOT}/bin/forge-statusline.sh" install` makes forgerdr's the status line, which keeps the subscription's 5-hour and weekly windows for the forgerdr layout's usage bar and hands the same JSON on to their line; it backs the settings up first, and `remove` puts their line back. Once installed, run `install` on every setup without asking: it refreshes its copy |
| plugins the user keeps | `claude plugin list` shows `typescript-lsp@claude-plugins-official` and `azdo@azdospec` | `claude plugin marketplace add Gn0m0-dei/azdospec && claude plugin install azdo@azdospec`; `claude plugin install typescript-lsp@claude-plugins-official` (ask first: optional) |

## Leftovers the plugin replaces

Report each one found; remove only on request:

- plugins `caveman`, `ponytail`, `engram` (`claude plugin uninstall <name>@<marketplace>`): the rules and the hooks replace them;
- `~/.claude/skills/my-personal-skill` and its line in `~/.claude/CLAUDE.md`: `rules/standards.md` replaces them;
- user-scope MCP servers `codebase-memory-mcp`, `context7`, `chrome-devtools` (`claude mcp remove -s user <name>`): the plugin declares them;
- `~/.claude/hooks/cbm-*` and their entries in `~/.claude/settings.json`: `hooks/graph-augment.sh` and the rules replace them;
- the herdr TUI's forgerdr plugin (`herdr plugin list` shows `gn0m0dei.forgerdr`; `herdr plugin uninstall gn0m0dei.forgerdr`, or `herdr plugin unlink` for a linked checkout) and its forgerdr block in `~/.config/herdr/config.toml`: forgerdr now works with the herdr app, and its TUI version stays on the repository's `tui` branch. The TUI's own Claude integration (`~/.claude/hooks/herdr-agent-state.sh`) is herdr's, not forgerdr's: mention it only.

Final: the table, then `mem_save` what was installed on this machine and the date.
