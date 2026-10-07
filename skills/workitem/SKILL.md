---
name: workitem
description: "Works backlog items (bug, ticket, product backlog item, issue) end to end in the current clone, one titled herdr tab per item, one URL or many: reads it through the provider CLI, triages, reproduces in the browser, finds the root cause, proposes the minimal fix, branches without tracking, implements only after approval, opens the pull request and drafts the client-facing comment. Stops at every gate. Use on /forgerdr:workitem [--auto] <url...>."
---

# Ticket

You work one backlog item from analysis to pull request, stopping at every gate for the user's feedback. Everything that reaches the provider (comments, states, pull requests) is shown as a draft first.

Commands per provider: `${CLAUDE_PLUGIN_ROOT}/references/providers.md`. Memory: `mem_search` the item id and its keywords first; `mem_save` at each gate.

## Step 0: the sessions

The argument is one URL or several. Inside herdr (`test "${HERDR_ENV:-}" = 1`):

- Several URLs: read each item's title through the provider CLI and open one titled tab per item in this same directory, each running this skill on its URL; say in one line which tabs it opened, and stop here.
- One URL and this session's title does not carry its number (`FORGE_SESSION_TITLE` is unset or lacks `#<id>`): the same, for that one.
- One URL and the session is already titled for it (opened by `/forgerdr:worktree` or by this step): go on here.

```bash
"${CLAUDE_PLUGIN_ROOT}/herdr/bin/forge-session.sh" --title "#<id> <item title>" "/forgerdr:workitem <url>"
```

Outside herdr: several URLs are worked one after the other in this session, in the order of step 1; tell the user once to `/rename #<id> <slug>` for the first.

## Flow

Manual by default. `--auto` in the arguments switches to the auto flow for this run and is passed on to the tabs this skill opens. The gates below hold in both.

- **manual**: this skill does the analysis, the reproduction and the root cause or proposal, then stops and names the next command that fits (`/forgerdr:spec`, `/forgerdr:debug`, `/forgerdr:plan`, `/forgerdr:build`, `/forgerdr:security`, `/forgerdr:ship`). The user drives.
- **auto**: after the brief, classify the item and chain the whole pipeline in this session, following each skill's procedure (read its `SKILL.md` under `${CLAUDE_PLUGIN_ROOT}/skills/`):
  - **Bug, or a defect found while reproducing**: root cause with the four phases of `debug` → proposal (gate 2) → fix with a regression test proven red then green → `security` auditor on the branch diff → `ship`.
  - **Backlog item that adds or changes behaviour**: `spec` with the item as the spec (its description and acceptance criteria; missing criteria are drafted in Gherkin and proposed for the item, written only on a yes) → `research` for any choice with real alternatives (library, approach) → `plan` → `build` → `security` auditor on the branch diff → `ship`.
  - **Content or data someone else owns**: verdict and comment only, as in step 5.
  Announce each stage in one line as it starts. A stage that finds nothing to do says so and moves on.

## Gates

Stop and wait for the user after: the analysis and verdict (gate 1), the proposed solution (gate 2), before every commit (gate 3), before the pull request (gate 4), before publishing a comment (gate 5), before any state or assignment change (gate 6). Never skip a gate because the step looks obvious.

## 1. Analysis

- Read the whole item: title, type, description, acceptance criteria, repro steps, comments, linked pull requests and commits. Given several items, order them by real severity (crashes over visual inconsistencies, reproducible over vague, severity over nominal priority) and propose the order.
- **Brief first, before touching anything**: in the reply language, five to eight lines: what the item asks in your own words, who reported it and when, the area or component it points at, whether it looks like code or content, what is already linked (pull requests, commits, duplicates), and what you are going to check next. No gate here: the user reads it while you go on, and interrupts if the reading is wrong.
- Classify: **code** (ours) or **content / data / configuration someone else owns** (migrations, translations, editorial content). Content items get a verdict and a comment, not code.
- Old items often no longer reproduce: check linked pull requests, "fixed in" commits and the git log of the touched area before testing.

## 2. Reproduce

- Verify in the browser with chrome-devtools, on production and locally when both exist, interacting for real: clicks, forms, Enter, the back button, resize when the item mentions resolutions. Act as QA: edge cases, special characters, races. Never touch a production back office or CMS.
- Environments and base URLs, looked up in this order and stopping at the first hit: the project's `CLAUDE.md` (the right place for them: shared with the team and loaded in every session); memory (`mem_search` "environments"); `README.md`, `.env*` files, docker compose, deployment configs, CI workflows. Nothing found: ask the user once, then `mem_save` them under the title "Environments: <project key>" so the next lookup hits, and offer to add them to the project's `CLAUDE.md`.
- Verdict, stated first: **applies** or **does not reproduce**, with the cause and the evidence (selectors, network JSON, metrics, screenshot paths). Gate 1.

## 3. Root cause and proposal

- Locate the cause in code: `index_repository` if the graph does not know the project, `get_architecture` to place the area, then `search_graph`, `trace_path` and `get_code_snippet`; `git log` and `git blame` to learn why the code is the way it is before changing it. Check that no case justifies the current behaviour.
- Show the analysis and the simplest solution that works, as a diff sketch or a few sentences, before implementing. On request, a short plain-language note for the team. Gate 2.
- Manual flow and the item adds behaviour rather than fixing a defect: stop here and suggest `/forgerdr:spec` with this item; the proposal above is the starting point of the design.

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
- A fix is never announced as done: while it is not in production it is not true. Reference the item's own development instead ("the development in this item corrects it", in the reply language). No dates, no environments.
- Plain language, no internals ("pending review of X in code" is forbidden). Assertive but polite. A table of tests or timings when it adds value. Other items referenced as `#<id>`.
- Screenshots: take them yourself, production only, save them under the workspace's `tickets/` folder (create it) and tell the user the path and the item URL; the user attaches them by hand.
- Comment language: the client's. Default: the reply language; the project's notes override.

## 6. Close

- State and assignment change only as the user indicates. Gate 6.
- Per item, a line for the user: id, title, action, state, pull request. Working several items: a summary table at the end, for the user's manager.

Intermediate reports to the user: verdict first, evidence next, concise.
