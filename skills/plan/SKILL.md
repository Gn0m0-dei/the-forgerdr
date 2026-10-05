---
name: plan
description: "Writes an implementation plan from an approved spec, as bite-sized tasks an engineer new to the codebase can execute with TDD: exact files, interfaces, failing test, minimal code, verification, commit. Use on /forgerdr:plan, 'haz el plan', after /forgerdr:spec approves an architectural design."
---

# Plan

Write the plan for an engineer who has not seen this codebase or this spec. They write idiomatic code once they know the exact interface and the exact test; what they cannot know is what you decided. Document that.

Input: the approved spec (`docs/specs/<date>-<feature>.md`) or, for bounded work, the approved in-chat design. Without an approval, stop and go through `/forgerdr:spec`.

## Scope

A spec covering several independent subsystems becomes one plan per subsystem, each producing working software on its own. Say so and plan the first.

## File structure first

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

Save to `docs/plans/<yyyy-mm-dd>-<feature>.md`, in English. Show the plan, stop, and let the user approve it and choose how it runs: inline (`/forgerdr:build`) or one agent per task. `mem_save` the plan path and the task list with the memory project key.
