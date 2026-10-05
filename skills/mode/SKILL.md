---
name: mode
description: "Shows or changes a forgerdr setting, globally or for the current project: today the spec mode (chat, openspec, openspec:<path>, azure) that decides where /forgerdr:spec, plan, build and ship keep the design and the tasks. Use on /forgerdr:mode, /forgerdr:mode spec <value> [--project], 'cambia el modo de spec', 'qué modo tengo'."
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

The change applies to the next skill that reads it, in this session. Confirm in one line: setting, scope, old value, new value.

## Spec modes

| Value | Design and tasks live in | Backend |
|---|---|---|
| `chat` (default) | the conversation | nothing written; approval in chat |
| `openspec` | `openspec/` in the repository, OpenSpec layout | the `openspec` CLI when installed, forgerdr's own writer otherwise |
| `openspec:<path>` | the same layout in another repository at `<path>` | same |
| `azure` | Azure Boards work items | the azdospec plugin (`/azdo:propose`, `/azdo:apply`, `/azdo:archive`) when installed; forgerdr's own `az` commands otherwise |

Whatever the mode, the forgerdr commands are the same and the gates do not move: no implementation before an approved design, no commit without permission, no publication without a yes.
