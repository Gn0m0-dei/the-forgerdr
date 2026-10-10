---
name: spec
description: "Turns an idea into an approved design before any code: classifies the request (spike, bounded, architectural), asks the questions that matter, writes back the understanding, presents the design and stops for approval. The spec mode (chat, openspec, azure) decides where the design is kept. Use on /forgerdr:spec, or before any new feature, component or behaviour change."
---

# Spec

Nothing is built before the user approves a design. Scale the artifact to the request, never the gate.

## Classify, out loud

Say the classification before the first question so the user can override it:

- **Spike**: a feasibility question ("can we…", "quick and dirty is fine"). Output is an answer, not code you keep. Present the question and the probe in 2-3 sentences, get a nod, investigate as cheaply as correctness allows, report a recommendation. Anything built is labelled throwaway.
- **Bounded**: a well-scoped change to a flow that already exists in this repository (a flag, a small endpoint, a one-file fix). Ask the questions that matter, present a short design in chat (sentences to a few short paragraphs) and stop until the user says yes. No spec file.
- **Architectural**: a new project, a new subsystem, a change that restructures how components fit or alters interfaces others depend on. Full path: questions, approaches, sectioned design, kept where the spec mode says, then `/forgerdr:plan`.

In doubt, take the heavier path. Complexity discovered mid-task upgrades the path: stop, say so, step up. Nothing downgrades mid-task.

## Understand

1. Intent: the outcome, who it is for, what success looks like. Missing: one focused question about purpose before proposing anything. Knowing the kind of app does not tell you why the user wants it.
2. Context: codebase-memory (`get_architecture`, `search_graph`) and `mem_search` on the feature's keywords before asking what the repository already answers.
3. Write back the understanding: outcome, constraints, success criteria, what the user said apart from what you assume. Invite correction. Keep it short.

Questions one at a time, the most consequential first. Prefer `AskUserQuestion` with concrete options over open questions.

## Design

- Load the project skills for the area first (standards, "Project skills"): the design follows their patterns and conventions.

- Two or three approaches when they genuinely differ, with the trade-off in one line each and your recommendation first. One approach when the lazy ladder leaves no real choice.
- Design in sections: data, interfaces, flow, error cases, what is explicitly out of scope. Each section short enough to be approved on its own.
- Every technical choice checked against the understanding and against the build philosophy: reuse before writing, standard library before dependency, one line before fifty.

## Where the design goes: the spec mode

The session start prints `Spec mode: <value>` (`/forgerdr:mode` shows or changes it). The classification, the questions and the design above are the same in every mode; the mode decides where the approved design is kept and which backend keeps it.

**`chat`**: nowhere but the conversation. Architectural work gets its sectioned design in chat, approved section by section; `/forgerdr:plan` then works from the conversation. No file is written unless the user asks for one.

**`openspec`** and **`openspec:<store>`**: OpenSpec 1.x, always through its CLI (`openspec`; `/forgerdr:setup` installs it). `openspec` works on the repository's own `openspec/`; `openspec:<store>` adds `--store <store>` to every command below, so the change lives in that registered store. Never write the change folder or its files from memory: the CLI gives the structure and the templates.

1. No OpenSpec root yet (`openspec status --change <name> --json` reports none, or `openspec/` is missing): stop and propose `openspec init --tools claude` as its own change on the base branch, committed by the user. Never initialize on a feature branch.
2. Change name: `<id>-<slug>` when the work has a work item, a short kebab-case name otherwise. `openspec new change <name> --json`.
3. `openspec status --change <name> --json` lists the artifacts and their order (proposal, then specs and design, then tasks). For proposal, specs and design: `openspec instructions <artifact> --change <name> --json` returns the instruction, the template and the output path; write each artifact from them, in English. `proposal.md` links the work item. Bounded work skips `design.md` only when the instruction allows it.
4. `openspec validate <name> --strict` passes before anything is shown. Then show the files; approval of the conversation only permits writing them, approval of the files only permits `/forgerdr:plan`.
5. A bug fix that restores the behaviour the specs already describe changes no requirement: no change is created. A fix that changes a requirement gets one.

**`azure`**: the design is a Feature with its requirements as backlog items in Azure Boards. When the azdospec plugin is installed (the `azdo:propose` skill is available), run it with the approved understanding: forgerdr is a wrapper and azdospec owns the work items. When it is not installed, say that `/forgerdr:setup` recommends it, and do it yourself through `az` (`${CLAUDE_PLUGIN_ROOT}/references/providers.md`, "Create work items"): one Feature, one backlog item per requirement with the acceptance criteria in Gherkin, written in the reply language, shown as a single draft and created only on a yes. A spike becomes one backlog item with the question and the timebox; its findings are posted as a comment on it when the spike closes.

When the work starts from an existing backlog item (`/forgerdr:workitem`, `/forgerdr:worktree`), that item is the requirement: never run `/azdo:propose` or create a Feature for it, it would duplicate the item. Draft what the item lacks, the acceptance criteria in Gherkin and the task checklist `/azdo:apply` reads from the description, in the reply language, show it, and write it to the item only on a yes. `/forgerdr:plan` then runs `/azdo:apply` on that item.

## Gate

Bounded: stop after the in-chat design. Architectural: stop after the design is kept where the mode says. Spike: stop after the recommendation. A yes approves the stage actually presented, nothing beyond it. `mem_save` the approved design decisions.
