---
name: review
description: "Fans out pull request reviews across herdr: opens a tab with one pane per pull request URL and launches a Claude agent in each running /forgerdr:pr-review, so the user reviews several pull requests side by side. Use on /forgerdr:review <url...>, 'revisa estas PRs', 'review these PRs'."
---

# Review

Open one pane and one agent per pull request. Each agent runs the interactive `/forgerdr:pr-review` flow on its own; the user jumps between panes and answers each one.

Preconditions: `test "${HERDR_ENV:-}" = 1` (otherwise say you are not inside herdr and stop); at least one pull request URL (ask otherwise).

## Run

```bash
"${CLAUDE_PLUGIN_ROOT}/herdr/bin/forge-review.sh" [--cwd <path>] <url> [<url>...]
```

Per URL the script resolves the clone: the directory under `--cwd` (default: the current directory) whose name or `origin` remote matches the repository in the URL, else `--cwd` itself. It creates a tab in the current workspace, splits it into a grid of N panes, starts a `claude` agent in each and prompts it with `/forgerdr:pr-review <url>`. It prints one JSON line per pane.

## Report

One line per pull request: id, repository, pane id, agent name. Agents that could not start (no clone, agent blocked on a trust prompt) with the reason. Nothing else: the reviews happen in their panes.
