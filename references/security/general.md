# General classes

Applied in every audit. Each item is a question to answer from the code, not a box to tick.

## Injection
- Trace every outside value to its sink: query, shell, template, HTML, path, redirect, deserializer, log line, LDAP or XPath query, regular expression.
- Look past the direct path: a value stored safely and later read by other code into a dangerous context (second-order injection), and values arriving through field names, keys, headers and metadata, not only values.

## Access control
- Not "is there a check" but "is it the right check, for the right resource, by the right mechanism".
- Same effect reachable through another route with a weaker check (admin endpoint, batch, export, import, GraphQL field, legacy version).
- A request field that overrides what the permission meant to restrict (owner id, tenant id, role, status).
- Routes that check authentication but not authorization; object references without an ownership check.
- Bulk and batch operations that check the first item and trust the rest.

## Files and resources
- Paths built from input: traversal through `..`, encoded sequences, symlinks, absolute paths, null bytes; archive extraction writing outside its folder.
- URLs fetched from input: internal addresses, redirects, DNS tricks, parser differences between the check and the fetch.
- Check-then-use races on files, temp files with predictable names.

## Secrets and cryptography
- Secrets in code, config, history, logs, error messages, URLs or anything the client receives.
- Tokens, keys and nonces from a non-cryptographic random source.
- Secret comparison that leaks timing; unauthenticated encryption; reused nonces or static IVs.
- What the code does when a crypto step fails: an error path that continues without it.

## Business logic
- Workflows: skipping a step, going back, replaying a finished flow, a half-failed flow that leaves the first step applied.
- Concurrent requests on check-then-act code: double spend, double approval, lost update.
- Quantities: negative, zero, overflow, rounding, string versus number.
- Data trusted because "it was validated on the way in" when another path writes it.
- Time: expiry boundaries, clock skew, time zones between components.
- Defaults: what the code allows when config is missing, a flag is off, a dependency is down, a migration is half done.

## Feature abuse and leaks
- Export, backup or report as a way to read above one's access; import or restore as a way to write it.
- Search, filters and sorting as an oracle for records one cannot read.
- Different errors, timings or sizes for "does not exist" and "no access": enumeration of users, records or emails.
- Preview, draft and share tokens that unlock more than the one item.

## Errors and failure
- Internals reaching the client: stack traces, queries, paths, versions.
- Failing open: an exception in an authorization or validation step that lets the request through.
