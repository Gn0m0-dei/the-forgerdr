# Data isolation and lifecycle

Use for multi-tenant or multi-user data, caches, search indexes, analytics, exports, backups, migrations and deletion.

- **Tenant and object scoping**: every query, cache key, search query and file path includes the tenant or owner, on every path (list, detail, search, export, count, autocomplete).
- **Derived copies**: search indexes, caches, analytics, thumbnails, logs and queues hold copies of the data; check they apply the same access rule as the source, and are updated or removed when it changes.
- **Exports and backups**: who can trigger them, what they include (deleted, draft, other users' data), where the file lands and who can download it.
- **Restore and migration**: restored or migrated records bypassing normal validation or landing in the wrong tenant.
- **Deletion and revocation**: deleted users, revoked tokens, removed members and cancelled shares that keep access through a cache, a long-lived token, a copy or a background job.
