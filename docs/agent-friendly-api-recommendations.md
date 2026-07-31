# Agent-Friendly API Recommendations

## Purpose

Make a GeeSome deployment understandable and safely usable by an automated
agent that starts with only the public site URL. The agent should not need to
inspect frontend bundles, guess reverse-proxy prefixes, read server source, or
infer response shapes before it can authenticate, upload immutable content,
verify it, and construct a public URL.

This document records recommendations from the Meat Master character-asset
integration performed on 2026-07-31. It is an API roadmap, not a claim that the
target contracts are already implemented.

See [Agent-Friendly API Implementation Plan](./agent-friendly-api-implementation-plan.md)
for the current-state gap analysis, phased delivery sequence, workstream scopes,
and verification gates.

## Integration Findings

The repository-level API contract was understandable after reading the
`content`, `storage`, and `gateway` modules, but the deployed contract was not
discoverable from the public URL:

- `https://geesome.microwavedev.io/` served the frontend.
- `GET /v1` and `GET /.well-known/openapi.json` returned nginx 404 responses.
- `GET /api/v1` returned the API discovery document.
- Authenticated upload therefore used `POST /api/v1/user/save-file`.
- Immutable reads used the separate public route `GET /ipfs/<storageId>`.
- Raw image storage required the non-obvious multipart field
  `driver={"raw":true}` to avoid unnecessary preview processing.
- Upload responses may be synchronous content records or asynchronous operation
  handles. A caller must understand both before it can safely obtain a CID.
- Invalid gateway identifiers can return status codes and bodies that do not
  explain the error as a stable machine-readable API problem.

The API has the necessary capabilities. The main problem is that deployment
routing and operation semantics are implicit instead of self-describing.

## P0: Universal Discovery

Every deployment should expose this document at a conventional route that the
frontend proxy cannot shadow:

```http
GET /.well-known/geesome
Content-Type: application/json
```

Recommended response:

```json
{
  "schemaVersion": 1,
  "product": "geesome",
  "apiVersion": "v1",
  "apiBaseUrl": "https://geesome.example/api/v1",
  "gatewayBaseUrl": "https://geesome.example",
  "openapiUrl": "https://geesome.example/api/v1/openapi.json",
  "docsUrl": "https://geesome.example/api/v1/docs",
  "healthUrl": "https://geesome.example/api/v1/health",
  "capabilities": {
    "contentUpload": true,
    "rawContentUpload": true,
    "asyncOperations": true,
    "batchContentUpload": false
  }
}
```

Requirements:

- Serve the same response from the site root, API service, and documented
  reverse-proxy topology.
- Use absolute URLs so clients do not have to combine `/api`, `/v1`, gateway,
  and frontend paths.
- Add `Link` headers for discovery and OpenAPI to responses from `/`, `/api`,
  and `/api/v1`.
- Make deployment startup fail when advertised discovery URLs do not resolve
  through the configured public origin.
- Add an external black-box test against the nginx entry point, not only the
  Express application.

## P0: Stable Errors And Status Codes

All API and gateway errors should use `application/problem+json`:

```json
{
  "type": "https://docs.geesome.example/problems/content-not-found",
  "title": "Content not found",
  "status": 404,
  "code": "content_not_found",
  "detail": "No readable content exists for the supplied storageId.",
  "requestId": "req_01...",
  "docsUrl": "https://docs.geesome.example/api/content#get-by-storage-id"
}
```

Use conventional meanings consistently:

- `400` for malformed CIDs, multipart bodies, and unsupported options.
- `401` for missing or invalid credentials.
- `403` for valid credentials without the required scope.
- `404` for absent content.
- `409` for idempotency or path conflicts that require caller action.
- `413` for upload limits, with the accepted maximum in problem details.
- `422` for valid syntax that violates content policy.
- `429` with `Retry-After` for rate limits.
- `502` or `503` for unavailable storage backends.

Never return an nginx HTML error for a documented API route. Preserve a stable
`requestId` through nginx, API logs, async jobs, storage calls, and responses.

## P1: First-Class Immutable Asset API

Keep the general content API, but add a small, explicit contract for
application assets. The caller should not need to know driver internals or
database content models.

```http
POST /v1/assets
Authorization: Bearer <api-key>
Idempotency-Key: meat-master:runtime:velora:idle:<sha256>
Content-Type: multipart/form-data

file=<binary>
expectedSha256=<lowercase hex>
logicalPath=games/meat-master/characters/velora/idle.webp
```

Recommended synchronous response:

```json
{
  "schemaVersion": 1,
  "assetId": "asset_01...",
  "storageId": "bafkrei...",
  "sha256": "0123456789abcdef...",
  "bytes": 84217,
  "mimeType": "image/webp",
  "created": true,
  "pinStatus": "pinned",
  "urls": {
    "content": "https://geesome.example/ipfs/bafkrei...",
    "metadata": "https://geesome.example/api/v1/assets/bafkrei..."
  }
}
```

Behavior:

- Treat raw immutable storage as the default for this endpoint.
- Verify `expectedSha256` while streaming and reject mismatches before
  publication.
- Return the existing record with `created: false` when the same user uploads
  the same bytes with the same idempotency key.
- Return both CID and SHA-256. CID is the storage identity; SHA-256 verifies
  bytes in caches and build pipelines without requiring every client to decode
  UnixFS/DAG details.
- Include pin/replication status so a successful database write is not mistaken
  for durable availability.
- Make `logicalPath` optional metadata. It must not change immutable identity.
- Keep generated previews opt-in through an explicit `previewPolicy`, rather
  than an encoded `driver` JSON string.

## P1: Verifiable Reads

Support both `GET` and `HEAD` on immutable content and return:

```http
ETag: "bafkrei..."
Digest: sha-256=<RFC-compliant digest>
Content-Length: 84217
Content-Type: image/webp
Cache-Control: public, max-age=31536000, immutable
Accept-Ranges: bytes
X-Geesome-Storage-Id: bafkrei...
X-Request-Id: req_01...
```

Document whether the gateway can serve content immediately after upload and
whether callers should poll pin status. Preserve CORS for public browser assets
and do not require authorization for content explicitly published as public.

## P1: Predictable Async Operations

Do not return two unrelated success shapes from one request. Use:

- `201 Created` with the final asset representation for synchronous completion.
- `202 Accepted` with `Location`, `Retry-After`, and one operation resource for
  asynchronous completion.

```json
{
  "schemaVersion": 1,
  "operationId": "op_01...",
  "status": "pending",
  "statusUrl": "https://geesome.example/api/v1/operations/op_01..."
}
```

The operation resource should have stable `pending`, `running`, `succeeded`,
`failed`, and `cancelled` states. On success it should embed or link the same
asset response returned by the synchronous route. On failure it should embed
the standard problem document.

## P1: Auth Designed For Integrations

- Give API keys explicit scopes such as `assets:write`, `assets:read-private`,
  `content:write`, and `operations:read`.
- Provide key name, creation time, last-used time, expiry, and revocation.
- Return required scopes in `403` problem details without exposing secrets.
- Support short-lived integration tokens for CI when practical.
- Never accept secrets in query strings or return them in discovery, errors, or
  logs.
- Document upload ownership, retention, deletion, and garbage-collection
  implications for immutable CIDs.

## P2: Batch And Manifest Workflow

Game releases commonly publish dozens or hundreds of files. Add a batch flow
that is resumable and idempotent:

1. `POST /v1/asset-batches` with logical IDs, sizes, MIME types, and SHA-256.
2. The server returns which hashes already exist and which require upload.
3. The client uploads missing files with per-item idempotency keys.
4. `POST /v1/asset-batches/<id>/complete` verifies every item and returns a
   signed/hash-bound manifest.

The final manifest should contain stable logical IDs, CIDs, SHA-256, sizes,
MIME types, public URLs, and pin status. Partial retries must not create
duplicate library rows or folder entries.

## P2: OpenAPI And Executable Examples

The public OpenAPI document should describe:

- The externally reachable `/api/v1` server URL from deployment config.
- Multipart `file` fields as `type: string`, `format: binary`.
- Bearer authentication and required scopes per route.
- Sync and async responses with discriminators or distinct status codes.
- Standard problem responses and rate-limit headers.
- CID and SHA-256 formats, examples, and maximum lengths.
- Upload limits and supported MIME types.

Provide tested examples for curl and modern Node.js `fetch`. Every example
should begin with discovery, avoid hardcoded `/api`, verify returned bytes, and
redact credentials. Run examples in CI against a disposable node and through
the same reverse proxy used in production.

## P2: Capability And Compatibility Contract

- Include deployment version, API version, and capability flags in discovery.
- Add deprecation and sunset headers before removing fields or routes.
- Keep additive response changes safe for strict clients.
- Publish a compact changelog link and migration notes in discovery.
- Expose storage backend characteristics without leaking infrastructure: CID
  type, maximum object size, immediate-read guarantee, pin policy, and range
  support.

## Agent Routing Guidance

An agent integrating GeeSome should be able to follow this deterministic path:

1. Fetch `/.well-known/geesome`.
2. Fetch the advertised OpenAPI document.
3. Check `capabilities.contentUpload` or `capabilities.rawContentUpload`.
4. Validate credentials with a non-mutating endpoint that reports scopes.
5. Upload with SHA-256 and an idempotency key.
6. Resolve a `201` asset or poll a `202` operation.
7. `HEAD` and `GET` the advertised content URL.
8. Verify digest and byte count.
9. Persist CID plus SHA-256 in the consuming repository manifest.

Repo documentation should route API tasks here from `docs/README.md` and
`docs/agent-map.md`. Module details remain in the owning module docs; this file
defines the cross-module public integration experience.

## Acceptance Checklist

- [ ] Public `/.well-known/geesome` works through nginx.
- [ ] Every advertised absolute URL is tested from outside the container.
- [ ] OpenAPI describes the deployed prefix and multipart upload correctly.
- [ ] Raw asset upload requires no driver-specific knowledge.
- [ ] Upload supports SHA-256 verification and idempotency.
- [ ] Sync and async responses have deterministic status codes and schemas.
- [ ] Gateway `HEAD` exposes immutable cache and digest headers.
- [ ] Errors are JSON problem documents with stable codes and request IDs.
- [ ] Integration API keys use minimal scopes and can be revoked.
- [ ] A 50-file interrupted batch resumes without duplicates.
- [ ] Curl and Node examples run in CI through the production-shaped proxy.
- [ ] The Meat Master asset publish/hydrate contract passes against the public
  deployment without endpoint-prefix heuristics.
