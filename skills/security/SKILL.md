---
name: security
description: "Security review of a change or a module before it ships: runs the security-auditor agent on the scope, triages its findings with the user, and fixes only what the user picks. Use on /forgerdr:security, or whenever the work touches authentication, user input, secrets, endpoints, uploads, payments or third-party integrations."
---

# Security

A security defect is a blocker, never a nit. The audit is read-only and delegated; the fix is yours and gated.

## Scope

Default: the branch diff (`git diff origin/<base>...HEAD`). The user can name a directory or the whole repository. Add the trust boundaries the project documents (README, architecture notes, routes, handlers, CLI entry points) so the auditor knows where the outside comes in.

## Audit

Dispatch the `forgerdr:security-auditor` agent with the scope and the boundaries. It returns findings graded Critical / High / Medium / Low with file, line, proof and fix. Do not audit inline: a fresh context finds what the author's context rationalized.

## Triage

Show the findings to the user in full sentences, whatever terse mode is active, one id per location, ordered by severity. Then `AskUserQuestion` (multiSelect, one option per finding, at most 4 per question) for which ones to fix now. Critical findings are listed first and recommended; the user still decides.

## Fix

One finding at a time: failing test or reproduction first when the finding is testable (a request that should be rejected, an input that should be escaped), then the minimal fix at the trust boundary, then the test green. Secrets found anywhere: remove, add the ignore rule, and tell the user to rotate them; never claim history is clean after a removal.

No commit without permission. Re-run the auditor on the fixed scope and report the delta. `mem_save` the findings accepted and discarded.
