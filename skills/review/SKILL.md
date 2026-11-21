---
name: review
description: "Opens each pull request URL, one or many, in a herdr app tab of its own: the forgerdr review view, with a titled Claude agent working out of sight behind it, running /forgerdr:review-other for a colleague's pull request or /forgerdr:review-own for the user's own. Use on /forgerdr:review <url...>."
---

# Review

Open each pull request, one or many, in a tab of its own: the review view, where the user picks, edits and stamps, with its agent working out of sight behind it. A pull request by someone else gets the interactive `/forgerdr:review-other` flow; one authored by the signed-in user gets `/forgerdr:review-own`.

Preconditions: `test -n "${HC_TERMINAL_ID:-}"` (otherwise say you are not inside the herdr app and stop); at least one pull request URL (ask otherwise).

## Run

```bash
"${CLAUDE_PLUGIN_ROOT}/bin/forge-review.sh" [--cwd <path>] [--mod <name>] <url> [<url>...]
```

Per URL the script resolves the clone: the directory under `--cwd` (default: the current directory) whose name or `origin` remote matches the repository in the URL, else `--cwd` itself. Each pull request gets a new tab in the space this session shows in, named `#<id> review` for a colleague's and `#<id> mine` for the user's own: the review view alone (the forgerdr mod, or the copy `--mod` names), and a `claude` session titled for it, started with `FORGE_REVIEW_VIEW=1`, running `/forgerdr:review-other <url>` or `/forgerdr:review-own <url>`, which accepts the folder trust prompt when it shows and is then parked out of sight. The view's `Discuss with the golem` peeks at it; closing the tab ends it, and quitting the app keeps it. The first tab is shown at the end. It prints one JSON line per pull request, `agent_started` false when its claude ended before it started.

## Report

One line per pull request: id, title, skill started, tab. Agents that did not start (no clone, claude ended) with the reason. Nothing else: the reviews happen in their tabs, in their views.
