# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the versions follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- A question answered in its pane with `Chat about this` stayed in the herdr app's inbox, its hook waiting, for a day: Claude Code neither ends that hook nor runs the tool, so nothing settled it. `hooks/inbox.sh stop` now takes away, at the session's next `Stop`, every request its main thread still asks, and their hooks leave without a decision; a subagent's requests stay, told apart by the `agent_id` each request now records.

## [0.34.0] - 2026-11-21

### Added

- `hooks/inbox.sh stop`, on Claude Code's `Stop`: inside the herdr app, a turn whose final message asks a question typed in the chat (outside fenced code, inline code and links), which no inbox sees, is sent back once to ask it with `AskUserQuestion`. An agent forgerdr dispatched asks the session that dispatched it instead.
- `Gate item`: creating a work item or writing any of its fields is a gate that leaves the machine, asked like the others.

### Changed

- Whatever a session needs from the user is asked with `AskUserQuestion`, so it reaches the herdr app's inbox, the gates of understanding too: a verdict, a proposal, a design or a plan is written in the chat and its approval asked under a `Verdict`, `Proposal`, `Design` or `Plan` header. A `! <command>` the work waits on is told in a plain line, and a `/rename` hint is a passing line. The skills and references follow `rules/standards.md`.
- The forge floor names a gate of understanding from its question's header (`WAITING · PLAN GATE`) instead of `WAITING · QUESTION`.
- The forgerdr layout gives the open forge a frame of its own grey: forge-night's canvas (`#111015`) is the shelf under the forge tabs, chrome (`#18171c`) the open forge's frame (the sidebar, the session bar, the room around the panes, the golem lanes, the status bar, the inbox drawer and the active forge tab), and background stays the terminals'. A line under the top bar closes the sidebar and the inbox from above, and the active forge tab sits on it. The status bar is 33 px tall, so the folded golem lanes' top line meets the sidebar footer's, and the sign beside the sidebar's gnome leaves room before the forge's name.
- In the inbox, no card opens while a stamp shows: the next one opens as the stamped card goes.

### Fixed

- The inbox's stamp was centred on the whole card, out of sight on a long card answered at its buttons. It now lands over the middle of what shows of the card. The stamped card's room also keeps its height at any zoom, so the cards below no longer drop while it slides off.

## [0.33.0] - 2026-11-21

### Added

- Review views in the forgerdr layout (designs 06b and 06c): each pull request opens in a tab of its own, `#42 review` or `#40 mine`, showing the forgerdr mod's view alone while its review session works out of sight (`Discuss with the golem` peeks at it; closing the tab ends it; the sidebar lists it as a golem of the forge), the gnome thinking while it reads, drafts or publishes, and the tab closing by itself once every thread is published. A colleague's pull request shows its findings by severity, each opening to its rule, what happens, what to change, the code and the sketch, ticked one by one; the drafts are edited in place, a draft that names AI or its tools keeps the stamp back, and `Stamp gnomemark and publish N` freezes the drafts and answers the session's comment gate, so it publishes exactly those. Your own pull request shows a card per open thread with its fix, reply or question and its reply drafted, and one stamp publishes the replies and resolves the fixed threads. `review-other` and `review-own` use the view when `FORGE_REVIEW_VIEW` is set and the chat otherwise; the inbox sends their picks and comment gate to the view.
- `bin/forge-pr.sh` keeps each review in `~/.local/state/forgerdr/reviews/`, a file per herdr terminal that the review session and the mod write under its lock; `references/reviews.md` gives the formats and the questions.
- Review rounds (design 06): the review icon on an agent's pane header snapshots what it changed into a round and opens its rounds in a tab: every changed file with its lines numbered on both sides, viewed marks, the strip of rounds, what changed since the round before or since the base, and comments on lines that follow them from round to round. `Request changes` sends the open comments to the agent as one prompt, `Stamp gnomemark` makes the round its new base. `bin/forge-round.sh` pins the snapshots under `refs/forgerdr/rounds/<terminal>/` without touching the index, HEAD or stash, taking the base when a session starts.

### Changed

- Start work's Review tab takes a field per pull request and `Add another` for one more, instead of a box of lines.
- `bin/forge-review.sh` opens each pull request in a tab of its own with its review view, instead of tabs named `Reviews` with as many agents as fit; `--mod` picks the copy of the mod the views run in.

## [0.32.0] - 2026-11-21

### Added

- The forge floor: `FLOOR`, beside `INBOX` in the forgerdr layout's top bar (or `forgerdr.floor`), opens over the window every item the Claude sessions work, in every forge, as an accordion with a section per forge (its gnome, its name, its counts) that folds on a click, all open at first and remembered. Each item is a card: its key and title, its type and mode, what it waits on or does (`WAITING · COMMIT GATE`, `FORGING · BUILD`, `CRACKED`, `DONE · PR #40`, `ENDED`), its branch and its dev server's port, and the cells of its flow. An auto flow shows the cells its pipeline will run; a manual one shows every step that can be launched, lit only where it was; a step that will not run shows a ✕. A cell launched more than once says how often (`×3`), and `REVIEW` counts every reviewing agent. Under the strip, its progress pass by pass, a square each (`8 OF 10 DONE`: three reviews are three passes), and, while the build runs, its tasks red or green. `WAITING` opens the inbox, or the item's pane when what it waits on is asked there; `discuss` goes to the pane; a finished item leaves once its session ends; the agent sessions that report no flow come last. `FLOOR` counts the items that wait on you.
- `bin/forge-flow.sh` keeps each item's flow in `~/.local/state/forgerdr/flows/`, a file per herdr terminal that only its own session writes. `hooks/flow.sh` records every `/forgerdr:<command>` typed in a session, the dispatch hooks count every reviewing agent, and the skills report what only they know (the item's key and type, the stages of the auto flow, the build tasks, the pull request), as `references/flows.md` says. Outside the herdr app nothing is written.

## [0.31.0] - 2026-11-20

### Fixed

- `install.sh` stopped halfway when a tool could not be installed: zypper failing on `azure-cli` was only noted, and the azure-devops extension step then failed on the missing `az` and ended the run. A failed step is now noted and the rest still run, a step that needs a missing tool is skipped, and the run ends by checking every piece, naming what is still missing and failing. On openSUSE, Node.js comes from `nodejs-default` and `npm-default` together, since Tumbleweed no longer ships `nodejs22` and `nodejs-default` alone brings an `npm` that does not run; the global npm packages go through `sudo`, since npm's prefix there is `/usr`; and the Maple Mono NF font comes from its release, which openSUSE does not package. `~/.local/bin` is added to the PATH in the login shell's rc instead of a note asking for it.
- `install.sh` left the setup half done: the plugin, forgerdr's look in the herdr app and the sign-ins were steps to run by hand afterwards. It now installs the `forgerdr` and `azdo` plugins with their marketplaces, forgerdr's layout, theme, mod and alert sounds, and its status line, and offers the sign-ins it finds missing; every piece is skipped when it is there, so another run changes nothing. Claude Code, the herdr app and git are prerequisites it checks first, and no longer installs.
- `install.sh` poured every command's output on the terminal. It now opens with the forgerdr logo in the forge's colours, checks the prerequisites, shows each piece as here or to install and asks before it starts, then gives a line a piece with a spinner meanwhile and a summary at the end; the commands' output goes to `~/.local/state/forgerdr/install.log`, and a piece that fails shows the last lines it left there. On openSUSE, sudo is asked once at the start. `NO_COLOR` turns the colours off.
- There was no way back: `uninstall.sh` lists the pieces on the machine now, removes the ones ticked, in an order that keeps what each needs until it is gone, and names what could not be removed. Claude Code, the herdr app, git and the person's data stay.

## [0.30.0] - 2026-11-20

### Added

- The approval inbox: a drawer of the forgerdr layout, opened from `INBOX` in the top bar or `forgerdr.inbox`, with what waits on your mark in every session, a card each, by clicks: a tool's permission (`Allow once`, `Deny with reason`), a question (its options, an answer of your own), one of forgerdr's gates (`Stamp`), a plan (`Approve plan` into auto mode or approving each edit, `Revise`), and an agent waiting in its pane. Each card shows its forge's gnome and name, the branch and the session, and every field of what an allow applies, whole; `Discuss` goes to its pane. An answer stamps the card with the gnomemark (gold for a yes, red for a no) and its sound, a rubber stamp synthesised by `herdr/tools/sounds.mts`, drawn by `herdr/tools/sprites.mts`; the card trembles, then slides away. `hooks/inbox.sh` puts the requests there on Claude Code's `PermissionRequest`, for a session in a herdr terminal, and turns the answer into Claude Code's decision; the pane's own dialog stays open and whichever answers first wins, and a card answered in the pane goes. `bin/forge-inbox.sh` lists the requests and writes the answers. A convenience, not a lock: the drawer says so.

### Changed

- The gates on what leaves the machine (a commit, a push, a pull request, a comment or a reply to publish, a work item's state or assignment) are asked with `AskUserQuestion`, headed `Gate <kind>` with the draft beside the yes, so they reach the inbox; the gates of understanding stay in the chat (standards, Gates).
- `INBOX` in the top bar counts what waits in the inbox and opens it, instead of going to the first agent waiting.

### Fixed

- The sidebar's tree listed only two levels: a session and the agents it dispatched. An agent dispatched by an agent, and the subagents inside an agent's session (a Task, a background shell), were missing; the golem lanes showed them. The tree now goes as deep as they do, a step further in each level.

## [0.29.0] - 2026-11-19

### Added

- The forge's sounds: `bin/forge-herdr-install.sh --sounds` makes the app's alerts the hammer working the piece on the anvil (blocked) and the hiss of a quench (done), keeping a sound of the person's own unless `--force`; `--remove` takes them away. The mod sounds a golem's crack when an API error breaks it, while the app's sounds are on. Synthesised by `herdr/tools/sounds.mts`, with no one else's licence, and offered by `/forgerdr:setup`.

### Fixed

- The ✕ of a forge tab, a session tab, a pane's header and the forge heat and manual dialogs, and the chevron that folds the sidebar, did nothing: they were controls on a bare icon, an svg, where the app never wires a click. They are icons wrapped in a div now (`iconButton`), and a test fails on a control put on a bare icon. A control also stops its click as the app's own buttons do, so a ✕ no longer sets off the tab or header under it, and a session tab acts on a release only when the press started on it.

## [0.28.0] - 2026-11-19

### Added

- The forge's own New and Remove worktree dialogs, from the `+` beside the repository in the sidebar, a forge's menu, and `forgerdr.worktree-new` and `forgerdr.worktree-remove`. New worktree takes an optional issue or work item and a title, previews the branch forgerdr names, its folder, its base and its dev server's free port as you type, and opens it as a space with a shell. Remove worktree lists the panes that close and keeps the branch; it lists the uncommitted files and offers to discard them with it, and removes nothing while a golem is at work or waiting on you there.
- `Start the dev servers` in Start work when the items start in worktrees, and `--no-dev` for `/forgerdr:worktree` and `bin/forge-worktree.sh`.
- `--plan` for `bin/forge-worktree.sh` and `bin/forge-worktree-remove.sh`, which say what a run would make and make nothing, and `--kind feature|fix` with `--title`, which names an item's branch without asking the provider.
- Three more branch kinds, as Conventional Branch names them, picked by hand in the New worktree dialog or with `--kind`: `chore`, `hotfix` (from the production branch, `main` or `master`, instead of the base) and `release` (named by its version, `release/v1.2.0`). The skills still name an item's branch `fix` or `feature`, and open a `hotfix/` or `release/` branch's pull request to the production branch, then one back into the base.
- `--discard` for `bin/forge-worktree-remove.sh`: it throws uncommitted work away and, unlike `--force`, still refuses while an agent is at work in one of the worktree's spaces.
- Icons for a new worktree and for removing one, in the icons' pixel style.

### Changed

- A right click on a checkout's row of the sidebar opens the forge's menu on that space, with forgerdr's worktree dialogs, instead of the app's space menu.
- A worktree's dev server gets the first free port from 3000, so it no longer takes the main clone's.
- `bin/forge-worktree.sh` and `bin/forge-worktree-remove.sh` open and close the app's spaces whenever the app answers, also from outside its terminals, and a worktree given as `--repo` stands for its repository.

### Fixed

- Branch names from a title failed in a shell with no UTF-8 locale, as the herdr app runs its mods' commands: `forge_slug` now spells accented letters in ASCII in any locale.
- A branch that versions a symlink where the clone keeps an ignored env file, or in its way, could have the env file written outside the new worktree: the copy now skips it and names it.
- Removing a worktree could close a space of another machine open on the same path: only this machine's spaces are closed.
- An item id typed in lowercase (`ab#12`) named no branch.
- An item typed as forgerdr writes one of an external backlog, `EXT-231`, was refused: it names an `EXT-231` branch.

## [0.27.0] - 2026-11-19

### Added

- The forge's mode, at the foot of the sidebar where the forge heat was: Chat, OpenSpec (in the repository, or in another folder registered or made as an OpenSpec store), Azure DevOps, GitHub or GitLab, each with the backlog its work comes from: the origin's project or repository on that provider, else the one named with `Work with another backlog` by any URL of it (issues on GitLab for code on GitHub, work items of another organization). On Azure DevOps the backlog `/azdo:init` keeps in the clone's git config is read, shown filled in and editable, and changed there. The sidebar's foot shows the mode and the backlog's organization or owner, and the code's too, a line each, when the work comes from elsewhere. Its dialog keeps it per project with `bin/forge-config.sh`, whose new `mode` and `backlog` settings set the spec mode the skills read; `Forge mode…` in a forge's menu and `forgerdr.mode` open it too.
- Start work, from `START WORK` under the forge's gnome (a hammer on the folded sidebar), `Start work…` in a forge's menu or `forgerdr.start`: what the forge's mode takes (what to work on in Chat, issues by URL or #number in GitHub and GitLab, work items by URL or id in Azure DevOps, changes to tick and new ones to spec in OpenSpec), here or in worktrees, manual or auto, as `/forgerdr:workitem`, `/forgerdr:worktree` or `/forgerdr:spec`; and Review, the same in every mode, for pull request URLs of any provider. A preview says what each line starts and skips what it cannot.
- `forge_openspec` in `bin/forge-lib.sh` runs the OpenSpec CLI through mise when it is not on the PATH, as in a shell that is not interactive, and `bin/forge-start.sh` reads a forge's mode and its OpenSpec changes and stores.
- Icons for the hammer, OpenSpec, the board, pull requests and ideas, in the icons' pixel style.

### Changed

- The sidebar's foot shows the forge's mode instead of its heat: what its golems do is in the gnome's mood and the golem lanes.
- `bin/forge-prompt.sh review` takes the pull request URLs as arguments too, and then closes its tab once the reviews are open.

### Fixed

- An Azure DevOps origin through an ssh alias of `~/.ssh/config` (`git@<alias>:v3/<org>/<project>/<repository>`) was taken for an unknown provider: `forge_provider` reads any `:v3/` path as Azure DevOps.

## [0.26.0] - 2026-11-19

### Added

- The gnome's dialog, so each project keeps a face of its own: its name, each part (hat, colour, eyes, beard, accessory) turned by hand through its options with a live preview, a re-roll for a whole new gnome and the way back to the one its repository rolls. What you keep lasts across restarts, by the repository (by the space outside git). A double click on the sidebar's gnome opens it.
- A forge's menu, on a right click on its tab or on the sidebar's gnome: `Edit gnome…`, then what the app's space menu does: rename the forge (as a double click on its tab), new, open and remove worktree, close.

### Fixed

- Gnomes no longer show a passing face after a restart: the sidebar no longer forgets what git said of each space before the app has loaded them, and keeps it until git answers again, so every forge shows its own gnome from the first frame. A new space is asked about at once instead of at the next poll.
- A forge outside git takes its gnome from its space, not from the folder the app gives the space, which is where its new terminals start and not where it is.

## [0.25.0] - 2026-11-19

### Added

- Each forge's gnome is whole from the forge's key: its hat and the hat's colour, its beard, its eyes and what it wears over them, the same on every start and machine. A double click on the sidebar's gnome renames it; an empty name gives it back its brother's.
- The gnome's moods follow its golems: needs you, cracked (with smoke beside it), working, done, idle, and asleep with no golem.
- The forge's own notifications (the layout's `toast`): the gnome of the forge a notification is about tells it, in its level's colour and mood, coming in three 90 ms steps and leaving the same way when clicked, never taking the keyboard.
- Golems by kind: iron for a session, stone for an agent in a terminal of its own, clay for a subagent inside its session, which the tree now lists under it too.

## [0.24.0] - 2026-11-19

### Added

- The golem lanes under the panes, an accordion that stays whatever tab shows: the golems every session of the active space spawned (agents in terminals of their own and subagents inside a session), the most urgent first, each with what it is doing now, its context, how long its current task has taken and its status. Folded, one line with how many there are and the most urgent; unfolded, every lane. A lane goes to its terminal on a click; `forgerdr.lanes` folds and unfolds them from a key.
- CRACKED: `hooks/golem-state.sh` labels a session's herdr terminal when its turn ends in an API error (Claude Code's `StopFailure`, with the error's kind), and the tree, the lanes and the forge's heat show it until the human writes to that session again. It also keeps when each task started and stopped, which the lanes time.

### Changed

- Agents forgerdr dispatches open in a tab of agents of the session, next to its tab, as many panes as fit, then another tab: the session's own pane is never split.
- An agent forgerdr dispatches knows the terminal of the session that dispatched it (`FORGE_PARENT_TERMINAL`) and labels its own terminal with it at its start, so the sidebar's tree and the lanes list it under that session.

### Fixed

- The status line lost the sessions' contexts when many sessions wrote at once (their golems showed no context): each session now keeps its context in a file of its own terminal (`usage/sessions/<terminal>.json`), and every file the status line writes is written whole.

## [0.23.0] - 2026-11-18

### Added

- The forgerdr layout's status bar, in place of the app's: the account's profile, the subscription's forge heat (the 5-hour window and the week, each with its steps and its reset, coloured from 80 % and 95 % with a notification the first time each is crossed in a window), Herdr's update when one is ready and `? MANUAL`, which opens the forgerdr cheat sheet over the window. A window whose reset has passed is hidden rather than shown at 0 %.
- Golems that show their session's context: the percentage in grey before each golem in the sidebar, and its chest as a crucible that fills from the bottom with molten metal, a quarter at a time (a half on a clay golem), white hot from 80 % and blinking from 90 %. The status line keeps each session's context by the herdr terminal it runs in (`sessions.json`).
- The forge heat window, which the status bar's profile opens: each window with its stepped bar, its use, when it resets on the local clock and its history, a bar per half hour of the 5 hours and a bar a day of the week.
- `bin/forge-statusline.sh`, Claude Code's status line for forgerdr: it keeps the subscription's windows, merged across sessions (each window's newest period and the highest use any session sent), and a week of samples in `~/.local/state/forgerdr/usage/` and hands the same JSON on to the status line the user had, whose output still shows. `install` (offered by `/forgerdr:setup`) and `remove` change `settings.json` after a backup; `status` says what it hands on to and what it last saw.

### Changed

- The forgerdr mod knows the plugin it came from (`name.js` has its root), so it can read the plugin's references.

## [0.22.0] - 2026-11-18

### Added

- Motion, after the design's motion table, in steps and never eased: a flame beside the gnome of a forge at work, a blinking `!` beside it and on its tab while a golem waits on the human, a spark when one is done, and a rising zZ over a forge with no golem and over the empty state. The signs are the frames of a font of forgerdr's own, `ForgerdrGlyphs.ttf`, which `herdr/tools/glyphs.mts` writes from `herdr/tools/design/motion-frames.txt` with no dependency; the app steps them natively, so they stop while the window is not drawn. `forgerdr.motion` (a key in `keys.json`, or `herdr-app do forgerdr.motion`) turns motion off and on.

## [0.21.0] - 2026-11-18

### Added

- The forgerdr layout's session bar, in place of the app's tab bar: a tab per session of the open space with the icon of what runs in it, coloured by what its golem does, the tab that opens a session, the Files and Changes switches (each space keeps its panel) and the controls that split and zoom the focused pane. A session tab shows, renames (double click), closes (✕), reorders (drag) and opens the app's tab menu (right click); the wheel goes from tab to tab.
- Pane headers in the forgerdr look: the pane's name, its folder and its golem's status, or `RUNNING` for a program that is not a shell; a ✕ under the pointer closes the pane.
- The forge's empty state: with no space left, the work area shows the sleeping gnome and a button that opens a folder as a forge with the system's folder picker.

### Changed

- Pane frames follow the design: square, in the line colour, in the accent while the pane has the keyboard. The sidebar's tree scrolls with the theme's scrollbar.

## [0.20.0] - 2026-11-18

### Added

- The forgerdr layout's sidebar, in place of the app's spaces and agents lists: the forge's gnome and brother with what its golems do, the tree of the forge on show (the repository, its main checkout and worktrees with their branch, work item and how far each is from its upstream, the agents in each and their sub-agents, each with its status) and the forge's heat at its foot. Its rows show, rename and open the app's space menu for a space, and go to an agent's pane; a chevron folds it to a rail of the gnome and its golems. The app's Settings and Add machine stay at its foot.

### Changed

- The top bar shows a forge tab per repository, its main checkout and worktrees together, instead of one per space. A tab acts on the space it shows, its double click renames the forge, and dragging it moves the forge's spaces together.

## [0.19.0] - 2026-11-18

### Added

- The forgerdr layout's top bar: a forge tab per space with its gnome and a badge of what its golems do, the tab that opens a space, the inbox of agents waiting on the human, which goes to the first, and the command palette with the key it has in `keys.json`. A forge tab shows, renames (double click), closes (✕ or middle click) and reorders (drag) its space, and opens the app's own space menu on a right click; when the tabs do not fit, the strip scrolls with the trackpad and with arrows that appear on its sides. The bar drags the window and leaves room for macOS's window buttons; the app's own panels stay under it.

## [0.18.0] - 2026-11-18

### Added

- The forgerdr mod's kit and pixel art, from the forgnome design: chips, key buttons, forge and session tabs, tree rows, pane headers, the gnome's header, the empty state, the toast and the meters, drawn in the design's faces and the theme's colours; 21 pixel icons, gnome heads in parts and the iron, clay and stone golems, generated as SVG layers by `herdr/tools/sprites.mts` from the design's exports, so hat colours and theme tones tint them. A `gallery` role shows them all.

## [0.17.0] - 2026-11-18

### Added

- The `forgerdr` layout for the herdr app, drawn from the forgnome design: the `forge-night` theme, Pixelify Sans and Silkscreen for the panels (SIL OFL, in `herdr/mods/forgerdr/fonts/`) and Maple Mono NF for the terminals, over the app's own window for now. `bin/forge-herdr-install.sh` installs it into the app's home, updates what it installed and leaves what the user changed; `--dev [--watch]` installs a checkout beside it as `forgerdr-dev` and keeps it in step; `/forgerdr:setup` offers it. The look's mods come as roles of one `forgerdr` mod, since a herdr app mod cannot read another mod's files.
- `install.sh` installs Maple Mono NF on macOS.
- `pnpm typecheck:herdr` checks the mod's JavaScript against the type files the herdr app writes.

## [0.16.0] - 2026-11-18

### Changed

- `/forgerdr:review` and `/forgerdr:workitem` with several items open their sessions in new tabs of their own, named `Reviews` and `Work items` (`Reviews 2` and on when the name is taken in the space), never in the tab they are launched from: the first session fills a tab, each next one splits the largest pane that leaves both halves at least 80×15, and the group goes on in a new tab when none does. The tabs are shown while they fill, because the app sizes the panes of the shown tab only, and the first session is shown at the end. `forge-session.sh` takes `--group NAME` and several `--title TITLE <prompt>` pairs for it.
- A dispatched agent gets a pane next to the session again, as in the herdr TUI: the first one halves the session's pane, each next one the largest agent pane that keeps both halves at least 80×15, so they form an even grid, and once none can be halved the agent opens a tab of agents (`agents · <session>`) in the background, which the next ones fill the same way. The panes are split with `pane.split`, which runs the agent as it is, so its terminal ends with it, and the user keeps the pane they were in. The app sizes the panes of the shown tab only: a pane in another tab is taken at the size the dispatch gave it. A session with no pane of its own still starts its agents as sub-agents, listed under it in the Agents sidebar; one with `isolation: "worktree"` is still a pane of its worktree's space.

## [0.15.0] - 2026-11-17

### Changed

- **Breaking: forgerdr drives the herdr desktop app instead of the herdr TUI.** The app (`herdr-app`) and herdr-core (`hc`), which runs its terminals and agents, replace the `herdr` CLI everywhere; the TUI and the app run separate servers and share nothing, so forgerdr supports one of them. The TUI version stays on the `tui` branch as 0.14.x, installed with `/plugin marketplace add Gn0m0-dei/the-forgerdr#tui`. The fan-outs and the agent dispatch work inside a terminal of the app (`HC_TERMINAL_ID` set); outside it the worktree hook keeps making plain git worktrees.
- A dispatched agent runs as a sub-agent of the session in a herdr-core terminal of its own, which the app lists under the session in its Agents sidebar with its live status, instead of a pane in a grid next to the session or a tab of agents: the app gives a tab its added terminals as ever-thinner splits, so no grid holds. One with `isolation: "worktree"` is a pane of its worktree's space. It starts through the user's login shell, as the app starts agents, so it gets the user's environment (a login `sh` with the session's `PATH` for a shell neither of the sh family nor fish, such as nushell); hc types no note about it into the session; the folder trust prompt is accepted once from its reported status, and an agent that reports nothing within a minute, or a terminal that cannot be ended, never also runs in-process. A reopened agent keeps its name and resumes its Claude session.
- The agent's state lives only in its record: the app shows working, blocked and done from what Claude Code reports by itself, so the `▶ working` / `⏸ waiting` / `✓ done` pane labels and the `PermissionRequest` and `AskUserQuestion` hooks that set them are gone.
- `/forgerdr:worktree` makes each worktree with git where the app keeps its own (`worktrees.directory` in the app's settings, `~/.herdr/worktrees` by default) and opens it as a space that does not take the focus, named after the item, with the titled agent in its first tab and the dev server in a second tab, `dev :<port>`. A worktree path already taken stops the run before anything is made.
- `/forgerdr:review` opens one tab per pull request, the first one shown, instead of one tab split into a grid; `/forgerdr:workitem` opens its tabs with `herdr-app` and shows only the first of several (`forge-session.sh --no-focus`).
- Claude Code's own worktrees (`hooks/worktree.sh`) are git worktrees opened as app spaces in the background; forgerdr records the spaces it opens and closes them with their worktrees, and as orphans once their folder is gone, when a session starts or ends. While the app does not answer, the record stays and the space is closed later.
- The scripts moved from `herdr/bin/` to `bin/`.

### Added

- `bin/forge-worktree-remove.sh [--force] <path>`: removes a linked worktree and then closes its spaces, keeping its branch; it refuses a path that is not the top of a linked worktree, uncommitted work, the worktree the session stands in, the space it runs in, and a space where an agent is at work, and leaves the spaces open when git refuses. A space counts as at work whenever the app's answer does not say otherwise. The Bash guard points to it when it refuses `git worktree remove` inside the app, and `/forgerdr:ship` uses it.
- `bin/forge-setup-keys.sh`: two keys in the app's `keys.json`, Cmd+Alt+P (review pull requests) and Cmd+Alt+T (items in worktrees), Ctrl+Alt on Linux, each opening a prompt tab that closes when done. It keeps every other key, refuses one already in use, finds the installed plugin when the key runs, and `--remove` takes its keys away. `/forgerdr:setup` offers it and says that the app then stops adding its new default keys to an edited `keys.json`.
- `test/fakes.sh`, fake `hc` and `herdr-app` that log every call, and `test/herdr-app.test.sh` for the library functions over them and the scripts; the dispatch and worktree tests run against them.

### Fixed

- `/forgerdr:review` no longer stops on a pull request whose host is neither Azure DevOps, GitHub nor GitLab: `forge_pr_is_mine` compared variables it never set, which bash 5 refuses under `set -u`.

### Removed

- The herdr TUI plugin (`herdr/herdr-plugin.toml`, its actions and panes) and its keys in `~/.config/herdr/config.toml`; `/forgerdr:setup` reports them as leftovers.
- `herdr notification show` after a fan-out: the app already notifies when an agent finishes or needs you.

## [0.14.0] - 2026-11-16

### Added

- Work items of an external backlog: an Azure DevOps organization other than the repository's remote, as when a client hosts the code and another company runs the backlog. Everything that stays in the repository names such an item `EXT-<id>`: the branch (`feature/EXT-<id>-<slug>`), the commit footer (`Refs: EXT-<id>`, never `#<id>`, which Azure Repos links to the item with that id in the repository's organization) and the pull request title, with no `--work-items` and no backlog URL. `forge_item_external` detects it from the item's URL, `/forgerdr:worktree` names the branch, and existing `EXT-<id>` branches are reused. Where the backlog is lives in `git config azdospec.organization` and `azdospec.project`, the keys azdospec's `/azdo:init` writes; without azdospec, the first external item worked offers to save them.

### Fixed

- `forge_azure_org` reads the organization of a legacy `https://<org>.visualstudio.com/...` URL and of a git remote, including an SSH remote whose host is an alias of `~/.ssh/config`, instead of returning nothing.
- Pull request threads, work item comments and work item types work in an Azure DevOps organization reached only with a personal access token, such as a guest account in a client's organization: the providers reference reaches them through `az devops invoke` instead of `az rest`, which signs in with `az login` alone. The thread list also skips deleted threads, which the API returns.
- The providers reference resolves an SSH host alias with `ssh -G` before choosing the provider, takes the organization and project from the URL at hand before the remote's, decodes the project (`%20`), always passes `--organization`, and documents a personal access token per organization (`az devops login --organization`) next to `az login`.

## [0.13.1] - 2026-11-15

### Fixed

- A herdr workspace no longer stays open after its Claude Code worktree is removed where no hook sees it, with `git worktree remove` or `rm` from Bash or a terminal. Inside herdr, `hooks/worktree.sh` closes the workspaces of `.claude/worktrees/` checkouts gone from disk when a session starts or ends, and when Claude Code asks to remove a worktree that is already gone; the one the session stands in and one where an agent is still working or asking stay.
- `hooks/guard-bash.sh` refuses `git worktree remove` inside herdr and points to `herdr worktree remove --workspace <id>`, which closes the workspace with the worktree; the standards say the same.

## [0.13.0] - 2026-11-06

### Added

- A dispatched agent's herdr pane label shows its state and its current task: `▶ working · <task>`, `⏸ waiting · <task>` while it waits for a permission, an answer or agents of its own, and `✓ done · <task>` once it has reported. `hooks/agent-state.sh` (which replaces `hooks/agent-report.sh`) keeps it up to date from the agent's own SessionStart, UserPromptSubmit, PermissionRequest, AskUserQuestion and Stop hooks.
- `hooks/agent-message.sh` on PreToolUse for SendMessage: a message to an agent the session dispatched, addressed by its herdr agent name, goes to that agent's session. To an agent that is done it is its next task: worded with the same report instructions as the first one, its label taking the message's summary. To one still on its task, such as an answer to its question, it goes as it is. When its pane was closed, the agent is reopened in a new pane of the grid, resuming its Claude session (`claude --resume`) with its own model, tools and permission mode, and the call is answered with a reason that says so. Each dispatched agent's record (its pane, task, Claude session, message address and arguments) lives in `~/.local/state/forgerdr/worktrees/<session>.agents/` and goes with the session's sweep.

### Changed

- The standards forbid personal or sensitive data (an email, a name, an account id, a token, a hostname or a local path) in a `User-Agent`, `From` or custom client header, in code, scripts and commands; a site that asks automated clients to identify themselves gets a generic client name, and a demand for a personal contact goes to the user. The security audit's general classes check outgoing request headers for the same leak.
- The report reminder counts from the agent's current task, not its first one: an agent given a second pass that ends its turn without reporting is reminded again, and is shown as waiting if it ends it once more.
- The build skill and the standards send a fix pass, or a second review of a reviewer's own findings, to the agent that did the first one instead of a fresh agent; a new task, a final review and a security verification still get a new agent.

## [0.12.0] - 2026-11-06

### Added

- A dispatched agent that has sent its report says so in its pane, `✅ DONE: report delivered … You can close this pane now`, and its herdr pane title becomes `✓ done · <task>`, so finished agents are easy to spot and close by hand. Talking to it afterwards does not repeat either.

### Changed

- Agents dispatched inside herdr form an even grid instead of one ever thinner column: each new agent halves the largest agent pane of the session along its longer side (a row counts as two columns), never below 80 columns by 15 rows, and the session keeps its half of the tab. When no agent pane can be halved, the agent opens a new tab, `agents · <session>`, in the same workspace without taking the focus, and the grid goes on there; a tab whose agents are all closed by the sweep goes with them.

### Fixed

- `test/agent-dispatch.test.sh` no longer reaches the real herdr or the session running it: it clears the herdr and messaging variables and routes every herdr call to its fake.

## [0.11.0] - 2026-11-06

### Added

- `hooks/agent-dispatch.sh` on PreToolUse for Agent: inside herdr every subagent runs as its own Claude session in a herdr pane instead of inside the session, so it can be watched and talked to. One with `isolation: "worktree"` opens in its herdr worktree's workspace; any other in a new pane of the current tab, stacked in one column. The agent gets its definition (instructions through `--append-system-prompt-file`, its own tool list through `--tools` plus what reporting needs, no MCP servers unless the list names them), the dispatching session's permission mode, and its model unless the call or the definition names one; it reports back with SendMessage. Nested agents work the same way. A fork, a type it cannot reproduce or that is not a plain name, a session that cannot receive messages, and every agent outside herdr stay in-process; inside herdr each fallback is logged to `~/.local/state/forgerdr/worktrees/dispatch.log`.
- `hooks/agent-report.sh` on Stop: a dispatched agent that has not sent its report yet is reminded once per turn; once it has, talking to it in its pane brings no reminder.
- The SessionEnd sweep closes the agent panes the session opened while they still hold that agent and it is done, and leaves worktrees where an agent is still at work.
- `FORGE_CLAUDE_ARGS` adds its words to every `claude` the scripts and hooks start.

### Fixed

- Starting an agent in a new herdr pane no longer fails while the pane's shell is still starting (`agent_pane_busy`), which a slow login shell such as nushell made common in `/forgerdr:worktree`, `workitem` tabs and the new dispatch.

## [0.10.0] - 2026-11-05

### Added

- `hooks/worktree.sh` on `WorktreeCreate`, `WorktreeRemove` and `SessionEnd`: Claude Code's own worktrees (`EnterWorktree`, subagents with `isolation: "worktree"`, `claude --worktree`) open as herdr workspaces inside herdr, nested ones included, and as plain git worktrees outside it, under the main checkout's `.claude/worktrees/<name>` on branch `worktree-<name>`, with no upstream. The base follows Claude Code's `worktree.baseRef`: `fresh` starts from the forgerdr base on origin, `head` from the asking directory's HEAD. Ignored `.env*` files and the files `.worktreeinclude` names are copied, non-ASCII names included, and `.claude/worktrees/` is excluded locally. Removing one closes its herdr workspace, refuses while uncommitted work remains, and deletes only the worktree's own branch, while it still points where it started or once it is merged. When a session ends, the worktrees it created with no change and no commit are removed from herdr and git, detached so the cleanup outlives Claude Code and logged to `~/.local/state/forgerdr/worktrees/sweep.log`; worktrees with work, the one the session stands in and one another session also holds stay.

### Changed

- The worktree rule in the standards: Claude Code's own worktrees are allowed again, since the hook routes them through herdr; `git worktree add` from Bash stays forbidden.
- Ignored file names with non-ASCII characters are copied into `/forgerdr:worktree` worktrees too (git no longer quotes them).
- Biome 2.6: the configuration is migrated and Markdown stays unformatted, since Biome does not recognise the YAML frontmatter of skills and agents.

### Fixed

- The cheat sheet listed a `--manual` flag that does not exist: the manual flow is the default and needs no flag.
- `workitem` opening one tab per item now passes `--auto` on to them in its example too, as its flow section says.

## [0.9.0] - 2026-10-23

### Changed

- The spec mode decides what `workitem` and `worktree` take as an item and how its branch is named (`references/items.md`, standards "Branch names"): in `openspec`, an OpenSpec change or a work item URL, the branch built from the change (`feature/#<id>-<slug>` when it references a work item, `feature/<change>` otherwise); in `azure`, a work item URL and `<kind>/AB<id>-<slug>`; in `chat`, a work item URL or free text, the branch asked with two or three proposals. A branch that already carries the work is reused; for a work item, any branch with its id.
- Several items are separated by `|`, and only by `|`, so free text with spaces is one item.
- `workitem` on an OpenSpec change continues from its stage: `spec` while the proposal, specs or design are open, then `plan`, `build` and `ship`.
- `forge-worktree.sh` takes `--branch` and `--title` before an item, resolves every branch before creating anything and stops when one is checked out elsewhere, reuses a branch that carries the item's id and a branch the remote already has instead of starting a new one from the base, and in spec mode `openspec` copies an uncommitted OpenSpec change from the main clone into the worktree.
- The herdr `worktree` action reads items up to an empty line and starts a Claude session running `/forgerdr:worktree` on them, so it follows the spec mode too.
- Every worktree inside herdr is a herdr worktree, created the way `/forgerdr:worktree` creates them and removed with `herdr worktree remove`; never `git worktree add`, `EnterWorktree` or a subagent isolated in its own worktree. `build` in agent mode keeps every implementer in the branch's worktree, strictly sequential.
- `spec`, `plan`, `build` and `ship` find the change of the current work from the arguments or the branch, take "no change" for a work item that has none or for new work instead of an unrelated active change, and ask when nothing decides, never picking an active change on their own; `spec` continues an existing change instead of creating it again; `build` names the branch by the spec mode. Every `openspec` command takes `--store` in `openspec:<store>`.
- `Closes: #<id>` follows the work's work item, from the branch or from the OpenSpec change.

### Fixed

- `/forgerdr:worktree <change>` failed with "no item id": every argument was read as a work item URL.
- `workitem` would have opened tabs in a loop for an item without an id: the session title is checked against the item's key, and free text goes on in any titled session.
- Agent names in `forge-worktree.sh` and `forge-session.sh` always fit herdr's rule (`[a-z][a-z0-9_-]{0,31}`) and are unique per item: the work item id, or a checksum of the branch or the title. Items without an id no longer stop the run at `agent start`, and one prompt can no longer reach another item's agent.
- `forge-worktree.sh` stops before creating anything when two items resolve to the same branch, and keeps the upstream of a reused branch that tracks itself on `origin`.
- `review-other` no longer reports a missing id or work item on a pull request whose branch has none by design, and reviews the diff against the OpenSpec change it carries.

## [0.8.0] - 2026-10-21

### Added

- `hooks/guard-bash.sh` strips AI attribution (`Co-Authored-By` naming a vendor product or a bot address, "Generated with/by <vendor>", the robot emoji) from commit and pull request commands when it sits on its own line, tells the agent what it stripped, and refuses the command otherwise, including inside `-F` and `--body-file` files. Human co-authors who share a first name with a model are left alone.
- `hooks/scrub-unicode.sh`: PostToolUse on Write, Edit and MultiEdit that strips zero-width, bidi, tag and stray BOM characters from the written file, keeps joiners next to emoji or non-Latin text, reports NBSP and exotic spaces, and skips binaries and invalid UTF-8.

## [0.7.0] - 2026-10-11

### Changed

- Spec mode `openspec` runs on the OpenSpec 1.x CLI end to end: `openspec new change <id>-<slug>`, each artifact written from `openspec instructions <artifact> --json`, `openspec validate --strict` before showing anything, `tasks.md` ticked during `build`, and `openspec archive --yes` on the branch before the pull request, so code, updated specs and the archived change merge together. The hand-written fallback is gone: its format failed `validate --strict`. A repository without `openspec/` is not initialized on a feature branch; `openspec init --tools claude` is proposed on the base branch.
- `openspec:<path>` becomes `openspec:<store>`: an OpenSpec store registered with `openspec store register`, used through `--store`. Reset a previous `openspec:<path>` value with `/forgerdr:mode`.
- Spec mode `azure`: branches follow azdospec's naming, `feature/AB<id>-<slug>` and `fix/AB<id>-<slug>`, in `worktree`, `workitem` and the standards; `/azdo:apply` is told to use that branch and the current working tree instead of creating its own branch and per-stream worktrees. Pull request titles drop either id form from the slug.
- `forge-config.sh` moves to `herdr/bin/`, next to the scripts that read it.

### Fixed

- Spec mode `azure` with work that starts from an existing backlog item no longer runs `/azdo:propose`, which would have created a second Feature for it: the item is the requirement, its missing acceptance criteria and task checklist are drafted and written to it on a yes, and `/azdo:apply` runs on it.
- `worktree` described the agent as starting in the root pane; it starts in its own pane since 0.3.0.

### Added

- `test/openspec.test.sh`: smoke test of the OpenSpec CLI contract (init, new change, status, instructions, strict validation, archive, stores) in a throwaway `HOME`; required in CI.
- `install.sh` installs the OpenSpec CLI; `/forgerdr:setup` checks it, the store registration and the repository initialization in the `openspec` modes.
- CONTRIBUTING: a tool is supported only after reading its docs and running its CLI for real, and every change walks the mode × command matrix.


## [0.6.0] - 2026-10-09

### Changed

- Security review reworked: the `security-auditor` reports only findings it can trace from a lower-trust actor through a failing control to a concrete effect, graded confirmed (critical, high, medium, low with explicit anchors), needs-validation (the decisive fact is outside the code, no severity) or rejected, each with the smallest fix and its regression test; it follows sibling paths and sad paths and skips checklist gaps without a reachable effect. Domain references under `references/security/` (general, web and auth, client side, supply chain, data isolation, availability, cloud and config, AI and agents) are read when they apply.

### Added

- `security-verifier` agent: every confirmed critical or high finding is challenged by a fresh agent before the user triages it.

## [0.5.2] - 2026-10-07

### Fixed

- A session started at a workspace root now gets the skills inside each repository below it listed by repository, with their paths; Claude Code only loads the root's.
- Internal function names mangled by the 0.4.0 rename (`forge_worktreespace_root`, `forge_worktreetree_of`) are back to `forge_workspace_root` and `forge_worktree_of`.

## [0.5.1] - 2026-10-07

### Fixed

- Project skills were only loaded by `review-other`. A standards rule now makes every step that writes, changes, plans or reviews code load the project's skills that cover it (repository, workspace and plugin), with the loaded/loading/not applicable table, and pass their paths to every subagent; `workitem`, `spec`, `plan`, `build`, `debug` and `ship` point to it, and the `reviewer` and `security-auditor` agents read the skills they are given before the diff.

## [0.5.0] - 2026-10-07

### Added

- `--auto` on `workitem` and `worktree`: chains the pipeline after the brief: a bug goes root cause → fix → security → ship; a backlog item goes spec (the item is the spec) → research → plan → build → security → ship. Without it, the manual flow stops after the proposal and suggests the next command.
- `ship` runs the security auditor on the branch diff in the auto flow and suggests `/forgerdr:security` in the manual flow when the diff touches sensitive areas.
- `/forgerdr:help`: the cheat sheet of commands, flows, settings and herdr keys, answered by a `UserPromptSubmit` hook from `references/cheatsheet.txt` without reaching the model.

## [0.4.0] - 2026-10-06

### Changed

- `workitem` takes one URL or many and opens one titled herdr tab per item (`herdr/bin/forge-session.sh`) in the current directory, continuing in place only when the session is already titled for the single item given; `worktree` stays the worktree path.
- `review` picks the skill per pull request: one authored by the signed-in user runs `review-own`, any other runs `review-other`; one URL or many.

## [0.3.0] - 2026-10-06

### Added

- Session titles with the item number: `review` and `worktree` start each agent with `FORGE_SESSION_TITLE` (`PR <id>: <title>`, `#<id> <title>`) and the session start hook sets the session title from it, the same as `/rename`; a standards rule asks, once, for `/rename` in any session that gains a number without carrying it in its title. The hook now answers in JSON (`additionalContext` plus `sessionTitle`).
- `worktree` starts the agent in its own pane, to the right of the worktree's shell, with the dev server below.

## [0.2.2] - 2026-10-06

### Added

- Multi-repository workspaces: the session start lists the skills under the workspace root's `.claude/skills` and prints the workspace `CLAUDE.md` when they sit above the git tree, so agents in a repository or a worktree read them by path; `review-other` counts them as loadable skills.

### Fixed

- The memory project key of a linked git worktree is resolved through its main checkout, so agents started by `worktree` share the workspace's memory and spec mode.

## [0.2.1] - 2026-10-05

### Changed

- Reply language instead of a fixed one: the `language` set in Claude Code, or the language the user writes in, printed at session start and used in chat, work items and their comments, review comments, thread replies and reports; repository content stays in English.
- `workitem` opens with a brief of the item before reproducing it, and looks environments up in the project's `CLAUDE.md`, memory and project files before asking once.

## [0.2.0] - 2026-10-05

### Added

- Spec mode setting (`chat`, `openspec`, `openspec:<path>`, `azure`) in `~/.config/forgerdr/config.toml`, global or per project, shown or changed with `/forgerdr:mode` and printed at session start; `spec`, `plan`, `build` and `ship` keep the design and the tasks where it says, wrapping the azdospec plugin or the `openspec` CLI when installed and falling back to `az` or the OpenSpec layout otherwise.

### Fixed

- The MCP servers are declared in `mcp-servers.json`, referenced from `plugin.json`, so working inside this repository no longer loads them a second time as project config. `install.sh` trusts the engram Homebrew tap before installing.

## [0.1.0] - 2026-10-05

### Added

- Claude Code plugin `forgerdr`: rules injected at session start (standards, terse communication, lazy build philosophy, engram memory protocol with a workspace-level project key), a Bash guard that refuses tracking branches, hard and mixed resets, force pushes and pattern kills.
- Skills `/forgerdr:setup`, `/forgerdr:spec`, `/forgerdr:plan`, `/forgerdr:build` (inline or one fresh implementer and reviewer per task), `/forgerdr:debug`, `/forgerdr:security`, `/forgerdr:research`, `/forgerdr:ship`, `/forgerdr:review-other`, `/forgerdr:review-own`, `/forgerdr:workitem`, `/forgerdr:review` and `/forgerdr:worktree`.
- Agents `forgerdr:reviewer`, `forgerdr:security-auditor` and `forgerdr:researcher`, read-only, dispatched by the skills for a fresh context.
- herdr plugin `gn0m0dei.forgerdr`: actions and panes that fan out pull request reviews and backlog items across worktrees, env files copied, dev servers started, one Claude agent per pane; `setup-keys` action for the keybindings.
- Provider reference for Azure DevOps, GitHub and GitLab through their CLIs.
- Banner and pixel-art logo under `assets/`, claim "Forge once. Herd many."
- `install.sh` for macOS and openSUSE Tumbleweed: git, jq, node, pnpm, az with azure-devops, gh, glab, engram, herdr, Claude Code and codebase-memory-mcp, each step idempotent.
- `mcp-servers.json` declaring engram (scoped to the memory project key through `bin/engram-mcp.sh`), codebase-memory, context7 and chrome-devtools, with hooks that start the engram server, register and close sessions, restore memory context after compaction, capture subagent output and augment Grep/Glob with the code graph. The engram and codebase-memory plugins and hand-registered MCP servers are no longer needed.
