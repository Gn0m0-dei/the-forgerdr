---
name: worktree
description: "Fans out backlog items across herdr: for each bug, ticket or issue URL it creates a git worktree on its own branch, copies the ignored env files from the main clone, starts the dev server on its own port and launches a Claude agent running /forgerdr:workitem on it, all in parallel. Use on /forgerdr:worktree <url...>."
---

# Work

Turn a list of backlog items into one herdr workspace per item and repository, each with its branch, its env files, its dev server and its own agent. The topology is built by `${CLAUDE_PLUGIN_ROOT}/herdr/bin/forge-worktree.sh`; you decide the inputs it cannot guess.

Preconditions: `test "${HERDR_ENV:-}" = 1` (otherwise say you are not inside herdr and stop); at least one item URL (ask for them otherwise).

## 1. Repositories

The script works on the repositories you pass with `--repo`. Decide them:

- The current directory is a git repository: that one.
- The current directory holds several git repositories (a multi-repo workspace): read each item's title and description through the provider CLI (`${CLAUDE_PLUGIN_ROOT}/references/providers.md`) and pick the repositories the item touches, by what the text names (front, back, scripts, a module) and by the workspace's architecture notes. Doubt: ask once with `AskUserQuestion`, one option per repository, multiSelect.

One item touching two repositories gets two worktrees and two agents, one per repository; say so.

## 2. Dev command

The script starts a dev server only when it can tell which: a single `dev` script in `package.json`. A monorepo with `dev:<app>` scripts, a docker compose stack or anything else: pick the command from the item (the app or portal it names) and pass `--dev '<command>'`, or pass nothing and leave the shell pane for the user. Never guess a port: the script assigns `PORT` per worktree.

Services that cannot run twice (a database, a CMS container mounted on the main clone) stay on the main clone; mention it in the summary.

## 3. Run

```bash
"${CLAUDE_PLUGIN_ROOT}/herdr/bin/forge-worktree.sh" --repo <path> [--repo <path>] [--base <branch>] [--dev '<command>'] <url> [<url>...]
```

The script, per item and repository: reads the item (type → `fix/` or `feature/`, title → slug), creates the worktree with `herdr worktree create` from `origin/<base>` (`develop` when it exists, the remote HEAD otherwise), removes the upstream the worktree inherits, copies every ignored `.env*` file of the main clone into the worktree at the same path, splits a pane for the dev server with `PORT` set, starts a `claude` agent in the root pane and prompts it with `/forgerdr:workitem <url>`. It prints one JSON line per worktree.

## 4. Report

One line per worktree: item, repository, branch, workspace id, port, agent name. Then what was left for the user (services on the main clone, repositories without a dev command). `mem_save` the mapping item → branch → workspace with the memory project key.
