---
name: ticket
description: "Works one backlog item (bug, ticket, product backlog item, issue) end to end: reads it through the provider CLI, triages, reproduces in the browser, finds the root cause, proposes the minimal fix, branches without tracking, implements only after approval, opens the pull request and drafts the client-facing comment. Stops at every gate. Use on /forgerdr:ticket <url>, 'trabaja este ticket', 'mira este bug'."
---

# Ticket

You work one backlog item from analysis to pull request, stopping at every gate for the user's feedback. Everything that reaches the provider (comments, states, pull requests) is shown as a draft first.

Commands per provider: `${CLAUDE_PLUGIN_ROOT}/references/providers.md`. Memory: `mem_search` the item id and its keywords first; `mem_save` at each gate.

## Gates

Stop and wait for the user after: the analysis and verdict (gate 1), the proposed solution (gate 2), before every commit (gate 3), before the pull request (gate 4), before publishing a comment (gate 5), before any state or assignment change (gate 6). Never skip a gate because the step looks obvious.

## 1. Analysis

- Read the whole item: title, type, description, acceptance criteria, repro steps, comments, linked pull requests and commits. Given several items, order them by real severity (crashes over visual inconsistencies, reproducible over vague, severity over nominal priority) and propose the order.
- Classify: **code** (ours) or **content / data / configuration someone else owns** (migrations, translations, editorial content). Content items get a verdict and a comment, not code.
- Old items often no longer reproduce: check linked pull requests, "fixed in" commits and the git log of the touched area before testing.

## 2. Reproduce

- Verify in the browser with chrome-devtools, on production and locally when both exist, interacting for real: clicks, forms, Enter, the back button, resize when the item mentions resolutions. Act as QA: edge cases, special characters, races. Never touch a production back office or CMS.
- Environments and base URLs come from the project itself: `CLAUDE.md`, `README.md`, `.env*` files, docker compose, deployment configs, CI workflows, and what earlier sessions saved in memory. Unknown after looking: ask once, then `mem_save` them.
- Verdict, stated first: **applies** or **does not reproduce**, with the cause and the evidence (selectors, network JSON, metrics, screenshot paths). Gate 1.

## 3. Root cause and proposal

- Locate the cause in code: `index_repository` if the graph does not know the project, `get_architecture` to place the area, then `search_graph`, `trace_path` and `get_code_snippet`; `git log` and `git blame` to learn why the code is the way it is before changing it. Check that no case justifies the current behaviour.
- Show the analysis and the simplest solution that works, as a diff sketch or a few sentences, before implementing. On request, a short plain-language note for the team. Gate 2.

## 4. Implement

- Update the base first: `git fetch origin`; `git log --oneline <base>..origin/<base>` must be empty for the local base, or branch from `origin/<base>` directly.
- Branch: `fix/#<id>-<slug>` for a bug, `feature/#<id>-<slug>` for a backlog item or a "bug" that is really new behaviour. `git switch -c <branch> --no-track origin/<base>`, then verify `git rev-parse --abbrev-ref @{upstream}` fails or names the branch itself. Working inside a worktree the forgerdr created: the branch already exists, verify the upstream only.
- A working tree mounted by a running container (watched folders, hot reload) must not be churned by git: check `git diff --stat HEAD origin/<base> -- <mounted-path>` before branching there and warn the user if files would be rewritten.
- Implement the minimal fix. Verify it in the browser before claiming anything.
- **No commit without permission.** Gate 3. When granted: Conventional Commits in English, `Closes: #<id>` footer, no AI mention of any kind. Pair programming the user names: `Co-authored-by: <colleague>`.
- Pull request to the base branch, title `#<id> <slug>`, description in English (problem, cause, change, verification), work item linked through the provider. Gate 4.

## 5. Comment on the item

The client reads it. Always show the draft first; the user approves or adjusts. Gate 5.

- Production only: never mention local environments, local screenshots or local URLs.
- No greetings, no addressee, no sign-off. Start with the content.
- Never describe the development status or the deployment: nothing like "finished", "integrated", "pending deploy", "will be in the next release". The work item state carries that.
- A fix is never announced as done: while it is not in production it is not true. Reference the item's own development: "se corrige con el desarrollo realizado en este ticket". No dates, no environments.
- Plain language, no internals ("pending review of X in code" is forbidden). Assertive but polite. A table of tests or timings when it adds value. Other items referenced as `#<id>`.
- Screenshots: take them yourself, production only, save them under the workspace's `tickets/` folder (create it) and tell the user the path and the item URL; the user attaches them by hand.
- Comment language: the client's. Default Spanish; the project's notes override.

## 6. Close

- State and assignment change only as the user indicates. Gate 6.
- Per item, a line for the user: id, title, action, state, pull request. Working several items: a summary table at the end, for the user's manager.

Intermediate reports to the user: verdict first, evidence next, concise.
