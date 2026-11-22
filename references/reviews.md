# Review and security views

A review opened from the herdr app (`bin/forge-review.sh`: Start work's Review tab, the review key, `/forgerdr:review`) runs in a tab of its own: the forgerdr mod's review view, with the Claude session running `/forgerdr:review-other` or `/forgerdr:review-own` working out of sight behind it, started with `FORGE_REVIEW_VIEW=1`. With that variable set, the session hands the view what it finds through `bin/forge-pr.sh`, and the view answers the session's questions through the inbox: the human picks, edits and stamps there, not in the chat. Without it (outside the app, or a skill typed by hand), the skills work in the chat, as their steps say.

A security triage inside the app goes the same way: `bin/forge-security.sh launch` opens a security session parked behind its security view, in a tab of their own, and the session hands the view what it finds through the same script: see [The security triage](#the-security-triage).

## The commands

From the review session, each given a JSON file, or `-` for stdin:

```bash
"${CLAUDE_PLUGIN_ROOT}/bin/forge-pr.sh" open <other|own> <file>   # the pull request; starts the review afresh
"${CLAUDE_PLUGIN_ROOT}/bin/forge-pr.sh" findings <file>           # another's pull request: what the review found
"${CLAUDE_PLUGIN_ROOT}/bin/forge-pr.sh" threads <file>            # the user's own: its open threads
"${CLAUDE_PLUGIN_ROOT}/bin/forge-pr.sh" drafts <file>             # the comments or replies drafted
"${CLAUDE_PLUGIN_ROOT}/bin/forge-pr.sh" results <file>            # what publishing did, a line per thread
"${CLAUDE_PLUGIN_ROOT}/bin/forge-pr.sh" drafted                   # the drafts as the view holds them, edits included
"${CLAUDE_PLUGIN_ROOT}/bin/forge-pr.sh" stamped                   # the drafts as the human stamped them
```

A file that is not JSON, or does not have the shape below, is refused, naming what is wrong, and changes nothing: fix it and send it again. `findings` (a review of another's pull request only) clears the picks, the drafts and any stamp; `threads` is for a review of the user's own; `drafts` clears the stamp, which was for other drafts. The human edits the drafts in the view as they come: before sending `drafts` again, read them with `drafted` and change only what was asked, or the human's edits are lost.

## The formats

The pull request (`open`); the counts and `checks` (`passing`, `failing`, `pending`) are optional:

```json
{"url": "https://github.com/acme/shop/pull/42", "number": 42, "title": "pane-resize-debounce",
 "source": "feature/#42-pane-resize-debounce", "target": "main", "author": "quench-dev",
 "items": ["#38 resize storms on split"], "files": 4, "additions": 96, "deletions": 21, "checks": "passing"}
```

The findings (`findings`), in the order the skill reports them. `severity` is `blocker`, `should`, `nit`, `question` or `info`; `path` is `""` and `line` `null` for the pull request itself; `title` is the finding in a few words; `context` (the lines around it, `mark` the line it is on), `refactor`, `group` and `discarded` are optional. Findings that share the same rule and the same fix share a `group` and become one row to pick, `[2-6]`. `discarded` is true when memory says the user usually discards that rule: the row goes last in its severity, tagged, never hidden.

```json
[{"id": "1", "severity": "blocker", "path": "crates/pty/src/resize.rs", "line": 48, "title": "unwrap on a full channel",
  "rule": "Panics are for bugs, not for a full channel.",
  "happens": "try_send(size).unwrap() panics when the resize channel is full.",
  "change": "Keep the latest size and drop the rest on Full.",
  "refactor": "match tx.try_send(size) {\n    Ok(()) | Err(TrySendError::Full(_)) => {}\n    Err(TrySendError::Closed(_)) => return Err(PaneGone),\n}",
  "context": {"start": 46, "lines": ["let size = PtySize::from(cells);", "", "tx.try_send(size).unwrap();"], "mark": 48},
  "group": "", "discarded": false}]
```

The threads (`threads`), each with the proposal for it: `fix`, `reply` or `ask`. `commit`, `subject` and `tests` come once the fix is pushed: send the threads again with them.

```json
[{"id": "1", "author": "tinker-ana", "path": "ui/src/inbox/drawer.rs", "line": 88,
  "request": "Can this list virtualize?", "proposal": "fix", "detail": "Render only the visible cards.",
  "commit": "7c41e2a", "subject": "fix(ui): virtualize the inbox list", "tests": "52 tests passed"}]
```

The drafts (`drafts`), one per picked row, its `id` the row's (a finding's id, a grouped row's ids joined by `-`, a thread's id), its `locations` one per thread it publishes (a grouped row has several, all with the same text). A reply to a thread of the user's own pull request takes the thread's `id`, and `resolve` true when publishing it resolves the thread (its fix was pushed). `suggestion` is optional.

```json
[{"id": "2-6", "locations": [{"path": "crates/pty/src/resize.rs", "line": 22}, {"path": "crates/daemon/src/pane.rs", "line": 64}],
  "body": "16 is the debounce window: name it RESIZE_DEBOUNCE so both call sites share it.", "suggestion": "", "resolve": false}]
```

The results (`results`), a line per thread: `status` is `published`, `duplicate` (an existing thread already says it), `failed` (with its `reason`), `resolved` or `open` (a reply that waits for the reviewer); `url` opens the thread.

```json
[{"id": "1", "path": "crates/pty/src/resize.rs", "line": 48, "status": "published", "url": "https://github.com/acme/shop/pull/42#discussion_r1"}]
```

## The questions the view answers

**The picks.** After `findings` (or `threads`), one `AskUserQuestion`, single-select, header exactly `Review pick`:

```json
{"header": "Review pick", "question": "Which findings become comments? Tick them in the review view.", "multiSelect": false,
 "options": [{"label": "Picked in the view", "description": "The rows ticked in the review view beside this session"},
             {"label": "None", "description": "No comments"}]}
```

The view answers `Picked: 1, 2-6, 3` (the ids of the rows picked, a grouped row's ids joined by `-`) or `None`; the pane accepts the same forms typed through Other. Draft one comment per row named.

**The stamp.** After `drafts`, the usual comment gate (standards, Gates): header `Gate comment`, `Publish` and `Not yet`, the drafts in the preview. The view answers it only when the same Claude session asked for the picks, after the drafts were sent and before anything was published; any other gate of the terminal waits in the pane. The view's stamp saves the human's edits, freezes the drafts and answers `Publish`. On `Publish`, publish exactly what `forge-pr.sh stamped` prints. When it prints nothing, the gate was answered in the pane: compare what `forge-pr.sh drafted` prints with the drafts of the gate's preview; the same, publish them; different (the human edited them in the view after the gate was asked), ask the gate again with `drafted` in its preview, since a yes covers only the drafts it showed. The view answers the gate in two other ways while the human works on the drafts: `Draft also: 3, 7-9` (rows ticked after the drafts: read the drafts with `drafted`, add one for each row named, send `drafts` again and ask again) and `Not yet` (every draft dropped: publish nothing, send no results). Any other answer changes the drafts: read them with `drafted`, apply the change to them, send `drafts` again and ask again. Then send `results`, which ends the view's hold on the terminal's questions: a gate asked after it shows in the inbox as any other. Another round (more threads after another push) starts with `open` again, which starts the review afresh.

## The security triage

`/forgerdr:security` inside the herdr app (`HC_TERMINAL_ID` set), which the auto flow's `security` stage runs too, runs in a security session of its own (design 06d). The session that runs the command does not audit: `launch` opens a tab in its space, `Security #18` (`Security` for an audit with no work item), with the security view and a Claude session titled `Security · <title>`, started with `FORGE_SECURITY_VIEW=1`, parked out of sight behind the view and running `/forgerdr:security` on the scope; the launching session then waits for its report, a message beginning `Report from security (<title>)`. Start work's Security tab launches the same session by hand on the checkout or worktree picked (`bin/forge-prompt.sh security`), with nobody waiting on a report. The security session's golem hangs under the session that launched it (with none, among its space's sessions), and a click on it opens its Security tab; once the session opens its triage (`open` labels its terminal, `done` clears it), it is drawn as the warden, reading `TRIAGE`; `Discuss with the golem` peeks at the session over the tab, and closing the tab ends it, as for a review. It launches only inside the herdr app showing the `forgerdr` or `forgerdr-dev` layout, unless `--mod` names the copy of the mod; anywhere else `launch` fails, saying why, and the triage stays in the chat of the session that ran the command, as the skill's Triage says. An agent forgerdr dispatched never launches one: it asks the session that dispatched it.

From the session that runs `/forgerdr:security`:

```bash
"${CLAUDE_PLUGIN_ROOT}/bin/forge-security.sh" launch [--cwd PATH] [--mod NAME] [--title TITLE] [--item ID] [--scope TEXT] [--report-to ADDRESS] [--no-agent]
```

The session runs in the folder (`--cwd`, else this one), at its repository's top level inside git. The scope defaults to the branch diff, or to the folder's files out of git, the title to the branch (else the folder's name); `--mod` names the copy of the mod the view runs in (else the layout's); `--no-agent` parks a shell instead of the session. It prints `{"tab", "terminal", "title", "agent_started"}`; a tab it opened but could not finish goes, the session in it with it. With `--report-to`, the security session sends its report there once it is over, and it carries the launching session's terminal (`FORGE_PARENT_TERMINAL`): its golem hangs under that session's, and it writes no flow, so the launching session reports the `security` cell.

From the security session, each given a JSON file, or `-` for stdin:

```bash
"${CLAUDE_PLUGIN_ROOT}/bin/forge-security.sh" open <file>       # the audit; starts the triage afresh in the view this session is parked behind
"${CLAUDE_PLUGIN_ROOT}/bin/forge-security.sh" findings <file>   # every finding, verified or not, in the order the triage lists them
"${CLAUDE_PLUGIN_ROOT}/bin/forge-security.sh" done              # the triage and its fixes are over, the report sent
```

The mod reads a terminal's triage with `forge-security.sh show <terminal>`, `null` when it has none. A triage is a file per herdr terminal in `~/.local/state/forgerdr/security/` (the folder `700`, the files `600`; a file a week untouched goes) and never leaves the machine. `open` works only in the security session `launch` opened, behind its view; in any other terminal (a review session's, whose questions go to its review view, or one with no view behind it) it fails, saying so, and changes nothing. It prints the view's tab and labels the session's terminal `forge.review=security` and `forge.view=<the view's tab>`, which send its `Security fix` question to the view; `findings` needs a triage opened first and replaces the findings sent before, which starts the view's picks over; `done` takes the labels and the triage away, and the view's tab with them when the tab holds the view alone and is not the last of its space: the sidebar then ends the session parked behind it, as it ends a review's. A file that is not JSON, or does not have the shape below, is refused, naming what is wrong, and changes nothing: fix it and send it again.

The audit (`open`): `title` the work's key and slug, else the session's title without its `Security · `; `scope` what was audited, as a command or a path; `item` the work item it is for (`#<id>`, `EXT-<id>`), `""` without one, which leaves the view's `Note on the issue` out.

```json
{"title": "#18 session-restore", "scope": "git diff origin/main...HEAD", "item": "#18"}
```

The findings (`findings`): every one, `confirmed`, `needs-validation` and `rejected`, its `id` `S<n>`, `N<n>` or `R<n>` in the order the triage lists them (confirmed by severity, the most serious first, then needs-validation, then rejected). Each has `status`, `path` (`""` with no file), `line` (`null` with none) and `title`, the finding in a few words. A confirmed one has `severity` (`critical`, `high`, `medium` or `low`) and tells `who` reaches it, the `input`, the `control` that fails, the `trace` from the entry to the effect, the `effect`, the `fix` and its regression `test`; a needs-validation one, the `fact` the code cannot show and how to `check` it; a rejected one, its `reason`. `verifier` is `null` for a finding no verifier checked, else its decision: `verdict` `confirmed` (kept, its severity unchanged or raised on new evidence), `downgraded` (kept at a lower severity), `needs-validation` or `rejected`, and `was`, the severity the auditor gave, which the view names on a downgrade (`VERIFIER: DOWNGRADED FROM HIGH`).

```json
[{"id": "S1", "status": "confirmed", "severity": "high", "path": "crates/daemon/src/restore.rs", "line": 41,
  "title": "session file read through a symlink", "who": "another local user",
  "input": "a symlink planted in the sessions folder", "control": "none: restore() opens the path as given",
  "trace": "load_session() -> restore() -> File::open(path)", "effect": "reads any file the user can read",
  "fix": "open with O_NOFOLLOW and refuse what is not a regular file", "test": "a symlinked session file is refused",
  "verifier": {"verdict": "confirmed", "was": "high"}},
 {"id": "N1", "status": "needs-validation", "path": "crates/daemon/src/log.rs", "line": 77, "title": "token in the debug log",
  "fact": "whether the shipped build logs at the debug level", "check": "read the log level of the release configuration",
  "verifier": {"verdict": "needs-validation", "was": "high"}},
 {"id": "R1", "status": "rejected", "path": "crates/daemon/src/socket.rs", "line": 12, "title": "control socket open to all",
  "reason": "its folder is created 700", "verifier": null}]
```

**The fix question.** After `findings`, one `AskUserQuestion`, single-select, header exactly `Security fix`:

```json
{"header": "Security fix", "question": "Which findings get fixed now? Pick them in the security view.", "multiSelect": false,
 "options": [{"label": "Picked in the view", "description": "The findings ticked in the security view beside this session"},
             {"label": "None", "description": "Fix nothing now"}]}
```

The view answers it with its stamp (`Stamp: fix N`): `Fix: S1, S2; Note: N1; Remember: N1, N2`, the confirmed findings to fix, then the needs-validation ones to note on the work item and to remember. With no confirmed finding picked it answers `Fix: none`; `Note` and `Remember` come only when something is picked for them (`Fix: none; Remember: N1`). The pane accepts the same forms typed through Other; `None` is `Fix: none`, and `Picked in the view` chosen in the pane names nothing: ask again. The view answers only a `Security fix` question asked after the findings were sent, the oldest if several wait; one asked before them still shows in the inbox as a card that opens the view, which does not answer it: answer it in the session's pane (Discuss). The session's other questions (a commit gate, a `Gate comment` for a note) show in the inbox as any other.

After the stamp the view stays, saying the golem works on the picks one at a time and closes the tab when it is done, with `Discuss with the golem` to watch it. The session fixes exactly the `S` ids named, each regression test red then green, each commit at its commit gate; `mem_save`s each `Remember` id's question and how to check it; drafts each `Note` id's note for the work item (the question for its owner and how to check it, never an exploit's detail) and posts it only after its `Gate comment`; with no work item (a `Note` typed in the pane), it remembers it instead. Then it re-runs the auditor on the fixed scope: new findings start a new triage in the view, `findings` with them and the `Security fix` question again. Once it is over, the session sends its report with SendMessage when its prompt names an address, beginning `Report from security (<title>)`: the findings picked, each fix with its commit, what was noted or remembered, and the re-run's delta; the session that launched it relays the report in its chat, reports the `security` cell done and goes on. Only then `done`, which ends the view's hold on the terminal's questions and closes its tab when it holds the view alone and is not its space's last; a tab that stays says the golem is done, and closing it ends the session. Nothing of the triage reaches the provider but a note stamped at its gate.
