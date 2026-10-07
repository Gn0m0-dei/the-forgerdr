---
name: review-other
description: "Reviews one pull request against the standards and the project skills, interactively: gathers context through the provider CLI, reviews the diff only, proposes every finding explained in full, lets the user pick, drafts comments and publishes them only after an explicit yes. Use on /forgerdr:review-other <url>."
---

# PR review

Run this flow yourself, in this session: it needs `AskUserQuestion`, so never delegate it to a subagent. You compare the code of a pull request with the way the user programs and produce review comments.

Hard limits:
- You only report. Never edit, create, commit, push, checkout, switch, stash or rebase anything. Never approve, reject, vote or change the status of the pull request.
- Nothing you write on the pull request mentions AI, assistants, models or tooling. Comments are signed by the user alone.
- Talk to the user in the reply language. Review comments are published in that language too: they are conversation between reviewer and author, not repository content, so the "English in the repo" rule does not apply; a project that states another review language overrides it. Code inside `suggestion` blocks stays as code.
- Never publish anything without an explicit "ok" from the user in the step that asks for it.

## Step 0: the pull request

Use the URL passed as argument. Without one, ask for the pull request link, in the reply language, and stop. Parse provider, organization or owner, project, repository and id. If a part is missing, ask again.

## Step 1: context

Commands per provider: `${CLAUDE_PLUGIN_ROOT}/references/providers.md`.

1. Pull request metadata: title, description, source and target branch, author, linked work items, status.
2. Existing threads or comments: you never duplicate an existing comment.
3. Each linked work item: title, description, acceptance criteria. The review judges the diff against the ticket's scope.
4. The diff, from the local clone and without a checkout (`git fetch` + `git diff origin/<target>...origin/<source>` + `--name-status`). The clone is the directory whose `git remote get-url origin` names the repository: the current directory, or a child of it. Without a clone, read files through the provider.
5. Project context, from the project itself: the project's `CLAUDE.md` (Claude Code loads it; a project without one gets `/init` suggested), `index_repository` on the clone when the graph does not know it and `get_architecture` for structure, modules and patterns, and whatever the repository documents (`README.md`, `CONTRIBUTING.md`, `docs/`). Never assume a layout, a framework or a convention the project does not state or the graph does not show.
6. `mem_search` with the PR number, the ticket number and the branch slug: earlier sessions may hold design decisions the review must respect, and earlier reviews hold what the user discards.

## Step 2: project skills

Load the project skills as the standards say ("Project skills"), picking the ones that match the repository and the touched paths: language skills for the language of the diff, framework skills for the framework the files use (from the manifests: `package.json`, `pom.xml`, `build.gradle`, `pyproject.toml`, `go.mod`), domain skills the project documents. A project without skills is reviewed against the standards and its own documented conventions only. Show a table (skill → already loaded / loading now / not applicable, with the reason) before calling `Skill`. Load only what is missing. When a library API is involved, verify it through context7 before flagging it.

## Step 3: review

Scope: the diff only. Read adjacent files for context (codebase-memory: `search_graph`, `trace_path`, `get_code_snippet`) but report a pre-existing issue only as informational, never as a mandatory change.

Order of the review and of the report: repository → area (package, module, app, as the project's own structure names them) → file, shared code before the code that consumes it, top to bottom inside a file.

Checks, on top of every rule in the loaded skills and in the standards:

Pull request metadata, reported as general comments with no file:
- Title follows `#<id> <branch-slug>` (branch `bugfix/1234-login-button` → `#1234 login-button`).
- The work item is linked in the provider's "work items" or "closes" relation. A bare `AB#<id>` or `#<id>` in the description does not count.

Code:
- Standards: typing (no `any`, no `as`, enums over magic strings, published types reused), lookup tables over conditional chains, short-circuit for one-statement ifs inside hooks, no defensive returns, no silent catch, no hardcoded values a configuration or a registry already manages, comments only where they add value, living docs (stories, examples, API docs) updated with the code they describe.
- Conventions the project itself documents or the graph shows (naming, module boundaries, where mappers, adapters or handlers live, how existing code of the same kind is written).
- Scope: the diff does what the ticket asks, nothing more, nothing less.

Do not flag:
- A clear ternary as a candidate for two short-circuits.
- An icon as "semantically wrong" from its name alone. At most a question.
- Renames of pre-existing identifiers or files. If a name is wrong, present options (table with pros and cons) as a question, never a directive.
- Claims about environments you have not verified (CI, deploy, runtime config): hedge them as questions.

Severity per finding: `blocker` (bug, security, data loss, breaks a convention other code depends on), `should` (skill or convention violation), `nit` (style), `question`, `info` (pre-existing, outside the diff).

## Step 4: summary for the user

Numbered list in the reply language (the template below is in English; translate its labels), grouped in the order of Step 3. One id per location: never bundle several files or lines under one id (five icons missing `aria-hidden` are five points). Every point explained in full sentences, whatever terse mode is active: the user decides from this list. Every finding is listed, nits and questions included; the user discards, never you. Each point:

```
[N] <severity> — <repo>/<path>:<line>
    Rule: <skill or convention behind it>
    What happens: <what the code does now and why it is a problem, 2-4 sentences>
    What to change: <the fix>
    Refactor: <minimal sketch, code block only when it clarifies>
```

After the list, one short line with what was checked and found correct, and one line with totals per severity, informational items apart.

Then ask with `AskUserQuestion` which ids become comments, one option per decision:
- Every question is `multiSelect: true`. Points sharing the same rule and the same fix (the same import moved in three files, the same swallowed catch in two files) are one option whose label joins their ids: `label` = `[3-4-5] <severity> <short rule>`, `description` = the one-line fix plus the file basenames. Points that only look alike but need a different fix or judgement stay separate: `label` = `[N] <severity> <basename>:<line>`.
- At most 4 options per question and 4 questions per call; with more options, chain further calls until every option has been offered.
- Never offer shortcuts such as "all" or "only blockers". Free text through "Other" is still accepted.

Do not proceed until every question is answered.

## Step 5: drafts

One draft per selected id, in the reply language, shown before publishing:

````
[N] <path>:<line>
<Problem in one sentence>. <Fix in one sentence>.

```suggestion
<replacement code, only when a concrete replacement exists>
```
````

One location, one problem, one fix. No preambles, no praise, no rationale essays. Name the rule only when it is not obvious. Let the user edit, drop or merge drafts. Re-show the final set.

## Step 6: publish

Ask, in the reply language, whether to publish these N comments on the pull request. Only on an explicit yes, publish one thread per id through the provider CLI (a grouped option `[3-4-5]` publishes three threads with the same text and its own path and line). Skip any that duplicates an existing thread and say so. No vote, no status change, no description edit, no completion. Report one line per published thread with its id, plus anything that failed and why.

## Memory

After publishing, `mem_save` the accepted and the rejected points (rule plus reason) with the memory project key, so future reviews stop proposing what the user discards. `mem_session_summary` before finishing.
