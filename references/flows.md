# Flows

The forge floor of the herdr app (FLOOR, beside INBOX in the forgerdr layout) shows the flow of every item a Claude session works: the cells of its pipeline, which ran and how many times, its build tasks and its pull request. `${CLAUDE_PLUGIN_ROOT}/bin/forge-flow.sh` keeps it, in a file named for the herdr terminal the session runs in. Outside the herdr app, and in an agent forgerdr dispatched, it writes nothing, so every report below is safe to run anywhere.

## Who reports what

The hooks record on their own, so a skill never reports these:

- every `/forgerdr:<command>` typed in the session: a launch of its cell, counted; a `/forgerdr:workitem` starts the flow;
- every reviewing agent dispatched or given another task (`forgerdr:reviewer`, `forgerdr:security-auditor`, `forgerdr:security-verifier`), counted on the `review` cell.

The skills report what only they know:

| When | Report |
|---|---|
| The item is classified, after its brief | `forge-flow.sh start <auto\|manual> <feature\|bug\|content\|change> <key> <title>` |
| A cell starts | `forge-flow.sh stage <cell> running` |
| A cell stops at a gate of understanding (verdict, proposal, design, plan) | `forge-flow.sh stage <cell> waiting` |
| The cell is over, its gate answered | `forge-flow.sh stage <cell> done` |
| A cell fails, or has nothing to do | `forge-flow.sh stage <cell> failed`, `forge-flow.sh stage <cell> skipped` |
| A build task's test fails for the stated reason, the suite passes, its review is over | `forge-flow.sh task <n> <of> red <test name>`, `… green`, `… reviewed` |
| The pull request is open | `forge-flow.sh pr <number> <url>` |

The key is `#<id>` for a work item, `EXT-<id>` for one of an external backlog, the change's name for an OpenSpec change, a short slug of the text for free text. The gates that leave the machine (commit, push, PR, comment, state) are asked with `AskUserQuestion`, and the floor reads them from the inbox: they need no report.

## Cells

| Flow | Its cells, in order |
|---|---|
| auto, `feature` | `brief spec research plan build review security ship` |
| auto, `bug` | `brief reproduce root-cause proposal fix review security ship` |
| auto, `content` | `brief verdict comment` |
| auto, `change` (OpenSpec) | `spec plan build review security ship` |
| manual | `workitem spec research debug plan build review security ship` |

Each skill reports its own cell: `spec`, `research`, `plan`, `build`, `debug`, `security`, `ship`. Inside a bug's auto flow the fix is the `fix` cell and the debug's root cause the `root-cause` cell. `workitem` reports `brief`, `reproduce`, `root-cause`, `proposal`, `fix`, `verdict` and `comment`.

The reports are the same in the manual flow. A cell the user launched by hand is already counted by the hook, and `stage <cell> running` on a cell that runs does not count it again.

## Never in the way

A report that fails (a usage error, a full disk) is not the item's failure: say so in one line and go on. Chain a report with the command that comes next in the same Bash call when you can (`forge-flow.sh stage plan done && …`), so the floor costs no extra turn.
