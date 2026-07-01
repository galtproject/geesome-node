# GeeSome Node TODO And Fast Delivery Plan

## Source Of Truth

Original user request:

> Analyze the `geesome-node` repo, adjust documentation and agent instructions, check the TODO list, actualize it with `geesome-node` repo issues if needed, make a plan to fast-deliver TODO items, and write it to Markdown.

Corrections and added requirements:

- Chat groups are not finished. They are only a proof of concept, and encryption currently works only in the backend, which is not secure enough. Real secure chat needs frontend-side end-to-end encryption with users' private keys and recipients' public keys. Status: reflected in the secure chat slice and issue cluster.
- Review the Vas3k E2EE article as background for why backend-only encryption is insufficient. Status: referenced in the secure chat notes.
- ActivityPub/Fediverse integration is an important feature. Research it, review the current implementation, document where it should be implemented in `geesome-node`, and decide whether current model schemas or API endpoints should be adjusted for ActivityPub best practices. Status: reflected in this TODO plan and detailed in `docs/activitypub-research.md`.
- User post text should not use raw HTML as the canonical storage format for social-network and decentralized interop. Store a small versioned semantic rich-text document as the source of truth, render sanitized HTML only for ActivityPub/Matrix/static/admin adapter outputs, and export plain text plus structured facets/tags/mentions for Bluesky/ATProto, Farcaster, Nostr-like protocols, and similar networks. Status: added to the ActivityPub/Fediverse plan as the content-format backlog.
- `geesome-node` is not inherently "the server side." It is a larger GeeSome app/node that can run locally, but is preferably run on an always-on server when content should be more available to other GeeSome network members. Status: this plan treats it as a node/app, not only a backend server.
- Plans saved to Markdown should keep this `Source Of Truth` section current when the user corrects architecture or adds requirements. Status: this plan has been adjusted under that rule.
- Add Node.js 22 migration to the TODO. Node 22 should become the supported baseline now, with Node 24 tested separately as the next LTS target. Status: implemented in [#779](https://github.com/galtproject/geesome-node/issues/779), with the Helia wrapper dependency update tracked by `geesome-libs` [#119](https://github.com/galtproject/geesome-libs/issues/119); Node 24 remains follow-up validation.
- Add security review of API and encryption flows to the TODO. Status: tracked in [#782](https://github.com/galtproject/geesome-node/issues/782) and added as a fast-delivery security gate.
- API documentation tooling should be handled through microwave-hub submodules for [`apidoc-template`](https://github.com/MicrowaveDev/apidoc-template) and [`apidoc-plugin-ts`](https://github.com/MicrowaveDev/apidoc-plugin-ts). Status: hub submodule tracking is in [Microwave Hub #2](https://github.com/MicrowaveDev/microwave-hub/issues/2), planning was tracked in [#787](https://github.com/galtproject/geesome-node/issues/787), vulnerable `apidoc-core` removal was tracked in [#802](https://github.com/galtproject/geesome-node/issues/802), final git-URL wiring was tracked in [#804](https://github.com/galtproject/geesome-node/issues/804), plugin-master repoint was tracked in [#806](https://github.com/galtproject/geesome-node/issues/806), request-body annotation support was tracked in [#808](https://github.com/galtproject/geesome-node/issues/808), all-module generation for existing annotated specs is tracked in [#810](https://github.com/galtproject/geesome-node/issues/810), practical remaining route coverage is tracked in [#812](https://github.com/galtproject/geesome-node/issues/812), and final examples/errors/render polish is tracked in [#813](https://github.com/galtproject/geesome-node/issues/813).
- Add database scalability review for the possibility of storing hundreds of thousands of posts and their content records in groups. Status: tracked in [#880](https://github.com/galtproject/geesome-node/issues/880) and added as a dedicated review slice.
- Add a global UI menu item and screen for storage-space analysis: show which file catalogs and groups use how much space, then let operators drill into largest files, file types, duplicate/shared storage IDs, cleanup candidates, and a separate future IPFS popularity/availability tab for content with many peers/providers or other retrievable network signals. Status: added as a dedicated planning slice; first `geesome-node` aggregate helpers live in a dedicated `storageSpace` module with AdminRead API routes, cached snapshot routes/table/history, snapshot-growth deltas, staged queued async refresh path, active-content file-catalog root/folder drilldown, group-post drilldown, generated/static output source accounting, duplicate/shared storage-id drilldown, pinned-object/remote-pin drilldown, preview/thumbnail overhead drilldown, cleanup-blocker drilldown, bounded runtime storage-stat inspection/reconciliation for unknown generated refs, bounded recursive generated-output DAG child inspection/reconciliation, durable preview/generated-output child-ref delete-safety blockers, queued original/preview storage-object physical removal with final safety recheck, configurable storage-removal retention delay/worker, operator-visible storage-removal history, deterministic availability signals from DB-visible refs/local pins/remote pin rows/stored peer counts, bounded on-demand IPFS provider/stat inspection, persisted/async availability-network sample history and per-storage summary with old-sample retention cleanup and an opt-in production sampling worker, the `geesome-ui` global screen and availability/sample-history tab, and a read-only restored-database `database:storage-space-report` command that includes active-content totals, availability signals, and cached network sample summaries. This closes the storage analyzer implementation phase for now; remaining work is production rollout tuning after observing real DHT/provider lookup cost.

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
- `yarn audit --groups dependencies --level high` now reports no production high/critical modules after [#840](https://github.com/galtproject/geesome-node/issues/840) consumes the merged `geesome-libs` dependency security batch from `geesome-libs` [#142](https://github.com/galtproject/geesome-libs/issues/142) / [#143](https://github.com/galtproject/geesome-libs/pull/143) and the follow-up dev cleanup in `geesome-libs` [#144](https://github.com/galtproject/geesome-libs/issues/144) / [#145](https://github.com/galtproject/geesome-libs/pull/145). The Telegram bot `request` path is handled in [#819](https://github.com/galtproject/geesome-node/issues/819); the `telegram > socks > ip` path is handled in [#838](https://github.com/galtproject/geesome-node/issues/838); the direct `geesome-libs` `node-forge` path is handled in [#821](https://github.com/galtproject/geesome-node/issues/821); the transitive `elliptic`, `secp256k1`, and `braces` advisories are handled in [#823](https://github.com/galtproject/geesome-node/issues/823), [#825](https://github.com/galtproject/geesome-node/issues/825), and [#826](https://github.com/galtproject/geesome-node/issues/826); consuming the merged `geesome-libs` crypto-resolution update is handled in [#827](https://github.com/galtproject/geesome-node/issues/827), consuming the wallet `axios`/`follow-redirects` update is handled in [#829](https://github.com/galtproject/geesome-node/issues/829), consuming the wallet `base-x`/`semver`/`ws` update is handled in [#831](https://github.com/galtproject/geesome-node/issues/831), the wallet `fetch-ponyfill`/`node-fetch` chain is handled in [#833](https://github.com/galtproject/geesome-node/issues/833) after the shared-library fix in `geesome-libs` [#138](https://github.com/galtproject/geesome-libs/issues/138), and the wallet `request`/`form-data` chain is handled in [#836](https://github.com/galtproject/geesome-node/issues/836) after the shared-library fix in `geesome-libs` [#140](https://github.com/galtproject/geesome-libs/issues/140). [#844](https://github.com/galtproject/geesome-node/issues/844) patches the remaining dev-tooling `minimatch` high under API-doc generation, moves `tsx`/`esbuild` to patched dev-tooling versions, and pins `qs` to the patched line for safe moderate cleanup.

Runtime maintenance:

- Migrate the supported runtime from Node `>=18` to Node 22. Node 18 and Node 20 are EOL or effectively out of support for new GeeSome work. Use Node 22 as the immediate baseline, then validate Node 24 separately.
- [#859](https://github.com/galtproject/geesome-node/issues/859) adds a Docker-backed full test flow for environments where host PostgreSQL credentials or `ffmpeg` are missing.
- [#861](https://github.com/galtproject/geesome-node/issues/861) makes Docker the preferred full-suite test path and optimizes it for warm reruns after source-only implementation changes. Docker test runtime now calls a shared Mocha runner after model sync/migrations instead of calling `yarn test`, so source-only reruns avoid the second dependency-install check and its package-manager warning output; test containers also disable npm update notices. Core app diagnostics for user-limit accounting, hook allow checks, and static-id object resolution now use lazy debug logging instead of unconditional stdout.
- [#862](https://github.com/galtproject/geesome-node/issues/862) removes the remaining `gateway.ipfs.io` fallback from test media/archive fixtures by generating every named resource locally before the Docker suite runs.
- [#866](https://github.com/galtproject/geesome-node/issues/866) fixes the remaining Docker full-suite failures in storage address normalization, static-site queue processing, pin account assertions, generated static-site expectations, and Telegram import fixture assertions.

Issue clusters still represented by the old README TODO:

- Pinning and backups: [#495](https://github.com/galtproject/geesome-node/issues/495), [#493](https://github.com/galtproject/geesome-node/issues/493), [#518](https://github.com/galtproject/geesome-node/issues/518), [#604](https://github.com/galtproject/geesome-node/issues/604).
- Static sites and frontend delivery: [#573](https://github.com/galtproject/geesome-node/issues/573), [#564](https://github.com/galtproject/geesome-node/issues/564), [#494](https://github.com/galtproject/geesome-node/issues/494).
- Permissions and auth: [#522](https://github.com/galtproject/geesome-node/issues/522), [#515](https://github.com/galtproject/geesome-node/issues/515), [#542](https://github.com/galtproject/geesome-node/issues/542), [#190](https://github.com/galtproject/geesome-node/issues/190).
- Security review: [#782](https://github.com/galtproject/geesome-node/issues/782) for API auth and encryption flows.
- Media and content handling: [#423](https://github.com/galtproject/geesome-node/issues/423), [#196](https://github.com/galtproject/geesome-node/issues/196), [#136](https://github.com/galtproject/geesome-node/issues/136), [#609](https://github.com/galtproject/geesome-node/issues/609).
- Group/feed/search evolution: [#646](https://github.com/galtproject/geesome-node/issues/646), [#563](https://github.com/galtproject/geesome-node/issues/563), [#517](https://github.com/galtproject/geesome-node/issues/517), [#33](https://github.com/galtproject/geesome-node/issues/33), [#2](https://github.com/galtproject/geesome-node/issues/2).
- Database scalability and data-model lifecycle: [#880](https://github.com/galtproject/geesome-node/issues/880) for large groups with hundreds of thousands of posts and attached content records. Status: the core migration/scalability pass is covered by `docs/database-scalability-review.md`, migration/derived-state integrity checks, restored-backup rehearsal commands, large Docker fixtures, cursor/page-scoped hydration, transaction-scoped post DB writes, actor-scoped content identity, chunked group `postsIndex` manifests, page-level `postsIndex` rewrites, the default inline manifest cutoff, and a default-on `group-derived-state` queue for post/group manifest rebuilds with checkpoint output, an interval worker, env opt-outs, and a guarded restored-data async rehearsal command that passed the May 15 posts dump. `StorageObject` now has a restored-data reconciliation check/repair that backfills canonical rows, preview rows/edges, legacy pin state from `Content`, and nullable ownerless/federated identity metadata before migration integrity; remote GeeSome content manifest imports seed that identity without creating ownerless `Content` rows, database callers can resolve canonical rows by identity pair, successful remote pins write a separate `PinStorageObject` ledger row, and delete safety uses reusable database helpers to check all known DB-visible derived storage columns, current static-ID dynamic targets, recorded remote pin refs, and durable preview/generated-output child refs whose source ancestor is still visible before queued physical removal. Content library deletion now soft-deletes unreferenced rows, normal reads/storage-space reports ignore hidden content, `(storageId, userId)` remains a non-unique actor lookup because restored production data can contain same-user duplicate storage rows, and AdminRead/AdminAll tombstone routes list/restore deleted rows plus preview/purge expired rows only after physical storage is already missing and row references are clear. Storage-space GC now has configurable retention delay, an optional worker, and AdminRead history backed by the async-operation ledger. This closes the core storage-object/storage-space scalability phase for now; remaining work moves to future verification or feature-driven backlog: larger restored-dump reruns when available, ActivityPub/generated producer policy and public UI/API semantics for canonical storage-object identity, optional static-ID history archiving, and production rollout tuning.
- Storage space analysis UI: add a global navigation entry and operator screen for file-catalog/group space usage, largest files, MIME/file-type breakdowns, duplicate/shared storage IDs, cleanup candidates, and a separate IPFS popularity/availability tab. First `geesome-node` aggregate helpers, AdminRead API routes, cached snapshot routes/table/history, snapshot-growth deltas, staged queued async refresh path, active-content file-catalog root/folder drilldown, group-post drilldown, duplicate/shared storage-id drilldown, pinned-object/remote-pin drilldown, preview/thumbnail overhead drilldown, cleanup-blocker drilldown, bounded generated-ref and recursive child-ref storage inspection/reconciliation, durable preview/generated-output child-ref delete-safety blockers, queued original/preview storage-object physical removal with a final safety recheck, configurable retention delay/worker, storage-removal history, deterministic availability-signal aggregate, bounded on-demand IPFS provider/stat inspection, persisted/async availability-network sample history/summary with old-sample retention cleanup and opt-in production sampling, `geesome-ui` global screen and availability/sample-history tab, and read-only restored-database report command exist. This phase is complete for now; remaining work is production rollout tuning after observing real DHT/provider lookup cost.
- Secure chat E2EE: [#2](https://github.com/galtproject/geesome-node/issues/2), [#33](https://github.com/galtproject/geesome-node/issues/33), [#115](https://github.com/galtproject/geesome-node/issues/115). Use [Vas3k's E2EE explainer](https://vas3k.blog/blog/end_to_end_encryption/) as background for why backend-only encryption and a single long-lived group key are not enough.
- ActivityPub/Fediverse integration: [#426 Make api for Fediverse](https://github.com/galtproject/geesome-node/issues/426).
- API documentation toolchain: [#787](https://github.com/galtproject/geesome-node/issues/787), [#802](https://github.com/galtproject/geesome-node/issues/802), [#804](https://github.com/galtproject/geesome-node/issues/804), [#806](https://github.com/galtproject/geesome-node/issues/806), [#808](https://github.com/galtproject/geesome-node/issues/808), [#810](https://github.com/galtproject/geesome-node/issues/810), [#812](https://github.com/galtproject/geesome-node/issues/812), and [#813](https://github.com/galtproject/geesome-node/issues/813), with implementation split across the microwave-hub `apidoc-template` and `apidoc-plugin-ts` submodules before GeeSome Node rewires generated docs to those cleaned-up packages.
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

Status: in progress. [#783](https://github.com/galtproject/geesome-node/issues/783) removed the direct deprecated `request` dependency from the API proxy path. [#785](https://github.com/galtproject/geesome-node/issues/785) removes the unused direct legacy `cids` dependency. [#789](https://github.com/galtproject/geesome-node/issues/789) upgrades `bcrypt` to remove the vulnerable `@mapbox/node-pre-gyp` chain. [#791](https://github.com/galtproject/geesome-node/issues/791) removes the deprecated unused `typings` devDependency. [#793](https://github.com/galtproject/geesome-node/issues/793) removes unused `lerna` dev tooling. [#794](https://github.com/galtproject/geesome-node/issues/794) removes unused `filecoin.js` dev tooling. [#795](https://github.com/galtproject/geesome-node/issues/795) replaces direct `rimraf` usage with Node `fs.rm`. [#796](https://github.com/galtproject/geesome-node/issues/796) bumps `sequelize-cli` within the 6.x line. [#797](https://github.com/galtproject/geesome-node/issues/797) updates Express 4 patch dependencies and removes unused direct `serve-static`. [#798](https://github.com/galtproject/geesome-node/issues/798) aligns shared dependency versions with `geesome-libs` [#123](https://github.com/galtproject/geesome-libs/issues/123) and `geesome-ui` [#1](https://github.com/galtproject/geesome-ui/issues/1). [#800](https://github.com/galtproject/geesome-node/issues/800) removes unused direct `express-mysql-session`, `pg-hstore`, and `node-fetch`, eliminating the direct MySQL/session and HSTORE chains and the visible `underscore` high alert source. [#815](https://github.com/galtproject/geesome-node/issues/815) removes the legacy `@microlink/youtube-dl` package chain and replaces `http-server` with a tiny local docs server, eliminating the `trim-newlines`, `semver-regex`, old `cross-spawn`, and old `http-server`/proxy dependency paths from the lockfile. [#817](https://github.com/galtproject/geesome-node/issues/817) consumes the merged `geesome-libs` [#128](https://github.com/galtproject/geesome-libs/issues/128) / [#129](https://github.com/galtproject/geesome-libs/pull/129) update and bumps direct `kubo-rpc-client`, moving `parse-duration` to patched `2.1.6`. [#819](https://github.com/galtproject/geesome-node/issues/819) bumps `node-telegram-bot-api` to the current `0.67.x` line and pins the transitive type-only `@types/request` path to the patched `form-data` range, removing the Telegram bot runtime `request`/`request-promise` path from the lockfile. [#838](https://github.com/galtproject/geesome-node/issues/838) moves Telegram's `socks` transitive dependency to a version that removes the vulnerable `ip` package. [#821](https://github.com/galtproject/geesome-node/issues/821) consumes `geesome-libs` [#130](https://github.com/galtproject/geesome-libs/issues/130) / [#131](https://github.com/galtproject/geesome-libs/pull/131), moving the direct `geesome-libs` `node-forge` dependency to `1.4.0`. [#823](https://github.com/galtproject/geesome-node/issues/823) pins transitive `elliptic` to `6.6.1`, removing the critical `elliptic` audit advisory from the lockfile. [#825](https://github.com/galtproject/geesome-node/issues/825) pins vulnerable transitive `secp256k1` paths to patched `4.0.4` while keeping the direct `geesome-libs` path on `5.0.1`. [#826](https://github.com/galtproject/geesome-node/issues/826) pins transitive `braces` to `3.0.3`, removing the high braces advisory from file watching/globbing chains. [#827](https://github.com/galtproject/geesome-node/issues/827) consumes `geesome-libs` [#132](https://github.com/galtproject/geesome-libs/issues/132) / [#133](https://github.com/galtproject/geesome-libs/pull/133), so the shared library also carries the `secp256k1` and `elliptic` crypto-resolution policy. [#829](https://github.com/galtproject/geesome-node/issues/829) consumes `geesome-libs` [#134](https://github.com/galtproject/geesome-libs/issues/134) / [#135](https://github.com/galtproject/geesome-libs/pull/135), removing the wallet `axios` and `follow-redirects` advisories from the node lockfile. [#831](https://github.com/galtproject/geesome-node/issues/831) consumes `geesome-libs` [#136](https://github.com/galtproject/geesome-libs/issues/136) / [#137](https://github.com/galtproject/geesome-libs/pull/137), removing the wallet `base-x`, `semver`, and `ws` advisories from the node lockfile. [#833](https://github.com/galtproject/geesome-node/issues/833) adds the root-level Yarn resolution for the wallet `fetch-ponyfill` `node-fetch` chain, matching the shared-library fix in `geesome-libs` [#138](https://github.com/galtproject/geesome-libs/issues/138). [#835](https://github.com/galtproject/geesome-node/issues/835) fixes the current UUID ESM import shape in driver modules so dependency verification can progress past test loading. [#836](https://github.com/galtproject/geesome-node/issues/836) adds the root-level Yarn resolution for the wallet `request` `form-data` chain, matching the shared-library fix in `geesome-libs` [#140](https://github.com/galtproject/geesome-libs/issues/140). [#840](https://github.com/galtproject/geesome-node/issues/840) consumes the merged `geesome-libs` [#142](https://github.com/galtproject/geesome-libs/issues/142) / [#143](https://github.com/galtproject/geesome-libs/pull/143) and [#144](https://github.com/galtproject/geesome-libs/issues/144) / [#145](https://github.com/galtproject/geesome-libs/pull/145) dependency batch, patches matching root-level Yarn-v1 paths, and moves the production audit to zero high/critical modules. Ethereum auth now suppresses the known optional `secp256k1` native fallback info line during dependency import by default, with `GEESOME_DEPENDENCY_INFO_LOGS=1` available when fallback diagnostics are needed.

Goal: merge or reproduce the Dependabot bumps in small batches.

Scope:

- Remove or replace direct deprecated dependencies where the code path is small and already covered by import smoke.
- Remove unused direct legacy dependencies that only contribute transitive audit surface.
- Remove stale direct dev tooling that is not called by scripts or source code.
- Start with low-blast-radius transitive/dev bumps when Dependabot opens fresh PRs.
- Handle runtime-sensitive bumps separately: old IPFS package chains, `sequelize-cli`, `axios`, `lodash`, `sequelize`, and any `geesome-libs` lockstep updates.
- For `sequelize`, run database, group, static-site-generator, invite, pin, and social import tests because those modules rely on models and migrations.
- Production high/critical alerts are cleared after [#840](https://github.com/galtproject/geesome-node/issues/840), and full-audit high/critical alerts are cleared by [#844](https://github.com/galtproject/geesome-node/issues/844). Remaining moderate alerts are mostly legacy wallet/API-doc chains: `bn.js` and `uuid` through old ethers/web3-provider-engine paths, `request`/`tough-cookie` through the deprecated wallet provider stack, and Bootstrap 3 from API docs. Treat those as follow-up migration/removal work instead of blind major overrides.

Verification:

- API module import smoke for the `request` removal.
- Storage/API import smoke for the `cids` removal.
- Package graph check for stale direct tooling removal.
- Password helper smoke for the `bcrypt` major bump.
- Targeted Mocha test for the touched module.
- `npm run test:docker` as the main full-suite path. Use `npm run test:docker:no-build` only to rerun the exact same already-built source snapshot, and `npm run test:docker:cold` when Docker service data may be stale.
- `yarn test` only when the host already has matching PostgreSQL, IPFS, and media prerequisites.
- `yarn audit --groups dependencies --level high` to document remaining high/critical chains.
- If a single bump fails, isolate with the narrowest mapped test file, then rerun the full test command where local database/runtime permits.

### 3. Content Serving Stabilization

Status: in progress. [#733](https://github.com/galtproject/geesome-node/issues/733) now has a focused API HEAD regression so content-data/file-catalog storage handlers can set their own `Content-Length` and content headers instead of being swallowed by the generic HEAD fallback. [#846](https://github.com/galtproject/geesome-node/issues/846) extends the same header behavior to gateway HEAD requests so published folder/IPFS-style paths can return storage headers. [#848](https://github.com/galtproject/geesome-node/issues/848) hardens byte-range handling so malformed or unsatisfiable ranges return `416` before storage streams are opened. [#850](https://github.com/galtproject/geesome-node/issues/850) returns `404` when an allowed content path is missing from storage instead of dereferencing a missing stat. [#852](https://github.com/galtproject/geesome-node/issues/852) closes response streams when storage streams fail after headers are written. The client-disconnect slice now destroys the upstream storage stream when the response closes and keeps range-stream byte counting behind the debug namespace. HEAD requests now reuse the GET metadata/path decision path for missing and forbidden storage ids, so they return `404`/`423` instead of empty `200` responses. Ranged GET requests now follow the same missing/forbidden storage decisions before parsing byte ranges or opening streams, and image/directory range requests now return `206` partial streams instead of falling back to full `200` sends while preserving metadata-derived content type after directory index path rewrites. Non-range GET now also streams content when storage stats provide size but no CID, using the already resolved path metadata for headers. Post-header storage stream errors and expected over-limit content-save failures now clean up without unconditional stderr noise, and HTTP access logs are opt-in through `GEESOME_ACCESS_LOGS=1` instead of default morgan output. The content-save performance check now has discoverable `check:performance:*` aliases, bounded env-configurable payload defaults, and calls the current `saveData(userId, data, name, options)` contract so #750 CPU checks can be repeated intentionally.

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

Status: in progress. [#854](https://github.com/galtproject/geesome-node/issues/854) hardens direct pin negative paths with explicit missing-account, unknown-service, and missing-content errors before remote pinning is attempted. [#856](https://github.com/galtproject/geesome-node/issues/856) keeps pin account secret updates encrypted and returns an explicit missing-account error for update calls. [#858](https://github.com/galtproject/geesome-node/issues/858) forwards caller pin options into Pinata metadata and normalizes remote Pinata failures to `pinata_pin_failed`. [#868](https://github.com/galtproject/geesome-node/issues/868) documents the account and direct pin API flows, examples, forwarded Pinata keyvalues, and common pin errors. [#872](https://github.com/galtproject/geesome-node/issues/872) enforces group edit permission before creating/deleting group-owned pin accounts and keeps pin secrets write-only in API responses. The same node PR consumes `geesome-ui` [#5](https://github.com/galtproject/geesome-ui/issues/5), [#7](https://github.com/galtproject/geesome-ui/issues/7), and [#6](https://github.com/galtproject/geesome-ui/pull/6) at commit `4c24162` so the profile UI can configure pin accounts, delete them, upload a file, pin its `storageId` through the user-owned account endpoint, and carry first-pass e2e/screenshot coverage plus repo-local e2e/screenshot review instructions.

Goal: turn "Pin to services like pinata from UI" into a shippable backend/API slice first.

Scope:

- Audit `pin` module behavior for encrypted account storage, account ownership, group account permissions, and Pinata request error handling. Group-owned account creation/deletion now checks edit permission, and API responses no longer echo pin secrets; keep the same boundary in the future UI.
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

Status: in progress. [#564](https://github.com/galtproject/geesome-node/issues/564) is implemented for generated group-site favicons. [#494](https://github.com/galtproject/geesome-node/issues/494) is the active static-site settings slice. The renderer now avoids Sass's deprecated default-import path and creates a fresh Vue SSR app/router per page render, so repeated generated-page renders do not emit `Symbol(v-scx)` context warnings or risk cross-page SSR state reuse. Generated static-site clients no longer print mounted modal refs or media-click diagnostics into visitor browser consoles while preserving the useful developer/examples banner.

Goal: deliver visible improvements without redesigning the protocol.

Scope:

- Finish [#564](https://github.com/galtproject/geesome-node/issues/564) by preferring group avatar for generated favicon when available, falling back to UI favicon. Implementation should copy the prepared group avatar storage object into `favicon.ico` during group static-site generation and keep content-list static sites on the bundled UI favicon.
- Triage [#494](https://github.com/galtproject/geesome-node/issues/494) into concrete options with defaults, validation, and stored option compatibility. First implementation should normalize numeric render settings, validate static site names in the nested `site` object, keep custom CSS bounded, and persist the normalized render options used for the generated site.
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

Status: complete for tooling cleanup, practical route coverage, and first polish pass. [#802](https://github.com/galtproject/geesome-node/issues/802) upgraded `geesome-node` to `apidoc@1.x` and removed the vulnerable `apidoc-core` package graph. [#804](https://github.com/galtproject/geesome-node/issues/804) wired `geesome-node` to the modern template and TypeScript plugin through git URLs. [#806](https://github.com/galtproject/geesome-node/issues/806) repointed the plugin dependency to the merged plugin master. [#808](https://github.com/galtproject/geesome-node/issues/808) added `apiBody` interface output. [#810](https://github.com/galtproject/geesome-node/issues/810) broadens `geesome-node` generation from `app/modules/api` to all currently annotated module API files and fixes stale request/response annotations. [#812](https://github.com/galtproject/geesome-node/issues/812) expands the generated spec to the practical API surface. [#813](https://github.com/galtproject/geesome-node/issues/813) adds shared error docs, copyable examples for common flows, and sensitive/low-level endpoint notes. The repos are tracked by microwave-hub as submodules:

- `apidoc-template` for generated documentation UI/template work.
- `apidoc-plugin-ts` for TypeScript parsing and apiDoc annotation support.

Goal: make generated GeeSome API docs more user-friendly, flexible, and maintainable without hiding parser/template bugs inside `geesome-node`.

Repo split:

- `apidoc-template`: modernized for the `apidoc@1.x` `template/src/*` layout, removes the active old vendored runtime folder, declares package dependencies, and includes a smoke command.
- `apidoc-plugin-ts`: modernized for `apidoc@1.x`, strengthens GeeSome `@apiInterface ... apiParam` and `apiBody` handling, ignores TypeScript utility base types such as `Record`, and includes focused parser fixtures.
- `geesome-node`: consumes the cleaned-up template/plugin by git URL and verifies generated docs from all annotated `app/modules/**/api.ts` files.
- `microwave-hub`: keep both API-doc repos as submodules so agents can route and coordinate docs tooling work from the hub.

First deliverable:

- Audit current `geesome-node` API doc generation command and package usage. Status: complete in [#802](https://github.com/galtproject/geesome-node/issues/802) and [#804](https://github.com/galtproject/geesome-node/issues/804).
- Consume `apidoc-plugin-ts` and `geesome-apidoc-template` by git URL. Status: complete in [#804](https://github.com/galtproject/geesome-node/issues/804) and [#806](https://github.com/galtproject/geesome-node/issues/806).
- Generate docs with the modern custom template. Status: complete; local smoke passes with all currently annotated module API files under `app/modules`.
- Broaden generated docs beyond the core API module. Status: complete in [#810](https://github.com/galtproject/geesome-node/issues/810) and [#812](https://github.com/galtproject/geesome-node/issues/812); current generation produces 113 endpoint docs across the practical API surface. The only handler lines not represented by docs are the empty root placeholder and a commented-out regenerate-previews route.
- Remaining polish: non-blocking rendered visual QA improvements in the template itself. The generated page loads in the in-app browser with no console errors; screenshot capture timed out on the large generated page, so this pass used DOM/console verification for examples, errors, and sensitive endpoint notes.

Verification:

- `apidoc-plugin-ts`: `yarn test`
- `apidoc-template`: static/template smoke check and rendered generated-docs review where practical.
- `geesome-node`: `yarn generate-docs` and a quick browser/manual check of the generated `docs/` output.

### 8. API And Encryption Security Review

Status: in progress. [#782](https://github.com/galtproject/geesome-node/issues/782) now has a first-pass route/security inventory and review note in `docs/security-review.md` plus a deterministic `npm run security:route-inventory` check that keeps `docs/security-route-inventory.md` aligned with registered API handlers. The same security PR implements [#876](https://github.com/galtproject/geesome-node/issues/876) by keeping Pinata, auto-action, social-account, Telegram login, and Twitter login secrets write-only in API responses. [#874](https://github.com/galtproject/geesome-node/issues/874) starts the token-only route ownership matrix in `docs/security-route-ownership.md` and now covers `asyncOperation` queue/operation ownership plus core `group` mutation route actor forwarding with focused tests. Remaining follow-up implementation is [#875](https://github.com/galtproject/geesome-node/issues/875) for public-route abuse coverage plus the remaining #874 route modules.

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

Status: first API prerequisite, public identity helper, read-only serializer, read-only route, actor-key/signature, inbound verification-only, remote actor key-cache, inbound follow-state, inbound follow-undo, inbound block, inbound flag-report storage, admin flag-report listing/state updates, followers collection, following collection, follow request delivery queue, outbound follow-response, follow-accept delivery queue, delivery processor, opt-in delivery worker, local post object-record, publish-time Create delivery, shared-inbox remote object-record, shared-inbox remote update, shared-inbox remote delete-tombstone, shared-inbox remote undo-create tombstone, safe remote attachment-preview metadata, and signed `Content-Digest` verification slices landed. The API module now supports unversioned JSON `POST` handlers, accepts `application/*+json` payloads, and exposes captured raw JSON bytes for signed/protocol-style posts such as ActivityPub inbox/shared-inbox routes. ActivityPub config now has explicit `enabled`, `publicUrl`, and `domain` fields sourced from `ACTIVITYPUB_*` env vars, deterministic helpers build group actor, inbox/outbox/followers/following, shared-inbox, post-object, and WebFinger URLs, serializers build group actor, Note/Create, `Follow`, `Accept(Follow)`, outbox collection, followers collection, and following collection payloads behind public/non-encrypted/published safety gates, the dedicated `activityPub` module exposes disabled-by-default public WebFinger, actor, outbox, followers, following, post-object, group inbox, and shared-inbox routes plus AdminAll outbound follow request routing, local group actors now get model-sync-created `ActivityPubActor` records with encrypted RSA private keys, public keys in actor documents, outbound HTTP-signature helpers, inbound RSA-SHA256 signature/signed `Digest` or `Content-Digest`/Date verification helpers, model-sync `ActivityPubRemoteActor` records for fetched remote actor key/inbox metadata, model-sync `ActivityPubFollow` records for idempotent signed inbound `Follow` activities plus signed embedded `Undo(Follow)`, signed `Block` cancellations, and pending outbound `Follow` activities plus signed remote `Accept(Follow)`/`Reject(Follow)` responses, model-sync `ActivityPubFlag` records for signed pending moderation reports plus AdminRead listing and AdminAll pending/resolved state updates, model-sync `ActivityPubObject` rows for local public post Note/Create IDs, signed remote `Create(Note)` replies and mentions to known local actors plus AdminRead remote-object list/detail/post-draft review with sanitized preview fields, bounded sanitized remote attachment/link metadata, accepted-review-gated import-readiness metadata, resolved local reply targets, manual native-post creation from accepted public Notes, persistent pending/accepted/rejected review decisions, and review-state filtering that treats missing review rows as pending, and signed remote `Update(Note)` updates plus `Delete`/`Undo(Create)` tombstones for cached remote objects from the same actor, update or soft-delete linked imported GeeSome posts when source identity still matches, reset review decisions to pending, and model-sync `ActivityPubDelivery` rows for queued outbound `Follow`, follow `Accept`, and local post `Create(Note)` activities. Group inbox routes can persist and cancel inbound follow state for local actor objects, update matching outbound follows from signed remote `Accept`/`Reject` responses, store pending reports for signed `Flag` activities that target the local actor or known local objects, admins can list/read those remote-object reviews per group actor, inspect accepted-review-gated post-draft readiness with local reply mapping and remote attachment provenance, filter cached remote objects by review state, mark cached remote objects pending/accepted/rejected, and manually create native remote posts from accepted public Notes, admins can mark flag reports pending/resolved, admins can queue signed outbound `Follow` delivery to a remote actor, followers routes list accepted inbound remote actors, following routes list accepted outbound remote actors once a signed remote `Accept` is recorded, accepted inbound follows enqueue a delivery record to the remote shared inbox or actor inbox, signed `Block` activities remove a remote actor from followers and future post delivery, post manifest updates enqueue idempotent `Create(Note)` rows only for accepted followers, imported remote posts are excluded from ActivityPub local-post federation to avoid loops, shared inbox routes can store/update/tombstone idempotent remote object rows and admins can review sanitized previews while linked imported posts are refreshed from real signed Note changes, `processDeliveryQueue` signs queued payloads, sends them through an injectable/default sender, then marks deliveries delivered, retry-pending, or failed after bounded attempts, and `ACTIVITYPUB_DELIVERY_WORKER=1` enables a bounded interval worker with DB-backed delivery claims when the model-synced claim shape is active. Broader shared-inbox activity handling, frontend preview adoption, remote-byte import/backup policy, richer embeds, and interop smoke remain future slices before accepting broad federation activities.

Research note: [activitypub-research.md](./activitypub-research.md).

Rich-text content-format design note: [rich-text-content-format.md](./rich-text-content-format.md).

Content format direction:

- Do not make raw HTML the canonical user-content format. ActivityStreams/ActivityPub and Matrix need sanitized HTML adapter output, but newer decentralized social protocols such as Bluesky/ATProto, Farcaster, and Nostr-style text notes prefer plain text plus structured facets, mentions, tags, embeds, or protocol tags.
- Add a versioned GeeSome rich-text document format as the source of truth before broad remote social content becomes editable/visible as native posts. The first schema should stay deliberately small: paragraph, line break, blockquote, code block, list/list item, text nodes, attachments by `storageId`, and marks such as strong, emphasis, code, link, mention, hashtag, spoiler, and strike.
- Store sanitized HTML only as derived output/cache for ActivityPub, Matrix, static sites, admin previews, or legacy clients. Inbound remote HTML should be sanitized and normalized into the canonical rich-text model; keeping the original remote object for audit/debug is fine, but it must not be rendered directly.
- Protocol adapters should render from the canonical model: ActivityPub/Matrix get conservative sanitized HTML plus plain-text fallbacks where required; Bluesky/ATProto gets text plus facets; Farcaster gets text plus mention positions/embeds; Nostr-like exports get plaintext plus tags.
- Keep arbitrary `style`, `class`, `iframe`, `script`, form controls, active content, and raw-HTML nodes out of the first canonical schema. New rich features should be added as explicit typed nodes/marks with migration/rendering policy, not by widening the HTML allowlist.

Scope:

- Map GeeSome identities/groups to ActivityPub actors. Group actor URL helpers now use `/ap/groups/{groupName}` and require GeeSome-valid group names so WebFinger `acct:` handles stay valid.
- Expose WebFinger discovery for local actors. The dedicated ActivityPub module now serves public `/.well-known/webfinger` for federatable local group actors.
- Add actor, outbox, inbox, followers, and following endpoints. Read-only actor, outbox, followers, following, and post-object routes are exposed; following lists accepted outbound follows after a signed remote `Accept` is recorded.
- Represent published group posts as ActivityPub `Create` activities with `Note`/attachment objects and stable GeeSome/IPFS links. Read-only serializers now cover Note/Create and outbox collection payloads, and public route wiring dereferences actor, outbox, and Note object URLs.
- Verify HTTP signatures for inbound activities and sign outbound activities. Raw JSON request bytes are now available to route callbacks for digest/signature checks; outbound RSA-SHA256 signing helpers, stable local actor keys, and inbound signature/signed `Digest` or `Content-Digest`/Date verification exist. Actual inbox activity acceptance still waits for remote actor cache/follow state.
- Store inbound/outbound follow state and minimal remote actor metadata. Remote actor key/inbox metadata is now cached for signature verification and outbound follow requests, signed inbound `Follow` activities are persisted idempotently for group inboxes, signed embedded `Undo(Follow)` cancels stored inbound follows, accepted follows enqueue outbound `Accept(Follow)` delivery rows, admin-triggered outbound follows enqueue signed `Follow` delivery rows, signed remote `Accept`/`Reject` responses update outbound follow state, published local posts enqueue outbound `Create(Note)` delivery rows, and the opt-in delivery worker can claim/sign/send/retry queued rows.
- Before cached remote ActivityPub objects become visible posts, audit how posts render in webviews/static sites because post text is HTML. Status: generated static-site post text, post-list title/description HTML, content-list text, header/footer HTML, title/meta headers, and backend admin remote-object preview fields now have a conservative sanitizer/escaping layer with XSS fixtures. Backend admin remote-object previews also expose a canonical rich-text projection of sanitized ActivityStreams `content`, bounded sanitized remote attachment/link metadata, accepted-review-gated post-draft readiness, local reply target mapping, manual native-post creation from accepted public Notes, signed remote update sync for linked imported posts, signed remote tombstone cleanup for linked imported posts, persistent review-state decisions, and review-state filtering for review/import follow-ups. Frontend/admin UI adoption of preview fields, remote-byte import/backup policy, richer embeds, and other visible surfaces still need review.
- Before remote/social-network content can become native editable GeeSome posts, design and implement the canonical rich-text schema plus import/export adapters described above. Until then, sanitized HTML should remain display-only adapter output rather than a trusted source format for post edits, migrations, search snippets, or cross-network publishing.
- Keep moderation, deletes/updates, rich media federation, and full timeline syncing for later slices.
- Decide whether to adopt Fedify or keep a minimal custom module. The repo now targets Node 22, so the earlier Node-floor concern is gone; the remaining decision is dependency weight, integration shape, and whether Fedify's helpers fit GeeSome's IPFS/IPNS-first identity model.

Likely modules:

- New `app/modules/activityPub` module.
- `app/modules/group` for local group/post mapping.
- `app/modules/content` for attachment URLs and media metadata.
- `app/modules/api` for unversioned POST/raw body support.
- ActivityPub-specific Sequelize models for actor, remote actor, follow, flag, object, object review, and delivery records. Model-sync `ActivityPubActor` stores local group actor URLs and encrypted signing keys, `ActivityPubRemoteActor` stores fetched remote actor URL/key/inbox metadata, `ActivityPubFollow` stores inbound follow/cancel state, pending outbound follow requests, and signed remote outbound follow responses, `ActivityPubFlag` stores pending moderation reports from signed `Flag` activities and backs admin listing/state updates, `ActivityPubObject` stores local public post Note/Create IDs from outbox/post-object/publish-hook serialization plus signed remote `Create(Note)` replies and mentions to known local group actors, AdminRead remote-object review with sanitized preview fields and bounded remote attachment/link metadata, accepted-review-gated post-draft readiness, resolved local reply targets, review-state filtering, manual native-post creation from accepted public Notes, linked imported-post updates from signed remote `Update(Note)`, and linked imported-post soft-deletes from signed remote tombstones, `ActivityPubObjectReview` stores pending/accepted/rejected review decisions that remote object updates/tombstones reset to pending, and `ActivityPubDelivery` stores queued outbound `Follow`, follow `Accept`, and post `Create(Note)` payloads plus retry/delivery/claim state.

Do not reuse `remoteGroup` as the ActivityPub remote actor store; it is GeeSome/IPFS-manifest oriented, while ActivityPub uses HTTPS actor IDs and signed HTTP.

First deliverable:

- Decide actor type and URL shape for GeeSome groups.
- Decide Node 22/Fedify adoption versus a minimal custom module.
- Design the ActivityPub data model and endpoint contract.
- Implement read-only actor/outbox/WebFinger for one local group.
- Add tests with deterministic JSON-LD payloads and signature fixtures.
- Reuse the shared deterministic ActivityPub helper contract from `geesome-libs` [#121](https://github.com/galtproject/geesome-libs/issues/121) for actor, WebFinger, Note/Create, digest, and request-signature fixtures.
- Before remote object moderation can create visible posts, add HTML render-path tests that prove untrusted ActivityPub/local post HTML is sanitized or escaped consistently in API/webview/static-site/admin preview surfaces. Static-site generated output and backend admin remote-object preview output now have focused helper/render tests; backend remote-object previews also expose canonical rich-text converted from sanitized ActivityStreams `content`, bounded sanitized remote attachment/link metadata, accepted-review-gated post-draft readiness metadata, resolved local reply targets, pending/accepted/rejected review decisions, review-state filtering, manual native-post creation from accepted public Notes, signed remote update sync for linked imported posts, and signed remote tombstone cleanup for linked imported posts. Frontend/admin UI adoption, remote-byte import/backup policy, and richer embeds remain.
- Add a rich-text content-format design note with schema versioning, IPLD/DAG-CBOR storage shape, allowed blocks/marks, attachment references, migrations, sanitization boundaries, and ActivityPub/Matrix/ATProto/Farcaster/Nostr export adapters before implementing native remote-post ingestion or cross-network publishing. Status: documented in [rich-text-content-format.md](./rich-text-content-format.md); helper implementation now covers canonical validation, unsafe HTML import, sanitized HTML rendering, ActivityPub local-post rendering with mention/hashtag tags, Matrix `m.text` body/formatted_body export, ATProto-compatible UTF-8 byte-indexed text facets, Farcaster CastAdd-style text/embeds/FID mention positions, and Nostr-like text-note tags. Native post storage, editor integration, and direct protocol wiring remain follow-up.

Verification:

- New module tests for actor serialization, WebFinger, and outbox payloads.
- Existing `test/group.test.ts` for post compatibility.
- Rich-text adapter tests that import unsafe ActivityPub/Matrix-style HTML into the canonical model, render sanitized ActivityPub/Matrix HTML, and export deterministic plain text plus facets/tags for ATProto/Farcaster/Nostr-style protocols. Status: unsafe HTML import, sanitized HTML rendering, ActivityPub local-post rendering with mention/hashtag tags, Matrix body/formatted-body export, ATProto-compatible link/DID-mention/tag facet export with UTF-8 byte offsets, Farcaster CastAdd-style text/embed/FID mention export with byte offsets, and Nostr-like `r`/`p`/`t` tag export are covered.
- Later integration smoke against a local ActivityPub test server.
- Later Bluesky data-exchange smoke with the protocol boundary explicit: ActivityPub interop should use a bridge such as Bridgy Fed, while direct Bluesky/ATProto import or cross-post testing should use a seeded test `socNetAccount` database row for the Bluesky account and verify ownership, credential handling, idempotency, and moderation/signature boundaries.

### 11. Database Scalability For Large Groups

Status: core/storage phase complete for now; future work remains architecture backlog in [#880](https://github.com/galtproject/geesome-node/issues/880). The living implementation record is `docs/database-scalability-review.md`; recent slices cover deterministic inventory checks, Postgres index/constraint migrations, cursor/page-scoped hydration, static-site/RSS batching, guarded migration rehearsal/integrity auditing, A1 content ownership rules, the smaller RSS default feed window, bounded per-render/feed text body caching for generated output, a fixture/restored-data generated-output pressure report with group-manifest pressure, a chunked group-manifest post-index sidecar, page-level `postsIndex` rewrites, a 1,000-post default inline manifest cutoff with compatibility overrides, the IPLD storage direction in `docs/group-manifest-ipld-scalability.md`, a default-on durable derived-state queue for post/group manifest rebuilds with env opt-outs and a guarded restored-data async rehearsal command that passed the May 15 posts dump, and a model-sync `StorageObject` registry that now backs shared public storage/header metadata plus canonical local pin state and nullable ownerless/federated identity with old-row fallback; GeeSome content manifest imports seed that identity without ownerless `Content` rows, database callers can resolve canonical rows by identity pair, restored-data reconciliation from `Content` including preview rows/edges, recorded remote pin refs, reusable all-known DB-visible derived/static-ID/preview/generated-output child reference checks before physical deletion, soft-deleted content library tombstones with admin restore and retention-gated purge paths, and configurable delayed GC with operator history. Remaining work is no longer a blocker for starting the next TODO items: larger restored-dump reruns when available, ActivityPub/generated producer policy and public UI/API semantics for canonical storage-object identity, optional static-ID history archiving, and production rollout tuning.

Goal: verify whether the current database schema, indexes, query patterns, and content/post associations can support groups with hundreds of thousands of posts and attached content records.

Scope:

- Audit hot tables and joins for group timelines, post contents, content metadata, group membership/admin pivots, read/unread state, imports, async operations, and static-site generation queues.
- Review current indexes and Sequelize query shapes for large-group paths: group post lists, post content loading, user-visible post reads, unread counters, static-site generation, social imports, and backup/export flows.
- Define target dataset sizes and benchmark fixtures for large groups, including posts with multiple content attachments and generated manifests.
- Identify where offset pagination becomes too expensive and where keyset pagination, denormalized counters, materialized views, or batch jobs are needed.
- Review storage/database split boundaries so large content bytes stay content-addressed while metadata remains queryable.
- Produce follow-up implementation issues for concrete index migrations, query rewrites, benchmark scripts, and API pagination changes.

Likely modules:

- `app/modules/group`
- `app/modules/content`
- `app/modules/fileCatalog`
- `app/modules/staticSiteGenerator`
- `app/modules/socNetImport`
- `app/modules/asyncOperation`
- `app/modules/database`

Verification:

- Scalability review document with query inventory, current indexes, risk table, and recommended fixes.
- Synthetic benchmark or fixture plan for hundreds of thousands of posts with content attachments.
- Targeted tests or scripts for any immediate index/query fixes discovered during review.

### 12. Storage Space Analysis UI

Status: core implementation complete for now, with the first backend aggregate/API seams, cached snapshot routes/table/history, snapshot-growth deltas, queued async refresh path, staged async snapshot progress, active-content file-catalog root/folder drilldown endpoint, group-post drilldown endpoint, generated/static output source accounting, duplicate/shared storage-id drilldown, pinned-object/remote-pin drilldown, preview/thumbnail overhead drilldown, on-demand cleanup-blocker drilldown, bounded runtime storage-stat inspection/reconciliation for unknown generated refs, bounded recursive generated-output child-ref inspection/reconciliation, durable preview/generated-output child-ref delete blockers, queued original/preview storage-object physical removal with a final delete-safety recheck, configurable retention delay/worker plus operator history for storage removals, and `geesome-ui` global navigation/screen in place. The dedicated `storageSpace` module reports active logical content bytes separately from deduplicated active physical storage bytes for overview, type breakdown, top content, top file-catalog file/folder, top group, group-post, generated-output, shared-storage, pinned-object, remote-pin refs, preview-storage, deterministic availability signals, on-demand availability-network inspection, persisted availability-network sample history/summary, and on-demand cleanup-blocker views; AdminRead routes expose live results under `admin/storage-space/*`; and a model-sync `StorageSpaceSnapshot` table can store timestamped analyzer snapshots for operator refreshes, list lightweight snapshot history, and compare the latest snapshot with older history for recent-growth cards. The snapshot refresh, storage-object removal, and availability-network sample refresh paths now use the shared async-operation queue runner while the database module keeps only synced models, reference-count helpers, and the shared SQL connection. The availability sampler has opt-in production worker knobs plus retention cleanup so live DHT/provider sampling stays bounded by default. `npm run database:storage-space-report` can now write the same top-level analyzer tables, availability signals, and cached availability-network sample summaries against a migrated/restored database without booting the full app, and `bash/database-restored-pressure` includes it after the restored EXPLAIN/generated-output pressure reports. Remaining work is production rollout tuning after observing real DHT/provider lookup cost.

Goal: give node operators a global space-analysis view that explains where storage is going and what can be investigated safely before cleanup or quota decisions.

Scope:

- Add a global menu item, likely under an operator/admin "Storage" or "Insights" area, that opens a space analyzer rather than hiding it inside one file catalog or group.
- Show top-level usage cards for total logical library bytes, estimated physical bytes, pinned bytes, file-catalog bytes, group/post attachment bytes, generated/static output bytes, and uncategorized storage objects when available.
- Rank file catalogs, folders, and groups by size with stable pagination, search, owner/group filters, and clear labels for "logical bytes" versus "deduplicated physical bytes".
- Add drilldowns for largest files, largest folders, largest groups, MIME/file-type breakdowns, duplicate/shared `storageId` rows, pinned objects, preview/thumbnail overhead, and recently growing areas. Status: preview/thumbnail overhead now has a backend aggregate/API route, and recently growing top-level areas now have snapshot-growth deltas from stored analyzer snapshots.
- Add a separate "Popularity" or "Availability" tab for content/network signals that IPFS can expose or GeeSome can measure over time. Start with best-effort provider/peer counts, remote pin/provider coverage, local gateway/API access counters, retrieval success/latency, and last-seen timestamps; label these as network availability signals, not exact global popularity. Backend deterministic availability aggregates, bounded on-demand provider/stat inspection, persisted sample history/summary, opt-in production sampling, and the UI availability tab now exist; remaining work is production tuning and richer popularity signals beyond provider/stat samples.
- Keep live network sampling explicitly bounded. Production nodes can opt in with `STORAGE_SPACE_AVAILABILITY_SAMPLE_WORKER=1`; tune `STORAGE_SPACE_AVAILABILITY_SAMPLE_WORKER_INTERVAL_MS`, `*_LIST_LIMIT`, `*_PROVIDER_LIMIT`, `*_PROVIDER_ADDRESS_LIMIT`, `*_PROVIDER_TIMEOUT_MS`, `*_STAT_TIMEOUT_MS`, `*_STAT_WITH_LOCAL`, and `STORAGE_SPACE_AVAILABILITY_SAMPLE_RETENTION_DAYS` only after watching real Kubo/IPFS cost.
- Use established space-analyzer UI patterns: sortable tables for exact values, horizontal bars for ranked categories, type breakdown charts, breadcrumbs for folder/group drilldown, and an inspectable file list for the largest contributors.
- Keep destructive cleanup out of the first screen. Start with safe analysis, links to the source file catalog/group/content, and explain why an item cannot be removed using the same blocker language as `getContentDeleteSafety` / `getStorageObjectDeleteSafety`.
- Make long-running scans asynchronous for large nodes, with progress, timestamped cached results, and a refresh button. The first synchronous snapshot refresh route and queued async refresh path exist, and queued snapshot refreshes now report per-stage analyzer progress.

Likely backend contract:

- Add paged aggregate endpoints for file-catalog usage by root/folder, group usage by group/post attachments, top files by size, type breakdowns by MIME/extension, duplicate/shared storage IDs, pinned storage objects, preview/thumbnail overhead, cleanup blockers, and IPFS popularity/availability signals. The first database helper layer, AdminRead API exposure, cached latest/refresh/history snapshot routes, snapshot-growth deltas, async refresh contract, file-catalog root/folder drilldown, group-post drilldown, generated/static output source accounting, shared-storage drilldown, pinned-object/remote-pin drilldown, preview-storage drilldown, cleanup-blocker drilldown, deterministic availability-signal aggregate, bounded on-demand provider/stat inspection, persisted network-sample history/summary with retention cleanup and opt-in worker, bounded generated-ref storage inspection/reconciliation, bounded recursive generated-output child-ref inspection/reconciliation, durable preview/generated-output child-ref blockers, restored-data preview-object repair, queued original/preview storage-object removal, configurable retention delay/worker, operator-visible removal history, restored-data measurement, and UI wiring exist; remaining work is production tuning and richer network-popularity signals, not more foundation work before the next TODO slice.
- Report both logical references and deduplicated physical storage where possible; same `storageId` rows across users/groups must not be double-counted as physical bytes.
- Reuse or extend `StorageObject`, content reference counts, and delete-safety blockers instead of inventing a second storage-accounting model.
- Include filters for owner user, group, catalog root/folder, MIME type, extension, pinned state, public/private visibility, and time window.
- Add indexes or background snapshots only after measuring restored production data; existing-table migrations must follow the database migration playbook.

Likely frontend contract:

- `geesome-ui` should add the global nav item and a responsive screen for overview, rankings, type breakdown, and drilldown list states.
- Prefer dense operational layout over a marketing dashboard: compact summary metrics, resizable/sortable tables, clear units, breadcrumbs, filters, and no oversized hero treatment.
- Use a best-practice storage-analyzer flow: overview -> choose large area -> inspect largest files/types -> open source item -> decide cleanup outside the analyzer.

Verification:

- Backend aggregate tests with duplicate/shared `storageId`, file-catalog-only content, group post attachments, pinned objects, previews, and generated/static outputs.
- IPFS popularity/availability tests should use deterministic mocked IPFS/Kubo responses plus stored GeeSome counters, because public peer/provider counts are time-varying and should not make CI depend on the live DHT.
- Restored-dump rehearsal on production-like data with `npm run database:storage-space-report` to confirm totals, availability signals, and cached availability-network sample summaries stay bounded and queries do not full-scan hot paths without pagination or background snapshots.
- Frontend screenshot/e2e coverage for empty state, large rankings, type breakdown, filters, and drilldown navigation.

## Deferred Epics

These are still valid but not fast-delivery work:

- Production secure chat groups after the design note: client-side E2EE, device keys, trust UX, and group key rotation.
- Additional `StorageObject` identity producers for generated/static outputs, ActivityPub objects, or other protocol-owned objects after the product identity/trust policy is clear. Each producer needs a stable identity type, ownership/trust boundary, import/update semantics, delete-safety behavior, and public UI/API meaning before it seeds canonical identity metadata.
- Local/in-browser IPNS accounts and client signing: [#115](https://github.com/galtproject/geesome-node/issues/115).
- PubSub/service communication and remote node backup.
- Matrix, Filecoin, Yacy/search integration: [#619](https://github.com/galtproject/geesome-node/issues/619), [#617](https://github.com/galtproject/geesome-node/issues/617), [#603](https://github.com/galtproject/geesome-node/issues/603).
- Mobile app and browser extension: [#7](https://github.com/galtproject/geesome-node/issues/7), [#6](https://github.com/galtproject/geesome-node/issues/6).

## Maintenance Rule

When a TODO item is delivered, update this file and the README TODO summary in the same PR. If an item becomes primarily frontend work, move the implementation plan to `geesome-ui` and leave only the backend contract here.
