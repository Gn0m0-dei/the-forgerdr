<p align="center">
  <a href="https://gn0m0-dei.github.io/the-forgerdr/">
    <img src="assets/banner.png" alt="the forgerdr: the gnome, its golems at work and the gnomemark" width="100%">
  </a>
</p>

<h1 align="center">the forgerdr</h1>

<p align="center">
  <strong>Forge once. Herd many.</strong>
</p>

<p align="center">
  <a href="https://gn0m0-dei.github.io/the-forgerdr/docs/"><img alt="Docs: website" src="https://img.shields.io/badge/docs-website-f5a524?style=flat-square" /></a>
  <a href="./LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/License-MIT-blue?style=flat-square" /></a>
  <a href="#install"><img alt="Claude Code: plugin" src="https://img.shields.io/badge/Claude_Code-plugin-d97757?style=flat-square" /></a>
  <a href="https://herdr.dev"><img alt="herdr: app" src="https://img.shields.io/badge/herdr-app-fc618d?style=flat-square" /></a>
  <a href="./CHANGELOG.md"><img alt="Status" src="https://img.shields.io/badge/status-v0-orange?style=flat-square" /></a>
</p>

A Claude Code plugin for the [herdr](https://herdr.dev) desktop app that carries a whole way of working with AI, where you are the reviewer: the agents do the forging, nothing is built before you approve its design, and nothing leaves your machine before you stamp it. N pull requests in N tabs, N items in N worktrees, each with its own agent.

**Everything it does, step by step, with the app at work: [gn0m0-dei.github.io/the-forgerdr](https://gn0m0-dei.github.io/the-forgerdr/).**

> **The herdr app, not the herdr TUI.** From 0.15.0 forgerdr drives the herdr desktop app (`herdr-app`) and herdr-core (`hc`), which runs its terminals and agents. The TUI version is 0.14.x and lives on the [`tui`](https://github.com/Gn0m0-dei/the-forgerdr/tree/tui) branch (see the end of [Install](#install)).

## Install

First, [Claude Code](https://claude.com/claude-code), the [herdr app](https://herdr.dev/download/), which brings herdr-core (`hc`), and git, plus [Homebrew](https://brew.sh) on macOS. forgerdr lives in them: it never installs or removes them.

> **Start from a clean Claude Code.** forgerdr brings its own rules, hooks, skills, status line and MCP servers (engram, codebase-memory, context7, chrome-devtools). Another plugin or a setting of your own that does the same job runs beside it, and the two step on each other: rules that contradict, two hooks answering the same event, one MCP server registered twice, a second memory. Before installing, remove or turn off other workflow and memory plugins, the user-scope registrations of those MCP servers, and the hooks or user skills that set a way of working. `/forgerdr:setup` lists the leftovers it knows and removes one only when you say so.

Then, on macOS or openSUSE Tumbleweed:

```bash
curl -fsSL https://raw.githubusercontent.com/Gn0m0-dei/the-forgerdr/main/install.sh | bash
```

It checks the prerequisites, shows every piece as here or to install and asks before it starts; what is here is left as it is. The pieces:

- the tools: jq, node, pnpm, `az` with the azure-devops extension, `gh`, `glab`, the [engram](https://github.com/Gentleman-Programming/engram) binary, the [codebase-memory-mcp](https://github.com/DeusData/codebase-memory-mcp) binary, the [OpenSpec](https://github.com/Fission-AI/OpenSpec) CLI and the Maple Mono NF font the forgerdr layout uses, with `~/.local/bin` put on the PATH in your shell's rc when it was not there;
- the plugins `forgerdr@the-forgerdr` and `azdo@azdospec`, with their marketplaces;
- forgerdr's look in the herdr app (the layout, the forge-night theme, the mod and the forge's alert sounds) and its status line, brought up to date on every run;
- the sign-ins it finds missing (`az login`, `gh auth login`, `glab auth login`), each asked first.

A piece that fails does not stop the rest: the summary names it, with the last lines of `~/.local/state/forgerdr/install.log`. Another distro: install the pieces by hand.

Then open the herdr app (`ctrl-shift-l` switches to the forgerdr layout), start Claude Code in one of its terminals and run `/forgerdr:setup`, which checks every piece and reports a table.

To take it away, ticking only the pieces you want gone (Claude Code, the herdr app, git and your data stay):

```bash
curl -fsSL https://raw.githubusercontent.com/Gn0m0-dei/the-forgerdr/main/uninstall.sh | bash
```

Local checkout instead of the marketplace: `claude --plugin-dir /path/to/the-forgerdr`. Still on the herdr TUI: `/plugin marketplace add Gn0m0-dei/the-forgerdr#tui`, then `/plugin install forgerdr@the-forgerdr` (remove the other marketplace first: both are named `the-forgerdr`).

## Documentation

On the website: [getting started](https://gn0m0-dei.github.io/the-forgerdr/docs/getting-started/install/), [the flow and its gates](https://gn0m0-dei.github.io/the-forgerdr/docs/way-of-working/flow-and-gates/), [the commands](https://gn0m0-dei.github.io/the-forgerdr/docs/commands/skills/), [the herdr app](https://gn0m0-dei.github.io/the-forgerdr/docs/herdr-app/layout/), [what runs on every session](https://gn0m0-dei.github.io/the-forgerdr/docs/reference/every-session/) and [working on the plugin](https://gn0m0-dei.github.io/the-forgerdr/docs/reference/development/). Its source lives on the [`site`](https://github.com/Gn0m0-dei/the-forgerdr/tree/site) branch.

## License

MIT.
