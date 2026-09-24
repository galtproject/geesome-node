# Agent-Friendly API Contract Decision

Status: accepted and implemented for API schema version 1.

- `GET /.well-known/geesome` is the origin-only bootstrap route.
- `GEESOME_PUBLIC_URL` is the trusted absolute public origin and
  `GEESOME_API_BASE_PATH` is the externally routed API prefix. Request `Host`
  is never used to construct advertised URLs.
- New integration failures use `application/problem+json` with stable codes and
  request IDs.
- `Content` remains the owner/library record; `StorageObject` remains physical
  metadata; `Asset` records the integration-facing owner, CID, SHA-256, size,
  MIME type, logical path, and pin state.
- Idempotency is unique by owner, endpoint namespace, and key. Reuse with a
  different normalized request fingerprint is a conflict.
- Multipart SHA-256 and byte count are calculated while writing the temporary
  file and verified before content publication.
- Asset creation returns `201`; deferred work returns `202` with `Location` and
  `Retry-After`; operation states are `pending`, `running`, `succeeded`,
  `failed`, and `cancelled`.
- Batch completion emits deterministically ordered JSON and binds the immutable
  manifest with SHA-256. Signing remains deferred until key lifecycle policy is
  defined.
