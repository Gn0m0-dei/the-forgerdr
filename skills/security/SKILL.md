---
name: security
description: "Security review of a change or a module before it ships: audits the scope in a fresh context (the security-auditor agent, or inside the herdr app a security session of its own that audits it), has every critical or high finding challenged by a fresh security-verifier, triages confirmed and needs-validation findings with the user, and fixes only what the user picks. Use on /forgerdr:security, or whenever the work touches authentication, user input, secrets, endpoints, uploads, payments or third-party integrations."
---

# Security

A security defect is a blocker, never a nit. The audit is read-only and runs in a fresh context (the auditor agent, or inside the herdr app the security session itself); the fix is gated.

On the forge floor (`${CLAUDE_PLUGIN_ROOT}/references/flows.md`) this is the `security` cell: `stage security running` as it starts, `waiting` at the triage, `done` once the picked fixes are in. Inside the herdr app the session that launches the security session reports it, `running` at the launch and `done` on the report ("Launch"): a security session launched with an address to report to writes no flow (`forge-flow.sh` skips a session with a parent), and one Start work launched, with nobody waiting on it, keeps its own as any session does. The auditor and the verifiers count on the `review` cell by themselves, except inside the herdr app: there the security session audits itself, and the verifiers it dispatches run under it and do not count on the review cell of the session that launched it.

## Scope

Default: the branch diff (`git diff origin/<base>...HEAD`). In a parent folder of repositories, the diff of each repository the work touched (`${CLAUDE_PLUGIN_ROOT}/references/workspaces.md`). The user can name a directory or the whole repository. Add the trust boundaries the project documents (README, architecture notes, routes, handlers, CLI entry points) so the auditor knows where the outside comes in.

## Inside the herdr app

With `HC_TERMINAL_ID` set, this session runs inside the herdr app, and `/forgerdr:security` runs in a security session of its own (except in a `claude -p` run, whose launch fails: "Launch"): a new Claude session parked out of sight behind its security view, the two in a tab of their own, as a review runs behind its review view (`${CLAUDE_PLUGIN_ROOT}/references/reviews.md`, "The security triage"). The method does not change: every finding shown, the user picks, nothing fixed that was not picked. Which part this session plays:

- `FORGE_SECURITY_VIEW` set: this is the security session; "In the security session" says what it does.
- An agent forgerdr dispatched (`FORGE_REPORT_TO` set, which the dispatch hook gives it, and `FORGE_SECURITY_VIEW` unset) never launches a security session, never opens a view and never asks the user: it audits and triages here, asking the session that dispatched it (standards, Gates).
- Any other session does not audit itself: it launches the security session and waits for its report ("Launch").

### Launch

```bash
"${CLAUDE_PLUGIN_ROOT}/bin/forge-security.sh" launch --scope "<the scope>" [--title "<title>"] [--item "<id>"] --report-to "uds:$CLAUDE_CODE_MESSAGING_SOCKET"
```

`--scope` the scope (Scope), as a command or a path (`git diff origin/main...HEAD`, `src/auth/`); `--title` the work's key and slug (`#18 session-restore`) or the session's title, the branch (else the folder's name) when left out; `--item` the work item's `#<id>` or `EXT-<id>`, left out without one; `--report-to` the address this session is reached at. It opens a tab in this session's space, `Security #18` (`Security` with no work item): the security view, and a `claude` session titled `Security · <title>`, started with `FORGE_SECURITY_VIEW=1` and parked behind the view, running `/forgerdr:security` on the scope with the address to report to and the work item. Its golem hangs under this session's, drawn as the warden once it opens its triage.

Then `forge-flow.sh stage security running`, one line saying that the security session works in its Security tab, and end the turn: its report arrives as a message beginning `Report from security (<title>)`. Never launch another one while it runs. On the report: relay it in the chat (the findings fixed and their commits, what was noted or remembered, the delta of the auditor's re-run), `forge-flow.sh stage security done`, and in the auto flow go on with the flow's next stage (ship).

The triage stays in the chat in this session, as Audit, Verify and Triage say, with one line saying why, when:

- `CLAUDE_CODE_MESSAGING_SOCKET` is empty: no `--report-to` can reach this session, so do not launch;
- `launch` fails (another layout, the app not answering): it says why;
- `launch` prints `"agent_started": false`: its Claude did not come up in time, and might still, which would make a second triage. Close that tab first, `herdr-app do tab.close --id <tab> --confirmed true` with the `tab` it printed, which ends its session; then triage here, saying so in one line.

### In the security session

With `FORGE_SECURITY_VIEW` set, this session was launched for the triage: its prompt is `/forgerdr:security <scope>`, maybe with an address to report to and a work item. It never launches another security session. Its questions reach the user through the inbox: the `Security fix` question waits in the view, the rest (a commit gate, a `Gate comment`) show in the inbox as any other.

- Before the audit: `"${CLAUDE_PLUGIN_ROOT}/bin/forge-security.sh" open <file>` with the audit: `title` the work's key and slug (`#18 session-restore`), else the session's title without its `Security · `; `scope` the scope from the prompt, as a command or a path; `item` the work item's `#<id>` or `EXT-<id>` from the prompt, `""` without one. It starts the triage in the view this session is parked behind, and works only there. When it fails (the app not answering), triage in the chat as Triage says and say why in one line: the view's `Discuss with the golem` shows it. The rest still holds: the report, when the prompt names an address, and `done` at the end.
- Audit it yourself, in this session, instead of dispatching the auditor: this session did not write the code, so its context is the fresh one Audit asks for, and the golem the user watches with `Discuss with the golem` is the one doing the audit. Read the auditor's definition (`${CLAUDE_PLUGIN_ROOT}/agents/security-auditor.md`) and the references it names, and follow its method on the scope, read-only until the triage: the boundaries, every candidate traced from entry to effect, graded confirmed (with severity), needs-validation or rejected, each with the fields the view shows. Then Verify as it says: the verifiers stay agents of their own, a second pair of eyes on each confirmed critical or high finding.
- After Verify: send every finding, confirmed, needs-validation and rejected, with `forge-security.sh findings`, instead of printing the list: ids `S<n>`, `N<n>` and `R<n>` in the order Triage lists them, each in the format `references/reviews.md` gives ("The security triage"), with the verifier's decision on each one it checked. In the chat, one line with the totals. Then the single `Security fix` question (its JSON in the reference) instead of the multiSelect ones; the view answers it with its stamp.
- The answer: the view's `Fix: S1, S2; Note: N1; Remember: N1, N2` (`Fix: none` when no fix is picked; `Note` and `Remember` only when something is picked for them), or ids typed in the pane (Other); `None` is `Fix: none`. `Picked in the view` chosen in the pane names nothing: ask again. The view stays open after its stamp, saying the golem works on the picks, with Discuss to watch.
- Fix exactly the `S` ids Fix names, one at a time, as Fix says, each commit at its commit gate. For each `Remember` id, `mem_save` its question and how to check it. For each `Note` id, draft a note for the work item, the question for its owner and how to check it, never an exploit's detail, and post it only after a `Gate comment` (standards, Gates). A `Note` id when the work has no item (typed in the pane; the view offers no note then) is remembered instead, with `mem_save`, and the report says so.
- Re-run the audit as Fix says, through the `forgerdr:security-auditor` agent this time, not yourself: once this session has written the fixes, its context is the author's. New findings start a new triage in the view: `findings` with them, and the `Security fix` question again.
- Then the report, when the prompt names an address: SendMessage to it, beginning with the line its prompt gives, `Report from security (<title>)`: the findings picked, each fix with its commit, what was noted or remembered, and the re-run's delta. With no address (Start work launched it, and nobody waits on it), no report.
- Only then `forge-security.sh done`: the triage and the terminal's labels go, and the view's tab with them when it holds the view alone and is not its space's last; the sidebar then ends this session, as it ends a review's. A tab that stays says the golem is done, and closing it ends the session.
- Findings never leave the machine: nothing of the triage reaches the provider but a note stamped at its gate.

## Audit

Dispatch the `forgerdr:security-auditor` agent with the scope, the boundaries and the paths of the project skills that cover it (standards, "Project skills"). It returns confirmed findings with severity, needs-validation findings without severity, and rejected candidates. Do not audit inline: a fresh context finds what the author's context rationalized. The security session inside the herdr app is that fresh context, and audits itself ("In the security session").

## Verify

Dispatch one `forgerdr:security-verifier` per confirmed critical or high finding, in parallel, each with that finding, the scope and the project skill paths. Take its decision: a rejected finding moves to rejected, a needs-validation one loses its severity, a corrected severity or fix replaces the auditor's. Medium and low go to triage as the auditor wrote them.

## Triage

This is the triage in the chat: outside the herdr app, in an agent forgerdr dispatched, or when the security session could not be launched ("Launch") or its `open` failed; in the security session, the view shows the same list and asks instead. Show the user, in full sentences whatever terse mode is active, one id per location:

1. **Confirmed**, by severity: who, input, the control that fails, the path, the effect, the fix and its regression test, and whether a verifier checked it.
2. **Needs validation**: the path, the fact the code cannot show and how to check it in the environment. These are questions for the owner, not bugs.
3. **Rejected**: one line each, so nobody re-reports them.

Then `AskUserQuestion` (multiSelect, one option per confirmed finding, at most 4 per question) for which ones to fix now. Critical findings are listed first and recommended; the user still decides. Needs-validation items are offered as checks to note on the work item or in memory, not as fixes.

## Fix

One finding at a time: the regression test the finding names first, failing today (a request that should be rejected, an input that should be escaped), then the smallest fix at the last trusted decision point, then the test green. Secrets found anywhere: remove, add the ignore rule, and tell the user to rotate them; never claim history is clean after a removal.

No commit without a commit gate (standards, Gates). Re-run the audit on the fixed scope by dispatching the `forgerdr:security-auditor` agent (never inline: whoever wrote the fixes is their author) and report the delta, in the chat or, in the security session, in its report. New findings start a new triage: new critical or high ones go through Verify first, and the new confirmed and needs-validation ones are triaged together, in the view in the security session (`findings` and the `Security fix` question again), else in the chat. `mem_save` the findings accepted and discarded.
