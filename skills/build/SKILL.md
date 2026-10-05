---
name: build
description: "Executes an approved plan task by task with test-driven development, verification before every claim and a fresh-context review at the end; inline in this session, or in agent mode with a fresh implementer and reviewer per task. Use on /forgerdr:build, 'ejecuta el plan', 'implementa', after /forgerdr:plan is approved."
---

# Build

The plan already did the thinking. Execute it exactly, prove every step with a test you watched fail and then pass, and leave a record that survives compaction.

Input: the approved plan, wherever the spec mode keeps it (conversation and todos, `tasks.md`, or the child work items). Without one, a bounded change executes its approved in-chat design with the same discipline, task-sized.

## Setup

- Isolated branch: `git switch -c <branch> --no-track origin/<base>`, upstream verified. Inside a herdr worktree the branch already exists.
- Ledger: the record that survives compaction. `chat`: `mem_save` per task (started, rulings, result). `openspec`: a `## Ledger` section at the end of `tasks.md`. `azure`: a progress comment on the task's work item at each milestone (azdospec posts them itself inside `/azdo:apply`; without it, `az boards work-item update --discussion`). Harness todos are a live view, never the record.
- Read the plan and the spec. Pre-flight: files the plan names exist where it says, the test command runs.

## Per task

1. Write the failing test. Run it. It must fail for the stated reason; a wrong failure means a wrong test.
2. Minimal code to pass. No production code without a failing test first; code written before the test is deleted and rewritten from the test.
3. Run the suite. Green, all of it.
4. Refactor only while green, only what the task touches.
5. Commit when the plan says so, after asking: permission covers that commit only.
6. Ledger the result and mark the task done.

Plan wrong: decide, write `Ruling: <what> — <why> — <cost if wrong>` in the ledger, continue. Code wrong: root cause first (read the error, reproduce, check recent changes, trace the data), never a symptom fix. Deviating without a ledgered ruling is a decision made in secret.

Only four things stop you: an irreversible or destructive operation, a security-sensitive action, a side effect outside the branch (merge, push to a shared branch, publish), a plan so broken that every path is a guess. Everything else is a ruling.

## Verification before any claim

No completion claim without fresh evidence from this turn. "Tests pass" needs the test command's output with 0 failures. "Build succeeds" needs the build's exit 0. "Bug fixed" needs the original symptom tested. "Regression test works" needs red then green. Words like "should", "probably", "seems to" are a stop sign: run the command instead.

## Agent mode

The user chose "one agent per task" at the plan handoff, or the plan is long enough that its last tasks would run on a compacted context. Same branch, same worktree, tasks strictly sequential: two agents editing one working tree in parallel is a merge conflict with extra steps.

Per task:
1. Dispatch an implementer with the Agent tool (general-purpose, same worktree): the task text verbatim, the plan's global constraints, the interfaces block, the test command, and the rule "TDD, no commit, report the diff summary and the test output". Nothing else from your context: a fresh implementer reads the codebase, not your assumptions.
2. Read its report, then `git diff` yourself: the report is a claim, the diff is the evidence.
3. Dispatch `forgerdr:reviewer` on the task diff with the spec and the plan. Critical or Important: one fix pass by a fresh implementer with the findings as its brief, then the reviewer again. Minor: ledger.
4. Commit when the plan says so, after asking. Ledger the task.

Watching the agents live: run the implementer in a herdr pane instead (`herdr pane split --current --direction right --cwd "$PWD"`, `herdr agent start task-<n> --kind claude --pane <id>`, `herdr agent prompt task-<n> "<brief>" --wait`), one pane at a time, same sequence. Use it when the user wants to see or interrupt the work; subagents otherwise, they are cheaper and leave no topology to clean.

## Finish

- Final review with a fresh context: dispatch a reviewer agent with the spec, the plan and `git diff <base>...HEAD`, asking for findings graded critical / important / minor. Critical and important get one fix pass, each fix red then green with the full suite green; minor goes to the ledger.
- Requirements checklist: re-read the spec, one line per requirement, verified or gap.
- Report: what shipped, what the ledger rulings changed, what is pending. `mem_session_summary` with the memory project key.
