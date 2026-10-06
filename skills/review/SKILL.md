---
name: review
description: "Opens one titled herdr pane and Claude agent per pull request URL, one or many: a colleague's pull request runs /forgerdr:review-other, the user's own runs /forgerdr:review-own. Use on /forgerdr:review <url...>."
---

# Review

Open one pane and one agent per pull request, one or many. A pull request by someone else gets the interactive `/forgerdr:review-other` flow; one authored by the signed-in user gets `/forgerdr:review-own`. The user jumps between panes and answers each one.

Preconditions: `test "${HERDR_ENV:-}" = 1` (otherwise say you are not inside herdr and stop); at least one pull request URL (ask otherwise).

## Run

```bash
"${CLAUDE_PLUGIN_ROOT}/herdr/bin/forge-review.sh" [--cwd <path>] <url> [<url>...]
```

Per URL the script resolves the clone: the directory under `--cwd` (default: the current directory) whose name or `origin` remote matches the repository in the URL, else `--cwd` itself. It creates a tab in the current workspace, splits it into a grid of N panes, starts a `claude` agent in each and prompts it with `/forgerdr:review-other <url>`. It prints one JSON line per pane.

## Report

One line per pull request: id, title, skill started, pane id, agent name. Agents that could not start (no clone, agent blocked on a trust prompt) with the reason. Nothing else: the reviews happen in their panes.
