# GeeSome Node Implemented Work

## Purpose

This document records delivered foundations that were previously mixed into the
active TODO plan. It is an implementation index, not a claim that every product
area is permanently finished.

Current unfinished work lives in [todo.md](./todo.md). Detailed design and
operational notes remain in their dedicated documents and module-local `docs`
directories.

Last consolidated: 2026-07-31.

## Incremental IPFS snapshot publication (#1475)

The paired membership publisher now records complete, independently bound public
and full inventories in additive v2 manifest capabilities. Eligible Kubo roots
are cloned into token-scoped staging and patched only at changed paths. Legacy
or unsupported roots use the full writer, preserving archive layout and render
caches; `GEESOME_PUBLICATION_ASSEMBLY=full` or `repair` provides operator bypass.
Old snapshots, paid/public projection, linked galleries, artifact references,
source fencing and atomic pair selection are preserved.

Lease renewal has one request in flight and bounded periodic/critical updates.
A model-sync staging journal recovers late remote RPC orphans with bounded indexed
batches after restart; failed-token tombstones intentionally persist. Content-free
versioned debug metrics distinguish projection, preparation, render/cache work,
assembly, committed-ready and cleanup. No API or shared storage-adapter change.

A naming audit follow-up separates the site inventory, tree assembly, CID/input
identity, metadata adapter, typed metrics and staging journal into focused modules.
Metric debug schema v2 uses explicit generated-byte/cache-hit/build-to-ready names;
manifest/schema/storage compatibility is preserved.

The [execution plan and measurements](plans/incremental-ipfs-publication.md)
record the real PostgreSQL/Kubo correctness/failure tests, five matched warm runs
for 46/146 posts, and browser verification. A newest-title edit uses two root
copies plus four changed paths, zero unchanged-media stat/mkdir/copy calls,
and four lease UPDATEs for short builds. Production rollout is a separate step.

## Available checkout methods and USDT Ethereum default (#1459)

New generated-site checkout prefers available USDT on Ethereum, falling back to
the first available method if needed. Currency tabs and network options contain
only enabled/available methods; unavailable selections cannot start a quote.
Existing invoices retain their asset, QR and network even if no longer offered
for new purchases. If none are available, checkout shows a clear empty state.

This changes generated client assets: deploy the node version and rebuild the
website snapshots to update their UI; existing immutable CIDs keep the previous
client. No payment ledger, schema, tariff or live payment settings change.

Verification: strict Vue types, 37 creator HTTP/SQL/controller cases and 56
payment regressions passed. Generated-site Playwright passed with 54 mapped
captures; desktop/narrow default and resumed-invoice screenshots were visually
reviewed. Existing reference parity is unchanged; the new method-selection
states have separate assertions/captures because they intentionally differ.
The parity rerun resolved an unrelated gallery raster-rounding flake; thresholds
were not changed. Production was not modified.

## Working payment RPC preference (#1456)

Automatic EVM calls now try up to ten eligible nodes. A per-network memory-only
working list puts successful nodes first, removes failures, and learns working
replacements. Shared adapters retain a common preference; discovery refresh
prunes withdrawn URLs. File cache format and explicit RPC overrides remain
unchanged. No schema or environment additions are required.

Verification: focused mocked RPC coverage checks the tenth candidate, attempt
limit, priority after cooldown expiry, failure eviction, learned replacements,
shared state, no working-list persistence, fresh-state behavior and network/
discovery isolation. All 34 creator HTTP/SQL cases and 56 payment regressions
passed, zero skipped. Production was not changed. See the [module notes](../app/modules/payments/docs/overview.md#working-rpc-preference-1456).

## Permanent reader/resource payment addresses (#1453)

Managed addresses are now stable per wallet/reader/resource. Wave and Meat get
separate addresses for one Google reader, while renewals and EVM networks reuse
the resource address. The global index allocator and service index zero remain;
pending invoice exclusion now permits simultaneous invoices for different
resources. Existing invoices, receipt ownership, payout snapshots and journals
are preserved.

The upgrade migration backfills only unambiguous historical resource assignments
and retains all other old indexes as reserved. Rollback refuses incompatible
multi-resource assignments. See the [plan](plans/resource-payment-addresses.md)
and [operator notes](../app/modules/payments/docs/overview.md#permanent-addresses-per-resource-1453).
Verification: 34 creator HTTP/SQL cases, 53 payment cases and a migrated SQL
integrity audit passed; scalability inventory is current. Production was not
modified.

## Owner default payout (#1429)

Private owner payout defaults apply to creator groups without an explicit
address. Existing group overrides remain; an explicit versioned inherit action
restores the default. Seed, reader wallets, content and membership rights remain
unchanged. Self-only bearer APIs require core/key group-management permission;
Google reader sessions do not authorize financial settings.

New managed invoices freeze effective payout/source/version and collection jobs
preserve that destination through edits/restart. Legacy jobs retain their explicit
group fallback, and permanent payout reservations prevent future deposit-address
reuse. The [plan/audit](plans/owner-default-payout.md) and
[module overview](../app/modules/payments/docs/overview.md) record rollout and
legacy reconciliation boundaries. New tables use model sync; production was not
modified. Verification: creator/worker HTTP/SQL 13 cases and payment 51 cases,
including two new real SQL scenarios, pass without live transfers. UI is pending.

## Creator Google login, payments and membership backend (#1425)

Opt-in `googleAuthorization`, `payments` and `membership` modules provide private
reader identities linked to core users, explicit site-bound cookie sessions,
direct cryptocurrency invoices/observation/collection recovery and group-scoped
access periods. Buyers receive no API key, core permissions, public profile or
group member pivot. Existing password/Ethereum bearer auth and group ACLs are
unchanged. Observer/collection workers require separate explicit flags.

The audited [migration plan](plans/creator-membership-migration.md) records scope,
constraints, workstreams and remaining client/import/cutover/SSG work. Current
full-set CID links retain legacy link-gating semantics; protected original bytes
are a separate phase. Production and microwave-girls billing are unchanged.

Verification: isolated Docker PostgreSQL/HTTP flow and worker lifecycle **12
passed**; crypto vectors and managed-ledger SQL recovery **49 passed**, zero
skipped in the Docker wrapper; existing auth/API/private-group/bootstrap focused
regression **20 passed**. API docs, security/scalability inventories and diff
hygiene passed. Full product suite and browser flows were not run for this
backend-only stage. Module-local overviews document exact configuration/APIs.

## Static-Site Media Folders (#1410)

Newly generated galleries and group sites put originals in root `content/` and
previews in root `preview/`. Gallery backgrounds use preview paths while full
images, video sources and the image viewer keep original paths. Numeric names
and content identifiers are unchanged. Published IPFS roots are immutable;
existing sites need rebuilding to receive the new layout.

Verification covers rendered mixed-format URLs, real JPEG/WebP archive entries,
and extracted gallery navigation on desktop/mobile `file://` and HTTP.

## Image Saving And Local IPFS Retirement

The [implementation contract](./image-optimization-retirement-plan.md) uses the
existing save-file/save-data pipeline with `optimize=true` and ordinary per-file
operation receipts. Full-resolution WebP and smaller WebP previews are persisted
and reused by policy in existing Content metadata; no separate optimization batch
or imageOptimization module is added. Replacement state and CAS checkpoints live
in existing operation queues/receipts; staticSiteGenerator owns the single new
revision model, and storageSpace owns physical retirement. Site replacement
receipts verify immutable revision, archive and consumer/Post cutover before
optional retirement of eligible old images, previews, MFS site roots and archive.
Shared references retain actual pins; Kubo GC/offline checks report physical local
removal. PostgreSQL writer/cleanup fences, render claims and CAS protect recovery.
Accepted queue inputs remain immutable; only operation.output contains the mutable
checkpoint. Source snapshots contain only cleanup/replay identities. The common
queue processor has an opt-in same-operation restart mode used by resaves, with
finished-result replay and cancellation preserved. Active queue inputs provide
temporary holds, indexed once per exclusive cleanup pass and refreshed before GC.
Ordinary writes query only exact pending cleanup CIDs, independent of backlog size.
Resave admission uses one transaction/connection, including provenance lookups.
Durable revision pins are limited to replacement renders; ordinary sites keep
existing current MFS paths. Failed/retried unfinished revision directories are
removed without touching published roots. SSG owns publication finalization;
fileCatalog owns transactional catalog remapping. Workflow receipts and waiting jobs
survive ordinary history cleanup. Pending CID gates release after cleanup; retired
Content records cannot be restored, while identical bytes can be uploaded as a new
file. Resumed cleanup repins new references and skips GC when no candidates remain.
Microwave Girls integrates the card action, automatic cleanup default, independent
GeeSome queue tracking and owner-scoped Generation import aliases.

Verification includes codec/preview/SSR tests and real PostgreSQL/Kubo replacement,
cleanup on/off, MFS-only shared roots, replay and concurrency checks. Deployment
must follow the contract's backend-first order and consumer alias migration.
Tracking: [#1382](https://github.com/galtproject/geesome-node/issues/1382).

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

## Agent-Friendly Public Asset API

- `GET /.well-known/geesome` advertises absolute, trusted public URLs,
  capabilities, limits, storage behavior, compatibility links, OpenAPI, and
  health without trusting the inbound Host header.
- Request IDs and RFC 9457-style problem documents standardize new route,
  authentication, parser, content, and storage errors without returning secret
  or internal exception details.
- Scoped integration credentials expose safe current-key metadata and throttled
  `lastUsedAt`; asset, operation, and batch routes enforce documented scopes.
- Immutable asset uploads require SHA-256, calculate digest and bytes while
  streaming to temporary storage, reject mismatches before publication, and
  persist owner-scoped idempotency with deterministic replay/conflict behavior.
- Asset reads expose stable metadata and immutable content `HEAD`/`GET` responses
  include SHA-256 `Content-Digest`, CID ETag, storage ID, request ID, and
  year-long immutable caching.
- Stable operation resources provide `pending`, `running`, `succeeded`,
  `failed`, and `cancelled` states with `201`/`202`, `Location`, and
  `Retry-After` semantics for asset creation.
- Resumable owner-scoped batches preflight existing assets, bind item uploads,
  avoid duplicate asset rows, and store deterministically ordered SHA-bound
  manifests through the existing immutable content path.
- All nginx templates expose the canonical bootstrap route; the Docker gate
  includes a production-shaped proxy and verifies discovery, OpenAPI, upload,
  replay, immutable reads, async polling, and 50-item batch completion.
- OpenAPI now includes public servers, required multipart/header fields,
  success/problem statuses, problem schema, and required scope metadata. Curl
  and executable Node examples begin with discovery rather than guessing a
  deployment prefix.
- Backpack Game Core's shared Geesome provider and the Meat Master character
  publication consumer now start from `/.well-known/geesome`, upload through
  the advertised `/assets` contract with SHA-256 and idempotency, and preserve
  immutable CID read-back verification without a hardcoded `/api` prefix.

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
- Configurable ciphertext admission limits reject oversized local attachments
  before event persistence and resolve remote ciphertext sizes before pinning.
  Defaults cap one attachment at 25 MiB and one event at 100 MiB; unavailable
  ciphertext remains retryable while quota rejection is a permanent `413`.
- Expiring, user-scoped attachment upload reservations record expected
  ciphertext bytes before upload. The content hook binds reserved uploads without
  adding them to the normal file catalog, and event acceptance moves matching
  uploads to attached state in the event transaction. Active reservations are
  bounded by count and reserved bytes; reservation-less clients remain compatible
  during the rolling transition.
- Browsers reserve the exact encrypted upload size, preserve successful uploads
  across event retries, and cancel deliberately discarded uploads. A bounded
  cleanup worker expires unbound reservations, retains cancelled uploads for one
  hour and abandoned uploads for seven days, reconciles event-linked rows, and
  tombstones only unreferenced Content. Physical bytes go through the existing
  async storage-removal queue and its execution-time shared-reference checks.
- The node records idempotent committed-attachment release intent per event
  participant and overlays released ciphertext IDs on that user's encrypted
  event reads. Release does not rewrite the signed event or prematurely remove
  the shared reference needed by another participant, retry, or repair.
- The browser exposes confirmed per-attachment release without removing the
  signed message event. A recoverable node lifecycle waits for every distinct
  local participant, every required signed delivery acknowledgement, and a
  configurable retention window before tombstoning dedicated ciphertext
  content, detaching the event reference, and delegating physical removal to the
  shared reference-safe queue.
- Recipient nodes recursively fetch and pin every referenced attachment
  ciphertext DAG before committing the remote event and signing its delivery
  acknowledgement. Missing or unavailable objects return a retryable service
  failure, and stalled IPFS pins are bounded below the sender request timeout,
  so the sender queue cannot report a false delivery and will retry.
- Authenticated HTTPS delivery has durable retry leases, bounded backoff,
  recipient-signed acknowledgements, source-head comparison, signed missing-range
  repair, and an opt-in bounded reconciliation worker.
- A PostgreSQL-backed restart regression proves a failed opaque delivery remains
  queued across sender shutdown, resumes after app restart, records the signed
  acknowledgement, and does not duplicate the encrypted event.
- An independent-process reliability harness starts two GeeSome apps with
  separate PostgreSQL databases, account-data directories, and Kubo daemons
  whose peer identities are verified as distinct. Its first real HTTP scenario
  stops the recipient, records a failed delivery, restarts both nodes, and
  proves the persisted sender queue delivers exactly one opaque event to the
  recipient database. Its encrypted-attachment scenario directly peers the two
  Kubo daemons, uploads browser-produced ciphertext to the sender only, proves
  the recipient fetches and pins the CID before acknowledgement, and decrypts
  the recipient copy only in the test client. Its unavailable-attachment
  scenario proves the recipient commits no event after a retryable fetch
  failure, then materializes the same CID, connects the sender storage peer, and
  delivers once on the second queued attempt. Its reordered-delivery scenario
  sends source event three first, repairs events one and two through the signed
  HTTP sync endpoint, revalidates event three without duplicating it, and proves
  a repeated repair imports nothing. Its revoked-device scenario proves the
  recipient stores no event and the sender records one visible failed delivery
  instead of retrying a permanent HTTP rejection.
- Configured nodes advertise canonical delivery, sync, and device-discovery
  endpoints in signed user manifests. Older profiles omit this additive field
  and remain valid.
- The IPFS chat reliability research records that bootstrap and PubSub cannot
  guarantee delivery, recommends reciprocal peering only as a live connectivity
  aid, and defines persist-before-publish, remote acknowledgement, retry, and
  sequence/head reconciliation as the correctness boundary.
- The group E2EE protocol review selects MLS 1.0 instead of extending pairwise
  envelopes or embedding Matrix. It defines one MLS leaf per browser device,
  signed GeeSome credential binding, explicit Add/Remove epoch changes,
  application-level admin authorization, canonical compare-and-set commit
  ordering, no automatic history sharing, opaque node transport, and a required
  browser compatibility gate before implementation. The July 2026 dependency
  pass selected no production browser implementation, so no experimental
  dependency or partial MLS node contract was retained.
- The disabled-by-default `privateGroup` foundation now normalizes private
  groups away from public publishing, stores immutable account/device
  membership snapshots, binds every accepted private post to its current
  snapshot atomically, and exposes authenticated membership read/refresh
  routes. Direct `ChatEvent` conversations remain unchanged.

This is a browser-first encrypted direct-message foundation, not completion of
production-secure group chat. Real two-node browser testing, explicit operator
policy, legacy-path retirement, and a future successful MLS dependency gate
remain in the active TODO.


## Static-site header/footer branding (#1325)

Static-site options now use a separate layout HTML policy that retains div/img
elements and bounded CSS class names. Avatar sources must be absolute HTTP(S)
URLs without embedded credentials or control characters. Events, inline styles,
scriptable elements, srcset and unsafe schemes remain removed. Post/message HTML
continues using the existing text-only policy. Both newly supplied and stored
options pass through the same normalization.

Verification: 21 focused tests passed across static-site branding, static-site
helpers and rich-text conversion, including production option normalization and
Vue SSR gallery rendering, negative XSS cases and idempotent normalization. No
database schema, route or dependency changes are required. The full Docker
database/IPFS suite was not run for this pure HTML-normalization change.

Deploy the updated node before publishing new branded galleries. Previously
published IPFS documents are immutable, and already-sanitized stored options
cannot recover discarded markup: republish from the original client template.

## Dev/master promotion conflict resolution (#1327)

Integrated master into dev without rewriting either branch. The storage conflict
retains dev's awaited Kubo/Helia pin completion, required by encrypted attachment
delivery; it does not restore master's fire-and-forget pin behavior. The lockfile
keeps dev's HPKE dependencies alongside master's Sharp 0.35.0 dependency graph.
Other master-only release metadata, storage-move helper and tests merge normally.

Verification: 15 focused chat attachment/static-site tests passed; route inventory
and storage-move shell syntax passed; the Yarn 1 lockfile parser accepted all
2051 selectors and verified the Sharp/HPKE versions. The full Docker suite was
attempted twice but did not reach test execution because dependency installation
failed extracting cached ts-morph/TypeScript packages. A targeted Yarn cache clean
also failed on a corrupt apidoc-plugin-ts cache entry. Full release validation
remains outstanding; mergeability alone is not a release-readiness result.

## Frontend Yarn availability during startup (#1328)

The frontend publisher retains the Yarn launcher before NVM changes PATH and
runs it explicitly with the selected frontend Node. If Yarn is absent, npm
installs Yarn 1.22.22 with an explicit selected-Node prefix, and the publisher
uses that absolute launcher path. This avoids successful global installation
into a different prefix followed by `yarn: command not found` and exit 127.

`npm run test:frontend-dist-publish` covers the original publication flow plus
isolated NVM/PATH regressions for existing and missing Yarn. The regression
against the previous publisher reproduces exit 127 at the Yarn install line;
the fixed publisher completes both builds on the host and in a Node 22 Linux
container. These tests simulate package
installation and bundling; they do not establish full production startup health.

## Verified Docker frontend reuse (#1331)

Docker now stores prepared frontend output at `/opt/geesome/frontend`, outside
`frontend/docker-dist`, which Compose overlays with a persistent host directory.
Each output contains `.geesome-build.json`: a SHA-256 input fingerprint and hashes
of its output files. Startup first verifies the persistent published output,
then the immutable image output, and only builds when neither matches.

The input fingerprint includes frontend files (including package metadata,
lockfiles, dotfiles/configuration and symlink targets), the publisher/build recipe,
configured frontend Node version, memory/worker settings, NODE_ENV, BABEL_ENV,
NODE_OPTIONS, and VUE_APP_, VITE_, PARCEL_, REACT_APP_ environment variables.
`node_modules`, `.git`, `dist`, build caches and coverage are excluded. Dependency
changes must be recorded in the frontend package/lockfile; direct node_modules
patches are not tracked. For custom build scripts reading other environment
variables, set `GEESOME_UI_BUILD_ENV_KEYS` to their comma-separated names in the
container environment. Only hashes are published, not environment values.

`GEESOME_FRONTEND_IMAGE_DIST` can override the prepared-artifact directory.
`GEESOME_UI_ROOT` selects custom source; `GEESOME_FRONTEND_PUBLISH_DIR` retains its
existing meaning and serves as the persistent server cache. A missing/old/invalid
manifest never grants reuse. The default builder uses a frozen lockfile. Build
failures leave the previously published directory intact; successful output is
validated and staged there, then files are renamed with index and manifest last.
This is per-file replacement, not an atomic whole-directory swap (the directory
is a bind mount). A single publisher should own this directory.

Verification: `npm run test:frontend-dist-publish` passes on the host and Linux,
covering image/server reuse, source/lock/env invalidation, corrupted output,
failed build preservation, and the earlier NVM/Yarn regressions.
`npm run test:frontend-cache:docker` builds a small multistage fixture and starts
two fresh containers sharing a volume; runtime builds are forbidden and both
runs reuse the intended artifact. This fixture does not compile the full Vue
application or run backend/database startup.

Deployment: rebuild the image with `npm run docker-upgrade` after the fix reaches
the deployed branch. The normal frontend path requires no runtime frontend
installation/build. Backend startup still performs its existing root Yarn check
and migrations, which can independently affect readiness time.

## Frontend build artifacts cached across Docker layers (#1333)

The frontend-build stage mounts a dedicated BuildKit cache with `sharing=locked`
at `/var/cache/geesome/frontend`. `GEESOME_FRONTEND_BUILD_CACHE` enables artifact
lookup by the existing frontend input SHA-256. A verified entry bypasses NVM,
frontend dependency installation and compilation even when backend dependency
changes invalidate the Docker RUN layer. Runtime publication/image reuse is
unchanged; the BuildKit cache is only mounted during image construction.

Successful builds are copied into a staging directory, verified, and renamed to
the hash entry. Corrupt entries are rebuilt and replaced. Multiple frontend
versions coexist, so returning to previous inputs can reuse their prior build.
The cache is local to the builder and may be evicted by BuildKit GC or pruning;
a missing cache safely triggers compilation. Normal layer-cache exports do not
promise to transfer this cache mount to another server. Non-Docker callers that
set this optional cache path must serialize writes, as Docker does with its
locked mount.

Verification: the Docker fixture forces RUN invalidation with a backend-revision
argument and forbids compilation on matching-input runs. It checks first build,
backend-only invalidation reuse, changed-source compilation, return-to-original
reuse, and fresh-container publication. Publisher tests cover missing published
output, corrupt cache recovery and absence of unfinished cache entries alongside
all prior regressions. Full production Vue compilation/backend startup were not
run; this change is verified with the small executable Docker build fixture.

## Published Docker images selected by Git revision (#1340)

Installation and upgrade share `docker-prepare-image.sh`: auto mode pulls a
matching SHA/platform image and verifies its revision, or builds from a committed
Git snapshot. Pull-only and build-only modes are explicit. `.docker-deploy/image`
stores the immutable selected reference; the Compose wrapper and systemd use it
across restarts. Failed preparation never restarts the service. The previous
image is retained with a rollback tag; database rollback is a separate operation.

`npm run docker-publish` builds and smoke-tests before registry publication. It
reuses existing SHA images and checks release aliases against exact Git tags.
Prepared runtime skips dependency installation and frontend compilation. The
release agent runs tests and publishes locally after the final user merge; no CI
image publication is configured. Release instructions are in
[Docker images](docker-images.md). The verified initial build platform is
linux/amd64; the current base image is amd64-only.

Validation on implementation commit `673e9691`:

- Selection/publisher/upgrade regression tests pass on macOS and Linux, covering
  clean Git snapshots, excluded local secrets, modes, registry/identity failures,
  no restart on failed preparation, and the prepared-runtime guard.
- Real Compose test reuses a saved local image ID on separate invocations.
- Frontend publication, BuildKit reuse and retention regressions pass.
- The full production linux/amd64 image built successfully and passed API health
  after model sync/migrations against isolated PostgreSQL and Kubo services.
- A second full image build reused the frontend BuildKit artifact (frontend step
  5.4 seconds) and passed the same runtime smoke.
- The publisher pushed `sha-673e969171526b44cfd24e9ba6e1658c2e1a4e33` to an isolated
  loopback registry; digest was
  `sha256:db41543c921c26926c3c5c622a31ba21eda033be39694bca82e827f75750582e`.

A second publisher invocation reused that registry image, passed startup smoke
and returned the same digest without a build or SHA-tag push.

GHCR publication/organization package permissions and a live Ubuntu/systemd
installation were not exercised locally. Local publication requires registry
package-write access. Full backend tests are a required local release gate;
this operational change was validated locally with targeted tests and real image
startup rather than repeating the prior release's 639-test suite.

## Multipart upload byte preservation (#1345)

The multipart parser starts SHA-256/byte accounting only after its temporary-file
writer opens, immediately before connecting the stream to disk. Previously,
attaching the `data` listener earlier drained buffered uploads before `pipe()`:
a 19-byte local upload reported 19 received bytes but persisted zero bytes.
Live Media reproduction produced zero-byte watermark inputs and
`Input file contains unsupported image format` in operations 52480–52482.

`test/asyncBusboy.test.ts` covers small image payloads, multiple files, a chunked
512 KiB payload, persisted bytes and digests, cleanup, and upload-limit rejection.
The focused parser/content API/content error suite passed 13 tests. No schema or
API route changes are required. Existing failed uploads must be retried after
server deployment; the parser fix cannot recover bytes from prior empty files.

## Batched Async Operation Reads (2026-09-25)

`POST /v1/user/get-async-operations` accepts `{ids: [52507, 52508]}` with
1–100 positive safe integers and returns `{list: [...]}` using the existing
async operation record shape. Authentication and the `operations:read` scope
are required. One bounded SQL query filters by the authenticated user and ID set;
results are sorted by ID, duplicates collapse, and missing/foreign records are
omitted without disclosing their existence. The single-operation route remains
unchanged. Microwave Girls consumes the batch route through its authenticated
BFF and coalesces concurrent upload polling.

Verification: 23 focused batch/ownership tests, apiDoc generation and security
route inventory validation. The inventory's generic token-only label does not
recognize integration scopes; this route additionally enforces `operations:read`
and query-level user ownership. No schema migration is required.

## Private group read ACL (#1358)

Group/post legacy API reads enforce creator/admin/member access for private groups,
with anonymous reads retained for explicitly public groups. Plain private post
manifests/directories remain DB-only; group manifests omit post discovery refs.
Numeric Content attachment metadata, public category feeds and authenticated
category/section lists cannot bypass group privacy. Exact ID lookups and missing
post JSON null responses support the gateway publication contract. [Delivery and rollout notes](./private-group-read-acl-delivery.md) record
NULL visibility handling, immutable historical-CID limitations and verification.

## Content archiving to IPFS (#1367)

The archive module queues owner-authorized local upload or generated-site archives,
pins tar.gz output and persists a unique originalStorageId/archivedStorageId pair.
Public lookup and attachment download use the original CID. Creation uses shared
async operations; failed jobs retain errors and can be requested again.

See [module contract](../app/modules/archive/docs/overview.md) for bounds,
ownership, public visibility and verification coverage.

Verification for #1367: an isolated Docker run with production Sequelize models,
PostgreSQL and Kubo downloaded the generated 30-post site's archive through the
public endpoint and compared all 87 files and 56 directories (143 entries) with
IPFS. Every file matched byte for byte. Unit checks also cover malformed CIDs,
unsafe paths, byte limits, read failure and cancellation. The shared full-suite
Docker run encountered stalled IPFS pin requests in existing app tests; it is not
recorded as a passing full-suite gate.

The final focused command ran archiveBuilder, archive and the generated-group-site
case with `--grep "archive|should generate site correctly from group"`:
**16 passing**. API documentation generation, security route inventory and database
scalability inventory checks also passed.

## Automatic published-site archives and download control (#586)

Microwave Girls requests `options.archive: true` on Page publication. The static
render worker checks archive/save/scoped-key permissions, saves the final site
CID and enqueues its archive without waiting for compression. Gallery and group
layouts include a top-right control for public readiness checks and downloads.
Pending checks are bounded; errors allow retry; no credentials reach the site.

Verification includes a real queued gallery render, automatic archive creation,
public download and byte comparison, plus desktop/narrow Playwright pending,
retry and ready states with screenshot manifests and matching download bytes.
The broader shared IPFS test instance still exhibited the previously recorded
pin stalls; focused gallery validation uses an isolated Kubo instance.


## Creator module defaults (#1434)

Google authorization, payments and membership now load in the default module
pack without global enable environment variables. Configured HTTPS site bindings
control endpoint availability, Google login requires a site client ID, and
registration remains explicitly controlled per site. Custom MODULES lists retain
their existing meaning. Site configuration loading and both opt-in payment worker
controls remain available; no payment loop starts by default. Existing deployments
can remove the old MEMBERSHIP_ENABLED and GOOGLE_AUTHORIZATION_ENABLED entries.

Verification: Docker Compose configuration, real PostgreSQL/HTTP creator tests,
payment regressions, default configuration and worker lifecycle checks.


## Membership site database (#1436)

Creator site configuration now lives in membership SQL records and is resolved
per request without a process restart. Explicitly authorized provisioning preserves
immutable resource/domain/group/owner identities. Group owners manage versioned
Google Client ID, registration, preview/branding and site availability through
bearer APIs. A new model-synced settings table leaves financial schemas intact.
Runtime MEMBERSHIP_SITES_FILE loading is removed; existing JSON entries must be
submitted explicitly with their original IDs before traffic is switched.

See [delivery and upgrade audit](plans/membership-site-database.md) for access
boundaries, import instructions and verification evidence.

## Membership site delegation (#1438)

A dedicated `admin:membership:sites` account and API-key permission permits
own-group site preparation without full node administration. Delegated callers
also require group management; full operator credentials retain cross-owner
provisioning. No automatic grants or schema changes. See
[upgrade and verification](plans/membership-site-permission.md).


## Membership website snapshots (#1441)

Paired public/full directories derive from one private canonical group and use
existing plaintext IPFS storage. A site-bound selector checks current resource
entitlement before redirecting to the appropriate CID. Previously obtained CIDs
and files remain readable after expiry and updates, as explicitly requested.
The staticSiteGenerator layer owns batched snapshot building and durable jobs.
Both variants use shared group/post SSR components, Sass and browser assets;
account controls are an optional Layout component and variant data is allowlisted.
Targeted source revisions, automatic retries with capped backoff, atomic publication
switching and permanent CID holds preserve complete immutable revisions. A compact
result contains two CIDs and a post/preview index; current publication state lives
with the resource, without a separate publication_heads table. Per-post attachment visibility is stored on PostsContents; public snapshots omit
private attachments, full snapshots include all, and gallery metadata/sets are
not used. An additive group migration upgrades existing attachment rows.
Owner admin controls live in
microwave-girls; existing per-post publication and payment identities remain.
See the [delivery plan](plans/membership-website-snapshots.md).


Creator snapshot design (#1444) now preserves the existing Era Of Wave/Meat public interface,
gallery, Google/account/refund and crypto-checkout screens through a reusable theme
on the shared SSR pipeline. Original/new paired browser screenshots and visible
control inventories verify parity at desktop/narrow widths. Branding, group profile
and tariff changes enqueue rebuilt snapshots; public data remains allowlisted and
received CIDs stay immutable. Production homepage cutover remains pending operator
verification; see docs/plans/membership-website-snapshots.md.

Creator theme Vue structure (#1444): the copied render-function screens are now
Vue SFCs with typed props/events and templates. Session, dialog and crypto invoice
controllers are separated from markup; legacy mutable-feed code is removed from
the snapshot client. A shared in-memory SFC compiler builds server/browser
components without generated files, and strict vue-tsc checks cover templates.
The original reader remains the visual reference; financial APIs are unchanged.

## Bounded static-image previews (#1447)

Ordinary image previews use WebP quality 85/effort 3, bounded long-side sizes,
per-set reuse of equal effective dimensions, and a shared bounded work queue with
input/encoding deadlines and byte/pixel caps. Existing stored renditions and
immutable sites keep their CIDs. Full publication encoders are unchanged.
MicrowaveGirls uploads social icons as raw original content without previews.
See [policy and evidence](plans/image-preview-policy.md) for verification and the
separately reproduced existing aborted-upload stress-test failure.

### Membership posts reuse published IPFS content (2026-10-28)

Creator snapshots support general text/uri-list Content: genuine CIDs, optional paths/query/fragments, comments, multiple URIs and multiple link attachments. New links use ipfs:// URIs with CRLF lines; existing /ipfs/ links remain readable. The per-post join-row privacy selects public/full output. Named links and view=link actions render without selecting any URI as a gallery; public links do not hide subscription controls for locked posts. Target roots are retained without traversing or copying their contents. Replacement validation selects its expected site root among links, with legacy metadata compatibility.

MicrowaveGirls supplies the 'View full set' caption and view=link for its existing galleries. Its idempotent Prepare upgrade preserves crops, unrelated links and the group, verifies gallery availability and removes only excess image associations. Existing gallery files are not deleted. See docs/plans/membership-gallery-links.md and MicrowaveGirls #733.

Verification includes real PostgreSQL/Kubo snapshot privacy, bounded URI reads, raw JSON Content saving, compact-post replacement, strict creator Vue types and desktop/narrow browser flows. The browser suite checks named document links, original gallery navigation after payment, and private targets absent after logout. No production deployment or new snapshot build was triggered by this implementation.

## Owner-defined creator presentation (#1468)

Creator publications accept a versioned owner manifest in the existing membership
resource JSON, with closed block regions, bounded editorial copy, style tokens
and external membership offers. Trusted auth/payment components retain their
handlers and authoritative values. Unknown fields, executable templates, CSS and
script sources are rejected. Old settings clients preserve the manifest when
omitted; updates use existing version locks, invalidation and publication fences.

Project presets and marketing belong to the producer. Node has neutral defaults
and no resource-id theme switch. Public/full projection and immutable artifact
retention remain unchanged. Contract and upgrade: [site-presentation.md](site-presentation.md).
Verification: 45 PostgreSQL/HTTP/Kubo and 56 payment cases, 21 focused
render/schema/shared-option checks, strict Vue types, 116 full browser captures
and a final 58-capture focused pass.
The editor/preview remain explicitly deferred in todo.md.

## Restricted owner HTML shells (#1470)

Owners can save html-shell/1 source in the existing presentation settings while
creator/1 remains the default. A bounded HTML parser checks permitted structural
elements, attributes, utility classes, text substitutions and unique trusted
slots. All source tokens must belong to the checked tree, preventing silent HTML
repairs. The renderer creates runtime VNodes without compiling owner source or
inserting raw HTML. App defines trusted blocks once for both layouts; login,
refund and payment dialogs stay outside the owner subtree.

Public/full projection, source invalidation, file cache keys, atomic publication
and retained immutable snapshots are preserved. Literal IPFS assets are retained
without directory traversal. Invalid saves preserve the previous manifest and
return a structured field/reason. No new table, worker or environment variable.
See [html-shell.md](html-shell.md), `examples/creator-shell.html`, and
[the implementation plan](plans/html-shell.md). Block editor and preview remain
explicitly deferred.

Verification: 50 PostgreSQL/HTTP/Kubo cases, 56 payment cases, 25 focused
presentation/render/shared-option cases, strict Vue types and 122 browser
captures across desktop/narrow JS/no-JS, including trusted crypto checkout from
an owner shell. Existing strict legacy pixel parity passed. API docs, security
route and database scalability inventory checks passed. No production deployment
or rebuild was triggered.


## Atomic snapshot source invalidation (#1478)

A combined post/attachment edit previously invalidated its resource twice in the
same database transaction. Source hooks now retain a weak transaction-scoped set
of invalidated resource IDs, incrementing each resource revision and enqueuing
its auto publication once per atomic commit. Standalone attachment changes and
later transactions retain their own invalidations; rollback persists neither
revision nor job. No schema migration or queued-job deletion is required.

The companion Microwave Girls #775 polls preparing website status independently
of the editor and list load, every two seconds. It does not change the publisher's
five-second discovery interval. Local PostgreSQL regression covers the real
attachment method plus Post hooks, standalone changes and rollback isolation.

Verification: 61 creator membership cases (including real PostgreSQL/Kubo) and
56 creator payment cases passed through `npm run test:creator-membership:docker`.
The first new regression exposed separate invalidation instances in the test's
hook-replacement/restart path; transaction identity is now shared across those
instances. No production update or publication was triggered for this fix.


## Creator social labels and post sharing (#1480)

The polished creator theme expands imported social host labels to Ko-fi, X,
Discord, Bluesky and Telegram while preserving custom authored names. Share is
an outlined button with a matching line icon and feedback beside the action.
It uses native sharing where available, then clipboard copying; denial or missing
clipboard support reveals a selectable readonly link. Cancellation of the native
sheet does not trigger an unwanted clipboard write. Shared URLs use the public
post selector on the creator domain, never the current full snapshot CID, and
remain usable before/after stable-domain cutover. The repeated locked-post note
is removed in the polished theme; legacy theme markup is retained.

Verification: strict creator Vue types and 18 focused presentation/share/snapshot
tests passed. The pagination browser flow verified 66 desktop/narrow JS/no-JS
captures, including copied/manual Share feedback and friendly labels seeded from
technical host names. Card, sidebar and narrow manual-copy captures were visually
inspected. No production update or snapshot rebuild was triggered; deploy and
rebuild to publish these template/client changes.
