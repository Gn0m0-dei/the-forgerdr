# Submodules

How work that changes code inside a git submodule is branched, committed and shipped. `/forgerdr:workitem`, `/forgerdr:build` and `/forgerdr:ship` follow it whenever the working tree has a `.gitmodules`. Every gate is asked as the standards say (Gates).

## What a submodule is here

A submodule is a repository of its own inside the checkout, with its own remote, branches and pull requests. The repository that holds it (the superproject) records one thing about it: the commit it points at. A worktree made by forgerdr comes with its submodules filled (`bin/forge-worktree.sh`, `hooks/worktree.sh`), each cloned anew for that worktree and checked out at the recorded commit with no branch (a detached HEAD).

## Whether the work touches one

```bash
git status --porcelain                                              # " M <path>" on a submodule: its pointer or its content moved
git submodule foreach --quiet --recursive 'git status --porcelain'  # the files changed inside each one
git -C <submodule> log --oneline HEAD --not --remotes               # its commits no remote has
```

Nothing printed: no submodule holds work, and the rest of this page does not apply. A change that only moves the pointer to a commit its remote already has (an update of the submodule) is an ordinary change of the superproject.

## Branch, before the first edit inside it

Never commit on the detached HEAD: a commit there belongs to no branch and is lost at the next checkout. Inside the submodule, a branch with the same name as the superproject's, from where it stands:

```bash
git -C <submodule> switch -c <branch>          # the superproject's branch name, so the two are found together
git -C <submodule> rev-parse --abbrev-ref @{upstream}   # must fail: no upstream yet
```

A branch is made only in a submodule the work changes, never in every one.

## Order: the submodule first

The superproject must never record a commit its submodule's remote does not have: nobody else could check it out.

1. Commit inside the submodule, after a commit gate of its own (its repository, its files, its message). Conventional Commits; the work item footer as in the superproject when both share a backlog, none otherwise.
2. Push it, after a push gate: `git -C <submodule> push -u origin HEAD`.
3. Its pull request, in the submodule's repository, through that repository's provider (`references/providers.md`, read from `git -C <submodule> remote get-url origin`), after a PR gate. Its base is that repository's base branch.
4. Then the superproject: `git add <submodule>` records the new commit, in the commit that carries the rest of the change, after its commit gate.
5. The superproject's pull request names the submodule's in its description (`Depends on <url>`), and says that it merges after it. When the submodule's pull request is merged by squash or rebase its commit changes: the superproject then records the merged commit in one more commit before its own merge.

Each repository gets its own gates: a yes for the superproject never covers a commit, a push or a pull request in a submodule.

## Verification and review

Tests run from the superproject, with the submodule at the commit under review. The review of the superproject's diff does not show the submodule's changes (git prints two commit ids): review `git -C <submodule> diff <recorded>...HEAD` as well, and give the reviewer both.

## Removing the worktree

`bin/forge-worktree-remove.sh` refuses a worktree whose submodule has uncommitted files or commits no remote has, and names it (`--plan` lists them): each worktree has its own clone of every submodule, which goes with it. Whatever keeps such a commit counts: a branch, a tag, a stash, or only the reflog, as a commit made on the detached HEAD and left behind, and the clone of a submodule that is no longer checked out counts too. Push first; `--discard` throws them away, only when the user says so.

git removes a worktree with submodules only by force, and then checks nothing itself: what the script reads first is all that is read. It does not read files git ignores, nor a folder a submodule left behind once it moved and its clone stands elsewhere: those go with the worktree. The herdr app's Remove worktree dialog says so and asks for the removal by force outright (`forced` in `--plan`); from a session, say it to the user before removing a worktree whose `--plan` has `forced: true`.
