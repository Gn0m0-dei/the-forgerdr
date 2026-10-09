# Cloud, containers and configuration

Use when the change touches infrastructure as code, container files, deployment manifests, environment config or secrets handling.

- **Identity and permissions**: roles and service accounts broader than the code needs; wildcards in IAM policies; credentials shared between environments.
- **Exposure**: services, buckets, databases or admin panels reachable from the internet that should not be; storage objects public by default.
- **Containers**: running as root, privileged mode, host mounts, secrets baked into images or build args, images from unpinned tags.
- **Config and secrets**: secrets in the repository, in images or in plain environment files committed; debug or verbose modes on in production config; TLS verification disabled; permissive CORS or allowed hosts.
- What the repository cannot show (the deployed policy, the network rules, the provider settings) is needs-validation, never a guess.
