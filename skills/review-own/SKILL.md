---
name: review-own
description: "Handles the review comments on the user's own pull request: reads every open thread through the provider CLI, proposes per thread a fix, a reply or a question, applies the fixes the user picks, pushes, replies in each thread and resolves it. Use on /forgerdr:review-own <url>."
---

# Address review

The reviewer's comment is a request from a colleague: understand it before agreeing or pushing back, and close the loop in the thread itself.

## 1. Read

Pull request and open threads through the provider CLI (`${CLAUDE_PLUGIN_ROOT}/references/providers.md`): author, path, line, text, status. Skip threads already resolved. Read the code each thread points at, with codebase-memory for the callers.

## 2. Propose

One entry per thread, in the reply language (the template below is in English; translate its labels), full sentences:

```
[N] <path>:<line> — <reviewer>
    Asks for: <the request in one sentence>
    Proposal: fix | reply | ask
    Detail: <the change, or the reply with its reason>
```

Then `AskUserQuestion` (multiSelect, one option per thread) for the ones to act on now. Disagreement with a reviewer is argued with code and evidence in the reply, never ignored silently.

## 3. Act

Fixes: one thread at a time, test first when the change is testable, suite green. Commit with permission (one commit per logical group, `Closes:` footer kept), `git push`. Replies: the draft shown first, in the reply language (a team that states another language overrides it), short, no preamble, naming the commit hash when a fix was pushed.

## 4. Close the loop

Publish the replies on an explicit yes, then resolve the threads whose fix was pushed (provider commands: Azure `status: fixed`, GitHub `resolveReviewThread`, GitLab `resolved=true`). Leave open the threads that wait for the reviewer. Table at the end: thread, action, commit, status. `mem_save` the rules the reviewer applied, so future code follows them before review.
