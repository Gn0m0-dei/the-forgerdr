---
name: plan
description: "Writes an implementation plan from an approved spec, as bite-sized tasks an engineer new to the codebase can execute with TDD: exact files, interfaces, failing test, minimal code, verification, commit. Use on /forgerdr:plan, after /forgerdr:spec approves an architectural design."
---

# Plan

Write the plan for an engineer who has not seen this codebase or this spec. They write idiomatic code once they know the exact interface and the exact test; what they cannot know is what you decided. Document that.

Input: the approved design, wherever the spec mode keeps it: the conversation (`chat`), the change (`openspec`), the Feature and its backlog items (`azure`). Without an approval, stop and go through `/forgerdr:spec`.

## Scope

A spec covering several independent subsystems becomes one plan per subsystem, each producing working software on its own. Say so and plan the first.

## File structure first

Load the project skills for the area first (standards, "Project skills"); the plan names, per task, which of them apply, so the implementer and the reviewer get their paths.


Map the files to create or modify and the responsibility of each. One responsibility per file, files that change together live together, existing patterns followed. Lock the decomposition here; tasks follow it.

## Tasks

A task is the smallest unit with its own test cycle that a reviewer could reject while approving its neighbour. Setup, configuration and documentation fold into the task whose deliverable needs them. Each task:

````markdown
### Task N: <component>

**Files:** create `path`, modify `path:lines`, test `path`
**Interfaces:** consumes <exact signatures from earlier tasks>; produces <exact names and types later tasks rely on>

- [ ] Step 1: write the failing test (the test, in a code block)
- [ ] Step 2: run it, expect FAIL with "<message>" (the command)
- [ ] Step 3: minimal code to pass (the code or the exact change)
- [ ] Step 4: run the suite, expect PASS (the command)
- [ ] Step 5: commit (the Conventional Commits message, pending the user's permission)
````

Each step is one action with a checkable result. Values, names and signatures come verbatim from the spec; never leave a choice the spec already made.

## Header

```markdown
# <feature> implementation plan

**Goal:** one sentence.
**Architecture:** 2-3 sentences.
**Spec:** path.

## Global constraints
<one line each, exact values copied from the spec>

## Review focus
<the inputs or failure modes the spec implies but no task's test exercises, most likely first; each one gets a test added to the task that owns the code>
```

## Where the plan goes: the spec mode

- `chat`: the plan is shown in the conversation and mirrored in the session todos; no file unless the user asks.
- `openspec` / `openspec:<store>`: `tasks.md` of the change, from `openspec instructions tasks --change <name> --json` (its numbered checkbox format; the forgerdr task detail goes under each item), in English, then `openspec validate <name> --strict` (with `--store <store>` when set).
- `azure` with azdospec installed: `/azdo:apply` creates the tasks as child work items; it refuses until the requirement has a product-owner approval and an iteration, and says which is missing. The branch is forgerdr's and already follows azdospec's naming, `feature/AB<id>-<slug>` (create it now with the git rules of the standards if the session is not on it yet): tell `/azdo:apply` to use the current branch and the current working tree, and to skip its own branch creation and its per-stream worktrees. Then the plan in chat carries the task ids. Without azdospec: one child Task per task through `az` (providers reference), created after the user approves the plan.

Show the plan, stop, and let the user approve it and choose how it runs: inline (`/forgerdr:build`) or one agent per task. `mem_save` the task list.
