# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the versions follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- The spec mode decides what `workitem` and `worktree` take as an item and how its branch is named (`references/items.md`, standards "Branch names"): in `openspec`, an OpenSpec change or a work item URL, the branch built from the change (`feature/#<id>-<slug>` when it references a work item, `feature/<change>` otherwise); in `azure`, a work item URL and `<kind>/AB<id>-<slug>`; in `chat`, a work item URL or free text, the branch asked with two or three proposals. A branch that already carries the work is reused; for a work item, any branch with its id.
- Several items are separated by `|`, and only by `|`, so free text with spaces is one item.
- `workitem` on an OpenSpec change continues from its stage: `spec` while the proposal, specs or design are open, then `plan`, `build` and `ship`.
- `forge-worktree.sh` takes `--branch` and `--title` before an item, resolves every branch before creating anything and stops when one is checked out elsewhere, reuses a branch that carries the item's id and a branch the remote already has instead of starting a new one from the base, and in spec mode `openspec` copies an uncommitted OpenSpec change from the main clone into the worktree.
- The herdr `worktree` action reads items up to an empty line and starts a Claude session running `/forgerdr:worktree` on them, so it follows the spec mode too.
- Every worktree inside herdr is a herdr worktree, created the way `/forgerdr:worktree` creates them and removed with `herdr worktree remove`; never `git worktree add`, `EnterWorktree` or a subagent isolated in its own worktree. `build` in agent mode keeps every implementer in the branch's worktree, strictly sequential.
- `spec`, `plan`, `build` and `ship` find the change of the current work from the arguments or the branch, take "no change" for a work item that has none or for new work instead of an unrelated active change, and ask when nothing decides, never picking an active change on their own; `spec` continues an existing change instead of creating it again; `build` names the branch by the spec mode. Every `openspec` command takes `--store` in `openspec:<store>`.
- `Closes: #<id>` follows the work's work item, from the branch or from the OpenSpec change.

### Fixed

- `/forgerdr:worktree <change>` failed with "no item id": every argument was read as a work item URL.
- `workitem` would have opened tabs in a loop for an item without an id: the session title is checked against the item's key, and free text goes on in any titled session.
- Agent names in `forge-worktree.sh` and `forge-session.sh` always fit herdr's rule (`[a-z][a-z0-9_-]{0,31}`) and are unique per item: the work item id, or a checksum of the branch or the title. Items without an id no longer stop the run at `agent start`, and one prompt can no longer reach another item's agent.
- `forge-worktree.sh` stops before creating anything when two items resolve to the same branch, and keeps the upstream of a reused branch that tracks itself on `origin`.
- `review-other` no longer reports a missing id or work item on a pull request whose branch has none by design, and reviews the diff against the OpenSpec change it carries.

## [0.8.0] - 2026-10-21

### Added

- `hooks/guard-bash.sh` strips AI attribution (`Co-Authored-By` naming a vendor product or a bot address, "Generated with/by <vendor>", the robot emoji) from commit and pull request commands when it sits on its own line, tells the agent what it stripped, and refuses the command otherwise, including inside `-F` and `--body-file` files. Human co-authors who share a first name with a model are left alone.
- `hooks/scrub-unicode.sh`: PostToolUse on Write, Edit and MultiEdit that strips zero-width, bidi, tag and stray BOM characters from the written file, keeps joiners next to emoji or non-Latin text, reports NBSP and exotic spaces, and skips binaries and invalid UTF-8.

## [0.7.0] - 2026-10-11

### Changed

- Spec mode `openspec` runs on the OpenSpec 1.x CLI end to end: `openspec new change <id>-<slug>`, each artifact written from `openspec instructions <artifact> --json`, `openspec validate --strict` before showing anything, `tasks.md` ticked during `build`, and `openspec archive --yes` on the branch before the pull request, so code, updated specs and the archived change merge together. The hand-written fallback is gone: its format failed `validate --strict`. A repository without `openspec/` is not initialized on a feature branch; `openspec init --tools claude` is proposed on the base branch.
- `openspec:<path>` becomes `openspec:<store>`: an OpenSpec store registered with `openspec store register`, used through `--store`. Reset a previous `openspec:<path>` value with `/forgerdr:mode`.
- Spec mode `azure`: branches follow azdospec's naming, `feature/AB<id>-<slug>` and `fix/AB<id>-<slug>`, in `worktree`, `workitem` and the standards; `/azdo:apply` is told to use that branch and the current working tree instead of creating its own branch and per-stream worktrees. Pull request titles drop either id form from the slug.
- `forge-config.sh` moves to `herdr/bin/`, next to the scripts that read it.

### Fixed

- Spec mode `azure` with work that starts from an existing backlog item no longer runs `/azdo:propose`, which would have created a second Feature for it: the item is the requirement, its missing acceptance criteria and task checklist are drafted and written to it on a yes, and `/azdo:apply` runs on it.
- `worktree` described the agent as starting in the root pane; it starts in its own pane since 0.3.0.

### Added

- `test/openspec.test.sh`: smoke test of the OpenSpec CLI contract (init, new change, status, instructions, strict validation, archive, stores) in a throwaway `HOME`; required in CI.
- `install.sh` installs the OpenSpec CLI; `/forgerdr:setup` checks it, the store registration and the repository initialization in the `openspec` modes.
- CONTRIBUTING: a tool is supported only after reading its docs and running its CLI for real, and every change walks the mode × command matrix.


## [0.6.0] - 2026-10-09

### Changed

- Security review reworked: the `security-auditor` reports only findings it can trace from a lower-trust actor through a failing control to a concrete effect, graded confirmed (critical, high, medium, low with explicit anchors), needs-validation (the decisive fact is outside the code, no severity) or rejected, each with the smallest fix and its regression test; it follows sibling paths and sad paths and skips checklist gaps without a reachable effect. Domain references under `references/security/` (general, web and auth, client side, supply chain, data isolation, availability, cloud and config, AI and agents) are read when they apply.

### Added

- `security-verifier` agent: every confirmed critical or high finding is challenged by a fresh agent before the user triages it.

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
