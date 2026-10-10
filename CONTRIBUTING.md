# Contributing

This repository is one person's way of working, packaged. Pull requests that
fix a bug, a wrong command or an unclear instruction are welcome; changes to
the way of working itself are a conversation first: open an issue.

## Before you open a pull request

- English everywhere: content, commit messages, pull requests.
- [Conventional Commits](https://www.conventionalcommits.org/).
- No attribution to AI anywhere in the repository.
- `pnpm lint`, `pnpm test` and `claude plugin validate .` pass.
- `CHANGELOG.md` has an `## [Unreleased]` entry when behaviour changes.

## Testing a change

Skills and rules are Markdown an agent follows: test them in a real session and
say in the pull request what you ran. The herdr scripts are tested by hand inside
herdr (`--no-agent` builds the topology without starting agents) plus
`test/forge-lib.test.sh` for the pure functions. Provider commands are verified
against the real CLI: a flag that does not exist fails loudly, a field that does
not exist fails quietly.

## Supporting another tool

A tool the plugin drives (a CLI, another plugin, a provider) is supported only after two things, in this order: its current official documentation is read (context7 when it has it), and its CLI is run once for real in a scratch directory, with any machine-wide state it writes isolated (a throwaway `HOME`). What the skills ask of it then gets a smoke test under `test/` that runs the real tool in CI. No fallback that writes the tool's files by hand: when the tool can be required, require it.

## The mode × command matrix

Commands and spec modes combine, and most of the defects so far came from a combination nobody walked. A change to a command or a mode walks this matrix and says in the pull request which cells it checked.

| | `chat` | `openspec` / `openspec:<store>` | `azure` (with and without azdospec) |
|---|---|---|---|
| `workitem` (manual and `--auto`) | | | |
| `worktree` (manual and `--auto`) | | | |
| `spec` → `plan` → `build` → `ship` | | | |
| `review`, `review-other`, `review-own` | | | |

For each cell: where the design and the tasks live, which branch is used and who creates it, what gets committed where, and what happens after the merge.

## Releasing

A release is a version bump in `.claude-plugin/plugin.json`, `package.json` and
`herdr/herdr-plugin.toml`, a `## [x.y.z] - date` section in `CHANGELOG.md`, one
commit, and a tag: `git tag vx.y.z && git push origin vx.y.z`. The tag creates
the GitHub Release with that changelog section as notes. Installed copies pick
the new version up with `claude plugin update forgerdr@the-forgerdr`; the
version bump is what makes the update visible, so never skip it.

## Keep it lean

Procedure goes in the skill that runs it, not in `README.md`; `README.md` links,
it does not duplicate. No new dependency for what a few lines of bash do.
