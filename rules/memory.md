# Memory

Persistent memory is engram (`mem_save`, `mem_search`, `mem_context`, `mem_session_summary`, `mem_get_observation`, `mem_judge`). It survives sessions and compactions. Claude Code's own memory directory keeps who the user is and how they want to work; engram keeps what happened in the projects.

## Project key

The plugin starts the engram server scoped to the **memory project key** printed at session start: the workspace root when the repository sits in a workspace (a parent with its own `.claude`, `CLAUDE.md` or `AGENTS.md`), the repository otherwise. Every `mem_*` call already lands in that project; do not pass `project` unless you deliberately read another project's memory.

## Search

`mem_search` before starting work that may have prior context: the user's first message naming a feature, a ticket, a pull request or a problem; a topic you have no context on; "remember", "what did we do". After a compaction the session start prints the project's context; call `mem_session_summary` with the compacted summary first, then `mem_context`, then continue.

## Save

`mem_save` immediately, without being asked, after any of these:

- a decision (architecture, convention, workflow, tool choice) or the user confirming a recommendation;
- a bug fixed, with its root cause;
- a non-obvious discovery, gotcha or edge case;
- a convention, pattern or naming established;
- a preference or constraint the user states, or an approach the user rejects;
- a review published: the points accepted and the points discarded, with the rule behind each, so the next review stops proposing what the user discards;
- a work item worked: verdict, cause, branch, pull request, pending steps.

Self-check after every task: did a decision, a fix, a discovery, a correction or a convention just happen? Then save now.

## Close

Before saying a task or session is done: `mem_session_summary` with goal, discoveries, accomplished, next steps and relevant files.

## Conflicts

When `mem_save` answers with `judgment_required`, resolve each candidate with `mem_judge` using that candidate's own `judgment_id`. Resolve silently when confidence is 0.7 or higher and the relation is not `supersedes` or `conflicts_with`; otherwise ask the user in the next reply, conversationally, and resolve after the answer.
