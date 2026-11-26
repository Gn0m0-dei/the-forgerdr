---
name: worktree
description: "Fans out items across the herdr app, one space each, one or many separated by |: a backlog item (bug, ticket, issue), an OpenSpec change or free text, as the spec mode says. For each it creates a git worktree on its branch, copies the ignored env files from the main clone, starts the dev server on its own port and launches a Claude agent running /forgerdr:workitem on it, all in parallel. Use on /forgerdr:worktree [--auto] [--no-dev] <item> [| <item>...]."
---

# Work

Turn a list of items into one git worktree per item and repository, each opened as a herdr app space with its branch, its env files, its dev server and its own agent. The topology is built by `${CLAUDE_PLUGIN_ROOT}/bin/forge-worktree.sh`; you decide the inputs it cannot guess.

Preconditions: `test -n "${HC_TERMINAL_ID:-}"` (otherwise say you are not inside the herdr app and stop); at least one item, asked for as the standards say (Gates) when none is given. Items are separated by `|`; what an item is in this project's spec mode, its title and its branch: `${CLAUDE_PLUGIN_ROOT}/references/items.md`.

## 1. Repositories

The script works on the repositories you pass with `--repo`. Decide them:

- The current directory is a git repository: that one.
- The current directory holds several git repositories (a multi-repo workspace): read each item (items reference) and pick the repositories it touches, by what the text names (front, back, scripts, a module) and by the workspace's architecture notes. An OpenSpec change in `openspec` mode lives in one repository: the one whose `openspec/changes/<name>` exists. Doubt: ask once with `AskUserQuestion`, one option per repository, multiSelect.

One item touching two repositories gets two worktrees and two agents, one per repository; say so. A session that keeps the work itself instead of handing it to agents follows `${CLAUDE_PLUGIN_ROOT}/references/workspaces.md`.

## 2. Branches

- `azure`, or a work item URL in `openspec` with no active change for its id: the script names the branch from the item, or reuses one that already carries the id; pass nothing.
- An OpenSpec change, or a work item URL in `openspec` whose id has an active change (it is that change): the branch the standards name from the change, reused when it exists (items reference), passed as `--branch <branch> --title <title>` before the item. The item passed is the change name, never the URL, so the script copies an uncommitted change and the agent continues it instead of creating it again.
- `chat`: one `AskUserQuestion` per item with two or three branch proposals (at most four questions per call), then `--branch` and `--title` as above.

Every branch: a local one is reused as it is, one only on `origin` is started from it. The script resolves every branch before creating anything and stops when one is checked out in the main clone or another worktree, naming where: then ask the user, as the items reference says, and run it again.

## 3. Dev command

`--no-dev` given to this skill is passed on, and no worktree starts a dev server: skip the rest of this step.

The script starts a dev server only when it can tell which: a single `dev` script in `package.json`. A monorepo with `dev:<app>` scripts, a docker compose stack or anything else: pick the command from the item (the app or portal it names) and pass `--dev '<command>'`, or pass nothing and leave the dev server to the user. Never guess a port: the script gives each worktree's `PORT` the first one from 3000 that nothing listens on.

Services that cannot run twice (a database, a CMS container mounted on the main clone) stay on the main clone; mention it in the summary.

## 4. Run

`--auto` given to this skill is passed on, so every agent runs `/forgerdr:workitem --auto`; without it, every agent works in the manual flow.

```bash
"${CLAUDE_PLUGIN_ROOT}/bin/forge-worktree.sh" [--auto] [--no-dev] [--no-submodules] --repo <path> [--repo <path>] [--base <branch>] [--dev '<command>'] [--branch <branch> --title <title>] <item> [[--branch <branch> --title <title>] <item>...]
```

The script, per item and repository: names the branch when no `--branch` precedes the item (type → `fix/` or `feature/`, title → slug; `<kind>/AB<id>-<slug>` in spec mode `azure`; `<kind>/EXT-<id>-<slug>` for an item of an external backlog, another Azure DevOps organization than the repository's remote), makes the worktree where the herdr app keeps its own (`<worktrees.directory>/<repo>/<branch with dashes>`, `~/.herdr/worktrees` unless the app's settings say otherwise) from `origin/<branch>` when the remote has the branch and from `origin/<base>` otherwise (`develop` when it exists, the remote HEAD otherwise), removes the upstream the worktree inherits, fills its git submodules, which git leaves empty (each one cloned anew for the worktree, at any depth; `--no-submodules` skips it, and one that does not come leaves the worktree with `submodules: false` and a line saying so), copies every ignored `.env*` file of the main clone into the worktree at the same path, copies `openspec/changes/<item>` from the main clone when the spec mode is `openspec` and the item is a change the worktree does not have yet (it was not committed), opens the worktree as a space that does not take the focus, named after the item, whose first tab runs a `claude` session titled for it with `/forgerdr:workitem <item>`, and starts the dev server in a second tab, `dev :<port>`, with `PORT` set to the first free port. The app nests the space under its repository in the sidebar. It prints one JSON line per worktree, `agent_started` false when its claude ended before it started. A worktree path already taken stops the run before anything is made.

Spec mode `openspec`: an agent on a work item URL creates its change, `<id>-<slug>`, inside its worktree; an agent on a change continues it there. Either way the change travels with that branch. A change copied from the main clone (`change_copied: true`) is now owned by the worktree, and the main clone's copy is a stale duplicate: tell the user to delete it there, and never delete it yourself. A change committed on the base but edited in the main clone is not copied: the worktree gets the committed version; when `git status --porcelain -- openspec/changes/<name>` in the main clone is not empty, say which edits stayed behind. With `openspec:<store>`, all agents write to the same store repository, each only inside its own change folder; nothing is committed there without the user's permission.

## 5. Report

One line per worktree: item, repository, branch, path, space id, port. Then what was left for the user (services on the main clone, repositories without a dev command, copied changes). `mem_save` the mapping item → branch → worktree path with the memory project key. A worktree goes, when the user asks, with `"${CLAUDE_PLUGIN_ROOT}/bin/forge-worktree-remove.sh" <path>`. It refuses uncommitted work, a submodule's too, and a submodule's commits no remote has.
