# GeeSome Node Implemented Work

## Purpose

This document records delivered foundations that were previously mixed into the
active TODO plan. It is an implementation index, not a claim that every product
area is permanently finished.

Current unfinished work lives in [todo.md](./todo.md). Detailed design and
operational notes remain in their dedicated documents and module-local `docs`
directories.

Last consolidated: 2026-07-31.

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
