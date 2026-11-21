# Review views

A review opened from the herdr app (`bin/forge-review.sh`: Start work's Review tab, the review key, `/forgerdr:review`) runs in a tab of its own: the forgerdr mod's review view, with the Claude session running `/forgerdr:review-other` or `/forgerdr:review-own` working out of sight behind it, started with `FORGE_REVIEW_VIEW=1`. With that variable set, the session hands the view what it finds through `bin/forge-pr.sh`, and the view answers the session's questions through the inbox: the human picks, edits and stamps there, not in the chat. Without it (outside the app, or a skill typed by hand), the skills work in the chat, as their steps say.

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
