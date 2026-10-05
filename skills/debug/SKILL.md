---
name: debug
description: "Systematic debugging of any bug, failing test, build failure or unexpected behaviour: root cause before any fix, in four phases, with a regression test proven red then green. Use on /forgerdr:debug, 'no funciona', 'falla el test', 'esto peta', and before proposing any fix under time pressure."
---

# Debug

No fix without a root cause. A symptom fix is a failure, and "just this once" is the moment the rule exists for.

## Phase 1: investigate

1. Read the error in full: message, stack trace, line numbers, codes. It often names the cause.
2. Reproduce consistently: exact steps, every time. Not reproducible: gather more data (logs, inputs, environment), never guess.
3. Recent changes: `git log`, `git diff`, new dependencies, config, environment differences between where it works and where it fails.
4. Multi-component systems (CI → build → deploy, API → service → database): instrument every boundary (what enters, what exits, which config reached it), run once, read where the data goes wrong, then investigate that component only.
5. Trace the bad value backwards to where it is born. Fix at the source, not where it hurts.

Codebase-memory first (`trace_path`, `search_graph`, `get_code_snippet`), then the files.

## Phase 2: pattern

Does the same thing work elsewhere in the codebase? What differs? Has this failed before (`mem_search` the error message and the component)? One difference at a time.

## Phase 3: hypothesis

State one hypothesis in one sentence. Design the smallest test that proves or kills it: a log line, a unit test, a request. Run it. Wrong: back to Phase 1 with the new evidence, not to another guess. Three failed hypotheses in a row: stop and tell the user; the architecture or the understanding is what is wrong.

## Phase 4: fix

1. Regression test that reproduces the bug. Run it: it must fail for the reported reason.
2. Minimal fix at the root cause. Run the test: green. Run the suite: green.
3. Revert the fix, run the test: red again. Restore. Only now is the test proven.
4. Report: cause in one sentence, why it was introduced (blame), the fix, the evidence (the three test runs), what else the same cause touched.

No commit without permission. `mem_save` the cause and the fix.
