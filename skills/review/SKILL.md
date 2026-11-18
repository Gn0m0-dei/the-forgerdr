---
name: review
description: "Opens one titled Claude agent per pull request URL, one or many, in new herdr app tabs named Reviews, as many panes to a tab as fit: a colleague's pull request runs /forgerdr:review-other, the user's own runs /forgerdr:review-own. Use on /forgerdr:review <url...>."
---

# Review

Open one agent per pull request, one or many, in new tabs of their own. A pull request by someone else gets the interactive `/forgerdr:review-other` flow; one authored by the signed-in user gets `/forgerdr:review-own`. The user jumps between the panes and answers each one.

Preconditions: `test -n "${HC_TERMINAL_ID:-}"` (otherwise say you are not inside the herdr app and stop); at least one pull request URL (ask otherwise).

## Run

```bash
"${CLAUDE_PLUGIN_ROOT}/bin/forge-review.sh" [--cwd <path>] <url> [<url>...]
```

Per URL the script resolves the clone: the directory under `--cwd` (default: the current directory) whose name or `origin` remote matches the repository in the URL, else `--cwd` itself. The pull requests go into new tabs named `Reviews` (`Reviews 2` and on when the name is taken in the space) of the space this session shows in, never this session's tab: the first fills a tab, each next one splits the largest pane that leaves both halves at least 80×15, and a tab that is full makes way for a new one. The tabs are shown while they fill, as the app sizes the panes of the shown tab only, and the first agent is shown at the end. Each pane runs a `claude` session titled for it with `/forgerdr:review-other <url>` or `/forgerdr:review-own <url>`, and accepts the folder trust prompt when it shows. It prints one JSON line per pull request, `agent_started` false when its claude ended before it started.

## Report

One line per pull request: id, title, skill started, tab. Agents that did not start (no clone, claude ended) with the reason. Nothing else: the reviews happen in their tabs.
