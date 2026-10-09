---
name: security
description: "Security review of a change or a module before it ships: runs the security-auditor agent on the scope, has every critical or high finding challenged by a fresh security-verifier, triages confirmed and needs-validation findings with the user, and fixes only what the user picks. Use on /forgerdr:security, or whenever the work touches authentication, user input, secrets, endpoints, uploads, payments or third-party integrations."
---

# Security

A security defect is a blocker, never a nit. The audit is read-only and delegated; the fix is yours and gated.

## Scope

Default: the branch diff (`git diff origin/<base>...HEAD`). The user can name a directory or the whole repository. Add the trust boundaries the project documents (README, architecture notes, routes, handlers, CLI entry points) so the auditor knows where the outside comes in.

## Audit

Dispatch the `forgerdr:security-auditor` agent with the scope, the boundaries and the paths of the project skills that cover it (standards, "Project skills"). It returns confirmed findings with severity, needs-validation findings without severity, and rejected candidates. Do not audit inline: a fresh context finds what the author's context rationalized.

## Verify

Dispatch one `forgerdr:security-verifier` per confirmed critical or high finding, in parallel, each with that finding, the scope and the project skill paths. Take its decision: a rejected finding moves to rejected, a needs-validation one loses its severity, a corrected severity or fix replaces the auditor's. Medium and low go to triage as the auditor wrote them.

## Triage

Show the user, in full sentences whatever terse mode is active, one id per location:

1. **Confirmed**, by severity: who, input, the control that fails, the path, the effect, the fix and its regression test, and whether a verifier checked it.
2. **Needs validation**: the path, the fact the code cannot show and how to check it in the environment. These are questions for the owner, not bugs.
3. **Rejected**: one line each, so nobody re-reports them.

Then `AskUserQuestion` (multiSelect, one option per confirmed finding, at most 4 per question) for which ones to fix now. Critical findings are listed first and recommended; the user still decides. Needs-validation items are offered as checks to note on the work item or in memory, not as fixes.

## Fix

One finding at a time: the regression test the finding names first, failing today (a request that should be rejected, an input that should be escaped), then the smallest fix at the last trusted decision point, then the test green. Secrets found anywhere: remove, add the ignore rule, and tell the user to rotate them; never claim history is clean after a removal.

No commit without permission. Re-run the auditor on the fixed scope and report the delta. `mem_save` the findings accepted and discarded.
