# GeeSome Node Implemented Work

## Purpose

This document records delivered foundations that were previously mixed into the
active TODO plan. It is an implementation index, not a claim that every product
area is permanently finished.

Current unfinished work lives in [todo.md](./todo.md). Detailed design and
operational notes remain in their dedicated documents and module-local `docs`
directories.

Last consolidated: 2026-07-29.

## Runtime And Test Foundation

- Node.js 22 is the supported runtime baseline in package metadata, Docker, and
  developer version files.
- Docker-backed testing provides PostgreSQL, Kubo/IPFS, ffmpeg, deterministic
  fixtures, warm dependency/service caches, and source-snapshot rebuilding.
- Runtime logs are quiet by default with explicit debug flags for SQL, access,
  dependency, test, and module diagnostics.
- Application shutdown closes ingress first, drains module-owned workers and
  active durable queue processors, then closes Sequelize last.
- Reusable interval-worker lifecycle handles prevent overlapping ticks and make
  shutdown await active callbacks.
- `SIGTERM` and `SIGINT` use a bounded, idempotent shutdown controller.
- PostgreSQL connection diagnostics and deployment pool-budget checks are
  opt-in, bounded, and avoid per-query logging.
- Configured module bootstrap is all-or-nothing and preserves the original
  annotated startup error while cleaning up initialized resources.

## Dependency Security

- Direct unused/deprecated dependencies and stale tooling were removed across
  the API, storage, Telegram, docs, and build paths.
- Runtime-sensitive packages and shared `geesome-libs` dependency resolutions
  were updated in focused batches.
- Production dependency audit reached zero high/critical modules.
- Full audit high/critical findings were cleared through patched development
  tooling and bounded Yarn resolutions.

Moderate legacy chains and Node 24 compatibility remain in the active plan.

## Content Serving Foundation

- API and gateway `HEAD` requests use the same metadata and access decisions as
  `GET`, preserving content headers and correct missing/forbidden responses.
- Malformed and unsatisfiable byte ranges return `416` before opening streams.
- File, image, and directory range requests return bounded partial responses.
- Missing storage paths return `404`.
- Client disconnects and post-header storage failures close upstream streams.
- Non-range serving works with size/path metadata even when a storage stat lacks
  a CID.
- Access logs and range byte-count diagnostics are opt-in.
- A bounded performance harness and privacy-preserving runtime profiler exist for
  incident attribution.

Production CPU incident attribution remains evidence-driven active work.

## Pinning And Pinata

- User and group Pinata accounts support encrypted write-only credentials,
  ownership/permission checks, explicit automatic policies, and bounded provider
  behavior.
- Automatic pin jobs are persistently deduplicated by stable account/storage
  identity and revalidate current policy before provider access.
- Policy caches expire across processes and remain discovery hints rather than
  authorization state.
- Provider requests use bounded timeouts, redirect/SSRF protection, safe error
  classification, and shutdown cancellation.
- `PinStorageObject` records per-account attempt and reconciliation state without
  treating provider acceptance as confirmed availability.
- Durable reconciliation supports bounded claims, retries, account health,
  history, credential tests, and operator-triggered recovery.
- The frontend exposes personal/group pin configuration and operator health and
  reconciliation controls with mobile/desktop coverage.

Additional providers and release-bound schema preparation remain optional
follow-ups in the active production-tuning section.

## API Keys, Documentation, And Discovery

- Disabled and expired API keys no longer authenticate.
- API-key permissions constrain request-scoped authorization beneath the user's
  own permission ceiling.
- API documentation uses maintained apiDoc template/parser submodules and covers
  the practical annotated route surface.
- Shared error documentation, examples, and sensitive-endpoint notes are
  generated.
- `docs/README.md` and `docs/agent-map.md` provide human/agent entry points.
- `/v1`, conventional OpenAPI paths, documentation headers, and IPFS-published
  links expose API and module documentation from a running node.

## Static-Site Foundation

- Generated group sites prefer the group avatar as favicon and retain the
  bundled fallback.
- The renderer creates a fresh Vue SSR app/router per page to avoid state reuse.
- The Sass default-import deprecation path was removed.
- Generated clients no longer emit incidental modal/media diagnostics while
  retaining the intentional developer banner.

Settings normalization and delivery/distribution remain active work.

## Database Scalability And Integrity

- Large group timelines use cursor/page-scoped reads and page-scoped hydration
  rather than unbounded offset/full-join paths.
- Database index/constraint work, bounded fixtures, EXPLAIN harnesses, and
  migration integrity checks cover recent scalability changes.
- Restored-backup rehearsal runs migrations, model sync, canonical storage
  reconciliation, integrity checks, and derived-state verification.
- Group manifests use chunked post-index sidecars, page-level rewrites, and an
  inline cutoff to avoid rewriting unbounded post arrays.
- Durable derived-state operations regenerate manifests/static outputs with
  checkpoints and bounded workers.
- `StorageObject` records canonical storage identity, shared storage metadata,
  local pin state, preview/generated-output relationships, and deletion safety.
- Content deletion uses tombstones, admin restore, retention-gated purge, and
  final reference safety checks before physical removal.

Larger restored-dump rehearsals and producer identity policy remain active
operational work.

## Storage Space Analyzer

- A dedicated `storageSpace` module exposes operator aggregates for logical and
  deduplicated physical usage.
- The analyzer covers file catalogs, folders, groups/posts, generated outputs,
  duplicates/shared storage IDs, pins, previews, cleanup blockers, and storage
  removal history.
- Cached snapshots, history, growth deltas, asynchronous refresh, staged
  progress, and retention exist.
- Availability views combine deterministic database-visible signals with bounded
  on-demand/persisted Kubo provider/stat samples.
- The frontend has a global analyzer screen with overview and
  availability/history drilldowns.
- Restored-database reports expose the same bounded top-level measurements.

Production DHT/provider tuning and richer non-global popularity signals remain
active follow-ups.

## ActivityPub And Native Bluesky Foundation

- ActivityPub implements WebFinger, NodeInfo, group actors, outbox/object
  serialization, followers/following, signed inbox/shared-inbox handling, remote
  actor keys, follow state, moderation flags, remote-object review, attachment
  policy, and queued outbound delivery.
- Remote objects use sanitized previews and canonical rich-text projections;
  accepted public Notes can be imported with source identity and update/delete
  handling.
- Source subscriptions, feeds, refresh/polling, moderation filters, review
  decisions, migration, relation reconciliation, and ownership proof paths
  exist.
- Signed ownership challenges support bounded detached proofs, expiration,
  replay/body/actor checks, cleanup, and abuse limits.
- Native Bluesky support uses ATProto/XRPC rather than pretending Bluesky is
  ActivityPub.
- Native Bluesky public feeds, source subscriptions, review/import, sync,
  account verification, migration, and cross-post create/update/delete exist.
- Cross-post policy covers supported image upload, public-link fallback,
  attachments/link previews, reply/quote identity, idempotency, and explicit
  reject/omit behavior.
- The frontend provides simplified source, account, cross-post, review, migration,
  reconciliation, moderation, and advanced-policy flows.
- Deterministic and public live-read smoke covers Mastodon, Bridgy Fed, native
  ATProto, and independent Fedify parsing.

Credentialed Bluesky writes, public staging federation exchange, and external
signed-proof compatibility remain release gates in the active TODO.

## Canonical Rich Text V1

- GeeSome stores a small versioned semantic rich-text document as the trusted
  editable source for supported native post paths.
- Unsafe inbound HTML is sanitized and normalized before visible/editable use.
- Vue post rendering and the native composer use canonical rich text.
- Static sites and ActivityPub render conservative sanitized HTML.
- ATProto exports plain text plus UTF-8 byte-indexed facets.
- Matrix, Farcaster, and Nostr-like adapters have typed projections.
- Arbitrary style/class/script/iframe/form/raw-HTML nodes are excluded.

Future protocols should add typed adapters instead of widening an HTML allowlist.

## Security Review Foundation

- A deterministic route inventory keeps registered handlers aligned with
  documented auth/permission notes.
- The first security review and route ownership matrix cover API keys,
  async-operation ownership, core group mutations, and credential-bearing
  integrations.
- Pinata, auto-action, social-account, Telegram, and Twitter secrets are
  write-only in API responses.

Remaining route ownership and public-route abuse coverage live in the active
TODO.

## Secure Chat Status

- `geesome-libs` defines browser-capable signed device bundles, encrypted
  envelopes, recipient key wrapping, recovery bundles, and compatibility
  fixtures.
- `geesome-ui` generates and stores private device keys in the browser, supports
  encrypted recovery/restore and revocation, discovers identity-bound recipient
  devices, encrypts/decrypts direct messages locally, deduplicates by message ID,
  reads ordered sequence pages, exposes delivery/setup states, and lets users
  compare stable fingerprints, verify devices, review key changes, and distinguish
  unverified, verified, changed, and revoked devices.
- `geesome-ui` encrypts attachment bytes before upload, sends only generic
  ciphertext files to the node, and keeps original names, media types, IVs, and
  content keys inside the encrypted message payload. Recipients fetch ciphertext
  on demand, authenticate it before rendering, preview only safe raster formats,
  and can retry failed integrity/download attempts. Text-only messages retain the
  older UTF-8 envelope shape for rolling frontend compatibility.
- `geesome-node` registers only public device bundles and persists only signed
  opaque envelopes plus routing, sequence, receipt, and delivery metadata.
- Outgoing encrypted-attachment references are accepted only when every
  content-addressed ciphertext object belongs to the authenticated sender. Chat
  stores normalized event-to-storage references, and registers them with the
  shared deletion-safety scanner so queued events cannot be orphaned by content
  cleanup.
- Recipient nodes recursively fetch and pin every referenced attachment
  ciphertext DAG before committing the remote event and signing its delivery
  acknowledgement. Missing or unavailable objects return a retryable service
  failure, and stalled IPFS pins are bounded below the sender request timeout,
  so the sender queue cannot report a false delivery and will retry.
- Authenticated HTTPS delivery has durable retry leases, bounded backoff,
  recipient-signed acknowledgements, source-head comparison, signed missing-range
  repair, and an opt-in bounded reconciliation worker.
- Configured nodes advertise canonical delivery, sync, and device-discovery
  endpoints in signed user manifests. Older profiles omit this additive field
  and remain valid.
- The IPFS chat reliability research records that bootstrap and PubSub cannot
  guarantee delivery, recommends reciprocal peering only as a live connectivity
  aid, and defines persist-before-publish, remote acknowledgement, retry, and
  sequence/head reconciliation as the correctness boundary.

This is a browser-first encrypted direct-message foundation, not completion of
production-secure chat. Attachment deletion, quota, abandoned-upload cleanup,
and retention policy, reviewed group membership/key rotation, and real two-node
browser testing remain in the active TODO.
