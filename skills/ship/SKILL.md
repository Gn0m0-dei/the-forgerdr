---
name: ship
description: "Finishes a development branch: fresh verification, rebase onto the updated base, final review, commit with permission, first push with its own upstream, pull request through the provider CLI with the work item linked, and the worktree left or removed as the user says. Use on /forgerdr:ship, after /forgerdr:build or /forgerdr:workitem."
---

# Ship

Nothing leaves the machine without fresh evidence and an explicit yes.

On the forge floor (`${CLAUDE_PLUGIN_ROOT}/references/flows.md`) this is the `ship` cell: `stage ship running` as it starts, `pr <number> <url>` once the pull request is open, `stage ship done` at the end.

## 1. Verify

Run the project's checks now, in this turn: tests, lint, typecheck, build, whatever `package.json`, `Makefile` or the CI workflow define. Quote the output. Red: stop here and fix with `/forgerdr:debug`.

## 2. Rebase

`git fetch origin`. The branch must not track the base: `git rev-parse --abbrev-ref @{upstream}` fails or names the branch itself. `git rebase origin/<base>`; conflicts resolved one file at a time, the suite green again afterwards. Verify the hashes changed only for the branch's own commits.

A working tree mounted by a running container must not be rebased with the container up; warn, and ask with `AskUserQuestion` (standards, Gates), whose options need no typing: `Stop it for me` (you stop it) and `I stopped it`.

## 3. Security

Auto flow (`ship` reached from `/forgerdr:workitem --auto`): nothing to run here. The flow's `security` stage ran `/forgerdr:security` just before ship, on every path (an OpenSpec change at its `ship` stage starts at `security`), and the fixes the user picked went in before the review; go on to Review, with no `stage security` report from here. Outside the auto flow: when the diff touches authentication, user input, secrets, endpoints, uploads, payments or dependencies, suggest `/forgerdr:security` in one line before going on.

## 4. Review

Dispatch the `forgerdr:reviewer` agent on `origin/<base>...HEAD` with the spec and the plan when they exist and the paths of the project skills that cover the diff (standards, "Project skills"). Critical and Important findings get one fix pass, each fix red then green. Minor goes to the pull request description's "known" line or is dropped by the user.

## 5. Commit

Uncommitted work: ask permission for the commit with a commit gate (standards, Gates), Conventional Commits in English, `Closes: #<id>` when the work has a work item (the branch's id, or the one the OpenSpec change references), `Refs: EXT-<id>` when that item is of an external backlog (`${CLAUDE_PLUGIN_ROOT}/references/items.md`). Permission covers that commit only.

## 6. Archive the OpenSpec change

Spec mode `openspec` or `openspec:<store>`, with a change for this work (the change of the current work, `${CLAUDE_PLUGIN_ROOT}/references/items.md`): when every task in `tasks.md` is ticked, run `openspec archive <name> --yes` (with `--store <store>` when set). It applies the deltas to `openspec/specs/` and moves the change under `openspec/changes/archive/`. In the repository it is one more commit on this branch, asked like any other, so the pull request carries the code, the updated specs and the archived change together. In a store it is a commit in the store repository, never made without the user's permission. Tasks still open: do not archive; list them in the pull request description.

## 7. Push and pull request

A push gate, then `git push -u origin HEAD`. Then the pull request through the provider CLI (`${CLAUDE_PLUGIN_ROOT}/references/providers.md`): base = `<base>` (for a `hotfix/` or `release/` branch the production branch, then a second pull request from it back into `<base>` when they differ, standards "Branch names"), title `#<id> <slug>` (or the branch name without id), description in English with Problem, Cause, Change, Verification (the commands and their results from step 1), and the work item (the branch's id, or the one the OpenSpec change references) linked through the provider's relation. An item of an external backlog is never linked: title `EXT-<id> <slug>` and `EXT-<id>` in the description, with no URL. The title and the description are the draft of a PR gate; publish on its yes. No AI mention anywhere.

Report the pull request URL. The work item's state changes only when the user says.

Spec mode `azure` with azdospec installed: the pull request is azdospec's (`/azdo:apply` opens it linking the requirement and its tasks), on the branch forgerdr created, pushed on the yes of a `Gate push` and opened on the yes of a `Gate PR`, as above (standards, Gates), whose preview also names the work items it links, if any, and says that its merge closes them. After the merge, `/azdo:archive` folds the delta into the spec store: say so in the report, it is the user's to run.

## 8. Worktree

A worktree stays, with its herdr space, until the pull request merges unless the user asks: then `"${CLAUDE_PLUGIN_ROOT}/bin/forge-worktree-remove.sh" <path>`, which closes its space and keeps the branch. `mem_save` the pull request, the branch and what is pending.
