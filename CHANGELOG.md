# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the versions follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.2] - 2026-10-06

### Added

- Multi-repository workspaces: the session start lists the skills under the workspace root's `.claude/skills` and prints the workspace `CLAUDE.md` when they sit above the git tree, so agents in a repository or a worktree read them by path; `pr-review` counts them as loadable skills.

### Fixed

- The memory project key of a linked git worktree is resolved through its main checkout, so agents started by `work` share the workspace's memory and spec mode.

## [0.2.1] - 2026-10-05

### Changed

- Reply language instead of a fixed one: the `language` set in Claude Code, or the language the user writes in, printed at session start and used in chat, work items and their comments, review comments, thread replies and reports; repository content stays in English.
- `ticket` opens with a brief of the item before reproducing it, and looks environments up in the project's `CLAUDE.md`, memory and project files before asking once.

## [0.2.0] - 2026-10-05

### Added

- Spec mode setting (`chat`, `openspec`, `openspec:<path>`, `azure`) in `~/.config/forgerdr/config.toml`, global or per project, shown or changed with `/forgerdr:mode` and printed at session start; `spec`, `plan`, `build` and `ship` keep the design and the tasks where it says, wrapping the azdospec plugin or the `openspec` CLI when installed and falling back to `az` or the OpenSpec layout otherwise.

### Fixed

- The MCP servers are declared in `mcp-servers.json`, referenced from `plugin.json`, so working inside this repository no longer loads them a second time as project config. `install.sh` trusts the engram Homebrew tap before installing.

## [0.1.0] - 2026-10-05

### Added

- Claude Code plugin `forgerdr`: rules injected at session start (standards, terse communication, lazy build philosophy, engram memory protocol with a workspace-level project key), a Bash guard that refuses tracking branches, hard and mixed resets, force pushes and pattern kills.
- Skills `/forgerdr:setup`, `/forgerdr:spec`, `/forgerdr:plan`, `/forgerdr:build` (inline or one fresh implementer and reviewer per task), `/forgerdr:debug`, `/forgerdr:security`, `/forgerdr:research`, `/forgerdr:ship`, `/forgerdr:pr-review`, `/forgerdr:address-review`, `/forgerdr:ticket`, `/forgerdr:review` and `/forgerdr:work`.
- Agents `forgerdr:reviewer`, `forgerdr:security-auditor` and `forgerdr:researcher`, read-only, dispatched by the skills for a fresh context.
- herdr plugin `gn0m0dei.forgerdr`: actions and panes that fan out pull request reviews and backlog items across worktrees, env files copied, dev servers started, one Claude agent per pane; `setup-keys` action for the keybindings.
- Provider reference for Azure DevOps, GitHub and GitLab through their CLIs.
- Banner and pixel-art logo under `assets/`, claim "Forge once. Herd many."
- `install.sh` for macOS and openSUSE Tumbleweed: git, jq, node, pnpm, az with azure-devops, gh, glab, engram, herdr, Claude Code and codebase-memory-mcp, each step idempotent.
- `mcp-servers.json` declaring engram (scoped to the memory project key through `bin/engram-mcp.sh`), codebase-memory, context7 and chrome-devtools, with hooks that start the engram server, register and close sessions, restore memory context after compaction, capture subagent output and augment Grep/Glob with the code graph. The engram and codebase-memory plugins and hand-registered MCP servers are no longer needed.
