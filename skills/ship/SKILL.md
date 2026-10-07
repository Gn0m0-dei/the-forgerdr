---
name: ship
description: "Finishes a development branch: fresh verification, rebase onto the updated base, final review, commit with permission, first push with its own upstream, pull request through the provider CLI with the work item linked, and the worktree left or removed as the user says. Use on /forgerdr:ship, after /forgerdr:build or /forgerdr:workitem."
---

# Ship

Nothing leaves the machine without fresh evidence and an explicit yes.

## 1. Verify

Run the project's checks now, in this turn: tests, lint, typecheck, build, whatever `package.json`, `Makefile` or the CI workflow define. Quote the output. Red: stop here and fix with `/forgerdr:debug`.

## 2. Rebase

`git fetch origin`. The branch must not track the base: `git rev-parse --abbrev-ref @{upstream}` fails or names the branch itself. `git rebase origin/<base>`; conflicts resolved one file at a time, the suite green again afterwards. Verify the hashes changed only for the branch's own commits.

A working tree mounted by a running container must not be rebased with the container up; warn and let the user stop it first.

## 3. Security

Auto flow (`ship` reached from `/forgerdr:workitem --auto`): dispatch the `forgerdr:security-auditor` agent on `origin/<base>...HEAD` and triage its findings with the user as `/forgerdr:security` does; Critical and High get a fix pass before the review. Otherwise: when the diff touches authentication, user input, secrets, endpoints, uploads, payments or dependencies, suggest `/forgerdr:security` in one line before going on.

## 3b. Review

Dispatch the `forgerdr:reviewer` agent on `origin/<base>...HEAD` with the spec and the plan when they exist. Critical and Important findings get one fix pass, each fix red then green. Minor goes to the pull request description's "known" line or is dropped by the user.

## 4. Commit

Uncommitted work: ask permission for the commit, Conventional Commits in English, `Closes: #<id>` when the branch carries a work item. Permission covers that commit only.

## 5. Push and pull request

`git push -u origin HEAD`. Then the pull request through the provider CLI (`${CLAUDE_PLUGIN_ROOT}/references/providers.md`): base = `<base>`, title `#<id> <slug>` (or the branch name without id), description in English with Problem, Cause, Change, Verification (the commands and their results from step 1), and the work item linked through the provider's relation. Show the title and the description as a draft first; publish on an explicit yes. No AI mention anywhere.

Report the pull request URL. The work item's state changes only when the user says.

Spec mode `azure` with azdospec installed: the pull request is azdospec's (`/azdo:apply` opens it linking the requirement and its tasks); after the merge, `/azdo:archive` folds the delta into the spec store. Spec mode `openspec`: after the merge, archive the change (`openspec archive` with the CLI; otherwise apply the deltas to `openspec/specs/` and move the change folder under `openspec/changes/archive/<yyyy-mm-dd>-<name>/`).

## 6. Worktree

A herdr worktree stays open until the pull request merges unless the user asks: then `herdr worktree remove --workspace <id>` and the branch is kept. `mem_save` the pull request, the branch and what is pending.
