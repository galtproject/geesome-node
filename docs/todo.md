# GeeSome Node TODO And Fast Delivery Plan

## Source Of Truth

Original user request:

> Analyze the `geesome-node` repo, adjust documentation and agent instructions, check the TODO list, actualize it with `geesome-node` repo issues if needed, make a plan to fast-deliver TODO items, and write it to Markdown.

Corrections and added requirements:

- Chat groups are not finished. They are only a proof of concept, and encryption currently works only in the backend, which is not secure enough. Real secure chat needs frontend-side end-to-end encryption with users' private keys and recipients' public keys. Status: reflected in the secure chat slice and issue cluster.
- Review the Vas3k E2EE article as background for why backend-only encryption is insufficient. Status: referenced in the secure chat notes.
- ActivityPub/Fediverse integration is an important feature. Research it, review the current implementation, document where it should be implemented in `geesome-node`, and decide whether current model schemas or API endpoints should be adjusted for ActivityPub best practices. Status: reflected in this TODO plan and detailed in `docs/activitypub-research.md`.
- `geesome-node` is not inherently "the server side." It is a larger GeeSome app/node that can run locally, but is preferably run on an always-on server when content should be more available to other GeeSome network members. Status: this plan treats it as a node/app, not only a backend server.
- Plans saved to Markdown should keep this `Source Of Truth` section current when the user corrects architecture or adds requirements. Status: this plan has been adjusted under that rule.
- Add Node.js 22 migration to the TODO. Node 22 should become the supported baseline now, with Node 24 tested separately as the next LTS target. Status: implemented in [#779](https://github.com/galtproject/geesome-node/issues/779), with the Helia wrapper dependency update tracked by `geesome-libs` [#119](https://github.com/galtproject/geesome-libs/issues/119); Node 24 remains follow-up validation.
- Add security review of API and encryption flows to the TODO. Status: tracked in [#782](https://github.com/galtproject/geesome-node/issues/782) and added as a fast-delivery security gate.
- API documentation tooling should be handled through microwave-hub submodules for [`apidoc-template`](https://github.com/MicrowaveDev/apidoc-template) and [`apidoc-plugin-ts`](https://github.com/MicrowaveDev/apidoc-plugin-ts). Status: hub submodule tracking is in [Microwave Hub #2](https://github.com/MicrowaveDev/microwave-hub/issues/2), planning was tracked in [#787](https://github.com/galtproject/geesome-node/issues/787), vulnerable `apidoc-core` removal was tracked in [#802](https://github.com/galtproject/geesome-node/issues/802), and final git-URL wiring is tracked in [#804](https://github.com/galtproject/geesome-node/issues/804).

Last issue snapshot: 2026-05-03 from `galtproject/geesome-node` open GitHub issues and PRs.

This file turns the README TODO list into delivery slices that match the current codebase. The repo already has modules for pinning, static-site generation, API keys, content/file catalog, groups, social imports, and media drivers, so the fastest wins are mostly hardening and exposing existing paths.

Important correction: chat groups are not finished. Current encryption is a backend-side proof of concept, which is not enough for secure chat. Real E2EE must encrypt and decrypt in the frontend, with private keys held by users/devices and only public keys available to the node.

## Current Tracker Signals

Recent operational issues:

- [#750 CPU overload problem](https://github.com/galtproject/geesome-node/issues/750) - current highest-risk runtime issue.
- [#733 ERR_CONTENT_LENGTH_MISMATCH on file-catalog request](https://github.com/galtproject/geesome-node/issues/733) - content serving and response header correctness. Status: HEAD route preemption fixed; keep GET stream lifecycle/content-length checks in the content-serving slice.
- [#662 Sticker bug](https://github.com/galtproject/geesome-node/issues/662) - media/content import polish.
- [#646 Add new group type: thread](https://github.com/galtproject/geesome-node/issues/646) - smaller group/feed evolution than secure chat.
- [#641 Move packages to @geesome org](https://github.com/galtproject/geesome-node/issues/641) - package/dependency hygiene.

Dependency security signals:

- The old Dependabot PR batch is no longer open after the Node 22/API-key merges.
- [#783](https://github.com/galtproject/geesome-node/issues/783) tracks the next dependency security pass.
- `yarn audit --groups dependencies --level high` still reports high/critical transitive chains through older dependencies such as old IPFS packages, `sequelize-cli`, `geesome-libs`, and deprecated transitive `request` consumers.

Runtime maintenance:

- Migrate the supported runtime from Node `>=18` to Node 22. Node 18 and Node 20 are EOL or effectively out of support for new GeeSome work. Use Node 22 as the immediate baseline, then validate Node 24 separately.

Issue clusters still represented by the old README TODO:

- Pinning and backups: [#495](https://github.com/galtproject/geesome-node/issues/495), [#493](https://github.com/galtproject/geesome-node/issues/493), [#518](https://github.com/galtproject/geesome-node/issues/518), [#604](https://github.com/galtproject/geesome-node/issues/604).
- Static sites and frontend delivery: [#573](https://github.com/galtproject/geesome-node/issues/573), [#564](https://github.com/galtproject/geesome-node/issues/564), [#494](https://github.com/galtproject/geesome-node/issues/494).
- Permissions and auth: [#522](https://github.com/galtproject/geesome-node/issues/522), [#515](https://github.com/galtproject/geesome-node/issues/515), [#542](https://github.com/galtproject/geesome-node/issues/542), [#190](https://github.com/galtproject/geesome-node/issues/190).
- Security review: [#782](https://github.com/galtproject/geesome-node/issues/782) for API auth and encryption flows.
- Media and content handling: [#423](https://github.com/galtproject/geesome-node/issues/423), [#196](https://github.com/galtproject/geesome-node/issues/196), [#136](https://github.com/galtproject/geesome-node/issues/136), [#609](https://github.com/galtproject/geesome-node/issues/609).
- Group/feed/search evolution: [#646](https://github.com/galtproject/geesome-node/issues/646), [#563](https://github.com/galtproject/geesome-node/issues/563), [#517](https://github.com/galtproject/geesome-node/issues/517), [#33](https://github.com/galtproject/geesome-node/issues/33), [#2](https://github.com/galtproject/geesome-node/issues/2).
- Secure chat E2EE: [#2](https://github.com/galtproject/geesome-node/issues/2), [#33](https://github.com/galtproject/geesome-node/issues/33), [#115](https://github.com/galtproject/geesome-node/issues/115). Use [Vas3k's E2EE explainer](https://vas3k.blog/blog/end_to_end_encryption/) as background for why backend-only encryption and a single long-lived group key are not enough.
- ActivityPub/Fediverse integration: [#426 Make api for Fediverse](https://github.com/galtproject/geesome-node/issues/426).
- API documentation toolchain: [#787](https://github.com/galtproject/geesome-node/issues/787), [#802](https://github.com/galtproject/geesome-node/issues/802), and [#804](https://github.com/galtproject/geesome-node/issues/804), with implementation split across the microwave-hub `apidoc-template` and `apidoc-plugin-ts` submodules before GeeSome Node rewires generated docs to those cleaned-up packages.
- Large protocol/integration epics: [#115](https://github.com/galtproject/geesome-node/issues/115), [#619](https://github.com/galtproject/geesome-node/issues/619), [#617](https://github.com/galtproject/geesome-node/issues/617), [#7](https://github.com/galtproject/geesome-node/issues/7), [#6](https://github.com/galtproject/geesome-node/issues/6).

## Fast Delivery Plan

### 1. Node 22 Runtime Baseline

Status: implemented in [#779](https://github.com/galtproject/geesome-node/issues/779). The required Helia wrapper update landed in `geesome-libs` [#119](https://github.com/galtproject/geesome-libs/issues/119). Follow-up work is limited to broader Node 24 compatibility validation and any runtime regressions found by CI.

Goal: move GeeSome node work onto a supported Node.js runtime before deeper dependency and protocol work.

Scope:

- Added `.nvmrc` and `.node-version` with `22`.
- Updated `package.json` `engines.node` from `>=18` to `>=22 <25`.
- Updated Docker image runtime pin and README dependency docs to Node 22.
- Verify native/runtime-sensitive packages on Node 22: `bcrypt`, `sharp`, `keccak`, `node-mediainfo`, `sequelize-cli`, old IPFS/libp2p-related packages, and `@geesome/ui` build/install paths.
- Keep Node 24 as a follow-up compatibility target, not the only supported runtime yet.

Verification:

- Fresh install on Node 22: passed with `yarn -W --no-optional` after the `geesome-libs` Helia update.
- Storage module Helia import smoke: passed with `node --import tsx --experimental-global-customevent -e "await import('./app/modules/storage/js-ipfs.ts')"`.
- `yarn test`: currently blocked in this sandbox by PostgreSQL/network listener permissions (`SequelizeConnectionError` and `listen EPERM 0.0.0.0:2083`), not by dependency installation.
- Database migration smoke commands if a test database is available.
- Static frontend/package install path that pulls `@geesome/ui`.

### 2. Dependency Security Pass

Status: in progress. [#783](https://github.com/galtproject/geesome-node/issues/783) removed the direct deprecated `request` dependency from the API proxy path. [#785](https://github.com/galtproject/geesome-node/issues/785) removes the unused direct legacy `cids` dependency. [#789](https://github.com/galtproject/geesome-node/issues/789) upgrades `bcrypt` to remove the vulnerable `@mapbox/node-pre-gyp` chain. [#791](https://github.com/galtproject/geesome-node/issues/791) removes the deprecated unused `typings` devDependency. [#793](https://github.com/galtproject/geesome-node/issues/793) removes unused `lerna` dev tooling. [#794](https://github.com/galtproject/geesome-node/issues/794) removes unused `filecoin.js` dev tooling. [#795](https://github.com/galtproject/geesome-node/issues/795) replaces direct `rimraf` usage with Node `fs.rm`. [#796](https://github.com/galtproject/geesome-node/issues/796) bumps `sequelize-cli` within the 6.x line. [#797](https://github.com/galtproject/geesome-node/issues/797) updates Express 4 patch dependencies and removes unused direct `serve-static`. [#798](https://github.com/galtproject/geesome-node/issues/798) aligns shared dependency versions with `geesome-libs` [#123](https://github.com/galtproject/geesome-libs/issues/123) and `geesome-ui` [#1](https://github.com/galtproject/geesome-ui/issues/1). [#800](https://github.com/galtproject/geesome-node/issues/800) removes unused direct `express-mysql-session`, `pg-hstore`, and `node-fetch`, eliminating the direct MySQL/session and HSTORE chains and the visible `underscore` high alert source.

Goal: merge or reproduce the Dependabot bumps in small batches.

Scope:

- Remove or replace direct deprecated dependencies where the code path is small and already covered by import smoke.
- Remove unused direct legacy dependencies that only contribute transitive audit surface.
- Remove stale direct dev tooling that is not called by scripts or source code.
- Start with low-blast-radius transitive/dev bumps when Dependabot opens fresh PRs.
- Handle runtime-sensitive bumps separately: old IPFS package chains, `sequelize-cli`, `axios`, `lodash`, `sequelize`, and any `geesome-libs` lockstep updates.
- For `sequelize`, run database, group, static-site-generator, invite, pin, and social import tests because those modules rely on models and migrations.
- Remaining high/critical alerts need larger migrations rather than direct lockfile bumps: old Telegram bot `request` chains, `@microlink/youtube-dl` CLI helper chains, and old `geesome-libs` wallet/libp2p crypto dependencies. The old `apidoc`/`apidoc-core` chain is being removed separately in [#802](https://github.com/galtproject/geesome-node/issues/802).

Verification:

- API module import smoke for the `request` removal.
- Storage/API import smoke for the `cids` removal.
- Package graph check for stale direct tooling removal.
- Password helper smoke for the `bcrypt` major bump.
- `yarn test`
- `yarn audit --groups dependencies --level high` to document remaining high/critical chains.
- If a single bump fails, isolate with the narrowest mapped test file, then rerun the full test command where local database/runtime permits.

### 3. Content Serving Stabilization

Status: in progress. [#733](https://github.com/galtproject/geesome-node/issues/733) now has a focused API HEAD regression so content-data/file-catalog storage handlers can set their own `Content-Length` and content headers instead of being swallowed by the generic HEAD fallback.

Goal: fix the highest user-visible backend bugs before feature work.

Scope:

- Reproduce [#733](https://github.com/galtproject/geesome-node/issues/733) through `content-data`, `/ipfs/*`, and file-catalog published folder paths.
- Check stream lifecycle, `Content-Length`, `HEAD` handling, and gateway/API duplicate logic.
- Profile [#750](https://github.com/galtproject/geesome-node/issues/750) against recurring jobs, static-site generation, media conversion, and large content responses.

Likely modules:

- `app/modules/content`
- `app/modules/fileCatalog`
- `app/modules/storage`
- `app/modules/api`
- `app/modules/gateway`
- `app/modules/autoActions`

Verification:

- `test/fileCatalog.test.ts`
- `test/storage.test.ts`
- `test/app.test.ts`
- `yarn test`

### 4. Pinata And Pinning MVP

Goal: turn "Pin to services like pinata from UI" into a shippable backend/API slice first.

Scope:

- Audit `pin` module behavior for encrypted account storage, account ownership, group account permissions, and Pinata request error handling.
- Add API docs/examples for account creation, listing, and pin-by-user/group calls.
- Add negative-path tests for missing account, unknown service, remote Pinata error, and group permission denial.
- Wire auto/manual pin behavior through existing `autoActions` only after the direct pin path is tested.

Likely modules:

- `app/modules/pin`
- `app/modules/autoActions`
- `app/modules/content`
- `test/pin.test.ts`

Verification:

- `test/pin.test.ts`
- `test/autoActions.test.ts`
- `yarn test`

### 5. API Key Permissions And Expiration

Status: implemented in [#190](https://github.com/galtproject/geesome-node/issues/190). Disabled and expired API keys no longer authenticate, and authorized API requests now apply the current key's stored permissions as a request-scoped limit on top of the user's core permissions.

Goal: make API keys safer before broader service integrations.

Scope:

- Implemented [#190](https://github.com/galtproject/geesome-node/issues/190) by rejecting disabled or expired keys in API authentication.
- `permissions` on `userApiKey` now constrain core permission checks at request time through an async request context. A user's own permissions remain the upper bound, and the API key must also allow the requested permission.
- Added tests for disabled, expired, and permission-limited API keys.

Likely modules:

- `app/index.ts`
- `app/modules/api`
- `app/modules/database/models/userApiKey.ts`
- `test/app.test.ts`

Verification:

- `test/app.test.ts`
- `yarn test`

### 6. Static Site Generator Polish

Goal: deliver visible improvements without redesigning the protocol.

Scope:

- Finish [#564](https://github.com/galtproject/geesome-node/issues/564) by preferring group avatar for generated favicon when available, falling back to UI favicon.
- Triage [#494](https://github.com/galtproject/geesome-node/issues/494) into concrete options with defaults, validation, and stored option compatibility.
- Treat [#573](https://github.com/galtproject/geesome-node/issues/573) as a separate deployment/distribution task after generated sites are stable.

Likely modules:

- `app/modules/staticSiteGenerator`
- `test/staticSiteGenerator.test.ts`
- `test/render.test.ts`

Verification:

- `test/staticSiteGenerator.test.ts`
- `test/render.test.ts`
- `yarn test`

### 7. API Documentation Toolchain Cleanup

Status: nearly complete. [#802](https://github.com/galtproject/geesome-node/issues/802) upgraded `geesome-node` to `apidoc@1.x` and removed the vulnerable `apidoc-core` package graph. [#804](https://github.com/galtproject/geesome-node/issues/804) wires `geesome-node` to the modern template and TypeScript plugin through git URLs. The repos are tracked by microwave-hub as submodules:

- `apidoc-template` for generated documentation UI/template work.
- `apidoc-plugin-ts` for TypeScript parsing and apiDoc annotation support.

Goal: make generated GeeSome API docs more user-friendly, flexible, and maintainable without hiding parser/template bugs inside `geesome-node`.

Repo split:

- `apidoc-template`: modernized for the `apidoc@1.x` `template/src/*` layout, removes the active old vendored runtime folder, declares package dependencies, and includes a smoke command.
- `apidoc-plugin-ts`: modernized for `apidoc@1.x`, strengthens GeeSome `@apiInterface ... apiParam` handling, ignores TypeScript utility base types such as `Record`, and includes focused parser fixtures.
- `geesome-node`: consumes the cleaned-up template/plugin by git URL and verifies generated docs from `app/modules/api`.
- `microwave-hub`: keep both API-doc repos as submodules so agents can route and coordinate docs tooling work from the hub.

First deliverable:

- Audit current `geesome-node` API doc generation command and package usage. Status: complete in [#802](https://github.com/galtproject/geesome-node/issues/802) and [#804](https://github.com/galtproject/geesome-node/issues/804).
- Consume `apidoc-plugin-ts` and `geesome-apidoc-template` by git URL. Status: in progress in [#804](https://github.com/galtproject/geesome-node/issues/804); the plugin git install fix is in [`apidoc-plugin-ts` PR #2](https://github.com/MicrowaveDev/apidoc-plugin-ts/pull/2).
- Generate docs with the modern custom template. Status: local smoke passes with `app/modules/api`.
- Future polish only: richer endpoint examples, rendered browser/mobile review, and API annotation cleanup for warnings where request-body fields are currently documented as `@apiParam`.

Verification:

- `apidoc-plugin-ts`: `yarn test`
- `apidoc-template`: static/template smoke check and rendered generated-docs review where practical.
- `geesome-node`: `yarn generate-docs` and a quick browser/manual check of the generated `docs/` output.

### 8. API And Encryption Security Review

Goal: run a focused security review before expanding service integrations, ActivityPub federation, and production chat E2EE.

Scope:

- Review API authentication and authorization boundaries, including API-key expiry, disabled keys, scoped key permissions, user/admin permission separation, and route coverage.
- Build a route/permission matrix for protected API endpoints, especially content upload, file catalog, groups, pinning, social imports, ActivityPub inbox/outbox, and service integrations.
- Review encryption boundaries: backend-side chat encryption PoC, frontend E2EE envelopes, key storage, public/private key separation, sender signatures, replay/dedupe metadata, and attachment encryption.
- Review secret handling for node app passphrases, account storage, social-network credentials, Pinata keys, ActivityPub signing keys, and local client bindings.
- Model abuse cases: stolen API key, expired/disabled token reuse, scoped-token privilege escalation, replayed encrypted chat envelope, malicious ActivityPub request, and oversized upload/content-serving DoS.

Deliverables:

- Threat model and findings document.
- Route/permission matrix.
- Test checklist for authorization and encryption boundaries.
- Follow-up issues for concrete vulnerabilities or missing controls.

Verification:

- Docs review against [#782](https://github.com/galtproject/geesome-node/issues/782).
- Targeted tests for any concrete auth/encryption fixes created from the review.

### 9. Secure Chat E2EE Design

Goal: replace the backend encryption PoC with an implementation plan that can become real end-to-end encrypted chat.

This is not a quick backend-only fix. The node can store encrypted payloads, publish public keys, route messages, and keep membership metadata, but it must not see plaintext messages or user private keys.

Cryptographic direction:

- Private keys live in the frontend/device key store, never in `geesome-node`.
- Public identity/device keys are published through user manifests or a dedicated key directory.
- Message payloads and attachments are encrypted client-side with symmetric content keys.
- Content keys are wrapped for recipients/devices using their public keys or a group ratchet/session protocol.
- Group membership changes require key rotation so removed members cannot read future messages.
- For serious group chat, evaluate Matrix Olm/Megolm, Signal-style pairwise sessions plus sender keys, or MLS rather than inventing a custom protocol.

Delivery and stability direction:

- Do not treat libp2p PubSub/GossipSub as the durable chat database. It is useful for online propagation, but disconnected devices still need history backfill.
- Persist signed opaque encrypted envelopes in `geesome-node` or another durable GeeSome/IPFS-backed message log so clients can reconnect and fetch missed messages.
- Track `messageId`, `conversationId`, sender device, recipient device set, created timestamp, delivery attempts, and acknowledgement state separately from ciphertext.
- Add idempotent send APIs and client-side dedupe by `messageId`; retries must not create duplicate chat messages.
- Define ordering rules before UI work: append-only per-conversation sequence, Lamport/vector-style causal metadata, or another explicit merge rule for offline concurrent sends.
- Add store-and-forward paths for offline recipients and multi-device users. libp2p direct streams/pubsub can accelerate delivery, but API/IPFS backfill should be the recovery path.
- Run realistic tests with restart, offline sender/recipient, NAT/browser clients, duplicate delivery, delayed delivery, and large attachments. Attachment bytes should be content-addressed separately and referenced from the encrypted envelope.

Repo split:

- `geesome-ui`: key generation/import/export UX, local private-key storage, encryption/decryption, recipient/device trust UI.
- `geesome-libs`: crypto helper APIs, manifest schemas, key wrapping, message envelope encoding, compatibility tests. Initial opaque envelope helpers are tracked in `geesome-libs` [#121](https://github.com/galtproject/geesome-libs/issues/121).
- `geesome-node`: storage/routing APIs for encrypted envelopes, public key lookup, membership metadata, delivery status, and migration away from backend plaintext handling.

First deliverable:

- Write a protocol design note with threat model, device model, key lifecycle, group membership flow, offline recipients, recovery, and migration from the current PoC.
- Mark backend encrypted chat endpoints as PoC/unsafe until frontend E2EE lands.
- Add tests proving the node can persist and return opaque encrypted envelopes without needing plaintext.
- Reuse the shared `geesome-libs` E2EE envelope helper contract from [#121](https://github.com/galtproject/geesome-libs/issues/121) for frontend/node compatibility tests.
- Add transport stability tests proving chat still works when realtime libp2p delivery is unavailable and clients recover through stored envelope backfill.

Verification:

- Design review across `geesome-node`, `geesome-libs`, and `geesome-ui`.
- Node tests for opaque envelope storage.
- Frontend/browser tests once client crypto exists.

### 10. ActivityPub/Fediverse Integration MVP

Goal: make GeeSome groups/posts visible and interoperable through ActivityPub without losing the IPFS/IPNS-first storage model.

This is an important protocol-facing feature, not only a generic integration. The first delivery should define a minimal compatible ActivityPub surface before implementing broad Mastodon-style behavior.

Research note: [activitypub-research.md](./activitypub-research.md).

Scope:

- Map GeeSome identities/groups to ActivityPub actors.
- Expose WebFinger discovery for local actors.
- Add actor, outbox, inbox, followers, and following endpoints.
- Represent published group posts as ActivityPub `Create` activities with `Note`/attachment objects and stable GeeSome/IPFS links.
- Verify HTTP signatures for inbound activities and sign outbound activities.
- Store inbound follows/accepts and minimal remote actor metadata.
- Keep moderation, deletes/updates, rich media federation, and full timeline syncing for later slices.
- Decide whether to adopt Fedify. Current Fedify 2.2.0 covers WebFinger, ActivityStreams vocabulary, HTTP Signatures, HTTP Message Signatures, testing, and Express integration, but declares Node `>=22`; this repo currently declares Node `>=18`.

Likely modules:

- New `app/modules/activityPub` module.
- `app/modules/group` for local group/post mapping.
- `app/modules/content` for attachment URLs and media metadata.
- `app/modules/api` for unversioned POST/raw body support.
- ActivityPub-specific Sequelize models for actor, remote actor, follow, object, and delivery records.

Do not reuse `remoteGroup` as the ActivityPub remote actor store; it is GeeSome/IPFS-manifest oriented, while ActivityPub uses HTTPS actor IDs and signed HTTP.

First deliverable:

- Decide actor type and URL shape for GeeSome groups.
- Decide Node 22/Fedify adoption versus a minimal custom module.
- Design the ActivityPub data model and endpoint contract.
- Implement read-only actor/outbox/WebFinger for one local group.
- Add tests with deterministic JSON-LD payloads and signature fixtures.
- Reuse the shared deterministic ActivityPub helper contract from `geesome-libs` [#121](https://github.com/galtproject/geesome-libs/issues/121) for actor, WebFinger, Note/Create, digest, and request-signature fixtures.

Verification:

- New module tests for actor serialization, WebFinger, and outbox payloads.
- Existing `test/group.test.ts` for post compatibility.
- Later integration smoke against a local ActivityPub test server.

## Deferred Epics

These are still valid but not fast-delivery work:

- Production secure chat groups after the design note: client-side E2EE, device keys, trust UX, and group key rotation.
- Local/in-browser IPNS accounts and client signing: [#115](https://github.com/galtproject/geesome-node/issues/115).
- PubSub/service communication and remote node backup.
- Matrix, Filecoin, Yacy/search integration: [#619](https://github.com/galtproject/geesome-node/issues/619), [#617](https://github.com/galtproject/geesome-node/issues/617), [#603](https://github.com/galtproject/geesome-node/issues/603).
- Mobile app and browser extension: [#7](https://github.com/galtproject/geesome-node/issues/7), [#6](https://github.com/galtproject/geesome-node/issues/6).

## Maintenance Rule

When a TODO item is delivered, update this file and the README TODO summary in the same PR. If an item becomes primarily frontend work, move the implementation plan to `geesome-ui` and leave only the backend contract here.
