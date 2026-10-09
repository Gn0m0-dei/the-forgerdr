# Supply chain, CI and release

Use when the change touches dependencies, lockfiles, build scripts, CI workflows, release or install scripts, plugins or extensions.

- **Dependencies**: lockfile present and used in CI (frozen install); no dependency from a git URL, a branch or a wildcard range; install scripts (`postinstall`) of new dependencies read; known vulnerable versions (`npm audit`, `pnpm audit`, `pip-audit`, `cargo audit`, read-only).
- **Typosquats and confusion**: a new dependency whose name is one letter off a popular one; internal package names resolvable from the public registry.
- **CI**: workflows triggered by forks or pull requests (`pull_request_target`, `workflow_run`) that check out and run the contributor's code with secrets; untrusted values (branch names, titles, comments) interpolated into shell steps; third-party actions pinned by tag instead of commit; tokens with write permission where read is enough.
- **Release and install**: artifacts or scripts downloaded over plain HTTP or without a checksum or signature; `curl | sh` installers that run before verifying what they fetched; update channels anyone can publish to.
- **Generated code**: inputs to code generation taken from outside the repository.
