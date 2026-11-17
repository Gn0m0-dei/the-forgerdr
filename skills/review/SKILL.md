---
name: review
description: "Opens one titled herdr app tab and Claude agent per pull request URL, one or many: a colleague's pull request runs /forgerdr:review-other, the user's own runs /forgerdr:review-own. Use on /forgerdr:review <url...>."
---

# Review

Open one tab and one agent per pull request, one or many. A pull request by someone else gets the interactive `/forgerdr:review-other` flow; one authored by the signed-in user gets `/forgerdr:review-own`. The user jumps between tabs and answers each one.

Preconditions: `test -n "${HC_TERMINAL_ID:-}"` (otherwise say you are not inside the herdr app and stop); at least one pull request URL (ask otherwise).

## Run

```bash
"${CLAUDE_PLUGIN_ROOT}/bin/forge-review.sh" [--cwd <path>] <url> [<url>...]
```

Per URL the script resolves the clone: the directory under `--cwd` (default: the current directory) whose name or `origin` remote matches the repository in the URL, else `--cwd` itself. Per pull request it opens a tab named after it in the space this session shows in, the first one shown and the rest in the background, running a `claude` session titled for it with `/forgerdr:review-other <url>` or `/forgerdr:review-own <url>`, and accepts the folder trust prompt when it shows. It prints one JSON line per pull request, `agent_started` false when its claude ended before it started.

## Report

One line per pull request: id, title, skill started, tab. Agents that did not start (no clone, claude ended) with the reason. Nothing else: the reviews happen in their tabs.
