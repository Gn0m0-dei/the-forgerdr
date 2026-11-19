---
name: mode
description: "Shows or changes a forgerdr setting, globally or for the current project: today the spec mode (chat, openspec, openspec:<store>, azure) that decides where /forgerdr:spec, plan, build and ship keep the design and the tasks. Use on /forgerdr:mode, /forgerdr:mode spec <value> [--project]."
---

# Mode

Settings live in `~/.config/forgerdr/config.toml`, outside the repositories, with a global default and overrides per memory project key (the key printed at session start). `${CLAUDE_PLUGIN_ROOT}/bin/forge-config.sh` reads and writes it.

## Show

No arguments: print the current value of every setting for this project and the global default.

```bash
"${CLAUDE_PLUGIN_ROOT}/bin/forge-config.sh" get spec <project-key>
"${CLAUDE_PLUGIN_ROOT}/bin/forge-config.sh" get spec
```

## Set

`/forgerdr:mode spec <value>` sets the global default; `--project` sets it for the current project only.

```bash
"${CLAUDE_PLUGIN_ROOT}/bin/forge-config.sh" set spec <value> [<project-key>]
```

Setting `openspec:<store>` checks the store is registered first (`openspec store list --json`); when it is not, offer `openspec store register <path>` and set the mode only after it. The change applies to the next skill that reads it, in this session. Confirm in one line: setting, scope, old value, new value.

## The forge's mode

The herdr app's forgerdr layout shows a forge's mode at the foot of its sidebar and sets it from a dialog, which writes two more settings for the project: `mode` (a spec mode, or `github` and `gitlab`, whose design stays in the chat) and `backlog`, the URL of the repository or project its work comes from (a GitHub repository, a GitLab project, `https://dev.azure.com/<org>/<project>`) when it is not the origin's, which completes the numbers and ids typed in Start work. On Azure DevOps, a clone `/azdo:init` set up keeps its backlog in its git config (`azdospec.organization`, `azdospec.project`); the dialog reads it first and changes it there, never `azdospec`'s other keys. Setting `mode` sets `spec` too; a `spec` set afterwards here wins over it. Show them with `forge-config.sh get mode <project-key>` and `get backlog <project-key>`.

## Spec modes

| Value | Design and tasks live in | Backend |
|---|---|---|
| `chat` (default) | the conversation | nothing written; approval in chat |
| `openspec` | `openspec/` in the repository, managed by the `openspec` CLI | OpenSpec 1.x through its CLI (`/forgerdr:setup` installs it) |
| `openspec:<store>` | an OpenSpec store: a separate repository registered with `openspec store register <path>` | the same CLI with `--store <store>` |
| `azure` | Azure Boards work items | the azdospec plugin (`/azdo:propose`, `/azdo:apply`, `/azdo:archive`) when installed; forgerdr's own `az` commands otherwise |

The mode also decides what `/forgerdr:workitem` and `/forgerdr:worktree` take as an item and how the branch is named: `${CLAUDE_PLUGIN_ROOT}/references/items.md`.

Whatever the mode, the forgerdr commands are the same and the gates do not move: no implementation before an approved design, no commit without permission, no publication without a yes.
