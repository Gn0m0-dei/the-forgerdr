# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the versions follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- `/forgerdr:review` and `/forgerdr:workitem` with several items open their sessions in new tabs of their own, named `Reviews` and `Work items` (`Reviews 2` and on when the name is taken in the space), never in the tab they are launched from: the first session fills a tab, each next one splits the largest pane that leaves both halves at least 80×15, and the group goes on in a new tab when none does. The tabs are shown while they fill, because the app sizes the panes of the shown tab only, and the first session is shown at the end. `forge-session.sh` takes `--group NAME` and several `--title TITLE <prompt>` pairs for it.

## [0.15.0] - 2026-11-17

### Changed

- **Breaking: forgerdr drives the herdr desktop app instead of the herdr TUI.** The app (`herdr-app`) and herdr-core (`hc`), which runs its terminals and agents, replace the `herdr` CLI everywhere; the TUI and the app run separate servers and share nothing, so forgerdr supports one of them. The TUI version stays on the `tui` branch as 0.14.x, installed with `/plugin marketplace add Gn0m0-dei/the-forgerdr#tui`. The fan-outs and the agent dispatch work inside a terminal of the app (`HC_TERMINAL_ID` set); outside it the worktree hook keeps making plain git worktrees.
- A dispatched agent runs as a sub-agent of the session in a herdr-core terminal of its own, which the app lists under the session in its Agents sidebar with its live status, instead of a pane in a grid next to the session or a tab of agents: the app gives a tab its added terminals as ever-thinner splits, so no grid holds. One with `isolation: "worktree"` is a pane of its worktree's space. It starts through the user's login shell, as the app starts agents, so it gets the user's environment (a login `sh` with the session's `PATH` for a shell neither of the sh family nor fish, such as nushell); hc types no note about it into the session; the folder trust prompt is accepted once from its reported status, and an agent that reports nothing within a minute, or a terminal that cannot be ended, never also runs in-process. A reopened agent keeps its name and resumes its Claude session.
- The agent's state lives only in its record: the app shows working, blocked and done from what Claude Code reports by itself, so the `▶ working` / `⏸ waiting` / `✓ done` pane labels and the `PermissionRequest` and `AskUserQuestion` hooks that set them are gone.
- `/forgerdr:worktree` makes each worktree with git where the app keeps its own (`worktrees.directory` in the app's settings, `~/.herdr/worktrees` by default) and opens it as a space that does not take the focus, named after the item, with the titled agent in its first tab and the dev server in a second tab, `dev :<port>`. A worktree path already taken stops the run before anything is made.
- `/forgerdr:review` opens one tab per pull request, the first one shown, instead of one tab split into a grid; `/forgerdr:workitem` opens its tabs with `herdr-app` and shows only the first of several (`forge-session.sh --no-focus`).
- Claude Code's own worktrees (`hooks/worktree.sh`) are git worktrees opened as app spaces in the background; forgerdr records the spaces it opens and closes them with their worktrees, and as orphans once their folder is gone, when a session starts or ends. While the app does not answer, the record stays and the space is closed later.
- The scripts moved from `herdr/bin/` to `bin/`.

### Added

- `bin/forge-worktree-remove.sh [--force] <path>`: removes a linked worktree and then closes its spaces, keeping its branch; it refuses a path that is not the top of a linked worktree, uncommitted work, the worktree the session stands in, the space it runs in, and a space where an agent is at work, and leaves the spaces open when git refuses. A space counts as at work whenever the app's answer does not say otherwise. The Bash guard points to it when it refuses `git worktree remove` inside the app, and `/forgerdr:ship` uses it.
- `bin/forge-setup-keys.sh`: two keys in the app's `keys.json`, Cmd+Alt+P (review pull requests) and Cmd+Alt+T (items in worktrees), Ctrl+Alt on Linux, each opening a prompt tab that closes when done. It keeps every other key, refuses one already in use, finds the installed plugin when the key runs, and `--remove` takes its keys away. `/forgerdr:setup` offers it and says that the app then stops adding its new default keys to an edited `keys.json`.
- `test/fakes.sh`, fake `hc` and `herdr-app` that log every call, and `test/herdr-app.test.sh` for the library functions over them and the scripts; the dispatch and worktree tests run against them.

### Fixed

- `/forgerdr:review` no longer stops on a pull request whose host is neither Azure DevOps, GitHub nor GitLab: `forge_pr_is_mine` compared variables it never set, which bash 5 refuses under `set -u`.

### Removed

- The herdr TUI plugin (`herdr/herdr-plugin.toml`, its actions and panes) and its keys in `~/.config/herdr/config.toml`; `/forgerdr:setup` reports them as leftovers.
- `herdr notification show` after a fan-out: the app already notifies when an agent finishes or needs you.

## [0.14.0] - 2026-11-16

### Added

- Work items of an external backlog: an Azure DevOps organization other than the repository's remote, as when a client hosts the code and another company runs the backlog. Everything that stays in the repository names such an item `EXT-<id>`: the branch (`feature/EXT-<id>-<slug>`), the commit footer (`Refs: EXT-<id>`, never `#<id>`, which Azure Repos links to the item with that id in the repository's organization) and the pull request title, with no `--work-items` and no backlog URL. `forge_item_external` detects it from the item's URL, `/forgerdr:worktree` names the branch, and existing `EXT-<id>` branches are reused. Where the backlog is lives in `git config azdospec.organization` and `azdospec.project`, the keys azdospec's `/azdo:init` writes; without azdospec, the first external item worked offers to save them.

### Fixed

- `forge_azure_org` reads the organization of a legacy `https://<org>.visualstudio.com/...` URL and of a git remote, including an SSH remote whose host is an alias of `~/.ssh/config`, instead of returning nothing.
- Pull request threads, work item comments and work item types work in an Azure DevOps organization reached only with a personal access token, such as a guest account in a client's organization: the providers reference reaches them through `az devops invoke` instead of `az rest`, which signs in with `az login` alone. The thread list also skips deleted threads, which the API returns.
- The providers reference resolves an SSH host alias with `ssh -G` before choosing the provider, takes the organization and project from the URL at hand before the remote's, decodes the project (`%20`), always passes `--organization`, and documents a personal access token per organization (`az devops login --organization`) next to `az login`.

## [0.13.1] - 2026-11-15

### Fixed

- A herdr workspace no longer stays open after its Claude Code worktree is removed where no hook sees it, with `git worktree remove` or `rm` from Bash or a terminal. Inside herdr, `hooks/worktree.sh` closes the workspaces of `.claude/worktrees/` checkouts gone from disk when a session starts or ends, and when Claude Code asks to remove a worktree that is already gone; the one the session stands in and one where an agent is still working or asking stay.
- `hooks/guard-bash.sh` refuses `git worktree remove` inside herdr and points to `herdr worktree remove --workspace <id>`, which closes the workspace with the worktree; the standards say the same.

## [0.13.0] - 2026-11-06

### Added

- A dispatched agent's herdr pane label shows its state and its current task: `▶ working · <task>`, `⏸ waiting · <task>` while it waits for a permission, an answer or agents of its own, and `✓ done · <task>` once it has reported. `hooks/agent-state.sh` (which replaces `hooks/agent-report.sh`) keeps it up to date from the agent's own SessionStart, UserPromptSubmit, PermissionRequest, AskUserQuestion and Stop hooks.
- `hooks/agent-message.sh` on PreToolUse for SendMessage: a message to an agent the session dispatched, addressed by its herdr agent name, goes to that agent's session. To an agent that is done it is its next task: worded with the same report instructions as the first one, its label taking the message's summary. To one still on its task, such as an answer to its question, it goes as it is. When its pane was closed, the agent is reopened in a new pane of the grid, resuming its Claude session (`claude --resume`) with its own model, tools and permission mode, and the call is answered with a reason that says so. Each dispatched agent's record (its pane, task, Claude session, message address and arguments) lives in `~/.local/state/forgerdr/worktrees/<session>.agents/` and goes with the session's sweep.

### Changed

- The standards forbid personal or sensitive data (an email, a name, an account id, a token, a hostname or a local path) in a `User-Agent`, `From` or custom client header, in code, scripts and commands; a site that asks automated clients to identify themselves gets a generic client name, and a demand for a personal contact goes to the user. The security audit's general classes check outgoing request headers for the same leak.
- The report reminder counts from the agent's current task, not its first one: an agent given a second pass that ends its turn without reporting is reminded again, and is shown as waiting if it ends it once more.
- The build skill and the standards send a fix pass, or a second review of a reviewer's own findings, to the agent that did the first one instead of a fresh agent; a new task, a final review and a security verification still get a new agent.

## [0.12.0] - 2026-11-06

### Added

- A dispatched agent that has sent its report says so in its pane, `✅ DONE: report delivered … You can close this pane now`, and its herdr pane title becomes `✓ done · <task>`, so finished agents are easy to spot and close by hand. Talking to it afterwards does not repeat either.

### Changed

- Agents dispatched inside herdr form an even grid instead of one ever thinner column: each new agent halves the largest agent pane of the session along its longer side (a row counts as two columns), never below 80 columns by 15 rows, and the session keeps its half of the tab. When no agent pane can be halved, the agent opens a new tab, `agents · <session>`, in the same workspace without taking the focus, and the grid goes on there; a tab whose agents are all closed by the sweep goes with them.

### Fixed

- `test/agent-dispatch.test.sh` no longer reaches the real herdr or the session running it: it clears the herdr and messaging variables and routes every herdr call to its fake.

## [0.11.0] - 2026-11-06

### Added

- `hooks/agent-dispatch.sh` on PreToolUse for Agent: inside herdr every subagent runs as its own Claude session in a herdr pane instead of inside the session, so it can be watched and talked to. One with `isolation: "worktree"` opens in its herdr worktree's workspace; any other in a new pane of the current tab, stacked in one column. The agent gets its definition (instructions through `--append-system-prompt-file`, its own tool list through `--tools` plus what reporting needs, no MCP servers unless the list names them), the dispatching session's permission mode, and its model unless the call or the definition names one; it reports back with SendMessage. Nested agents work the same way. A fork, a type it cannot reproduce or that is not a plain name, a session that cannot receive messages, and every agent outside herdr stay in-process; inside herdr each fallback is logged to `~/.local/state/forgerdr/worktrees/dispatch.log`.
- `hooks/agent-report.sh` on Stop: a dispatched agent that has not sent its report yet is reminded once per turn; once it has, talking to it in its pane brings no reminder.
- The SessionEnd sweep closes the agent panes the session opened while they still hold that agent and it is done, and leaves worktrees where an agent is still at work.
- `FORGE_CLAUDE_ARGS` adds its words to every `claude` the scripts and hooks start.

### Fixed

- Starting an agent in a new herdr pane no longer fails while the pane's shell is still starting (`agent_pane_busy`), which a slow login shell such as nushell made common in `/forgerdr:worktree`, `workitem` tabs and the new dispatch.

## [0.10.0] - 2026-11-05

### Added

- `hooks/worktree.sh` on `WorktreeCreate`, `WorktreeRemove` and `SessionEnd`: Claude Code's own worktrees (`EnterWorktree`, subagents with `isolation: "worktree"`, `claude --worktree`) open as herdr workspaces inside herdr, nested ones included, and as plain git worktrees outside it, under the main checkout's `.claude/worktrees/<name>` on branch `worktree-<name>`, with no upstream. The base follows Claude Code's `worktree.baseRef`: `fresh` starts from the forgerdr base on origin, `head` from the asking directory's HEAD. Ignored `.env*` files and the files `.worktreeinclude` names are copied, non-ASCII names included, and `.claude/worktrees/` is excluded locally. Removing one closes its herdr workspace, refuses while uncommitted work remains, and deletes only the worktree's own branch, while it still points where it started or once it is merged. When a session ends, the worktrees it created with no change and no commit are removed from herdr and git, detached so the cleanup outlives Claude Code and logged to `~/.local/state/forgerdr/worktrees/sweep.log`; worktrees with work, the one the session stands in and one another session also holds stay.

### Changed

- The worktree rule in the standards: Claude Code's own worktrees are allowed again, since the hook routes them through herdr; `git worktree add` from Bash stays forbidden.
- Ignored file names with non-ASCII characters are copied into `/forgerdr:worktree` worktrees too (git no longer quotes them).
- Biome 2.6: the configuration is migrated and Markdown stays unformatted, since Biome does not recognise the YAML frontmatter of skills and agents.

### Fixed

- The cheat sheet listed a `--manual` flag that does not exist: the manual flow is the default and needs no flag.
- `workitem` opening one tab per item now passes `--auto` on to them in its example too, as its flow section says.

## [0.9.0] - 2026-10-23

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
