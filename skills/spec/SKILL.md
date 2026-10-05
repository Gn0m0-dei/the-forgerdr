---
name: spec
description: "Turns an idea into an approved design before any code: classifies the request (spike, bounded, architectural), asks the questions that matter, writes back the understanding, presents the design and stops for approval. Architectural work ends in a written spec. Use on /forgerdr:spec, 'diseña', 'quiero hacer X', or before any new feature, component or behaviour change."
---

# Spec

Nothing is built before the user approves a design. Scale the artifact to the request, never the gate.

## Classify, out loud

Say the classification before the first question so the user can override it:

- **Spike**: a feasibility question ("can we…", "quick and dirty is fine"). Output is an answer, not code you keep. Present the question and the probe in 2-3 sentences, get a nod, investigate as cheaply as correctness allows, report a recommendation. Anything built is labelled throwaway.
- **Bounded**: a well-scoped change to a flow that already exists in this repository (a flag, a small endpoint, a one-file fix). Ask the questions that matter, present a short design in chat (sentences to a few short paragraphs) and stop until the user says yes. No spec file.
- **Architectural**: a new project, a new subsystem, a change that restructures how components fit or alters interfaces others depend on. Full path: questions, approaches, sectioned design, written spec, then `/forgerdr:plan`.

In doubt, take the heavier path. Complexity discovered mid-task upgrades the path: stop, say so, step up. Nothing downgrades mid-task.

## Understand

1. Intent: the outcome, who it is for, what success looks like. Missing: one focused question about purpose before proposing anything. Knowing the kind of app does not tell you why the user wants it.
2. Context: codebase-memory (`get_architecture`, `search_graph`) and `mem_search` on the feature's keywords before asking what the repository already answers.
3. Write back the understanding: outcome, constraints, success criteria, what the user said apart from what you assume. Invite correction. Keep it short.

Questions one at a time, the most consequential first. Prefer `AskUserQuestion` with concrete options over open questions.

## Design

- Two or three approaches when they genuinely differ, with the trade-off in one line each and your recommendation first. One approach when the lazy ladder leaves no real choice.
- Design in sections: data, interfaces, flow, error cases, what is explicitly out of scope. Each section short enough to be approved on its own.
- Every technical choice checked against the understanding and against the build philosophy: reuse before writing, standard library before dependency, one line before fifty.

## Spec (architectural only)

Write `docs/specs/<yyyy-mm-dd>-<feature>.md` in English: goal, understanding (as approved), design sections, global constraints (versions, naming, platform requirements, exact values), out of scope, open questions. The user reviews the file; approval of the conversation only permits writing the spec, approval of the spec only permits `/forgerdr:plan`.

## Gate

Bounded: stop after the in-chat design. Architectural: stop after the spec. Spike: stop after the recommendation. A yes approves the stage actually presented, nothing beyond it. `mem_save` the approved design decisions with the memory project key.
