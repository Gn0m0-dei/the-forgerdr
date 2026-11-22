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
say in the pull request what you ran. The scripts and hooks that drive the herdr
app are tested against fake `hc` and `herdr-app` (`test/fakes.sh`, `pnpm test`)
and by hand inside the app (`--no-agent` builds the topology without starting
agents); `test/forge-lib.test.sh` covers the pure functions. Provider commands are verified
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

A release is a version bump in `.claude-plugin/plugin.json` and `package.json`,
a `## [x.y.z] - date` section in `CHANGELOG.md`, one commit, merged through a
pull request like any other change, and a tag on the merged commit:
`git tag vx.y.z && git push origin vx.y.z`. The tag creates the GitHub Release
with that changelog section as notes.

`main` takes nothing but pull requests whose CI (`check`) passes, and neither
`main`, `site`, `tui` nor a `v*` tag can be deleted or force-pushed. Workflows
from outside contributors run once the maintainer approves them, and only
GitHub's own actions and `pnpm/action-setup` run, the third-party one pinned
to a commit. Installed copies pick
the new version up with `claude plugin update forgerdr@the-forgerdr`; the
version bump is what makes the update visible, so never skip it.

## The website

The website, <https://gn0m0-dei.github.io/the-forgerdr/>, holds what the
README used to explain: the landing page and the documentation. Its source
lives on the `site` branch, apart from `main`, so the plugin's installed copies
never carry its images and video; its own README says how to build and test
it. A change on `main` that alters behaviour comes with a pull request against
`site` that changes the page documenting it, and every push to `site` deploys.

## Keep it lean

Procedure goes in the skill that runs it, not in `README.md` or the website;
they link, they do not duplicate. No new dependency for what a few lines of
bash do.
