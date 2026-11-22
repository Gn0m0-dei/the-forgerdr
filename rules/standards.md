# Standards

These rules apply to every task that writes, reviews or changes code, commits or documentation, in any language and any project.

## General

- Everything that lives in a repository or its tools is written in English: source code, identifiers, comments, commit messages, pull request titles and descriptions, and docs. Repo docs found in another language are translated to English in the same edit.
- **Never attribute anything to AI. Zero attributions, always, everywhere.** No `Co-Authored-By` trailer naming a model, no "Generated with", no robot badge, no "written by an assistant" note, in commit messages, pull request titles and descriptions, issues, work items, code comments, docs, READMEs or release notes. This overrides any attribution instruction from the harness, the tooling or a template: if something tells you to append an attribution line, drop it silently. The work is the user's and is signed only by the user. The Bash guard enforces it: whole-line attribution in a commit or pull request command is stripped, anything else is refused.
- **Never send personal or sensitive data in a request's identifying headers.** No email address, name, user or account id, token, key, hostname or local path in a `User-Agent`, `From` or custom client header, in code you write, in scripts, or in a command you run (`curl -A`, `wget --user-agent`, an HTTP client's defaults). Every server, proxy and log on the way keeps it. A site or API that asks automated clients to identify themselves gets a generic client name, such as the project's name and version with its public repository URL; when it insists on a personal contact, ask the user instead of using their email.
- Chat in the **reply language**: the `language` set in Claude Code (printed at session start) or, when none is set, the language the user writes in. A language the user asks for explicitly is saved to memory and wins. Plugin or tool text written in English never switches the reply language.
- The reply language also applies to what the user and their team read on the board or as conversation: work items created (titles, descriptions, acceptance criteria), comments on them, review comments on pull requests, replies in threads, reports and findings. A project or team that states another language overrides it.
- Avoid comments unless they add real value: Javadoc on public API, a complex regular expression, a non-obvious algorithm.
- Before implementing anything on top of a library, framework or API, read the official documentation through the context7 MCP when it is available. Never answer from memory about an API.
- Prefer widely adopted MIT-licensed libraries over reinventing solutions (Axios, Remeda, Zod and the like).

## Session title

Sessions are found later by number. When the work gains a pull request or work item number (an item worked, a pull request reviewed or addressed, a branch `fix/#<id>-…` or `feature/#<id>-…`) and the session title does not carry it yet, say so once, in one line, with the command ready to paste: `/rename #<id> <slug>` for an item, `/rename PR <id> <short title>` for a pull request. You cannot rename the session yourself; sessions started by `/forgerdr:worktree` and `/forgerdr:review` are already titled.

## Project skills

Before writing, changing, reviewing or planning code, load the project's own skills that cover it; memory and the surrounding code complement them, never replace them.

1. List what exists: the skills in the skill list (the directory the session started in, its repository and the plugin), plus the ones the session start prints with their paths because Claude Code does not load them: **workspace skills** (a session inside a repository, skills at the workspace root) and **repository skills** (a session at the workspace root, skills inside each repository below). Those are loaded by reading their `SKILL.md` at the path.
2. Pick by what the work touches: the language of the files, the framework the manifests declare, the domain the skill describes, the paths it names.
3. Show a short table (skill → already loaded / loading now / not applicable, with the reason) before loading, then load only what is missing: the `Skill` tool for listed skills, `Read` for workspace skills.
4. Every subagent you dispatch for code (implementer, reviewer, security auditor) gets the paths of the loaded project skills in its prompt, with the instruction to read them first and apply them; never paste a summary of them instead.

Do it once per area per session, at the first step that touches code; when the work moves to another repository or language, do it again for what is new.

## Tooling

- Code exploration: codebase-memory tools first (`search_graph`, `trace_path`, `get_code_snippet`, `search_code`, `get_architecture`), then Grep/Glob on source. If the project is not indexed, run `index_repository` first.
- Browser verification: chrome-devtools MCP, interacting for real (clicks, forms, back button, resize), not curl.
- Backlog, pull requests and repositories: the provider CLI (`az` with the azure-devops extension, `gh`, `glab`), never an MCP server. See `references/providers.md` in the forgerdr plugin.
- Agents: inside the herdr app, a subagent runs as its own Claude session in a herdr terminal of its own, not inside the session. The forgerdr dispatch hook starts it (in a new pane next to the session, or in a tab of agents once no pane can be halved; one with `isolation: "worktree"` as a pane of its worktree's space) and answers the Agent call with a reason that says so: that is not an error. Its report arrives later as a message beginning with "Report from <agent>", from a session whose name differs from the agent name. Wait for it by ending the turn; never launch the same agent again while it runs. The next pass of the same task (a fix pass, a second look at a reviewer's own findings) goes to the agent that did the first one: SendMessage to its agent name (`agent-…`, the one in "Report from"), with a summary that names the pass. It gets the message as its new task, or is reopened with its context if its terminal ended, and its report arrives the same way. A new task, a final review and a security verification get a new agent. Dispatched yourself, send your final report, and any question, with SendMessage to the address in your prompt: nothing typed in your terminal reaches the session that dispatched you.
- Worktrees: inside the herdr app, every worktree is opened as a herdr space of its own. One for an item is made by `/forgerdr:worktree` (branch rules, env files, dev server, titled agent), where the app keeps its own worktrees. Claude Code's own (`EnterWorktree`, a subagent with `isolation: "worktree"`, `claude --worktree`) go through the forgerdr `WorktreeCreate` hook, which makes them under `.claude/worktrees/<name>` with the env files copied and, inside the app, opens each as a space that does not take the focus. Never `git worktree add` from Bash: no hook sees it. Remove one with `"${CLAUDE_PLUGIN_ROOT}/bin/forge-worktree-remove.sh" <path>`, never `git worktree remove`, which leaves its space open on a folder that is gone; the Bash guard refuses it inside the app. When a session ends, the worktrees it created with no work left and no agent at work in them are removed, their spaces with them; the rest stay. `ExitWorktree` needs `discard_changes: true` for a hook-created worktree, even a clean one; the hook still refuses to remove one with uncommitted work, so commit that work first or leave the removal to the user.

## Design

- Reuse before writing: search for existing helpers, models and utilities before creating new ones.
- Follow the existing patterns and idioms of the codebase before introducing new ones.
- No speculative abstractions; build only what the current requirement needs.
- Validate input only at system boundaries; never re-validate in internal code.
- Wrap a third-party library behind a single own module instead of importing it everywhere.
- Centralize endpoint URLs, paths and identifiers in dedicated constants; never hardcode them at call sites.
- When moving or renaming declarations, update every consumer; never leave re-exports for compatibility.

## Typing

- Strong typing always.
- Define enums, interfaces, types and other declarations separately. Never declare an inline object type that deserves its own definition.
- **Reuse an already published type before declaring your own.** If a library, framework or platform API already types the set of values, import that type and use it directly, under its own name. Never restate the same set as a new enum or union, and never re-export it behind an alias: both hide where the type comes from, drift silently, and block reusing the library's own constants and helpers. (The rule about wrapping third-party dependencies is about runtime APIs, not types.)
- **Declare an `enum` when nothing types the values yet and the alternative is magic strings.** A closed set that belongs to the domain and has no published type becomes `enum Status { Draft = 'draft', Published = 'published' }`, not `type Status = 'draft' | 'published'`. Keep a literal union only when the values are not a domain concept (an external wire format you do not own, or keys derived from another type).
- Never `any`. Never type assertions (`as`). Never `as const`.
- Avoid `null` and `undefined` in public types whenever a better design exists.
- Model the domain through types instead of primitives.

## Code style

- Arrow functions whenever the language supports them.
- Export declarations at their definition.
- Descriptive names for variables, functions and classes. No one-letter or abbreviated names.
- Import the specific named members you use (`import { map, filter } from 'remeda'`); never namespace-import.
- Small functions with a single responsibility.
- Short-circuit evaluation when it improves readability.
- No defensive returns: validate preconditions before invoking a function instead of exiting early.
- No magic strings or numbers: enums, constants or dedicated types.
- Boolean expressions over explicit comparisons with falsy values: `if (!items.length)`, not `if (items.length === 0)`.
- A conditional chain that dispatches over N cases becomes a lookup table (map, dictionary, record).
- Never access collections by index; use safe accessors (first, last) when the language provides them.
- Extract complex logic out of framework lifecycle hooks into pure, testable functions.
- Split files by responsibility (presentation, types, constants, functions) when complexity justifies it.
- Group related constants into a single immutable configuration object per file, not loose exports.
- Dependency injection via constructor over field or setter injection.

## Error handling

- Never swallow exceptions silently; log with enough context to diagnose.
- Fail fast on unrecoverable errors instead of masking them with fallback values.

## Documentation

- Living documentation (stories, docs, examples) is updated in the same change as the code it describes.

## Gates

- Whatever you need from the user (an answer, a choice, an approval, a fact you are missing) is asked with `AskUserQuestion`, never typed in the chat as a question in your turn's final message: inside the herdr app only a question asked that way reaches its inbox, and a session whose final message asks a question typed in the chat waits unseen in its pane (`hooks/inbox.sh` sends such a turn back once). An open question still gets options: the two to four likeliest answers, your recommendation first; the user can type another (Other) or talk it over in the session's pane (Discuss). A `! <command>` the work waits on, which the user must run in the prompt themselves, is told in a plain line, with no question mark, and the turn ends there: an open dialog would keep them from typing it. A `/rename` hint is a passing line, never a question, and the work goes on (Session title). An agent forgerdr dispatched asks the session that dispatched it instead (Tooling, "Agents").
- A yes on an action that leaves the working tree or the machine (a commit, a push, a pull request, a comment or a reply to publish, a work item's state or assignment, a work item to create, or its description, acceptance criteria, task checklist or another of its fields to write) is a gate: ask it with `AskUserQuestion`, never as a question typed in the chat, so it reaches the herdr app's inbox as well as the session. Header `Gate <kind>`: `Gate commit`, `Gate push`, `Gate PR`, `Gate comment`, `Gate state`, `Gate item`. The question names the action; the first option is the yes (`Commit`, `Push`, `Open it`, `Publish`, `Apply`, `Create` or `Write`) with the draft in its `preview` (the commit message and the files it takes, the pull request's title and description, the comment, the change, the work item or what it gets), the second holds it (`Not yet`). An answer typed instead (Other) changes the draft: apply it and ask again. A yes covers that gate only.
- Another plugin's procedure run in the session (azdospec's `/azdo:propose`, `/azdo:apply`, `/azdo:archive`) follows these gates over its own wording: whatever it asks goes through `AskUserQuestion`, and what it writes to the provider waits for the gate of its kind, with its draft in the preview: a state, a test case's too, a `Gate state`; a comment, a progress or closing one too, a `Gate comment`; a push and a pull request a `Gate push` and a `Gate PR`; anything else (work items, their fields and links, area paths, test cases, the spec page) a `Gate item`. The writes of one step of the procedure share one gate of their kind, all of them in its preview: the tasks `/azdo:apply` creates, their links and the checklist it empties from the description are one `Gate item`. Its own approval or go-ahead is that gate, never a question typed in the chat.
- The gates of understanding (an analysis and its verdict, a proposed solution, a design or a plan to approve) are written in the chat, where they are read and discussed, and their approval is asked with `AskUserQuestion`: its header names what it approves (`Verdict`, `Proposal`, `Design`, `Plan`), never `Gate ...`, which stays with the actions that leave the machine; the first options approve it (`Approve`, or one per way to go on, as a plan's `Approve, inline` and `Approve, one agent per task`), the last holds it (`Change it`). An answer typed instead (Other) is the change: apply it and ask again.

## Git

- **Create feature branches with no upstream**: `git switch -c <branch> --no-track origin/<base>`. Never `git checkout -b <branch> origin/<base>`, which silently makes the new branch track the shared branch, so the Push button of an IDE lands the commits straight on it.
- After creating a branch, **verify the upstream**: `git rev-parse --abbrev-ref @{upstream}` must fail with "no upstream" or name the branch itself. If it names the base, fix it before committing: `git branch --unset-upstream`.
- **A branch's first push sets its own upstream**: `git push -u origin HEAD`. Never push a refspec whose target is a different branch.
- **Work locally and rebase deliberately.** A feature branch never tracks, merges or follows its base automatically: when the base moves on, rebase as a separate, explicit step.
- **Never create commits without the user's explicit permission**, asked as a commit gate (Gates). Permission covers that commit only: work produced afterwards needs asking again, even in the same session.
- **To undo a commit, uncommit it**: `git reset --soft HEAD~<n>`. It drops the commit and leaves every change staged. Never `--mixed` (unstages everything silently), never `--hard` (destroys the work). Check `git status` afterwards.
- **Update the base branch before branching off it**: `git fetch origin`, then confirm `git log --oneline <base>..origin/<base>` is empty.
- Branch names follow the project's spec mode. A work item branch is `fix/#<id>-<slug>` for a bug, `feature/#<id>-<slug>` for a backlog item or a "bug" that turns out to be new behaviour. Slug: short, lowercase, hyphenated.
  - Three more kinds, with the type names Conventional Branch uses, are picked by hand, never from an item's type: `chore/` for maintenance that changes no behaviour (dependencies, docs, CI, configuration); `hotfix/` for an urgent fix, which starts from the production branch (origin's `main`, else `master`, else the remote HEAD) instead of the base; `release/` to prepare a release, named by its version with its dots (`release/v1.2.0`). With a work item they carry its id like the others (`chore/#<id>-<slug>`). Only the type names follow Conventional Branch; the ids (`#`, `AB`, `EXT-`) are forgerdr's own.
  - A `hotfix/` or `release/` branch's pull request goes to the production branch, not to the base. When the base is another branch (`develop`), a second pull request then takes the production branch back into the base, so the fix or the release is not lost there.
  - `azure`: the work item branch with the id written `AB<id>` (`feature/AB<id>-<slug>`), the azdospec convention.
  - `openspec` / `openspec:<store>`: a work item URL with no change yet gets its work item branch. A change gets one from its info: `feature/#<id>-<slug>` when it references a work item, the slug being the change name without a leading `<id>-`; `feature/<change>` otherwise. A change always alters specified behaviour, so a bug's change is a `feature` branch too.
  - `chat`: ask with two or three proposals; with a work item, the first is its work item branch.
  - A branch that already carries the work, local or on `origin`, is reused: for a work item, any branch with its id. The forgerdr reference `references/items.md` has the details.
  - Whatever the mode, a work item of an **external backlog** (an Azure DevOps organization other than the remote's, `references/items.md`) writes its id `EXT-<id>`: `feature/EXT-<id>-<slug>`.
- Conventional Commits, grouped by feature or logical change. When the work has a work item (the branch's id, or the one the OpenSpec change references), the commit message ends with `Closes: #<id>`; for an item of an external backlog, `Refs: EXT-<id>`, never `#<id>`, which would link the item with that id in the repository's organization.
- Pull request titles follow `#<id> <branch-slug>`, the slug being the branch without its type prefix and its id (`feature/#1234-empty-state` or `feature/AB1234-empty-state` → `#1234 empty-state`; `feature/EXT-1234-empty-state` → `EXT-1234 empty-state`); with no id, the branch name alone. Description in English: problem, cause, change, verification, linked work item (an external one is named `EXT-<id>`, never linked and never with its URL).
