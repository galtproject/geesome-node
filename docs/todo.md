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

Last issue snapshot: 2026-05-03 from `galtproject/geesome-node` open GitHub issues and PRs.

This file turns the README TODO list into delivery slices that match the current codebase. The repo already has modules for pinning, static-site generation, API keys, content/file catalog, groups, social imports, and media drivers, so the fastest wins are mostly hardening and exposing existing paths.

Important correction: chat groups are not finished. Current encryption is a backend-side proof of concept, which is not enough for secure chat. Real E2EE must encrypt and decrypt in the frontend, with private keys held by users/devices and only public keys available to the node.

## Current Tracker Signals

Recent operational issues:

- [#750 CPU overload problem](https://github.com/galtproject/geesome-node/issues/750) - current highest-risk runtime issue.
- [#733 ERR_CONTENT_LENGTH_MISMATCH on file-catalog request](https://github.com/galtproject/geesome-node/issues/733) - content serving and response header correctness.
- [#662 Sticker bug](https://github.com/galtproject/geesome-node/issues/662) - media/content import polish.
- [#646 Add new group type: thread](https://github.com/galtproject/geesome-node/issues/646) - smaller group/feed evolution than secure chat.
- [#641 Move packages to @geesome org](https://github.com/galtproject/geesome-node/issues/641) - package/dependency hygiene.

Open Dependabot PRs that should be handled as security/maintenance work:

- [#776 axios 1.12.0 to 1.15.0](https://github.com/galtproject/geesome-node/pull/776)
- [#775 lodash 4.17.21 to 4.18.1](https://github.com/galtproject/geesome-node/pull/775)
- [#774 handlebars 4.7.8 to 4.7.9](https://github.com/galtproject/geesome-node/pull/774)
- [#773 picomatch 2.3.1 to 2.3.2](https://github.com/galtproject/geesome-node/pull/773)
- [#772 sequelize 6.37.5 to 6.37.8](https://github.com/galtproject/geesome-node/pull/772)
- [#771 immutable 4.3.2 to 4.3.8](https://github.com/galtproject/geesome-node/pull/771)
- [#770 dottie 2.0.6 to 2.0.7](https://github.com/galtproject/geesome-node/pull/770)
- [#769 ajv 6.12.6 to 6.14.0](https://github.com/galtproject/geesome-node/pull/769)
- [#768 pbkdf2 3.1.2 to 3.1.5](https://github.com/galtproject/geesome-node/pull/768)

Runtime maintenance:

- Migrate the supported runtime from Node `>=18` to Node 22. Node 18 and Node 20 are EOL or effectively out of support for new GeeSome work. Use Node 22 as the immediate baseline, then validate Node 24 separately.

Issue clusters still represented by the old README TODO:

- Pinning and backups: [#495](https://github.com/galtproject/geesome-node/issues/495), [#493](https://github.com/galtproject/geesome-node/issues/493), [#518](https://github.com/galtproject/geesome-node/issues/518), [#604](https://github.com/galtproject/geesome-node/issues/604).
- Static sites and frontend delivery: [#573](https://github.com/galtproject/geesome-node/issues/573), [#564](https://github.com/galtproject/geesome-node/issues/564), [#494](https://github.com/galtproject/geesome-node/issues/494).
- Permissions and auth: [#522](https://github.com/galtproject/geesome-node/issues/522), [#515](https://github.com/galtproject/geesome-node/issues/515), [#542](https://github.com/galtproject/geesome-node/issues/542), [#190](https://github.com/galtproject/geesome-node/issues/190).
- Media and content handling: [#423](https://github.com/galtproject/geesome-node/issues/423), [#196](https://github.com/galtproject/geesome-node/issues/196), [#136](https://github.com/galtproject/geesome-node/issues/136), [#609](https://github.com/galtproject/geesome-node/issues/609).
- Group/feed/search evolution: [#646](https://github.com/galtproject/geesome-node/issues/646), [#563](https://github.com/galtproject/geesome-node/issues/563), [#517](https://github.com/galtproject/geesome-node/issues/517), [#33](https://github.com/galtproject/geesome-node/issues/33), [#2](https://github.com/galtproject/geesome-node/issues/2).
- Secure chat E2EE: [#2](https://github.com/galtproject/geesome-node/issues/2), [#33](https://github.com/galtproject/geesome-node/issues/33), [#115](https://github.com/galtproject/geesome-node/issues/115). Use [Vas3k's E2EE explainer](https://vas3k.blog/blog/end_to_end_encryption/) as background for why backend-only encryption and a single long-lived group key are not enough.
- ActivityPub/Fediverse integration: [#426 Make api for Fediverse](https://github.com/galtproject/geesome-node/issues/426).
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

Goal: merge or reproduce the Dependabot bumps in small batches.

Scope:

- Start with low-blast-radius transitive/dev bumps: `picomatch`, `handlebars`, `immutable`, `dottie`, `ajv`, `pbkdf2`.
- Handle runtime-sensitive bumps separately: `axios`, `lodash`, `sequelize`.
- For `sequelize`, run database, group, static-site-generator, invite, pin, and social import tests because those modules rely on models and migrations.

Verification:

- `yarn test`
- If a single bump fails, isolate with the narrowest mapped test file, then rerun the full test command.

### 3. Content Serving Stabilization

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

Goal: make API keys safer before broader service integrations.

Scope:

- Implement [#190](https://github.com/galtproject/geesome-node/issues/190) by rejecting disabled or expired keys in API authentication.
- Clarify whether `permissions` on `userApiKey` should constrain core permissions at request time.
- Add tests for disabled, expired, and permission-limited API keys.

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

### 7. Secure Chat E2EE Design

Goal: replace the backend encryption PoC with an implementation plan that can become real end-to-end encrypted chat.

This is not a quick backend-only fix. The node can store encrypted payloads, publish public keys, route messages, and keep membership metadata, but it must not see plaintext messages or user private keys.

Cryptographic direction:

- Private keys live in the frontend/device key store, never in `geesome-node`.
- Public identity/device keys are published through user manifests or a dedicated key directory.
- Message payloads and attachments are encrypted client-side with symmetric content keys.
- Content keys are wrapped for recipients/devices using their public keys or a group ratchet/session protocol.
- Group membership changes require key rotation so removed members cannot read future messages.
- For serious group chat, evaluate Matrix Olm/Megolm, Signal-style pairwise sessions plus sender keys, or MLS rather than inventing a custom protocol.

Repo split:

- `geesome-ui`: key generation/import/export UX, local private-key storage, encryption/decryption, recipient/device trust UI.
- `geesome-libs`: crypto helper APIs, manifest schemas, key wrapping, message envelope encoding, compatibility tests. Initial opaque envelope helpers are tracked in `geesome-libs` [#121](https://github.com/galtproject/geesome-libs/issues/121).
- `geesome-node`: storage/routing APIs for encrypted envelopes, public key lookup, membership metadata, delivery status, and migration away from backend plaintext handling.

First deliverable:

- Write a protocol design note with threat model, device model, key lifecycle, group membership flow, offline recipients, recovery, and migration from the current PoC.
- Mark backend encrypted chat endpoints as PoC/unsafe until frontend E2EE lands.
- Add tests proving the node can persist and return opaque encrypted envelopes without needing plaintext.
- Reuse the shared `geesome-libs` E2EE envelope helper contract from [#121](https://github.com/galtproject/geesome-libs/issues/121) for frontend/node compatibility tests.

Verification:

- Design review across `geesome-node`, `geesome-libs`, and `geesome-ui`.
- Node tests for opaque envelope storage.
- Frontend/browser tests once client crypto exists.

### 8. ActivityPub/Fediverse Integration MVP

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
