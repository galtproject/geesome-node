# Agent-Friendly API Implementation Plan

## Table Of Contents

- [Outcome](#outcome)
- [Current-State Analysis](#current-state-analysis)
- [Contract Decisions To Freeze](#contract-decisions-to-freeze)
- [Delivery Sequence](#delivery-sequence)
- [Workstream Specifications](#workstream-specifications)
- [Parallelization And Ownership](#parallelization-and-ownership)
- [Rollout And Compatibility](#rollout-and-compatibility)
- [Verification Matrix](#verification-matrix)
- [Definition Of Done](#definition-of-done)
- [Deferred Follow-Ups](#deferred-follow-ups)

## Outcome

An automated client that knows only a GeeSome public origin can discover the
externally reachable API, inspect an accurate contract, validate its
credentials, upload and verify immutable assets idempotently, follow async
work, and resume a multi-file release without source-code knowledge or
deployment-specific path guesses.

Implementation status: completed on `codex/agent-friendly-api` for issue #1312.
The delivered surface includes origin-only discovery, problem responses,
immutable asset upload/read verification, stable operation resources, scoped
credential introspection, resumable batches, deterministic manifests,
production-shaped nginx coverage, generated inventories, and executable docs.
The items under Deferred Follow-Ups remain intentionally out of scope.

The implementation should extend the existing `api`, `content`, `storage`,
`gateway`, `asyncOperation`, `database`, and `pin` foundations. It should not
create a second HTTP server, a second content store, or an unrelated job system.

## Current-State Analysis

The recommendations are valid, but several foundations already exist and
should be hardened rather than replaced.

| Area | Existing foundation | Gap to close |
| --- | --- | --- |
| Discovery | `GET /v1`, OpenAPI/apiDoc routes, docs headers, and a live route registry exist in `app/modules/api/index.ts`. | Discovery uses relative URLs, does not expose `/.well-known/geesome`, has no capability or compatibility contract, and does not prove that advertised paths work through the public proxy. |
| Reverse proxy | `bash/nginx.conf` and `bash/nodomain-nginx.conf` explicitly proxy conventional OpenAPI paths and `/api/`. | The public prefix is topology-dependent. `/.well-known/` is otherwise served from a filesystem alias, and the Cloudflare template does not expose the same API discovery surface. There is no production-shaped proxy contract test. |
| Errors | Route helpers map some failures to HTTP status codes, and the API wrapper catches unhandled errors. | Responses include bare statuses, empty bodies, `{error, errorCode}`, and `{message, errorCode}`. Storage failures can be reported as `400`; documented routes can still fall through to proxy/HTML errors. There is no common problem schema or request correlation. |
| Uploads | `/v1/user/save-file` accepts multipart data, supports raw storage through `driver`, enforces user limits, and can run synchronously or asynchronously. | The client must know content/driver internals. There is no required digest, durable idempotency contract, stable asset representation, logical-path metadata contract, or deterministic `201`/`202` split. |
| Immutable reads | `/ipfs/*` and `/v1/content-data/*` support `GET`, `HEAD`, ranges, content length/type, CORS, and immutable caching. | Responses lack a standard digest, stable ETag, GeeSome storage-id header, and request ID. Invalid or unavailable identifiers are not expressed as stable problems. |
| Async operations | `asyncOperation` persists user-owned work, progress, errors, cancellation, and queue links. | Uploads return either content or `{asyncOperationId, channel}` under the same success status. Operation reads use legacy POST routes and `inProcess` rather than a small stable state machine. |
| Integration auth | API keys already support permissions, expiry, disable/revocation, ownership checks, and a current-key endpoint. | Permissions are not presented as a documented integration-scope vocabulary. There is no `lastUsedAt`, no stable credential-introspection response, and `403` does not tell a client which scopes are required. |
| Physical metadata | `StorageObject` is the canonical physical-byte registry and pin modules track durable pin attempts/status. | SHA-256 is not canonical metadata, and asset/idempotency/logical-path records do not exist. Batch preflight and manifest completion are absent. |
| OpenAPI | The spec is generated from apiDoc and recognizes bearer auth and multipart file fields. | Server URLs are relative and generic; generated operations mostly declare only `200`. Required fields, status-specific schemas, problem responses, scopes, limits, examples, and compatibility metadata are incomplete. |

This leads to one sequencing rule: repair the public contract and response
infrastructure before adding asset and batch endpoints. Otherwise the new
routes would inherit the ambiguity they are meant to remove.

## Contract Decisions To Freeze

Record these decisions in a short API contract/ADR before implementation. The
ADR is the shared input for all workstreams.

1. **Canonical discovery:** `GET /.well-known/geesome` is the bootstrap route.
   It returns absolute URLs derived from one validated public-origin
   configuration, never from an untrusted `Host` header. `GET /v1` remains as a
   backward-compatible route index.
2. **External route shape:** discovery advertises the actual public base, such
   as `https://host/api/v1`; route annotations continue to describe versioned
   application paths. OpenAPI receives the deployed absolute server URL.
3. **Error shape:** all new routes and all cross-cutting auth/parser failures use
   RFC 9457-style `application/problem+json`, with a stable GeeSome `code` and
   `requestId`. Existing routes migrate incrementally through the same helper.
4. **Asset ownership:** `Content` remains the owner/library record and
   `StorageObject` remains physical metadata. New asset records store only the
   integration contract: owner, content/storage reference, SHA-256, optional
   logical path, idempotency identity, and lifecycle timestamps.
5. **Digest storage:** store lowercase SHA-256 as canonical physical metadata on
   `StorageObject`, with an indexed lookup. Treat this as an additive production
   schema change and ship a real migration. Do not globally reveal hash
   existence; batch preflight only reports reusable assets visible to the
   authenticated owner.
6. **Idempotency:** uniqueness is scoped to authenticated owner plus endpoint
   namespace plus `Idempotency-Key`. Persist a normalized request fingerprint.
   Replaying the same request returns the original result; reusing the key for a
   different request returns `409 idempotency_key_conflict`.
7. **Upload verification:** compute byte count and SHA-256 while multipart bytes
   are written to the temporary file, compare before calling content/storage,
   and always clean temporary files on rejection. A mismatch returns `422` and
   must not create Content, StorageObject, file-catalog, or pin rows.
8. **Async shape:** synchronous creation returns `201` plus the asset resource.
   Deferred work returns `202`, `Location`, `Retry-After`, and an operation
   resource. The public operation state maps existing rows to `pending`,
   `running`, `succeeded`, `failed`, or `cancelled`.
9. **Pin semantics:** distinguish `stored` from `pinned`/`confirmed`. Discovery
   describes the deployment's immediate-read and pin policy. Asset success
   never implies more durability than the recorded pin state proves.
10. **Manifest integrity:** a completed batch manifest uses deterministic
    canonical JSON and includes a manifest SHA-256. Signing is added only when a
    configured server signing key, key identifier, verification method, and key
    rotation policy are defined; hash binding is mandatory in the first slice.

## Delivery Sequence

### Phase 0 — Freeze Contracts And Baselines

- Add the ADR described above and versioned JSON fixtures for discovery,
  problems, assets, operations, batches, and manifests.
- Capture baseline behavior for direct-node and nginx-shaped requests,
  including the currently deployed `/api/v1` topology.
- Add a deterministic TODO section for this roadmap so later agents can use
  `npm run todo:context -- <section-id>`.
- Decide the public-origin configuration names and precedence across direct,
  nginx, Cloudflare, gateway, and no-domain installs.

Exit gate: fixture schemas and public URL rules are reviewed; no route
implementation begins while response shapes remain unsettled.

### Phase 1 — Make The Existing API Reliably Discoverable

- Implement request IDs and the common problem response layer.
- Implement `/.well-known/geesome` and absolute discovery/OpenAPI links.
- Align every nginx template and add `Link` headers at the public entry points.
- Add black-box tests through a production-shaped reverse proxy.

Exit gate: a client starting at the site origin discovers valid absolute URLs,
and every tested API/proxy failure returns a correlated problem response.

### Phase 2 — Add The Immutable Asset Façade

- Add asset persistence and SHA-256 metadata without duplicating stored bytes.
- Implement `POST /v1/assets`, `GET /v1/assets/:storageId`, and the corresponding
  externally prefixed routes through discovery.
- Make raw storage the default and previews an explicit `previewPolicy`.
- Add digest/ETag/storage-id/request-id headers to `GET` and `HEAD` reads.

Exit gate: one idempotent synchronous upload can be byte-verified end to end
using only discovery, OpenAPI, the asset response, and `HEAD`/`GET`.

### Phase 3 — Normalize Operations And Integration Credentials

- Add `GET /v1/operations/:id` and cancellation semantics as a façade over the
  existing async-operation store.
- Return deterministic `201` or `202` from asset creation.
- Define asset/operation scope aliases over existing core permissions and expose
  a safe current-credential introspection resource.
- Record `lastUsedAt` without writing synchronously on every request; use a
  throttled update or bounded background flush.

Exit gate: a minimally scoped key can upload and poll its own operation, cannot
read another user's operation, and receives actionable `403` problems.

### Phase 4 — Add Resumable Batches And Manifests

- Implement batch create, per-item upload association, status, and completion.
- Reuse owner-visible hashes and resume interrupted uploads without duplicate
  Content, file-catalog, asset, or batch-item rows.
- Emit a deterministic hash-bound manifest and store it through the existing
  immutable content/storage path.

Exit gate: the 50-file interrupted-batch scenario passes under retries and
process restart.

### Phase 5 — Publish Executable Documentation And Roll Out

- Complete OpenAPI schemas, status responses, scopes, limits, and examples.
- Add tested curl and Node `fetch` examples that always start with discovery.
- Run the Meat Master publish/hydrate contract through the public proxy.
- Roll out additive routes first, measure legacy route use, then publish
  deprecation and sunset dates where replacement is justified.

Exit gate: CI runs examples through the same topology used in production and
the public deployment passes the consumer contract without prefix heuristics.

## Workstream Specifications

### WS-A — Request Context And Problem Responses

- **Inputs:** contract fixtures; current API response adapter; route error
  helpers; nginx error behavior.
- **Outputs:** request-ID middleware; typed problem factory; error-to-status/code
  mapping; response adapter support for content type, status, and location;
  sanitized structured logging.
- **Write scope:** `app/modules/api/**`, shared API interfaces/helpers, focused
  API/error tests, nginx error interception only where required.
- **Dependencies:** Phase 0 fixtures.
- **Completion criteria:** request IDs accept a valid inbound correlation ID or
  generate one; the same ID reaches logs and responses; auth, parser, not-found,
  rate/size, storage-backend, and unhandled errors use problem JSON; no secrets
  or stack traces are returned.
- **Verification:** unit tests for every mapping; malformed multipart and invalid
  CID integration tests; black-box proxy tests asserting JSON content type and
  request-ID continuity.

### WS-B — Public Discovery, Proxy, And Capability Contract

- **Inputs:** public-origin ADR; existing discovery builder; install-time nginx
  templates; deployment configuration.
- **Outputs:** `/.well-known/geesome`; absolute discovery fields; validated
  capability/backend characteristics; absolute OpenAPI server URL; consistent
  `Link` headers; startup/public-origin validation command.
- **Write scope:** `app/modules/api/**`, `app/config.ts`, relevant interfaces,
  `bash/*nginx.conf`, install scripts, discovery/proxy checks.
- **Dependencies:** Phase 0 fixtures; WS-A for problem responses.
- **Completion criteria:** all advertised URLs resolve from outside the app
  container; direct, `/api`, Cloudflare, gateway, and no-domain topologies have
  an explicit tested behavior; file aliases do not shadow GeeSome discovery.
- **Verification:** direct-node tests plus a containerized nginx black-box suite;
  negative startup/config tests; security route inventory update/check.

### WS-C — Asset Persistence, Idempotency, And Upload API

- **Inputs:** asset fixtures; `Content`/`StorageObject` ownership rules;
  `asyncBusboy`; raw content save path; file catalog and quota behavior.
- **Outputs:** asset module/API; additive asset/idempotency models; nullable
  `StorageObject.sha256`; streaming hash/byte-count capture; request-fingerprint
  validation; stable asset serializer.
- **Write scope:** new `app/modules/asset/**`; focused additions in `content`,
  `database`, and app wiring; migrations and migration integrity checks; asset
  unit/integration tests.
- **Dependencies:** WS-A and WS-B; Phase 0 data decisions.
- **Completion criteria:** exactly one file is required; SHA-256 and MIME/size
  limits are validated; hash mismatch publishes nothing; replay is stable;
  conflicting key reuse returns `409`; logical path does not affect CID;
  previews are opt-in; legacy `/user/save-file` remains compatible.
- **Verification:** upload success/mismatch/limit/duplicate/conflict tests;
  concurrent same-key test; failure cleanup test; permission isolation test;
  migration integrity and restored-upgrade rehearsal where available.

### WS-D — Verifiable Immutable Reads

- **Inputs:** asset representation; storage metadata; existing `GET`, `HEAD`, and
  range implementations.
- **Outputs:** `ETag`, RFC-compliant `Content-Digest` (plus legacy `Digest`
  only where a measured compatibility need exists), `X-Geesome-Storage-Id`,
  `X-Request-Id`, consistent immutable caching, and stable read errors.
- **Write scope:** `app/modules/content/**`, `app/modules/gateway/**`, focused
  header/range/error tests.
- **Dependencies:** WS-A; WS-C for persisted SHA-256. Header plumbing can begin
  in parallel with WS-C using fixtures.
- **Completion criteria:** `GET`, `HEAD`, and range reads agree on identity,
  length, type, cache policy, and ranges; public assets remain CORS-readable;
  absent, malformed, locked/private, and backend-unavailable cases are
  distinguishable without leaking private existence.
- **Verification:** byte-for-byte digest tests; conditional request tests;
  `HEAD`/`GET` parity tests; range regression suite; API and gateway black-box
  coverage.

### WS-E — Operation Resource And Deterministic Async Semantics

- **Inputs:** operation fixtures; existing `UserAsyncOperation` and queue
  ownership/retry behavior; asset serializer.
- **Outputs:** stable operation serializer and state mapping; authorized GET
  status route; cancellation route; `Location`/`Retry-After`; embedded asset or
  problem result; retention behavior documented in discovery/OpenAPI.
- **Write scope:** `app/modules/asyncOperation/**`, asset response integration,
  async-operation tests.
- **Dependencies:** WS-A and WS-C.
- **Completion criteria:** synchronous and async paths never share a status/body
  shape; operation access is owner-scoped; success resolves to the same asset
  schema; failures preserve stable problem codes and request lineage; cancelled
  work cannot later be reported as successful without an explicit terminal
  transition policy.
- **Verification:** state-transition tests, restart recovery, cross-user denial,
  cancellation race tests, and `201`/`202` contract tests.

### WS-F — Integration Scopes And Credential Introspection

- **Inputs:** current core permissions, API-key expiry/disable flow, asset and
  operation authorization requirements.
- **Outputs:** documented integration scope vocabulary; mapping to core
  permissions; safe current-key resource containing id/title/scopes/created/
  expiry/last-used state; required-scope problem extension; throttled last-used
  persistence.
- **Write scope:** `app/index.ts`, `app/modules/api/**`, API-key model/interface,
  required migration/integrity checks, auth tests and docs.
- **Dependencies:** WS-A; endpoint scope mapping from WS-C and WS-E.
- **Completion criteria:** least-privilege keys work; expired, revoked, malformed,
  and insufficient-scope credentials have distinct safe responses; secret value
  and hash never leave persistence/auth internals.
- **Verification:** scope matrix tests, expiry/revocation tests, redaction tests,
  concurrent last-used throttling test, security inventory update/check.

### WS-G — Batch Upload And Hash-Bound Manifest

- **Inputs:** batch/manifest fixtures; asset idempotency API; operation resource;
  storage and pin state.
- **Outputs:** batch, item, and completion models; create/status/complete routes;
  owner-visible hash preflight; deterministic manifest serializer; immutable
  manifest storage and digest.
- **Write scope:** `app/modules/assetBatch/**` or an `asset/batch` submodule,
  database models/migrations, async producer, batch tests and examples.
- **Dependencies:** WS-C, WS-D, and WS-E; WS-F for scopes.
- **Completion criteria:** item identity is stable; completion is atomic from the
  caller's perspective; incomplete or hash-mismatched batches cannot complete;
  retries and restarts do not duplicate rows; manifest ordering and digest are
  deterministic; global hash existence is not disclosed.
- **Verification:** 50-file interrupted/resumed test; concurrent completion;
  duplicate logical ID/hash cases; process restart; manifest reserialization
  digest equality; migration integrity and database scalability inventory.

### WS-H — OpenAPI, Examples, Consumer Contract, And Observability

- **Inputs:** all frozen fixtures and implemented routes; API doc generator;
  production-shaped proxy harness; Meat Master consumer flow.
- **Outputs:** complete OpenAPI components/responses/security; schema validation;
  executable curl and Node examples; consumer smoke; metrics for discovery,
  upload outcomes, idempotency replay/conflict, operation latency, digest
  mismatch, and batch completion.
- **Write scope:** apiDoc annotations, `app/apiDocSpec.ts`, `docs/**`, `check/**`,
  package scripts, CI configuration where present.
- **Dependencies:** begins with fixtures in Phase 0, lands final coverage after
  WS-B through WS-G.
- **Completion criteria:** generated OpenAPI validates and contains the external
  server, binary multipart field, required inputs, scopes, all success/problem
  statuses, limits, examples, and deprecation metadata; examples and the Meat
  Master flow pass without hardcoded `/api`.
- **Verification:** `npm run generate-docs`; OpenAPI schema/lint test; executable
  example suite through nginx; route-doc drift check; consumer contract smoke.

## Parallelization And Ownership

Use one integration owner for contract fixtures, shared interfaces, migrations,
and final branch/PR coordination. Suggested execution lanes:

| Lane | Work | Can run in parallel with | Merge dependency |
| --- | --- | --- | --- |
| 1 | WS-A request context/problems | Early WS-B and WS-H fixture/tooling work | Merge first because every new route consumes it. |
| 2 | WS-B discovery/proxy | WS-A, then WS-D header preparation | Merge after shared public-origin and problem interfaces settle. |
| 3 | WS-C asset core | WS-D header plumbing and WS-F scope vocabulary after fixtures freeze | Merge before operation/batch endpoint integration. |
| 4 | WS-D reads + WS-F auth | Each other, and late WS-C tests | Merge before public end-to-end gate. |
| 5 | WS-E operations | WS-F and WS-H schema work | Requires asset serializer. |
| 6 | WS-G batch | Final WS-H docs/examples | Requires asset, reads, operations, and scopes. |

Agents must not edit the same shared files concurrently. In particular,
`app/modules/api/index.ts`, `app/apiDocSpec.ts`, database model registration, and
generated docs need single-owner integration windows.

## Rollout And Compatibility

1. Ship discovery, problem infrastructure, and proxy routes additively.
2. Keep `/v1/user/save-file` and legacy async-operation routes unchanged while
   new clients adopt `/assets` and `/operations`.
3. Backfill SHA-256 lazily for existing storage objects on first verified read or
   an explicit bounded maintenance job. Do not block deployment on hashing the
   full store.
4. Guard new capabilities with truthful discovery flags. A flag becomes `true`
   only after its public black-box test passes for that deployment.
5. Treat asset database success, storage availability, and confirmed pinning as
   separate states in responses and metrics.
6. Add deprecation and sunset headers only after usage telemetry and migration
   notes exist. Do not remove legacy routes as part of the first delivery.
7. Roll back by disabling advertisement/new route registration while preserving
   additive rows and nullable columns. Never require destructive data rollback.

## Verification Matrix

| Contract | Required evidence |
| --- | --- |
| Origin-only discovery | Direct and nginx/Cloudflare/no-domain black-box tests; every absolute advertised URL fetched successfully. |
| Stable problems | Status/code/schema matrix, JSON content type, request-ID continuity, proxy fallthrough test, secret-redaction test. |
| Upload integrity | Known-byte SHA-256 fixture, mismatch with zero durable side effects, quota/size/MIME failures, temporary-file cleanup. |
| Idempotency | Serial replay, concurrent replay, request-fingerprint conflict, restart replay, owner isolation. |
| Immutable reads | `HEAD`/`GET` parity, digest and byte count, ETag/conditional request, ranges, immutable cache, CORS. |
| Async operations | `201` final, `202` operation, state transitions, failure problem, cancellation, restart recovery, ownership. |
| Credentials | Scope matrix, current-key metadata, expiry, revocation, last-used throttling, no secret/hash serialization. |
| Batch resume | 50 files, interruption mid-upload, retry after restart, no duplicate rows/catalog entries, deterministic manifest hash. |
| Documentation | Generated OpenAPI validation, route/doc drift checks, executable curl/Node examples through nginx. |
| Consumer proof | Meat Master publish/hydrate smoke starts at discovery and persists/verifies CID plus SHA-256 without prefix heuristics. |

For every route change, also run the repository-required documentation and
security inventory workflows. Database work must update migration integrity;
large batch/list queries must update the database scalability inventory. Use the
narrow unit/integration suites first, then `npm run test:docker` for the final
cross-module gate.

## Definition Of Done

- `/.well-known/geesome` is public and consistent across supported deployment
  topologies.
- Discovery contains absolute, externally reachable URLs, version/capabilities,
  compatibility links, upload limits, and storage-read/pin characteristics.
- All new endpoints and migrated cross-cutting failures return stable problem
  documents with a correlated request ID.
- Asset upload needs no driver knowledge and proves byte count and SHA-256 before
  publication.
- Asset idempotency is durable, concurrency-safe, owner-scoped, and conflict
  detecting.
- `GET`/`HEAD` allow an agent to verify immutable bytes and cache safely.
- Sync and async paths use distinct status codes and a single asset schema.
- Integration credentials are least-privilege, introspectable, expiring, and
  revocable without exposing secrets.
- Interrupted batches resume without duplicate product or storage metadata.
- OpenAPI and executable examples match the public proxy, and the consumer smoke
  passes from origin-only discovery.
- `docs/todo.md`, `docs/implemented.md`, module docs, generated API docs,
  security inventory, scalability inventory, and migration integrity evidence
  accurately reflect delivered scope.

## Deferred Follow-Ups

- Generic idempotency middleware for non-asset mutation endpoints, after the
  asset contract proves the persistence model.
- Signed manifests, after signing-key ownership, rotation, verification, and
  recovery policies are defined.
- Pre-signed/direct-to-storage uploads, only if proxy upload throughput becomes
  a measured bottleneck and end-to-end digest verification remains enforced.
- A broader REST normalization of legacy POST-based reads. Do not couple that
  migration to the agent-friendly asset delivery.
- Global content deduplication or cross-user hash reuse. This needs an explicit
  privacy and quota policy and is not required for resumable owner-scoped
  batches.
