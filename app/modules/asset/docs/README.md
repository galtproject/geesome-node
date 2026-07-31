# Asset Module

The asset module is the stable integration façade over existing content and
storage modules. It verifies SHA-256 and byte length before publication,
persists owner-scoped idempotency, exposes asset metadata, supports resumable
batches, and stores a deterministic immutable batch manifest.

It does not duplicate bytes or reveal global hash existence. Reuse during batch
preflight is limited to assets owned by the authenticated user.

Public clients should bootstrap through `GET /.well-known/geesome` and use the
advertised `apiBaseUrl` and `openapiUrl`.
