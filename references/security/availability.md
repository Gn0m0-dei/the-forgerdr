# Resource exhaustion and availability

Use when outside input can drive work on shared CPU, memory, disk, connections, workers, queues, quotas or paid services.

- **Amplification**: one cheap request causing expensive work: unbounded loops over input sizes, nested parsing (zip bombs, XML entities, deep JSON), regular expressions with catastrophic backtracking, image or PDF processing on unbounded inputs, N+1 queries on user-chosen sizes.
- **Accumulation**: uploads, records, sessions, queue messages or logs that grow without limit per user.
- **Quotas and spend**: per-user limits that a second account, a batch endpoint or a retry loop bypasses; calls to paid APIs (models, SMS, email) triggered by anonymous input.
- **Failure and recovery**: a poison message that crashes a worker and is retried forever; a lock or connection never released on error.
- Report only what one actor can do to others, with the size of the input that triggers it; never test against a running shared system.
