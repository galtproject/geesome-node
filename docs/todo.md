# GeeSome Node Active TODO

## Purpose

This file contains only unfinished work and operational follow-ups. Delivered
foundations and their verification history live in
[implemented.md](./implemented.md).

Use the stable `todo-section` markers with:

```bash
npm run todo:sections
npm run todo:context -- <section-id>
```

When a section is completed, move its durable outcome and verification evidence
to `implemented.md`, remove it from this file, and update the README summary in
the same pull request.

## Current Priority

1. Complete browser-first secure chat beyond direct messages.
2. Complete the ActivityPub/Bluesky operator-run release gates.
3. Finish API route ownership and public-route abuse coverage.
4. Complete static-site settings and delivery polish.
5. Attribute content-serving CPU incidents before changing runtime behavior.
6. Continue bounded runtime/dependency, media/upload, group/feed, and
   social-import follow-ups.

<!-- todo-section: activitypub-bluesky-live-interop-smoke -->
## ActivityPub/Bluesky: Live Release Gates

Goal: prove the implemented federation and native Bluesky paths against real
systems without making live credentials or public services part of deterministic
CI.

Remaining work:

- Run the credentialed native Bluesky write lifecycle with a disposable account:
  account verification, create, idempotent repeat, update, delete, source import,
  source refresh, and image-upload-failure public-link fallback.
- Run full public staging-node ActivityPub exchange with an external actor:
  discovery, actor/outbox/object reads, signed inbox/shared-inbox delivery,
  follow/accept, Create, Update, Delete/Tombstone, and retry behavior.
- Run an externally signed ActivityPub ownership challenge when compatible
  tooling is available. Record a clear skip when the selected hosted service
  cannot sign the required request.
- Record secret-free reports and feed demonstrated product/protocol gaps into
  focused follow-up issues or pull requests. Do not reopen completed foundations
  without new evidence.

Existing commands:

- `npm run activitypub:interop-smoke`
- `npm run activitypub:remote-server-smoke`
- `npm run activitypub:bluesky-bridge-smoke`
- `npm run activitypub:ownership-challenge-smoke`
- `npm run bluesky:atproto-smoke`
- `npm run bluesky:credentialed-smoke`

Release gate:

- Deterministic tests remain required.
- Missing disposable credentials, a public staging node, or an external signer
  must be reported as a skip, not a pass.
- Keep the runbook in
  `app/modules/activityPub/docs/live-interoperability.md` aligned with results.
<!-- /todo-section -->

<!-- todo-section: browser-first-chat-e2ee -->
## Secure Chat: Browser-First E2EE

Goal: complete the browser-first end-to-end encrypted chat foundation without
allowing GeeSome nodes to receive plaintext messages, plaintext attachments, or
user/device private keys.

Architecture decision:

- Follow
  [Reliable IPFS Chat Research](./ipfs-chat-reliability-research.md).
- Use a durable, signed, append-only encrypted event log as the source of truth.
- Treat Fluence, libp2p PubSub, WebSocket notifications, and future direct
  browser transports as replaceable live hints. Losing every hint must delay
  delivery without losing a message.
- Optimize delivery for mutually reachable, running GeeSome/IPFS nodes, while
  retaining an encrypted outbound queue when a recipient node is temporarily
  unavailable.
- Use reciprocal Kubo peering to improve live node-to-node connectivity.
  Bootstrap peers are discovery entry points and must not be treated as durable
  relays, mailboxes, or delivery guarantees.
- Keep PostgreSQL as the operational authorization, head, acknowledgement, and
  retry index. Consider encrypted IPLD event batches or checkpoints for portable
  replication only after the operational path is proven.
- Use MLS 1.0 for group membership and future-message key rotation according to
  [Group Chat E2EE Protocol Decision](./chat-group-e2ee-protocol-decision.md).
  Matrix remains an operational reference rather than the group wire protocol.

Current safety boundary:

- Browser/device key generation, protected local storage, encrypted recovery,
  registration, revocation, direct-message encryption/decryption, ordered
  reads, client dedupe, and delivery-state UI are implemented in `geesome-ui`.
- `geesome-node` stores signed opaque envelopes, assigns deterministic local
  sequence numbers, retries authenticated HTTPS delivery, verifies
  recipient-signed acknowledgements, and repairs missing ranges from signed
  source heads. It does not receive browser private keys or message plaintext.
- Signed user manifests advertise canonical identity-bound chat transport when
  configured. Older profiles remain valid and produce an actionable unavailable
  state instead of falling back to plaintext.
- Direct messages and encrypted attachment lifecycle are the implemented E2EE
  foundation. Chat must not be described as production-secure for groups until
  MLS membership/key rotation, explicit event retention, and real multi-node
  browser tests are complete.

Remaining delivery order:

1. Promote the independent-process restart and reordered-repair scenarios into
   real two-browser/two-node tests. Add revoked-device, separate-IPFS-node, and
   NAT/bootstrap/reciprocal-peering conditions.
2. Define operator-visible queue/reconciliation metrics and explicit encrypted
   event retention, retry deadline, quota, and cleanup policy. Migrate or
   explicitly retire the legacy server-encrypted path without relabelling old
   conversations as E2EE.
3. Integrate MLS group chat through the staged checklist below. Start with a
   maintained browser dependency that passes GeeSome's required behavior tests;
   do not add partial production routes around a dependency that fails them.

MLS group-chat integration checklist:

1. Select and pin a maintained browser dependency. Run the same deterministic
   create, join, add, remove, restart, interrupted-update, and larger-group
   scenarios against every candidate.
2. Add a small `geesome-libs` adapter that owns versioned MLS byte encoding,
   GeeSome device identity binding, application-message framing, and shared
   cross-package fixtures. Keep package-specific calls out of product modules.
3. Add browser-owned MLS state storage in `geesome-ui`, including atomic state
   updates, restart recovery, clear-on-logout/device-removal behavior, and an
   explicit unrecoverable-state screen. GeeSome nodes must receive only opaque
   protocol values.
4. After the dependency passes, add bounded node storage and delivery contracts
   for group metadata, one-time join packages, device-specific Welcome values,
   proposals, commits, and application events. Reuse the existing durable event
   log, queue, acknowledgement, and missing-range repair machinery.
5. Implement group creation and device join first. Then add another device,
   remove a device, remove an account's remaining devices, restore a device as a
   new member, and reconcile database membership with the current MLS epoch as
   explicit user actions.
6. Serialize membership updates through the canonical group node. Reject stale
   expected epochs, reload the accepted update, discard interrupted local work,
   and let the browser rebuild the requested change when it is still allowed.
7. Add group-message and encrypted-attachment UI using the existing chat
   conversation surface. Show joining, waiting for an update, retrying,
   unsupported client, removed device, and unavailable older history states in
   ordinary user language.
8. Add real two-browser/two-node tests for restart, temporary node
   unreachability, duplicate and reordered events, interrupted membership
   updates, simultaneous updates, device removal, attachment delivery, and
   bounded history repair.
9. Enable the feature only for newly created group conversations behind a
   capability flag. Keep direct messages unchanged and keep older group chats
   visibly on their existing mode until an explicit migration flow exists.

MLS implementation findings:

- **Open:** In the July 2026 browser check, membership changes were not applied
  consistently. After one device was removed from the test group, that device
  could still process a group message sent afterward.
- **Open:** The reviewed packages did not provide all browser restart,
  device-management, and interrupted-update recovery operations required by
  the checklist.
- During implementation, add every unexpected behavior here with its date,
  affected flow, smallest reproduction, expected result, actual result, package
  version, and status (`open`, `verified`, `resolved`, or `deferred`). Resolve or
  explicitly defer each entry before enabling the capability by default.

Transport requirements:

- Treat every live transport as optional online propagation, not durable
  storage.
- Define idempotent send and deterministic dedupe by `messageId`.
- Define deterministic sequence/log-head comparison and conflict behavior.
- Reconcile heads after subscription, reconnect, and at a bounded periodic
  interval while both nodes are running.
- Authenticate the repair peer against the expected GeeSome static identity and
  IPFS peer ID; an IP address or URL alone is insufficient.
- Keep encrypted content pinned on the sender until the receiving node confirms
  fetch, verification, persistence, and pinning. A successful PubSub publish
  must not be presented as remote receipt.
- Queue opaque encrypted delivery when a recipient node is unavailable and
  resume after either node restarts. Never store plaintext or client private
  keys in queue state.
- Enforce configurable retry deadlines and quotas. A deadline or permanent
  rejection stops automatic retries but must remain visible and must not
  silently delete encrypted content or pins. Cleanup is explicit or governed by
  a separately documented retention policy.
- Use opaque, rotatable topic identifiers or direct streams so public topic
  names do not expose account/group names.
- Test browser-compatible WebTransport/WebRTC/relay paths separately from the
  authenticated HTTP/WebSocket durable sync baseline.

Verification:

- Cross-package compatibility fixtures for envelope encoding and key wrapping.
- Browser tests with two users where either node cannot inspect plaintext.
- Duplicate, delayed, reordered, briefly disconnected, and retry scenarios
  between otherwise running nodes.
- A test that drops 100% of PubSub/communicator notifications and still
  recovers every locally accepted event through sequence/head reconciliation.
- Recipient restart after persistence but before acknowledgement, browser
  resubmission after a rejected local save, brief network partition,
  reciprocal-peering reconnect, remote fetch/pin failure, and database/storage
  failure scenarios.
- Concurrent worker lease recovery, quota/expiry, permanent rejection, and
  membership-removal cancellation.
- Membership removal and key rotation proving removed devices cannot decrypt new
  messages.
- Encrypted attachment upload/download and corruption/tamper failure tests.
- A regression proving the node persists and returns opaque envelopes without
  possessing client private keys.
- Operational metrics for queue depth/age, oldest unacknowledged event, retry
  count, permanent failures, head divergence, reconciliation lag, fetch/pin
  failures, and peer availability.
<!-- /todo-section -->

<!-- todo-section: api-security-remaining -->
## API And Encryption Security: Remaining Coverage

Goal: complete the route-level authorization and abuse review before expanding
public federation and secure-chat surfaces.

Remaining work:

- Finish the token-only route ownership matrix for modules not yet covered by the
  async-operation and core group mutation passes.
- Add public-route abuse coverage for ActivityPub discovery/inbox paths, content
  serving, uploads, authentication, remote fetches, and other unauthenticated or
  externally triggered work.
- Verify request size, pagination, timeout, concurrency, replay, rate-limit, and
  SSRF boundaries where each route can cause storage, network, database, or CPU
  work.
- Keep API/social/Pinata/ActivityPub secrets write-only and add negative tests
  whenever a new credential-bearing route appears.
- Review browser-first chat boundaries as part of the E2EE design: the node may
  publish public device keys and store ciphertext but must never receive client
  private keys.

Verification:

- `npm run security:route-inventory:update`
- Review `docs/security-route-inventory.md` and
  `docs/security-route-ownership.md`.
- `npm run security:route-inventory`
- Focused authorization and abuse tests for every changed route.
<!-- /todo-section -->

<!-- todo-section: static-site-settings-delivery -->
## Static Sites: Settings And Delivery

Goal: finish operator-visible static-site settings and distribution without
regressing the stabilized renderer.

Remaining work:

- Complete the active static-site settings slice with explicit defaults,
  validation, normalized numeric render settings, bounded custom CSS, compatible
  stored options, and persisted normalized options.
- Keep the completed group-avatar favicon fallback behavior covered.
- Handle generated-site frontend delivery/distribution as a separate task after
  settings are stable.
- Preserve fresh Vue SSR app/router state per render and keep generated clients
  free from diagnostic console noise while retaining the intentional developer
  banner.

Verification:

- Focused `staticSiteGenerator` and render tests.
- Repeated multi-page rendering to detect cross-page state leakage.
- Generated frontend publication smoke and browser review.
<!-- /todo-section -->

<!-- todo-section: content-serving-cpu-attribution -->
## Content Serving: CPU Attribution

Goal: turn CPU saturation reports into a reproducible GeeSome, Kubo, proxy,
PostgreSQL, media-conversion, request, background-job, or storage-I/O profile
before changing application behavior.

Current foundation:

- Opt-in runtime snapshots correlate process CPU, event-loop utilization/delay,
  memory, system load, and bounded API/gateway request interval counters.
- Profiling avoids paths, query values, headers, bodies, user IDs, and response
  payloads.
- The operator workflow is documented in
  [runtime-performance-diagnostics.md](./runtime-performance-diagnostics.md).

Next incident work:

- Capture the GeeSome runtime profiler, `pidstat`/`top`, nginx metrics, Kubo
  stats, and PostgreSQL activity over the same incident window.
- If GeeSome CPU and event-loop utilization are high, capture a bounded Node CPU
  profile and add a focused benchmark for the hottest route or job.
- If system load is high while GeeSome CPU is low, investigate Kubo, nginx,
  PostgreSQL, media conversion, or storage I/O first.
- Do not use expected Docker dependency/frontend builds as evidence of a runtime
  content-serving incident.

Verification:

- Keep profiler unit tests for completed/aborted request counts, interval reset,
  and numeric CPU/event-loop fields.
- Keep API/gateway tests quiet and unchanged when profiling is disabled.
<!-- /todo-section -->

<!-- todo-section: runtime-dependency-followups -->
## Runtime And Dependency Follow-Ups

Goal: keep the supported runtime and package graph maintainable without unsafe
major-version overrides.

Remaining work:

- Test Node 24 as the next compatibility target while Node 22 remains the
  supported baseline.
- Reassess moderate audit findings in legacy wallet/Web3 provider, `request` /
  `tough-cookie`, and Bootstrap/API-doc chains. Prefer replacing or removing the
  owning dependency over blind transitive overrides.
- Keep shared dependency versions aligned across `geesome-node`,
  `geesome-libs`, and `geesome-ui`; treat Vue, ethers, MIME, Sequelize, and
  storage-stack major changes as explicit migrations.
- Run focused native/runtime-sensitive checks for bcrypt, sharp, keccak, media
  tooling, Sequelize, Kubo/Helia, and frontend publication when their dependency
  paths change.

Verification:

- Fresh Node 24 install/import smoke and Docker suite.
- `yarn audit --groups dependencies --level high`
- Targeted module tests followed by `npm run test:docker`.
<!-- /todo-section -->

<!-- todo-section: media-content-views-uploads -->
## Media, Content Views, And Uploads

Goal: make media ingestion and presentation predictable across file, photo,
sticker, animation, and composed-image use cases without widening unsafe preview
or browser-rendering behavior.

Open issue-backed work:

- Reproduce and fix the sticker bug in
  [#662](https://github.com/galtproject/geesome-node/issues/662).
- Define portable image composition with SVG sticker inputs in
  [#1272](https://github.com/galtproject/geesome-node/issues/1272), keeping
  untrusted SVG active content outside browser execution paths.
- Add explicit preview-driver type policy for
  [#609](https://github.com/galtproject/geesome-node/issues/609).
- Clarify file/photo/sticker content views from
  [#423](https://github.com/galtproject/geesome-node/issues/423) across API
  metadata and frontend rendering.
- Design resumable chunked upload for
  [#196](https://github.com/galtproject/geesome-node/issues/196) with bounded
  parts, idempotent completion, cleanup, quota accounting, and restart behavior.
- Revisit GIF/SVG acceptance from
  [#136](https://github.com/galtproject/geesome-node/issues/136) with MIME
  sniffing, sanitizer/render policy, size limits, and preview isolation.

Verification:

- Deterministic media fixtures, including malformed MIME/extension combinations.
- Browser rendering tests proving untrusted SVG cannot execute active content.
- Upload interruption/resume, duplicate part, quota, cleanup, and restart tests.
- Mobile/desktop post/content view E2E without broken previews or layout overflow.
<!-- /todo-section -->

<!-- todo-section: group-thread-feed-evolution -->
## Groups: Thread And Feed Evolution

Goal: support thread/feed-oriented group views while preserving existing
group/post API behavior and large-group pagination guarantees.

Remaining work:

- Define thread group semantics, root/reply ordering, moderation, permissions,
  counters, and compatibility with existing `replyToId`/relation metadata.
- Design API and UI behavior around cursor pagination rather than loading full
  groups.
- Preserve ActivityPub/Bluesky reply and quote identity when rendering mixed
  local and remote context.
- Add large-thread fixtures before adding denormalized counters or new indexes.

Verification:

- Group/post permission and relation tests.
- Cursor-pagination tests for deep and wide threads.
- Frontend mobile/desktop E2E for collapsed, expanded, deleted, and remote-context
  replies.
<!-- /todo-section -->

<!-- todo-section: social-backup-import -->
## Social Backup And Import

Goal: improve reliable backup/import workflows for Telegram and
Twitter-compatible sources without bypassing moderation, identity, or bounded
async-operation rules.

Remaining work:

- Inventory current Telegram/Twitter-compatible import gaps using real bounded
  fixtures and operator feedback.
- Keep imports resumable and idempotent with stable source identity, explicit
  update/delete semantics, bounded pagination, and durable progress.
- Preserve replies, reposts, quotes, media provenance, and remote placeholders
  where source APIs expose them.
- Route long-running imports through shared async operations and make retries
  safe after restart.

Verification:

- Deterministic source fixtures and importer tests.
- Restart/resume, duplicate-page, deletion, media-failure, and rate-limit tests.
- Production-like dry runs that do not require live credentials in CI.
<!-- /todo-section -->

<!-- todo-section: production-storage-database-tuning -->
## Production Storage And Database Tuning

Goal: maintain the completed scalability and storage-analyzer foundations using
production evidence rather than adding speculative models or migrations.

Remaining work:

- Rerun restored-database migration, integrity, derived-state, pressure, and
  storage-space reports against larger production-like dumps when available.
- Tune storage-space DHT/provider sampling only after observing actual Kubo cost;
  add richer availability/popularity signals without calling provider counts
  exact global popularity.
- Define identity/trust policy before adding canonical `StorageObject` producers
  for generated/static outputs, ActivityPub objects, or other protocol-owned
  artifacts.
- Consider static-ID history archiving only when a concrete recovery or audit
  requirement justifies it.
- Prepare release-bound migrations and migration-integrity checks when promoting
  unreleased `dev` schemas to production. Do not store temporary development-only
  table-creation migrations in Git.
- Add provider-specific status adapters before reconciling additional pinning
  services or custom endpoints; uncertainty must remain fail-closed.

Verification:

- `npm run database:migration-rehearsal` against a confirmed restored backup.
- `npm run database:migration-integrity`
- `npm run database:derived-state-integrity`
- `npm run database:storage-space-report`
- Deterministic mocked Kubo/provider tests plus bounded production observation.
<!-- /todo-section -->

<!-- todo-section: open-issue-reconciliation -->
## Open Issue Reconciliation

Goal: keep the issue tracker aligned with shipped behavior and this active plan.

Current findings:

- Several open issues overlap work recorded as implemented, including API-key
  permissions, Pinata automation, ActivityPub API foundations, and recent
  Bluesky policy UI consumption.
- Verify each issue's acceptance criteria against `dev`; close it when complete,
  or rewrite the remaining gap and add it to the relevant deterministic section.
- Do not treat an open issue number alone as proof that a shipped foundation must
  be rebuilt.

Initial reconciliation set:

- [#522](https://github.com/galtproject/geesome-node/issues/522)
- [#495](https://github.com/galtproject/geesome-node/issues/495)
- [#426](https://github.com/galtproject/geesome-node/issues/426)
- [#1214](https://github.com/galtproject/geesome-node/issues/1214)
- [#1216](https://github.com/galtproject/geesome-node/issues/1216)
- [#1218](https://github.com/galtproject/geesome-node/issues/1218)

Verification:

- Link the implementing pull request or commit when closing an issue.
- If acceptance criteria remain, record only the concrete delta in this TODO.
<!-- /todo-section -->

<!-- todo-section: deferred-protocol-epics -->
## Deferred Protocol And Client Epics

These remain valid but are not ahead of the active priorities above:

- Local/in-browser IPNS accounts and client-side signing.
- PubSub/service communication and remote node backup.
- Timeline/search, post-history, and additional group/content presentation modes.
- Matrix, Filecoin, and decentralized search integrations.
- Mobile app and browser extension.

Each epic should receive its own deterministic TODO section before implementation.
<!-- /todo-section -->
