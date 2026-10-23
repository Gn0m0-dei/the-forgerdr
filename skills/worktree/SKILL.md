---
name: worktree
description: "Fans out items across herdr, one or many separated by |: a backlog item (bug, ticket, issue), an OpenSpec change or free text, as the spec mode says. For each it creates a git worktree on its branch, copies the ignored env files from the main clone, starts the dev server on its own port and launches a Claude agent running /forgerdr:workitem on it, all in parallel. Use on /forgerdr:worktree [--auto] <item> [| <item>...]."
---

# Work

Turn a list of items into one herdr workspace per item and repository, each with its branch, its env files, its dev server and its own agent. The topology is built by `${CLAUDE_PLUGIN_ROOT}/herdr/bin/forge-worktree.sh`; you decide the inputs it cannot guess.

Preconditions: `test "${HERDR_ENV:-}" = 1` (otherwise say you are not inside herdr and stop); at least one item (ask for them otherwise). Items are separated by `|`; what an item is in this project's spec mode, its title and its branch: `${CLAUDE_PLUGIN_ROOT}/references/items.md`.

## 1. Repositories

The script works on the repositories you pass with `--repo`. Decide them:

- The current directory is a git repository: that one.
- The current directory holds several git repositories (a multi-repo workspace): read each item (items reference) and pick the repositories it touches, by what the text names (front, back, scripts, a module) and by the workspace's architecture notes. An OpenSpec change in `openspec` mode lives in one repository: the one whose `openspec/changes/<name>` exists. Doubt: ask once with `AskUserQuestion`, one option per repository, multiSelect.

One item touching two repositories gets two worktrees and two agents, one per repository; say so.

## 2. Branches

- `azure`, or a work item URL in `openspec` with no active change for its id: the script names the branch from the item, or reuses one that already carries the id; pass nothing.
- An OpenSpec change, or a work item URL in `openspec` whose id has an active change (it is that change): the branch the standards name from the change, reused when it exists (items reference), passed as `--branch <branch> --title <title>` before the item.
- `chat`: one `AskUserQuestion` per item with two or three branch proposals (at most four questions per call), then `--branch` and `--title` as above.

Every branch: a local one is reused as it is, one only on `origin` is started from it. The script resolves every branch before creating anything and stops when one is checked out in the main clone or another worktree, naming where: then ask the user, as the items reference says, and run it again.

## 3. Dev command

The script starts a dev server only when it can tell which: a single `dev` script in `package.json`. A monorepo with `dev:<app>` scripts, a docker compose stack or anything else: pick the command from the item (the app or portal it names) and pass `--dev '<command>'`, or pass nothing and leave the shell pane for the user. Never guess a port: the script assigns `PORT` per worktree.

Services that cannot run twice (a database, a CMS container mounted on the main clone) stay on the main clone; mention it in the summary.

## 4. Run

`--auto` given to this skill is passed on, so every agent runs `/forgerdr:workitem --auto`; without it, every agent works in the manual flow.

```bash
"${CLAUDE_PLUGIN_ROOT}/herdr/bin/forge-worktree.sh" [--auto] --repo <path> [--repo <path>] [--base <branch>] [--dev '<command>'] [--branch <branch> --title <title>] <item> [[--branch <branch> --title <title>] <item>...]
```

The script, per item and repository: names the branch when no `--branch` precedes the item (type → `fix/` or `feature/`, title → slug; `<kind>/AB<id>-<slug>` in spec mode `azure`), creates the worktree with `herdr worktree create` from `origin/<branch>` when the remote has the branch and from `origin/<base>` otherwise (`develop` when it exists, the remote HEAD otherwise), removes the upstream the worktree inherits, copies every ignored `.env*` file of the main clone into the worktree at the same path, copies `openspec/changes/<item>` from the main clone when the spec mode is `openspec` and the item is a change the worktree does not have yet (it was not committed), splits a pane below for the dev server with `PORT` set, starts a titled `claude` agent in its own pane to the right of the worktree's shell and prompts it with `/forgerdr:workitem <item>`. It prints one JSON line per worktree.

Spec mode `openspec`: an agent on a work item URL creates its change, `<id>-<slug>`, inside its worktree; an agent on a change continues it there. Either way the change travels with that branch. A change copied from the main clone (`change_copied: true`) is now owned by the worktree, and the main clone's copy is a stale duplicate: tell the user to delete it there, and never delete it yourself. A change committed on the base but edited in the main clone is not copied: the worktree gets the committed version; when `git status --porcelain -- openspec/changes/<name>` in the main clone is not empty, say which edits stayed behind. With `openspec:<store>`, all agents write to the same store repository, each only inside its own change folder; nothing is committed there without the user's permission.

## 5. Report

One line per worktree: item, repository, branch, workspace id, port, agent name. Then what was left for the user (services on the main clone, repositories without a dev command, copied changes). `mem_save` the mapping item → branch → workspace with the memory project key.
