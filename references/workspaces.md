# A parent folder of repositories

How a session works when it starts in a folder that is not a git repository and holds several: a product's back and front, a set of micro frontends, the services of one system. The herdr app shows such a folder as one forge, with every repository under it, and its Start work launches sessions there. `/forgerdr:workitem`, `/forgerdr:spec`, `/forgerdr:plan`, `/forgerdr:build`, `/forgerdr:security` and `/forgerdr:ship` follow this page whenever `git rev-parse --show-toplevel` fails in the directory the session started in and repositories sit directly under it. Every gate is asked as the standards say (Gates).

## What the folder gives the session

- **All the repositories, at once.** The session reads and edits any of them: that is why it starts here. List them with `"${CLAUDE_PLUGIN_ROOT}/bin/forge-start.sh" repos .` (`repos`, by path).
- **No git of its own.** Every git command names its repository: `git -C <repo> ...`. A bare `git status` fails here, and that is not an error to work around.
- **One key, once the forge is indexed.** The memory project key, the spec mode and the backlog are the folder's, the ones the session start prints. Its repositories share them once the folder's forge is indexed: indexing records the folder in each repository's own git config (`forgerdr.workspace`, never committed, shared by every worktree of the clone), so every session in one of them, however it was opened, takes the folder's key, mode, backlog, skills and `CLAUDE.md`. A folder that carries a `.claude` folder, a `CLAUDE.md` or an `AGENTS.md` is a workspace for its repositories without it.
- **Index it first.** `"${CLAUDE_PLUGIN_ROOT}/bin/forge-start.sh" indexed .` says how it stands (`state`: `none`, `indexing` or `ready`; `joined` of `repos`). When it is `none`, say so in one line and run `"${CLAUDE_PLUGIN_ROOT}/bin/forge-start.sh" index .` before handing work to a repository: it joins the repositories and indexes the code of all of them as one codebase-memory project, the one the session start then names (`Code index: ...`), which takes minutes on a large folder. The herdr app shows the same state under the forge's gnome and indexes on a click. `forge-start.sh unindex .` undoes the joining.
- **Skills from both places.** The folder's own skills are in the skill list. The session start lists the skills of each repository below under "Repository skills", by path, because Claude Code does not load them here.

## The repositories an item touches

Decide them before touching anything, per item: by what the item names (the front, the API, a module, a path), by the folder's notes (`CLAUDE.md`, architecture notes) and by where the code it describes lives (search across the repositories). An OpenSpec change in spec mode `openspec` lives in the repository whose `openspec/changes/<name>` exists. Doubt: ask once with `AskUserQuestion`, one option per repository, multiSelect. Say which ones in the brief.

Before the first read or edit in a repository, load its skills: the ones listed for it under "Repository skills" that apply to the files touched (standards, "Project skills": once per repository, again when the work moves to another).

## Where the work is done in each repository

For each repository the item touches, one of two, decided by the state of its main checkout:

- **In its main checkout**, when it is clean and on its base branch, and no other session works there: update the base and branch there as the standards say, `git -C <repo> switch -c <branch> --no-track origin/<base>`.
- **In a worktree of its own**, when the main checkout holds other work, is on another branch, or the item runs alongside others: `"${CLAUDE_PLUGIN_ROOT}/bin/forge-worktree.sh" --repo <repo> --no-agent --no-dev --branch <branch> --title "<title>" "<item>"`, which makes it where the herdr app keeps its own, fills its submodules, copies the env files and opens it as a space under its repository. This session then works in that folder. To hand the repository to an agent of its own instead, `/forgerdr:worktree` does it for the items and repositories given.

The branch has the same name in every repository the item touches, so they are found together. A branch that already carries the item in a repository is reused there (`references/items.md`).

## The item, the provider and the backlog

- A work item URL names its own provider and backlog. An id alone is completed with the folder's backlog: `"${CLAUDE_PLUGIN_ROOT}/bin/forge-config.sh" get backlog <key>`, the one the forge's mode dialog keeps. Unset, ask for the URL; never guess a repository's.
- Pull requests and repositories go through each repository's own provider, read from `git -C <repo> remote get-url origin` (`references/providers.md`): the repositories of one folder may sit on different hosts or organizations.
- **External backlog, per repository.** An Azure DevOps item is external for a repository when its organization is not that repository's remote's (`references/items.md`): there the branch is `EXT-<id>`, the commit footer `Refs: EXT-<id>` and the pull request neither links the item nor names its URL. One item can be external for one repository and its own for another; decide it per repository, never once for the folder.

## Commits, pull requests and gates

Each repository is its own history and its own pull request.

- One commit gate per repository, with that repository's files and message; a yes for one never covers another.
- One push gate and one PR gate per repository, each pull request to that repository's base (or production branch, for a `hotfix/` or `release/`).
- Each pull request names the others of the same item (`Part of <item>: also <url>`), and says the order they merge in when one depends on another (an API before the client that calls it).
- The work item is linked in every pull request whose repository shares its backlog; a comment on it, at its gate, names all of them once.

## Verification, review and security

Tests, lint and build run per repository, with that repository's commands, from its folder. A change that crosses repositories (a contract, a shared type, an endpoint and its caller) is also verified together: the consumer against the changed provider, running both from their branches. The final review and the security review take one diff per repository (`git -C <repo> diff origin/<base>...HEAD`); give the reviewer all of them and the skill paths of each repository.

## What does not change

The flow on the forge floor, the inbox and the session title are the session's, whatever the repositories. A repository with git submodules follows `references/submodules.md` as well.
