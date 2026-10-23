# Items

What `/forgerdr:workitem` and `/forgerdr:worktree` take as an item, and how `spec`, `plan`, `build` and `ship` find the OpenSpec change they work on. The project's spec mode decides both: it is printed at session start, and `${CLAUDE_PLUGIN_ROOT}/herdr/bin/forge-config.sh get spec <project-key>` reads it. In `openspec:<store>`, every `openspec` command below takes `--store <store>`.

## Several items

Items are separated by `|`, and only by `|`: `/forgerdr:worktree --auto <item> | <item> | <item>`. Spaces and line breaks belong to the item, never split it. One item needs no separator. Flags go before the first item.

## What an item is

| Spec mode | Item | Read through |
|---|---|---|
| `openspec` / `openspec:<store>` | the name of an OpenSpec change, or a work item URL | `openspec status --change <name> --json`; a URL through the provider CLI |
| `azure` | a work item URL | `az boards` (`${CLAUDE_PLUGIN_ROOT}/references/providers.md`) |
| `chat` | a work item URL, or free text describing the work | the provider CLI for a URL; the text itself otherwise |

An item the mode does not take (a change name in `azure`, a bare name in `chat` that the user meant as a change): stop, say what the mode expects and that `/forgerdr:mode` changes it. A change that does not exist (`openspec status` fails): stop and list the active ones (`openspec list --json`). In `openspec`, a work item URL whose id already has an active change (`<id>-…` in `openspec list --json`) is that change.

## A change and its work item

Read the change whole (`openspec show <name>`, or its files: `proposal.md`, the spec deltas, `design.md`, `tasks.md`). Every work item it references (a URL, `#<id>`, `AB#<id>`) is a candidate. One: it is the change's work item; read it through the provider CLI. Several: ask which one the change implements. None: the change has no work item.

Its stage, from `openspec status --change <name> --json` and `openspec list --json`:

| State | Stage |
|---|---|
| `proposal`, `specs` or `design` neither `done` nor `skipped` | `spec`, continuing this change |
| `tasks` not `done` | `plan` |
| `completedTasks` below `totalTasks` | `build` |
| every task ticked | `ship` |

## Branch, key and title

The branch follows the standards (Git, "Branch names") for the spec mode. Before creating one, look for a branch that already carries the item, local or on `origin`, and reuse it:

| Item | Existing branch |
|---|---|
| work item, or a change with one | `git branch --all --list '*/#<id>-*' '*/AB<id>-*'` |
| change without a work item | `feature/<change>` exactly |
| free text | the name chosen, exactly |

A branch checked out in another clone or worktree (`git worktree list --porcelain`) cannot be opened twice: say where, and ask whether to free it there (commit with permission, switch that clone back to the base) or to work the item in that clone.

| Item | Key | Session title |
|---|---|---|
| work item, or a change with one | `#<id>` | `#<id> <title>` |
| change without a work item | the change name | `<change>` |
| free text | none | a few words of it; the branch slug once the branch is chosen |

## The change of the current work

`spec`, `plan`, `build` and `ship`, in the `openspec` modes, work on one change, or on none. Find it, stopping at the first rule that answers:

1. The arguments name a change, or a work item URL whose id has an active change: that change.
2. The branch carries an id: the active change named `<id>-…`. It is `feature/<change>`: that change, when it exists.
3. The arguments or the branch name a work item and no change matched: there is none. `spec` creates it as `<id>-<slug>`, the slug taken from the branch when it carries that id and from the item's title otherwise; `plan` asks whether to create it through `/forgerdr:spec` or keep the plan in chat; `build` and `ship` work without a change.
4. The arguments describe new work (`/forgerdr:spec <idea>`): there is none, `spec` creates it.
5. Otherwise ask, one option per active change (`openspec list --json`) plus "none". An active change is never picked without this question: it may belong to other work.
