# Web, HTTP and authentication

Use for web apps, APIs, gateways, sessions and any login, token or account flow.

- **Tokens** (JWT, session, API key, OAuth, SAML): find the signature or secret check and every binding the token needs for its role: issuer, audience, client, session, user, resource, expiry, algorithm. A token accepted where a different one was meant is the finding.
- **Sessions**: rotated at login and privilege change, invalidated at logout and password change, bound to the user they were issued for.
- **CSRF**: name the ambient credential (cookie), the state-changing route, the cross-site request it accepts and the missing check. Read-only routes and routes that need a non-ambient token are not CSRF.
- **Request-derived values are trust decisions**: Host, Forwarded, X-Forwarded-*, Origin, Referer, redirect targets, callback state, URLs built from the request. Trace each to the identity or response it affects. Open redirects matter when they carry a token or bypass an allow list.
- **Caching**: a private response stored under a key another user hits; a header the cache ignores but the app uses.
- **Account flows**: password reset, email change, account linking, MFA enrollment and recovery, invitations. Look for steps that can be skipped, tokens reusable or not bound to the account, and the weakest flow that reaches the same account.
- **Framework defaults**: verify the version and config before claiming a default is missing or present; unknown means needs-validation.
- A missing header, cookie flag, MFA prompt or rate limit is not a finding unless you show the request it lets through.
