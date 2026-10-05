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
