# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the versions follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Claude Code plugin `forgerdr`: rules injected at session start (standards, terse communication, lazy build philosophy, engram memory protocol with a workspace-level project key), a Bash guard that refuses tracking branches, hard and mixed resets, force pushes and pattern kills.
- Skills `/forgerdr:setup`, `/forgerdr:spec`, `/forgerdr:plan`, `/forgerdr:build` (inline or one fresh implementer and reviewer per task), `/forgerdr:debug`, `/forgerdr:security`, `/forgerdr:research`, `/forgerdr:ship`, `/forgerdr:pr-review`, `/forgerdr:address-review`, `/forgerdr:ticket`, `/forgerdr:review` and `/forgerdr:work`.
- Agents `forgerdr:reviewer`, `forgerdr:security-auditor` and `forgerdr:researcher`, read-only, dispatched by the skills for a fresh context.
- herdr plugin `gn0m0dei.forgerdr`: actions and panes that fan out pull request reviews and backlog items across worktrees, env files copied, dev servers started, one Claude agent per pane; `setup-keys` action for the keybindings.
- Provider reference for Azure DevOps, GitHub and GitLab through their CLIs.
- Banner and pixel-art logo under `assets/`, claim "Forge once. Herd many."
- `install.sh` for macOS and openSUSE Tumbleweed: git, jq, node, pnpm, az with azure-devops, gh, glab, engram, herdr, Claude Code and codebase-memory-mcp, each step idempotent.
- `.mcp.json` declaring engram (scoped to the memory project key through `bin/engram-mcp.sh`), codebase-memory, context7 and chrome-devtools, with hooks that start the engram server, register and close sessions, restore memory context after compaction, capture subagent output and augment Grep/Glob with the code graph. The engram and codebase-memory plugins and hand-registered MCP servers are no longer needed.
