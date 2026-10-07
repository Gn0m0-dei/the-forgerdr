# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the versions follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.5.2] - 2026-10-07

### Fixed

- A session started at a workspace root now gets the skills inside each repository below it listed by repository, with their paths; Claude Code only loads the root's.
- Internal function names mangled by the 0.4.0 rename (`forge_worktreespace_root`, `forge_worktreetree_of`) are back to `forge_workspace_root` and `forge_worktree_of`.

## [0.5.1] - 2026-10-07

### Fixed

- Project skills were only loaded by `review-other`. A standards rule now makes every step that writes, changes, plans or reviews code load the project's skills that cover it (repository, workspace and plugin), with the loaded/loading/not applicable table, and pass their paths to every subagent; `workitem`, `spec`, `plan`, `build`, `debug` and `ship` point to it, and the `reviewer` and `security-auditor` agents read the skills they are given before the diff.

## [0.5.0] - 2026-10-07

### Added

- `--auto` on `workitem` and `worktree`: chains the pipeline after the brief: a bug goes root cause → fix → security → ship; a backlog item goes spec (the item is the spec) → research → plan → build → security → ship. Without it, the manual flow stops after the proposal and suggests the next command.
- `ship` runs the security auditor on the branch diff in the auto flow and suggests `/forgerdr:security` in the manual flow when the diff touches sensitive areas.
- `/forgerdr:help`: the cheat sheet of commands, flows, settings and herdr keys, answered by a `UserPromptSubmit` hook from `references/cheatsheet.txt` without reaching the model.

## [0.4.0] - 2026-10-06

### Changed

- `workitem` takes one URL or many and opens one titled herdr tab per item (`herdr/bin/forge-session.sh`) in the current directory, continuing in place only when the session is already titled for the single item given; `worktree` stays the worktree path.
- `review` picks the skill per pull request: one authored by the signed-in user runs `review-own`, any other runs `review-other`; one URL or many.

## [0.3.0] - 2026-10-06

### Added

- Session titles with the item number: `review` and `worktree` start each agent with `FORGE_SESSION_TITLE` (`PR <id>: <title>`, `#<id> <title>`) and the session start hook sets the session title from it, the same as `/rename`; a standards rule asks, once, for `/rename` in any session that gains a number without carrying it in its title. The hook now answers in JSON (`additionalContext` plus `sessionTitle`).
- `worktree` starts the agent in its own pane, to the right of the worktree's shell, with the dev server below.

## [0.2.2] - 2026-10-06

### Added

- Multi-repository workspaces: the session start lists the skills under the workspace root's `.claude/skills` and prints the workspace `CLAUDE.md` when they sit above the git tree, so agents in a repository or a worktree read them by path; `review-other` counts them as loadable skills.

### Fixed

- The memory project key of a linked git worktree is resolved through its main checkout, so agents started by `worktree` share the workspace's memory and spec mode.

## [0.2.1] - 2026-10-05

### Changed

- Reply language instead of a fixed one: the `language` set in Claude Code, or the language the user writes in, printed at session start and used in chat, work items and their comments, review comments, thread replies and reports; repository content stays in English.
- `workitem` opens with a brief of the item before reproducing it, and looks environments up in the project's `CLAUDE.md`, memory and project files before asking once.

## [0.2.0] - 2026-10-05

### Added

- Spec mode setting (`chat`, `openspec`, `openspec:<path>`, `azure`) in `~/.config/forgerdr/config.toml`, global or per project, shown or changed with `/forgerdr:mode` and printed at session start; `spec`, `plan`, `build` and `ship` keep the design and the tasks where it says, wrapping the azdospec plugin or the `openspec` CLI when installed and falling back to `az` or the OpenSpec layout otherwise.

### Fixed

- The MCP servers are declared in `mcp-servers.json`, referenced from `plugin.json`, so working inside this repository no longer loads them a second time as project config. `install.sh` trusts the engram Homebrew tap before installing.

## [0.1.0] - 2026-10-05

### Added

- Claude Code plugin `forgerdr`: rules injected at session start (standards, terse communication, lazy build philosophy, engram memory protocol with a workspace-level project key), a Bash guard that refuses tracking branches, hard and mixed resets, force pushes and pattern kills.
- Skills `/forgerdr:setup`, `/forgerdr:spec`, `/forgerdr:plan`, `/forgerdr:build` (inline or one fresh implementer and reviewer per task), `/forgerdr:debug`, `/forgerdr:security`, `/forgerdr:research`, `/forgerdr:ship`, `/forgerdr:review-other`, `/forgerdr:review-own`, `/forgerdr:workitem`, `/forgerdr:review` and `/forgerdr:worktree`.
- Agents `forgerdr:reviewer`, `forgerdr:security-auditor` and `forgerdr:researcher`, read-only, dispatched by the skills for a fresh context.
- herdr plugin `gn0m0dei.forgerdr`: actions and panes that fan out pull request reviews and backlog items across worktrees, env files copied, dev servers started, one Claude agent per pane; `setup-keys` action for the keybindings.
- Provider reference for Azure DevOps, GitHub and GitLab through their CLIs.
- Banner and pixel-art logo under `assets/`, claim "Forge once. Herd many."
- `install.sh` for macOS and openSUSE Tumbleweed: git, jq, node, pnpm, az with azure-devops, gh, glab, engram, herdr, Claude Code and codebase-memory-mcp, each step idempotent.
- `mcp-servers.json` declaring engram (scoped to the memory project key through `bin/engram-mcp.sh`), codebase-memory, context7 and chrome-devtools, with hooks that start the engram server, register and close sessions, restore memory context after compaction, capture subagent output and augment Grep/Glob with the code graph. The engram and codebase-memory plugins and hand-registered MCP servers are no longer needed.
