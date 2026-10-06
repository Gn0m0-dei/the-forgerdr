# Security Policy

## Reporting a vulnerability

Report privately through
[GitHub Security Advisories](https://github.com/Gn0m0-dei/the-forgerdr/security/advisories/new).
Please do not open a public issue for a vulnerability.

## Scope

This project runs code on your machine: hooks that fire on every Claude Code
session and tool call, bash scripts that drive herdr, an installer that puts
binaries on your PATH, and MCP server declarations. The risks live there:

- **Hooks and scripts that do more than they say.** A guard that blocks or allows the wrong command, a script that touches a repository it was not pointed at, a hook that leaks data out of the machine: in scope, treated as a vulnerability.
- **The installer.** `install.sh` downloads and runs third-party installers (herdr, Claude Code, codebase-memory-mcp) and release binaries (engram on Linux). Anything that makes it fetch from an unexpected origin or skip HTTPS is in scope.
- **Agents started without you.** `forge-worktree.sh` and `forge-review.sh` start Claude Code in new panes and accept its folder-trust prompt for worktrees of repositories you already cloned. Anything that widens what those agents can reach, or starts them somewhere you did not ask, is in scope.
- **Env files.** `forge-worktree.sh` copies your ignored `.env*` files into worktrees of the same repository, on the same machine. Anything that copies them anywhere else, or commits them, is in scope.
- **Instructions that cause unintended writes.** The skills publish review comments, work item comments, pull requests and state changes only after an explicit yes. A flaw that makes an agent publish, commit, push or change state without that yes is in scope.

Out of scope: vulnerabilities in herdr, Claude Code, engram, codebase-memory-mcp, the provider CLIs or the agents themselves; report those to their maintainers.

## Running it safely

- Read `install.sh` before piping it to a shell; every step is a plain command you can run by hand.
- Sign in to the provider CLIs with an identity scoped to the projects you work on.
- Review every draft before saying yes. The approval gates are the control that makes the rest safe.
- Keep secrets in env files that are ignored by git; the scripts copy them between worktrees, never into commits.
