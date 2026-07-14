# GeeSome Node TODO And Fast Delivery Plan

## Source Of Truth

Original user request:

> Analyze the `geesome-node` repo, adjust documentation and agent instructions, check the TODO list, actualize it with `geesome-node` repo issues if needed, make a plan to fast-deliver TODO items, and write it to Markdown.

Corrections and added requirements:

- Chat groups are not finished. They are only a proof of concept, and encryption currently works only in the backend, which is not secure enough. Real secure chat needs frontend-side end-to-end encryption with users' private keys and recipients' public keys. Status: reflected in the secure chat slice and issue cluster.
- Review the Vas3k E2EE article as background for why backend-only encryption is insufficient. Status: referenced in the secure chat notes.
- ActivityPub/Fediverse integration is an important feature. Research it, review the current implementation, document where it should be implemented in `geesome-node`, and decide whether current model schemas or API endpoints should be adjusted for ActivityPub best practices. Status: reflected in this TODO plan and detailed in `app/modules/activityPub/docs/activitypub-research.md`.
- User post text should not use raw HTML as the canonical storage format for social-network and decentralized interop. Store a small versioned semantic rich-text document as the source of truth, render sanitized HTML only for ActivityPub/Matrix/static/admin adapter outputs, and export plain text plus structured facets/tags/mentions for Bluesky/ATProto, Farcaster, Nostr-like protocols, and similar networks. Status: added to the ActivityPub/Fediverse plan as the content-format backlog.
- `geesome-node` is not inherently "the server side." It is a larger GeeSome app/node that can run locally, but is preferably run on an always-on server when content should be more available to other GeeSome network members. Status: this plan treats it as a node/app, not only a backend server.
- Plans saved to Markdown should keep this `Source Of Truth` section current when the user corrects architecture or adds requirements. Status: this plan has been adjusted under that rule.
- Actionable TODO slices should be wrapped in stable `<!-- todo-section: ... -->` markers and extracted with `npm run todo:sections` / `npm run todo:context -- <section-id>` so future agents can load deterministic implementation context instead of re-reading the whole backlog. Status: added for the ActivityPub/Bluesky finish plan, with the extractor in `check/todoSectionContext.ts`.
- Add Node.js 22 migration to the TODO. Node 22 should become the supported baseline now, with Node 24 tested separately as the next LTS target. Status: implemented in [#779](https://github.com/galtproject/geesome-node/issues/779), with the Helia wrapper dependency update tracked by `geesome-libs` [#119](https://github.com/galtproject/geesome-libs/issues/119); Node 24 remains follow-up validation.
- Add security review of API and encryption flows to the TODO. Status: tracked in [#782](https://github.com/galtproject/geesome-node/issues/782) and added as a fast-delivery security gate.
- API documentation tooling should be handled through microwave-hub submodules for [`apidoc-template`](https://github.com/MicrowaveDev/apidoc-template) and [`apidoc-plugin-ts`](https://github.com/MicrowaveDev/apidoc-plugin-ts). Status: hub submodule tracking is in [Microwave Hub #2](https://github.com/MicrowaveDev/microwave-hub/issues/2), planning was tracked in [#787](https://github.com/galtproject/geesome-node/issues/787), vulnerable `apidoc-core` removal was tracked in [#802](https://github.com/galtproject/geesome-node/issues/802), final git-URL wiring was tracked in [#804](https://github.com/galtproject/geesome-node/issues/804), plugin-master repoint was tracked in [#806](https://github.com/galtproject/geesome-node/issues/806), request-body annotation support was tracked in [#808](https://github.com/galtproject/geesome-node/issues/808), all-module generation for existing annotated specs is tracked in [#810](https://github.com/galtproject/geesome-node/issues/810), practical remaining route coverage is tracked in [#812](https://github.com/galtproject/geesome-node/issues/812), and final examples/errors/render polish is tracked in [#813](https://github.com/galtproject/geesome-node/issues/813).
- User-facing and agent-facing docs must be discoverable from a running node, not only from Git. Follow the API discovery direction implemented in [#1048](https://github.com/galtproject/geesome-node/pull/1048), [#1049](https://github.com/galtproject/geesome-node/pull/1049), and [#1051](https://github.com/galtproject/geesome-node/pull/1051): conventional machine paths, `/v1` discovery JSON, OpenAPI/apiDoc JSON, docs headers, and IPFS-published docs pointers should lead users and agents to generated API docs plus the newer handwritten module docs. Status: added as the documentation discovery follow-up in the API docs plan.
- Add database scalability review for the possibility of storing hundreds of thousands of posts and their content records in groups. Status: tracked in [#880](https://github.com/galtproject/geesome-node/issues/880) and added as a dedicated review slice.
- Add a global UI menu item and screen for storage-space analysis: show which file catalogs and groups use how much space, then let operators drill into largest files, file types, duplicate/shared storage IDs, cleanup candidates, and a separate future IPFS popularity/availability tab for content with many peers/providers or other retrievable network signals. Status: added as a dedicated planning slice; first `geesome-node` aggregate helpers live in a dedicated `storageSpace` module with AdminRead API routes, cached snapshot routes/table/history, snapshot-growth deltas, staged queued async refresh path, active-content file-catalog root/folder drilldown, group-post drilldown, generated/static output source accounting, duplicate/shared storage-id drilldown, pinned-object/remote-pin drilldown, preview/thumbnail overhead drilldown, cleanup-blocker drilldown, bounded runtime storage-stat inspection/reconciliation for unknown generated refs, bounded recursive generated-output DAG child inspection/reconciliation, durable preview/generated-output child-ref delete-safety blockers, queued original/preview storage-object physical removal with final safety recheck, configurable storage-removal retention delay/worker, operator-visible storage-removal history, deterministic availability signals from DB-visible refs/local pins/remote pin rows/stored peer counts, bounded on-demand IPFS provider/stat inspection, persisted/async availability-network sample history and per-storage summary with old-sample retention cleanup and an opt-in production sampling worker, the `geesome-ui` global screen and availability/sample-history tab, and a read-only restored-database `database:storage-space-report` command that includes active-content totals, availability signals, and cached network sample summaries. This closes the storage analyzer implementation phase for now; remaining work is production rollout tuning after observing real DHT/provider lookup cost.
- ActivityPub actor-signed ownership challenges are backend-foundation complete for claimed visible migration, but follow-up planning should keep the real-world operability findings explicit: detached-proof versus public callback semantics, expired/consumed challenge cleanup, creation/verification abuse limits, UI/operator guidance for hosted accounts that cannot sign arbitrary requests, and live compatibility checks against real ActivityPub tooling. Status: added as a dedicated ownership-challenge operability slice.
- The Pinata/pinning MVP is complete, but production-scale operability is a separate follow-up: deduplicate still-pending automatic jobs, make account-policy cache freshness safe across processes, clarify group credential ownership, define account limits explicitly, and reconcile local pin claims with remote provider state before offering automatic unpin or cleanup actions. Status: added as a deterministic post-MVP section without reopening the shipped MVP.
- A full Docker run on 2026-07-14 passed with 431 tests but emitted repeated PostgreSQL `too many clients already` errors from a background auto-action worker late in the suite. Do not hide this by increasing PostgreSQL limits first; inventory Sequelize pools and worker/timer lifecycle, add bounded diagnostics, and prove clean teardown/concurrency budgets. Status: added as the first recommended reliability slice.

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
- Documentation discovery: expose the newer handwritten docs through the same agent-findable runtime surfaces as API docs: `GET /v1`, `GET /v1/openapi.json`, `GET /v1/apidoc.json`, conventional unversioned OpenAPI paths, docs headers, and IPFS-published docs links. The repo-local starting point should be `docs/README.md`; the module map remains `docs/modules.md`; module details stay under `app/modules/<module>/docs/`.
- Large protocol/integration epics: [#115](https://github.com/galtproject/geesome-node/issues/115), [#619](https://github.com/galtproject/geesome-node/issues/619), [#617](https://github.com/galtproject/geesome-node/issues/617), [#7](https://github.com/galtproject/geesome-node/issues/7), [#6](https://github.com/galtproject/geesome-node/issues/6).

## Fast Delivery Plan

### Recommended Next Order

1. Fix or conclusively isolate the database connection/worker lifecycle warning in one focused reliability PR. It is a cross-cutting production risk and the current evidence is strong enough to investigate, but not strong enough to assume the database limit itself is wrong.
2. Close the remaining ActivityPub/Bluesky release gates: run public staging inbox/outbox exchange, credentialed Bluesky write lifecycle, and external signed-ownership proof; then address only the operability gaps those runs expose. Do not reopen the completed backend, simplified UI, cross-post policy, or migration-reconciliation foundations without new evidence.
3. Complete the pinning operability section before enabling automatic pinning on multi-process nodes or groups with high post volume. The shipped MVP remains usable while this follow-up is developed.
4. Continue canonical rich-text native-storage work after the federation live-smoke gates, so new adapters and identity producers build on one stable, non-HTML-trusting content model.

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

Status: in progress. [#733](https://github.com/galtproject/geesome-node/issues/733) now has a focused API HEAD regression so content-data/file-catalog storage handlers can set their own `Content-Length` and content headers instead of being swallowed by the generic HEAD fallback. [#846](https://github.com/galtproject/geesome-node/issues/846) extends the same header behavior to gateway HEAD requests so published folder/IPFS-style paths can return storage headers. [#848](https://github.com/galtproject/geesome-node/issues/848) hardens byte-range handling so malformed or unsatisfiable ranges return `416` before storage streams are opened. [#850](https://github.com/galtproject/geesome-node/issues/850) returns `404` when an allowed content path is missing from storage instead of dereferencing a missing stat. [#852](https://github.com/galtproject/geesome-node/issues/852) closes response streams when storage streams fail after headers are written. The client-disconnect slice now destroys the upstream storage stream when the response closes and keeps range-stream byte counting behind the debug namespace. HEAD requests now reuse the GET metadata/path decision path for missing and forbidden storage ids, so they return `404`/`423` instead of empty `200` responses. Ranged GET requests now follow the same missing/forbidden storage decisions before parsing byte ranges or opening streams, and image/directory range requests now return `206` partial streams instead of falling back to full `200` sends while preserving metadata-derived content type after directory index path rewrites. Non-range GET now also streams content when storage stats provide size but no CID, using the already resolved path metadata for headers. Post-header storage stream errors and expected over-limit content-save failures now clean up without unconditional stderr noise, and HTTP access logs are opt-in through `GEESOME_ACCESS_LOGS=1` instead of default morgan output. The content-save performance check now has discoverable `check:performance:*` aliases, bounded env-configurable payload defaults, and calls the current `saveData(userId, data, name, options)` contract so #750 CPU checks can be repeated intentionally. The existing opt-in memory profiler now also records process CPU, event-loop utilization/delay, system load, and bounded API/gateway request interval counters so the next #750 incident can distinguish GeeSome JavaScript pressure, native/external service pressure, and request spikes without enabling high-volume access logs.

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

<!-- todo-section: content-serving-cpu-attribution -->
#### Content Serving: CPU Attribution

Goal: turn [#750](https://github.com/galtproject/geesome-node/issues/750) from a
system-saturation screenshot into a reproducible GeeSome, IPFS, proxy, request, or
background-job profile before changing runtime behavior.

Current state:

- Opt-in runtime snapshots correlate process CPU, event-loop utilization/delay,
  memory, system load, and bounded API/gateway request interval counters.
- The profiler records no paths, query values, headers, bodies, user IDs, or
  response payloads. Event-loop and request tracking remain disabled unless
  `GEESOME_RUNTIME_PROFILE=1`, a runtime log file, or the exact
  `DEBUG=geesome:runtime` namespace is configured; broad debug wildcards retain
  only the legacy memory profiler behavior.
- The operator workflow is documented in
  [runtime-performance-diagnostics.md](./runtime-performance-diagnostics.md).

Next incident work:

- Capture profiler output alongside `pidstat`/`top`, nginx request metrics, Kubo
  stats, and PostgreSQL activity during the same incident window.
- If GeeSome CPU and event-loop utilization are high, capture a bounded Node CPU
  profile and add a focused route/job benchmark for the hottest stack.
- If system load is high while GeeSome CPU is low, investigate Kubo, nginx,
  PostgreSQL, media conversion, or storage I/O before changing application loops.

Verification:

- Focused runtime-profiler unit tests cover completed and aborted request counts,
  interval reset behavior, and numeric CPU/event-loop fields.
- Existing API/gateway tests remain green with profiling disabled.
<!-- /todo-section -->

<!-- todo-section: database-connection-worker-lifecycle -->
#### Runtime Reliability: Database Connection And Worker Lifecycle

Status: lifecycle correction in progress from a real full-suite signal. The original 2026-07-14 Docker run completed with `431 passing, 11 pending`, but late Telegram-import tests coincided with repeated `SequelizeConnectionError: sorry, too many clients already` errors from the auto-action worker. Attribution found that every test app opened the shared Sequelize pool but `app.stop()` never closed it, while interval workers were not consistently owned or drained by their modules. App shutdown now runs once in reverse startup order and closes the database pool last. A shared interval-worker helper prevents overlapping ticks, unreferences timers, tracks immediate runs, and makes shutdown await active callbacks. Auto-actions, ActivityPub, Bluesky, group derived-state, and storage-space sampling/removal workers now use module-owned lifecycle handles. Async-operation queue processing locks are app-instance-local, reject new work after stop, and drain active durable queue processors before database closure. A full Docker run completed with `440 passing, 11 pending` and no PostgreSQL client-exhaustion or post-shutdown database errors. Remaining work starts with process signal handling and awaitable infrastructure shutdown, followed by bounded connection-budget diagnostics rather than a speculative pool-size increase.

Goal: give all long-lived workers and module-owned Sequelize instances an explicit connection budget and deterministic shutdown path, then prove normal test and application lifecycles do not exhaust PostgreSQL clients.

Findings to preserve:

- The normal app has one shared Sequelize instance used by the database and model-owning feature modules, but its default pool maximum is `20` connections per process. The deployment budget is therefore multiplicative: `DATABASE_POOL_MAX * node process count + concurrent migration/check/admin pools` must stay below PostgreSQL `max_connections` with an explicit operational reserve.
- Database check/rehearsal commands create short-lived Sequelize instances. Keep ownership local and closure in `finally`; do not route recurring runtime work through those scripts or leave a diagnostic connection open after failure.
- Group derived-state, storage-space/removal, and async-operation queue guards previously included module-scope state or untracked `void`/promise-chain kicks. Keep these lifecycle handles app-instance-local and awaitable so multiple app instances cannot suppress each other's work and shutdown cannot race database closure.
- User/API-triggered durable work already belongs in `asyncOperation`. Interval workers should discover or advance bounded persisted work, not become a second in-memory queue whose jobs disappear on restart.
- `index.ts` does not yet route `SIGTERM`/`SIGINT` through `app.stop()`. Correct module stop methods alone do not provide graceful Docker/systemd shutdown until process signals stop accepting new work, drain servers/workers, close storage/communication resources, and close Sequelize last.
- API/gateway server stop methods and the global memory profiler need explicit lifecycle verification. Repeated app construction must not accumulate listeners/timers, and server shutdown must be awaitable rather than merely requesting `server.close()`.
- Waiting forever is also unsafe. Long remote calls should retain their request timeouts or cooperative abort support, while app shutdown should have an operator-visible deadline that does not interrupt an active database transaction silently.

Scope:

- Inventory every Sequelize instance and pool configuration, including module-local databases, migration/check scripts, tests, and app-level database ownership. Record which component opens and closes each pool.
- Inventory interval/cron workers for auto actions, async operations, ActivityPub delivery/source refresh, storage-space sampling/removal, derived-state processing, and social imports. Make start/stop idempotent and ensure test/app shutdown awaits worker cancellation before closing databases.
- Reproduce the warning with a focused repeated-start/stop or late-suite harness. Measure active/idle/waiting PostgreSQL clients and Sequelize pool use under an opt-in diagnostic flag; do not add per-query logging or unconditional object/array serialization.
- Define one documented total connection budget for a default node and bounded per-worker concurrency. Prefer shared module services or smaller pools where ownership allows it; do not solve leaked clients by only increasing `max_connections`.
- Keep expected shutdown and transient worker errors quiet by default while preserving actionable opt-in diagnostics and final worker failure state.

Recommended remaining slices:

1. Completed 2026-07-14: group derived-state and storage-space/removal workers now use instance-owned shared worker handles, immediate kicks participate in the same drain lifecycle, and async-operation queue locks and active promises are scoped to each app instance and drained during shutdown.
2. Add process-level graceful shutdown for `SIGTERM` and `SIGINT`: stop accepting HTTP/gateway work, invoke idempotent `app.stop()`, enforce a configurable deadline, and exit with a meaningful status. Keep signal registration out of reusable module factories so tests and embedded callers do not accumulate handlers.
3. Make API/gateway/storage/communicator/memory-profiler shutdown ownership explicit and awaitable. Add a repeated app start/stop test that checks active handles/listeners and proves no callback reaches Sequelize after database closure.
4. Add opt-in, bounded connection diagnostics without per-query logging: configured pool limits; Sequelize pool size/available/borrowed/waiting counts when supported; and an aggregate `pg_stat_activity` snapshot grouped by application/state. Build payloads lazily and never serialize model rows or arrays unless the debug namespace is enabled.
5. Document the production connection formula and reserve. Add startup validation/warning for clearly impossible pool/process/PostgreSQL budgets, but do not query or log database state on every request and do not automatically raise `max_connections`.
6. Classify fatal bootstrap failures. If initialization fails after opening the database or starting a server/worker, stop already-started modules in reverse order before rejecting; do not silently leave a partially initialized process holding resources.

Verification:

- A focused lifecycle test starts/stops the app and affected workers repeatedly without increasing active PostgreSQL connections.
- `npm run test:docker:cold` finishes without `too many clients already`, open-handle hangs, or worker activity after teardown.
- Run the exact late-suite Telegram/auto-action combination repeatedly to distinguish a test leak from production worker pressure.
- Enable each recurring worker with short test intervals, stop during an active callback, and prove shutdown waits without allowing a subsequent tick.
- Record PostgreSQL connection count before repeated app start/stop cycles and assert it returns to baseline after every cycle.
- Send `SIGTERM` to a disposable Docker node with active HTTP and worker work, then prove bounded clean exit, no new accepted work, and no post-close database query.
<!-- /todo-section -->

<!-- todo-section: pinata-and-pinning-mvp -->
### 4. Pinata And Pinning MVP

Status: complete. [#854](https://github.com/galtproject/geesome-node/issues/854) hardens direct pin negative paths with explicit missing-account, unknown-service, and missing-content errors before remote pinning is attempted. [#856](https://github.com/galtproject/geesome-node/issues/856) keeps pin account secret updates encrypted and returns an explicit missing-account error for update calls. [#858](https://github.com/galtproject/geesome-node/issues/858) forwards caller pin options into Pinata metadata and normalizes remote Pinata failures to `pinata_pin_failed`. [#868](https://github.com/galtproject/geesome-node/issues/868) documents the account and direct pin API flows, examples, forwarded Pinata keyvalues, and common pin errors. [#872](https://github.com/galtproject/geesome-node/issues/872) enforces group edit permission before creating/deleting group-owned pin accounts and keeps pin secrets write-only in API responses. The same node PR consumes `geesome-ui` [#5](https://github.com/galtproject/geesome-ui/issues/5), [#7](https://github.com/galtproject/geesome-ui/issues/7), and [#6](https://github.com/galtproject/geesome-ui/pull/6) at commit `4c24162` so the profile UI can configure pin accounts, delete them, upload a file, pin its `storageId` through the user-owned account endpoint, and carry first-pass e2e/screenshot coverage plus repo-local e2e/screenshot review instructions. User-owned accounts can opt into automatic pinning through structured account options; each new-content hook creates a bounded one-shot `autoActions` job, and successful one-shot actions are deactivated instead of being selected again every minute. `geesome-ui` [#32](https://github.com/galtproject/geesome-ui/pull/32) at commit `8b8ffc1` adds the profile toggle, bounded attempt control, metadata editor, unknown-option preservation, account-state label, and mobile/desktop e2e screenshot coverage for this user-account flow. Group accounts have an explicit backend `group-post` policy with selected `post-manifest` and/or `contents` targets. It runs after the final post manifest exists, permits cross-user content only through exact post attachment membership, excludes remote/private/encrypted/unpublished posts, executes as the account owner with group permission rechecks, and skips targets already recorded for that pin account. `geesome-ui` [#33](https://github.com/galtproject/geesome-ui/pull/33) at commit `c54cc55` completes the group settings flow with group-scoped account management, required manifest/content target selection, responsive mobile rows, exact payload assertions, and clean mobile/desktop screenshot evidence.

Goal: turn "Pin to services like pinata from UI" into a shippable backend/API slice first.

Scope:

- Audit `pin` module behavior for encrypted account storage, account ownership, group account permissions, and Pinata request error handling. Group-owned account creation/deletion now checks edit permission, and API responses no longer echo pin secrets; keep the same boundary in the future UI.
- Add API docs/examples for account creation, listing, and pin-by-user/group calls.
- Add negative-path tests for missing account, unknown service, remote Pinata error, and group permission denial.
- Keep the shipped profile-UI toggle and attempt/metadata controls aligned with the user-account automatic-pinning contract.
- Keep the shipped group settings controls aligned with the backend `group-post` scope and explicit target selection contract.

Likely modules:

- `app/modules/pin`
- `app/modules/autoActions`
- `app/modules/content`
- `test/pin.test.ts`

Verification:

- `test/pin.test.ts`
- `test/autoActions.test.ts`
- `yarn test`
- `geesome-ui`: `npm run test:e2e:screens` and `npm run build` under Node 18
<!-- /todo-section -->

<!-- todo-section: pinning-operability-and-reconciliation -->
#### Pinning: Operability And Reconciliation

Status: post-MVP backlog. Manual pinning, user automatic pinning, explicit group-post target policy, account UI, and group settings UI are shipped. The items below improve correctness under retries, multiple node processes, remote provider drift, and larger account/post volume; they are not blockers for the completed single-node MVP.

Goal: make automatic pinning observably idempotent and make the per-account pin ledger the trustworthy source for remote pin state without silently changing or deleting remote pins.

Scope:

- Deduplicate pending automatic jobs by stable identity such as `(pinAccountId, storageId, operation)` before execution. The current ledger skips completed pins, but repeated manifest hooks can still enqueue duplicates while the first job is pending.
- Replace indefinitely stale process-local account-policy caches with a bounded TTL/version strategy or a cheap database-backed lookup. Account changes in one process must become visible to workers in another process without restart.
- Decide and document group-account ownership: distinguish credential creator/owner from group scope, then keep user account lists from ambiguously mixing direct user accounts with group-scoped credentials. Preserve execution-time group permission checks.
- Replace the silent first-100 group account scan with an explicit product limit, validation rule, or complete bounded traversal. A configured account must not be ignored merely because its sort position falls outside an implementation cap.
- Treat `PinStorageObject` per-account rows as canonical remote-pin claims. Keep `Content.isPinned` or `StorageObject.isPinned` only as a derived aggregate, because one storage ID can be pinned by multiple accounts/providers and remote state can drift.
- Add bounded provider-status reconciliation with last-check time, remote status/error, retry/backoff, and operator-visible stale/failed state. Automatic unpin, account deletion cleanup, and physical storage deletion must remain explicit separate policies and fail closed.
- Add a credential test/health action in the account UI that does not expose secrets, plus last successful check/error summaries suitable for operators.

Verification:

- Concurrency tests call the same post-manifest hook repeatedly before the worker runs and assert one pending job per account/storage operation.
- Multi-instance or cache-version tests prove create/update/delete policy changes become visible without process restart.
- Provider tests use an injected fake Pinata client for pinned, missing, failed, rate-limited, and recovered states; CI must not depend on live Pinata.
- Ownership tests cover creator removal, group admin changes, same `storageId` across users, and exact post-attachment authorization.
- If schema changes become release-bound, add the production migration and migration-integrity checks at release preparation; while changes remain unreleased on `dev`, keep model-sync-only tables aligned with the repo migration rules.
<!-- /todo-section -->

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

Documentation discovery follow-up:

Status: implemented for the repo docs portal, compact agent map, richer `/v1`
docs object, docs headers, and module-doc IPFS/repo links. Keep this section as
the checklist for future generated-docs layout changes.

- Add `docs/README.md` as a stable docs portal for humans and agents. Status: implemented.
- Add a compact agent/docs map, either as a section in `docs/README.md` or a separate `docs/agent-map.md`, mapping common work types to the right docs and verification commands. Status: implemented as `docs/agent-map.md`.
- Extend the existing `/v1` discovery JSON so the `docs` object includes generated API HTML, OpenAPI JSON, raw apiDoc JSON, the repo docs portal, the module-doc index, and the published IPFS paths when `app.docsStorageId` is available. Status: implemented.
- Add or restore dedicated docs headers such as `X-Api-Docs-Ipfs`, and consider standard `Link` headers with `service-desc` / `describedby` relations so generic tools can find the OpenAPI spec and human docs without knowing GeeSome conventions. Status: implemented with `X-Api-Docs-Ipfs`, `X-Api-Docs-Openapi`, `X-Api-Docs-Discovery`, and `Link` headers.
- Keep conventional unversioned paths (`/openapi.json`, `/swagger.json`, `/api-docs.json`, `/.well-known/openapi.json`) returning machine-readable API docs instead of the frontend SPA shell. Status: already implemented in the API docs discovery work.
- Do not move the generated API docs root until there is a planned compatibility change; if it is later moved to `docs/api/`, keep redirects or published links so existing `/ipfs/<docsStorageId>/` docs links keep working.

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

Status: first API prerequisite, public identity helper, read-only serializer, read-only route, actor-key/signature, inbound verification-only, remote actor key-cache, inbound follow-state, inbound follow-undo, inbound block, inbound flag-report storage, admin flag-report listing/state/target context, followers collection, following collection, follow request delivery queue, outbound follow-response, follow-accept delivery queue, delivery processor, opt-in delivery worker, local post object-record, publish-time Create delivery, shared-inbox remote object-record, shared-inbox remote update, shared-inbox remote delete-tombstone, shared-inbox remote undo-create tombstone, safe remote attachment-preview metadata, explicit remote attachment embed/import policy with opt-in HTTP(S)/IPFS/IPNS media/document backup-on-create, async retry queue for missing supported remote attachment backups, signed `Content-Digest` verification, and NodeInfo discovery/document slices landed. The API module now supports unversioned JSON `POST` handlers, accepts `application/*+json` payloads, and exposes captured raw JSON bytes for signed/protocol-style posts such as ActivityPub inbox/shared-inbox routes. ActivityPub config now has explicit `enabled`, `publicUrl`, and `domain` fields sourced from `ACTIVITYPUB_*` env vars, deterministic helpers build group actor, inbox/outbox/followers/following, shared-inbox, post-object, WebFinger, and NodeInfo URLs, serializers build group actor, Note/Create, `Follow`, `Accept(Follow)`, outbox collection, followers collection, and following collection payloads behind public/non-encrypted/published safety gates, the dedicated `activityPub` module exposes disabled-by-default public WebFinger, NodeInfo discovery/document, actor, outbox, followers, following, post-object, group inbox, and shared-inbox routes plus AdminAll outbound follow request routing, local group actors now get model-sync-created `ActivityPubActor` records with encrypted RSA private keys, public keys in actor documents, outbound HTTP-signature helpers, inbound RSA-SHA256 signature/signed `Digest` or `Content-Digest`/Date verification helpers, model-sync `ActivityPubRemoteActor` records for fetched remote actor key/inbox metadata, model-sync `ActivityPubFollow` records for idempotent signed inbound `Follow` activities plus signed embedded `Undo(Follow)`, signed `Block` cancellations, and pending outbound `Follow` activities plus signed remote `Accept(Follow)`/`Reject(Follow)` responses, model-sync `ActivityPubFlag` records for signed pending moderation reports plus AdminRead listing with target context and AdminAll pending/resolved state updates, model-sync `ActivityPubObject` rows for local public post Note/Create IDs, signed remote `Create` replies and mentions to known local actors for supported review object types (`Note`, `Article`, `Page`, `Image`, `Video`, `Audio`, `Document`, `Question`, and `Event`) plus AdminRead remote-object list/detail/post-draft review with sanitized preview fields, bounded sanitized remote attachment/media metadata, accepted-review-gated import-readiness metadata, resolved local reply targets, manual native-post creation from accepted public Notes only, persistent pending/accepted/rejected review decisions, and review-state filtering that treats missing review rows as pending, and signed remote `Update` refreshes plus `Delete`/`Undo(Create)` tombstones for cached remote objects from the same actor, update or soft-delete linked imported GeeSome Note posts when source identity still matches, reset review decisions to pending, and model-sync `ActivityPubDelivery` rows for queued outbound `Follow`, follow `Accept`, and local post `Create(Note)` activities. Group inbox routes can persist and cancel inbound follow state for local actor objects, update matching outbound follows from signed remote `Accept`/`Reject` responses, store pending reports for signed `Flag` activities that target the local actor or known local objects, admins can list/read those remote-object reviews per group actor, inspect accepted-review-gated post-draft readiness with local reply mapping and remote attachment/media provenance plus a `provenanceOnly` default attachment import policy, filter cached remote objects by review state, mark cached remote objects pending/accepted/rejected, and manually create native remote posts from accepted public Notes, admins can inspect local actor/post target context for flag reports and mark reports pending/resolved, admins can queue signed outbound `Follow` delivery to a remote actor, followers routes list accepted inbound remote actors, following routes list accepted outbound remote actors once a signed remote `Accept` is recorded, accepted inbound follows enqueue a delivery record to the remote shared inbox or actor inbox, signed `Block` activities remove the remote actor from followers and future post delivery, post manifest updates enqueue idempotent `Create(Note)` rows only for accepted followers, imported remote posts are excluded from ActivityPub local-post federation to avoid loops, shared inbox routes can store/update/tombstone idempotent remote object rows including review-only non-Note ActivityStreams objects and admins can review sanitized previews while linked imported Note posts are refreshed from real signed Note changes, remote attachment previews now carry bounded media category, alt text, duration, blurhash, sensitive metadata, per-attachment embed policy, backup eligibility/reasons, and explicit import policy, manual remote-post creation can opt into backing up supported HTTP(S), IPFS, and IPNS media/document attachments into GeeSome content storage while unsupported or link-only attachments remain provenance metadata, already-imported posts can queue async retries for missing supported attachment backups through the normal user operation queue, `processDeliveryQueue` signs queued payloads, sends them through an injectable/default sender, then marks deliveries delivered, retry-pending, or failed after bounded attempts, and `ACTIVITYPUB_DELIVERY_WORKER=1` enables a bounded interval worker with DB-backed delivery claims when the model-synced claim shape is active. The geesome-ui admin review screen now consumes the sanitized preview/post-draft APIs for escaped previews, review-state changes, attachment-backup opt-in, and manual post creation. Generic live remote-server smoke now exists for configurable Fediverse actors/public Notes; deeper conformance tooling remains future work before accepting broad federation activities.

Local smoke note: `npm run activitypub:interop-smoke` now checks deterministic WebFinger, NodeInfo, actor, Note/Create, outbox filtering, content-type, sanitized rich-text, tag, and attachment payload compatibility. `npm run activitypub:remote-server-smoke` is the generic live operator-run Fediverse smoke: it resolves a configurable WebFinger resource or direct actor URL, fetches a public Note from featured/outbox collections when available, and feeds a signed fixture-equivalent `Create(Note)` through the existing `activityPub` module path into a disposable local group. `npm run activitypub:bluesky-bridge-smoke` is the live operator-run Bluesky boundary smoke: it defaults to the official public `bsky.app` account, discovers the Bridgy Fed ActivityPub actor, uses the public ATProto feed to pick a recent post when available, converts it through the bridge to an ActivityPub Note, then feeds that same local harness path. The remaining interop-smoke backlog means deeper remote-server checks such as Fedify CLI and ActivityPub.Academy.

Bluesky smoke status: `npm run activitypub:bluesky-bridge-smoke` uses Bridgy Fed/ActivityPub discovery when the Bluesky account is bridged, verifies actor resolution, shared inbox/key metadata, and a public bridged Note, feeds a signed fixture-equivalent ActivityPub object through the existing `activityPub` module path into a disposable local group, and asserts `ActivityPubRemoteActor`, `ActivityPubObject`, pending/accepted review metadata, idempotency, and accepted-post creation results. If the chosen Bluesky account is not bridge-enabled or has no bridge-visible public Note, the script reports a clear skip instead of creating fake success. Override the default official account with `ACTIVITYPUB_BLUESKY_SMOKE_HANDLE`.

Native Bluesky/ATProto direction: direct public Bluesky timeline import, account ownership, and cross-posting without Bridgy Fed are now part of the overall social interoperability plan. Keep this bridge-free work in the dedicated Bluesky/ATProto module or socNet import driver instead of expanding the ActivityPub module.

Status: native helper/smoke groundwork now fetches public `app.bsky.feed.getAuthorFeed` data through unauthenticated ATProto/XRPC, maps `app.bsky.feed.post` text/facets/replies/external/image embeds into canonical rich-text/source-identity projection metadata, exposes a read-only admin preview API through the dedicated `bluesky` module, has a reusable `BlueskyImportClient` adapter that converts projected posts into the existing `socNetImport` client contract with AT URI idempotency, same-channel reply mapping, source metadata, public `bsky.app` links, and canonical rich-text content storage, exposes an AdminAll/UserGroupManagement write route that imports one public feed page into a created/reused social-import channel/group through an async operation, stores per-user native Bluesky source subscriptions with active/paused/removed state plus filter/import preferences and persisted import relation/media policy defaults, can manually or asynchronously refresh one public feed page from stored subscriptions through the shared async-operation queue with opt-in worker/poller env flags, exposes a read-only cached source-feed route that returns already-imported group posts through the linked social-import channel with cursor pagination, has a bounded manual sync route that verifies already-imported AT URIs with `com.atproto.repo.getRecord`, re-imports changed CIDs, and soft-deletes local posts only when the AT record lookup confirms deletion, applies a shared remote-content moderation helper for stored source `autoImport`/`reviewFirst` mode plus bounded keyword/regex/source/group-name rules before refresh creates visible posts and before sync keeps/updates visible posts, persists native Bluesky source review records for review/quarantine/block decisions with admin APIs to list, reject/reset, and import pending/quarantined records through the social-import pipeline, applies optional write-time moderation and request-level or stored source-default relation/media import policy before public feed, source refresh, source-review, and claimed migration imports create visible GeeSome posts, supports user-scoped Bluesky account login/verification through ATProto session/profile checks without returning secret material or storing short-lived JWTs, and now has backend cross-post routes that create text/rich-text plus supported-image `app.bsky.feed.post` records from safe local published public GeeSome posts, fall back to public image links/cards when blob upload fails and `BLUESKY_PUBLIC_URL`, `ACTIVITYPUB_PUBLIC_URL`, or `DOMAIN` can identify the public node, add storage-backed non-image media/attachments and safe JSON link-preview records as explicit public link facets/cards, preserve local `replyToId` and `repostOfId` as native Bluesky reply/quote metadata only when relation targets have stored/imported Bluesky URI/CID identity, expose explicit `mediaPolicy` / `relationPolicy` controls for upload/link/reject/ignore and reply/quote omission choices, store per-account URI/CID idempotency metadata, update stored cross-post records in place with stored-URI ownership checks plus stored CID `swapRecord`, and delete stored cross-post records with stored-URI ownership checks plus per-DID metadata cleanup. Frontend bridge-free source feed, account, cross-post, relation guidance, source-review screens, Bluesky source-subscription import policy defaults, Bluesky publish-time cross-post policy controls, social-migration import policy controls, social-migration relation-reconciliation status/actions, post-card canonical rendering, and native rich-text composer publishing now exist through the pinned `@geesome/ui` dependency; ActivityPub claimed visible imports now support short-lived actor-signed ownership challenges in addition to admin-approved and profile-token trust paths, with bounded cleanup and request-level abuse controls for the detached-proof backend path; next slices should focus on deeper live interop result runs without bypassing moderation, source identity, idempotency, account ownership, upload failure handling, update/delete safety, and review rules.

ActivityPub source-feed direction: geesome-ui now has a user-facing ActivityPub Sources section where operators can subscribe to remote ActivityPub actors and read cached posts in a feed-style view. The first preset supports the official Bluesky account through Bridgy Fed (`acct:bsky.app@bsky.brid.gy`) while keeping direct ATProto import/cross-posting on the native Bluesky phase. Backend source-oriented APIs now resolve source handle/actor URL, list/add/update/remove subscriptions, manually or asynchronously refresh public `featured`/`outbox` source objects into the local cache, enqueue stale active subscriptions through an opt-in poller, process queued refresh jobs through the shared async-operation queue/worker, expose subscription read/refresh/error state, optionally request a federation-level outbound Follow from an explicit local group actor to the subscribed source actor, and list sanitized feed items with source actor metadata, `contentText`/canonical rich text, bounded attachment metadata, `embedPolicy`, remote URLs, local review/import state, and optional `(publishedAt, id)` cursor pagination that skips expensive totals. Source follow acceptance remains represented by the existing signed remote `Accept(Follow)` path and group following collection. Frontend implementation detail and the dual-viewport Playwright e2e/screenshot coverage live in `geesome-ui/docs/activitypub-source-feed-plan.md`.

Remaining ActivityPub/Bluesky finish plan sections are ordered by delivery priority. Agents should run `npm run todo:sections`, then `npm run todo:context -- <section-id>` for the next section before implementing it.

<!-- todo-section: activitypub-bluesky-simplified-user-ui -->
#### ActivityPub/Bluesky: Simplified User UI

Goal: simplify the ActivityPub/Bluesky frontend so ordinary users see the main job first, while flexible configuration and migration repair controls remain available in grouped expandable containers.

Current state:

- The backend and frontend expose source feeds, account connection, cross-posting, review/import, migration, reconciliation, and rich media/relation policy controls.
- Several screens expose powerful policy and troubleshooting inputs that are useful for edge cases but can distract from the common path.
- Status: complete. Social migration keeps source, target, preview, import actions, progress, and results in the primary flow; source tuning, ownership proof, media/relation policy, moderation filters, and relation repair are grouped behind task-named disclosures. Unverified ownership remains a visible blocker with a direct repair action. ActivityPub and native Bluesky source readers lead with subscribe, feed refresh/read state, reviews, and visible errors; source defaults, import policy, synchronization, pause/resume, and removal are grouped behind task-named disclosures. Bluesky account connection keeps handle/password and connect/verify actions first while credential storage is advanced, and post cross-publishing keeps account, credential, relation warning, remote status, and post/update/delete actions first while media/relation policy is advanced. The full geesome-ui browser suite covers collapsed and expanded states on mobile and desktop without changing backend contracts.

Implementation context:

- Use progressive disclosure. The first viewport of each screen should prioritize the primary action and current status, not every protocol option.
- Keep recommended defaults visible and action-oriented:
  - ActivityPub Sources: source search/subscribe, feed, refresh, read state, and visible error state first.
  - Native Bluesky Sources: public handle preview/subscribe, feed, refresh, account state, and review/import status first.
  - Bluesky account: connect/verify account first; credential/storage diagnostics stay in advanced details.
  - Cross-posting: account selector, post/update/delete actions, remote URL/status, and retry/error state first.
  - Social migration: source, target group, preview summary, start/resume job, progress, and result summary first.
- Put flexible configuration under labeled spoiler/disclosure groups with compact inputs/buttons:
  - import media policy, relation policy, reply/quote behavior, upload fallback, link-preview handling, language/facet details;
  - moderation mode, keyword/regex filters, group-name filters, review/quarantine overrides;
  - migration ownership proof token, signed challenge proof, max pages/cursors, force/cross-group reconciliation, relation repair actions;
  - source default group/channel, import limit, poller/worker hints, actor URL versus handle override, bridge/provider details;
  - smoke/report/debug details for operators.
- Make each expanded group task-oriented, for example "Advanced import policy", "Resolve migration ownership", "Repair replies and quotes", "Source refresh settings", and "Operator diagnostics".
- Do not hide blockers, safety decisions, or destructive actions. If a post cannot cross-post, a source cannot resolve, ownership cannot be proven, or content is quarantined, the primary screen should show the concise reason plus a button/link to expand the relevant repair group.
- Avoid dense protocol vocabulary in the default view. Show ActivityPub/Bridgy/ATProto labels only where they affect trust, source identity, or user choice.
- Keep admin/operator-only controls out of ordinary user flows unless the current user has the needed permission.

Verification:

- geesome-ui e2e/screenshot coverage for the default collapsed state and expanded advanced groups on desktop and mobile.
- Check that main actions remain visible without horizontal overflow, nested card clutter, or long labels overflowing buttons.
- Keep existing backend route contracts unchanged unless simplification exposes a missing focused endpoint.
<!-- /todo-section -->

<!-- todo-section: activitypub-bluesky-cross-post-policy-ui -->
#### ActivityPub/Bluesky: Cross-Post Policy UI

Goal: expose publish-time Bluesky cross-post policy controls in the frontend so users can choose image upload/link/reject behavior, upload-failure fallback, attachment/link-preview card/link/reject/ignore behavior, and reply/quote omission choices without weakening backend safety gates.

Current state:

- Backend `mediaPolicy` / `relationPolicy` options exist for cross-post create/update paths.
- geesome-ui already has account connect/verify, cross-post/update/delete, and reply/quote guidance.
- Status: complete. geesome-ui exposes publish-time cross-post policy controls and e2e/screenshot coverage; this node branch consumes that UI commit.

Implementation context:

- Keep cross-posting credential-scoped and idempotent by DID.
- Do not silently drop images, attachments, link previews, replies, or quotes; the UI should make fallback/reject/omit choices explicit.
- Keep unsupported, private, encrypted, remote, unpublished, non-public, missing-public-URL, and missing-relation-identity cases rejected or clearly explained.

Verification:

- geesome-ui e2e/screenshot coverage for cross-post controls on desktop and mobile.
- geesome-node consumes the merged UI pointer and runs frontend-dist publication smoke after dependency install.
<!-- /todo-section -->

<!-- todo-section: activitypub-bluesky-migration-policy-reconciliation-ui -->
#### ActivityPub/Bluesky: Migration Policy And Reconciliation UI

Goal: add richer social-migration import controls in the frontend for Bluesky and ActivityPub media/relation policy choices, then add an explicit post-import relation-reconciliation action/status loop so users can see what was linked, skipped, ambiguous, or blocked.

Current state:

- Bluesky and ActivityPub migration/import routes accept bounded media/relation policy options.
- The social migration wizard covers preview/import, async import, one-off moderation mode/rules, and desktop/mobile e2e.
- Backend dry-run/apply reconciliation routes exist for native Bluesky imported posts and ActivityPub-created visible remote posts.
- Status: complete. geesome-ui exposes migration media/relation policy controls, reconciliation source/cross-group/force/cursor inputs, and linked/missing/ambiguous/permission/already-linked status rows; this node branch consumes that UI commit.

Implementation context:

- Preserve moderation/review filters, canonical rich text, source identity, update/delete/idempotency, and bounded-page async job rules.
- Reconciliation should show counts and reasons for linked, skipped, ambiguous, missing, permission-blocked, or already-linked relations.
- Keep third-party replies, reposts, quotes, or group content represented as remote context/placeholders, not rewritten as local-authored content by the migrating user.

Verification:

- geesome-ui e2e/screenshot coverage for migration policy controls and reconciliation status.
- geesome-node consumes the merged UI pointer and runs frontend-dist publication smoke after dependency install.
<!-- /todo-section -->

<!-- todo-section: activitypub-signed-ownership-challenge -->
#### ActivityPub: Signed Ownership Challenge

Goal: harden ActivityPub claimed-profile migration with a stronger signed ownership challenge while keeping the existing admin-approved and public profile-token trust paths.

Current state:

- ActivityPub claimed visible imports can use admin-approved claims or a matching public profile `ownershipProofToken`.
- ActivityPub claimed visible imports can also use a short-lived actor-signed `ownershipChallengeProof`.
- Status: complete. GeeSome can create an ownership challenge, verify actor HTTP signatures against the resolved ActivityPub actor key, report signed proof in preview without consuming it, consume the challenge during visible import, reject expired/replayed/body-mismatched proofs, and preserve cache-only unverified imports as review-only remote objects.

Implementation context:

- The challenge should prove control of the ActivityPub actor or actor signing key without requiring GeeSome to trust arbitrary profile text forever.
- Keep admin-approved claims available as an explicit trust-policy override.
- Do not create visible GeeSome posts from an unproven claim.

Verification:

- Unit/API tests cover challenge creation, verification, preview reporting, visible-import consumption, expiration/replay behavior, and failed ownership claims.
- ActivityPub migration tests prove unverified claims remain cached/review-only unless admin/profile-token/signed-challenge policy allows visible creation.
<!-- /todo-section -->

<!-- todo-section: activitypub-ownership-challenge-operability -->
#### ActivityPub: Ownership Challenge Operability

Goal: turn the signed challenge foundation into a safe operator/user-facing flow across real ActivityPub servers without hiding trust-policy tradeoffs.

Current state:

- Backend APIs create short-lived challenge records and verify detached actor-signed HTTP request proofs over canonical `bodyJson` plus the challenge `verificationUrl`.
- Preview can report a valid signed proof without consuming it; visible import consumes the challenge atomically so the same proof cannot create posts twice.
- Status: backend operability complete for the detached-proof path. Challenge creation/verification carries request-IP context, applies configurable in-memory abuse limits by user/actor/token/IP, rejects expired/replayed/body-mismatched proofs, and runs bounded cleanup for expired/consumed challenge rows at module startup plus through the ActivityPub cron service.
- GeeSome intentionally does not expose a public callback route that receives a remote actor's challenge `POST` directly yet; current verification is an API-submitted proof object. Add a public proof receiver only if live interop shows compatible ActivityPub tools need it and can make the trust boundary clearer.
- Real hosted ActivityPub servers may not give normal users a way to sign arbitrary detached HTTP requests, so the UI and operator docs must keep admin-approved and public profile-token fallbacks visible instead of presenting signed challenge as universally available.

Implementation context:

- Keep the product flow detached-proof-only for advanced/operator tooling until live interop proves a public proof receiver is useful. Document the request method, URL, headers, digest/body, and key-ownership expectations.
- Keep cleanup/rate-limit knobs conservative and operator-configurable: challenge cleanup interval/limit/retention plus create/verify limit/window.
- Add UI/operator guidance that explains the three accepted ownership paths: admin-approved trust, public profile token, and actor-signed challenge. The UI should explain why a hosted ActivityPub account may need profile-token or admin review when it cannot produce a signed proof.
- Feed live interop results back into the verifier requirements, especially if real servers or tools prefer newer HTTP Message Signatures over legacy ActivityPub HTTP Signatures.

Verification:

- Focused tests cover cleanup/retention, cron no-overlap behavior, and create/verify abuse-limit behavior.
- Operator-run smoke can create a challenge, produce or intentionally skip a real signed proof, and report whether the selected remote/tool supports the signed-challenge path.
- Existing deterministic migration tests remain the default reliable gate for signed proof replay, actor mismatch, body mismatch, and visible-import consumption.
<!-- /todo-section -->

<!-- todo-section: activitypub-bluesky-live-interop-smoke -->
#### ActivityPub/Bluesky: Live Interop Smoke

Goal: expand operator-run interop coverage beyond deterministic/local checks: Fedify CLI or ActivityPub.Academy style checks, broader remote-server exchange, and credentialed native Bluesky smoke for seeded `socNetAccount` reads/writes where credentials are required.

Current state:

- Deterministic ActivityPub interop smoke exists.
- Optional live Fediverse actor smoke exists.
- Optional Bluesky-through-Bridgy smoke exists.
- Native public ATProto read smoke exists.
- Native credentialed Bluesky account/write lifecycle smoke exists and skips without credentials.
- Signed ActivityPub ownership challenges have deterministic coverage, and an operator smoke can create the exact challenge, print signing instructions, or verify a supplied/local signed proof.
- The deterministic and live smoke scripts print secret-free JSON reports and can persist the same payload with a script-specific `*_SMOKE_REPORT_PATH` env var or the shared `GEESOME_SMOKE_REPORT_PATH` env var.
- Public live evidence recorded on 2026-07-13 covers Mastodon WebFinger/public Note import, Bridgy Fed discovery/import, native Bluesky public XRPC projections, and independent Fedify CLI parsing of the Mastodon actor. The exact commands, capabilities, warnings, and release gates are in the module's [live interoperability runbook](../app/modules/activityPub/docs/live-interoperability.md).
- Credentialed Bluesky write lifecycle and full public staging-node inbox/outbox exchange remain operator release gates. They require disposable credentials, a publicly reachable GeeSome node, and an external signer/actor; unavailable prerequisites must be reported as skips rather than passes.

Implementation context:

- Keep live checks operator-run and skip clearly when remote accounts, bridges, or credentials are unavailable.
- Do not commit secrets or require production credentials in CI.
- Credentialed Bluesky smoke should validate ownership, credential handling, idempotency, source identity, moderation/signature boundaries, and native ATProto storage semantics. Status: `npm run bluesky:credentialed-smoke` verifies login/stored `socNetAccount` lookup, public source preview, local public-feed import through the `socNetImport` pipeline, source subscription refresh with the verified account ID bound, and best-effort imported-post sync through live `com.atproto.repo.getRecord`; it still requires `BLUESKY_CREDENTIAL_SMOKE_WRITE=1` before creating remote records, and then checks create/idempotency/update/delete plus optional image-upload-failure link fallback.
- ActivityPub live smoke should cover both ordinary federation behavior and the ownership-challenge proof path when a compatible remote/tool can sign the exact challenge request; otherwise it should skip with a clear reason. Status: `npm run activitypub:ownership-challenge-smoke` skips without actor configuration, prints proof requirements when an actor has no supplied signer, verifies deterministic local harness signatures with `ACTIVITYPUB_OWNERSHIP_CHALLENGE_SMOKE_LOCAL_SIGNER=1`, and can run an operator-provided signing command through `ACTIVITYPUB_OWNERSHIP_CHALLENGE_SMOKE_SIGN_COMMAND`.
- Fedify CLI now independently confirms remote actor parsing. Use its ephemeral inbox, ActivityPub.Academy, or a disposable Mastodon-compatible actor against a public staging GeeSome node to check GeeSome discovery, actor/outbox/object payloads, inbox/shared-inbox signatures, follow accept/delivery, create/update/delete/tombstone behavior, and conformance diagnostics without becoming a default CI dependency.

Verification:

- New smoke command(s) with documented env vars and clear skip/failure output. Status: `npm run bluesky:credentialed-smoke` documents required credential/write/media-fallback/source-import/source-sync env vars in `--help` and prints secret-free JSON reports.
- Credentialed Bluesky smoke should cover account verification, import/source refresh, cross-post create/update/delete, media fallback policy, idempotency, and source identity without exposing secrets. Status: account verification, public source preview, local source import, source subscription refresh, best-effort source sync, cross-post lifecycle, idempotency, and optional media fallback policy are covered.
- ActivityPub live smoke should record the remote/tool capabilities it tested, including whether signed ownership proof was supported or skipped. Status: ownership-challenge smoke reports actor discovery, public-key capability, challenge body/URL, proof source, and verified key id, and smoke reports can be written to per-run JSON artifacts. Public remote reads and Fedify parsing have recorded evidence; public staging-node delivery and an external signed ownership proof remain operator release gates.
- Existing deterministic tests remain the default reliable gate.
<!-- /todo-section -->

<!-- todo-section: canonical-rich-text-native-storage -->
#### Canonical Rich Text: Native Storage And Editor Wiring

Goal: move from helper-level canonical rich-text adapters toward native post storage, editor integration, and direct protocol wiring so remote/social content does not become trusted editable raw HTML.

Current state:

- The design note and helpers cover canonical validation, unsafe HTML import, sanitized HTML rendering, ActivityPub/Matrix HTML output, ATProto facets, Farcaster casts, Nostr-like tags, stored canonical rich-text post-content projection as plain body text plus validated JSON, backend create/update post input for native canonical rich-text bodies, static-site rendering from canonical rich text through the safe HTML renderer, geesome-ui post-card rendering, and geesome-ui native composer writes through `contentRichText`.
- Status: complete for the v1 canonical storage/editor slice. Future protocol modules should add typed rich-text adapters instead of accepting raw HTML as editable source.

Implementation context:

- Store canonical rich text as the trusted editable source; keep sanitized HTML as adapter/cache output.
- Do not widen the HTML allowlist to support editor features; add typed nodes/marks with migrations/rendering policy.
- Make inbound remote HTML sanitize and normalize into canonical rich text before visible/editable native use.

Verification:

- Rich-text helper tests plus focused group/post/editor tests cover the v1 storage/write shape.
- Rendering tests cover Vue frontend, generated static sites, ActivityPub, and Bluesky adapter paths when wiring changes.
<!-- /todo-section -->

Native Bluesky/ATProto phase:

- Add a dedicated Bluesky/ATProto module or socNet import driver, not ActivityPub-specific code, because Bluesky uses AT Protocol records and XRPC APIs rather than signed ActivityPub inbox activities. Status: native helpers, read-only module/API, a reusable `BlueskyImportClient`, a first async import route, model-backed source subscription CRUD, read-only imported source-feed API, manual refresh, queued refresh processing, due-subscription polling, and opt-in worker/poller config live under `app/modules/bluesky`; refreshes import one public feed page through the social-import pipeline and update subscription cursor/channel/error metadata.
- Import public account feeds with unauthenticated ATProto/XRPC reads when possible, starting with the official `bsky.app` account smoke and a configurable public handle. Status: `npm run bluesky:atproto-smoke` fetches public author feeds from `https://public.api.bsky.app`, and `POST /v1/admin/bluesky/public-author-feed/preview` exposes the same projection through the app using server-side `BLUESKY_PUBLIC_API_ORIGIN` / `BLUESKY_PUBLIC_API_TIMEOUT_MS` config. The projection maps `app.bsky.feed.post` text, facets, links, mentions, tags, images, external embeds, and replies into GeeSome canonical rich-text/source-identity metadata. `POST /v1/admin/bluesky/sources/:sourceId/sync` verifies stored imported post AT URIs through `com.atproto.repo.getRecord`, updates records with changed CIDs, and soft-deletes only records confirmed missing.
- Support credentialed ownership and optional cross-posting through seeded `socNetAccount` rows with non-production app password/OAuth credentials in tests. Status: `POST /v1/soc-net/bluesky/login` and `POST /v1/soc-net/bluesky/verify-account` authenticate through ATProto session/profile checks, store or update user-scoped `socNetAccount` rows, tolerate handle changes after DID ownership is known, avoid returning secrets, and prevent new provider rows from replacing unrelated same-user social accounts. `POST /v1/soc-net/bluesky/posts/:postId/cross-post` now converts canonical rich text via `richTextToAtProtoTextWithFacets`, uploads supported images through `com.atproto.repo.uploadBlob`, creates a native ATProto record for safe text/image local posts, falls back to public image URL link facets/external cards when blob upload fails and `BLUESKY_PUBLIC_URL`, `ACTIVITYPUB_PUBLIC_URL`, or `DOMAIN` is configured, adds storage-backed non-image media/attachments and safe JSON link-preview records as explicit public link facets/cards, preserves local `replyToId` and `repostOfId` as native Bluesky reply/quote metadata only when relation targets have stored/imported Bluesky URI/CID identity, accepts explicit `mediaPolicy` controls for image upload/link/reject, upload-failure fallback/reject, attachment card/link/reject/ignore, and link-preview card/link/reject/ignore, accepts explicit `relationPolicy` controls to require or omit reply/quote metadata, preserves per-DID URI/CID metadata for idempotency, and rejects unsafe link-preview URLs plus unsupported remote/encrypted/unpublished/non-public/missing-public-URL/missing-relation-identity cases instead of silently dropping context. `POST /v1/soc-net/bluesky/posts/:postId/update-cross-post` updates only an existing stored cross-post URI for the authenticated DID/feed-post collection, reuses the stored rkey, sends the stored CID as `swapRecord`, preserves original local `postedAt`, and stores the new CID/`updatedAt`. `POST /v1/soc-net/bluesky/posts/:postId/delete-cross-post` deletes only a stored cross-post URI for the authenticated DID/feed-post collection, treats already-missing remote records as cleanup, and removes only that DID's metadata. Frontend cross-post, source-default import, and social-migration import/reconciliation policy screens are now covered by geesome-ui e2e/screenshot flows.
- Reuse the same moderation, review/import, source identity, group/post creation, tombstone/update, and retry boundaries used by ActivityPub remote-object import and other social import drivers. Status: a shared `remoteContentModeration` helper now normalizes `autoImport`/`reviewFirst` decisions and bounded keyword/regex/source/group-name rules; native Bluesky source refresh and sync apply it before creating or keeping visible posts; source refresh persists skipped records with projected ATProto content, moderation decision, and review/import state, admin APIs can list, reject/reset, and import pending/quarantined records; public feed import, source refresh, source-review import, and claimed migration import accept request-level relation/media policy controls to preserve, omit/ignore, or reject replies, quotes, repost feed items, images, link previews, and unsupported embed metadata before visible posts are written; native Bluesky source subscriptions persist default relation/media import policies that refreshes and review imports inherit unless a one-off request override is provided; the Bluesky Sources UI exposes review history, source-default import policy controls, and import/reject/reset actions; and the social migration wizard exposes one-off auto-import/review-first plus keyword/regex text/group-name filters, import media/relation policy controls, and relation-reconciliation status/action controls.
- Add a simple remote social-page migration flow for users moving from Bluesky or ActivityPub to GeeSome. The flow should let a user choose a Bluesky DID/handle or ActivityPub actor URL/handle, preview bounded public profile/outbox/feed content, verify ownership when claiming it as their own page, and start a resumable async import into a personal GeeSome group. User-authored posts become local posts with stable source identity; replies, reposts/reblogs, quotes, and mentions keep relation metadata; referenced remote actors/groups become placeholders keyed by ActivityPub actor/object IDs or ATProto DID/AT URI/CID so later GeeSome migrations can reconcile partial thread/history content instead of duplicating it. Status: native Bluesky projection now preserves repost/quote metadata, a deterministic migration-preview helper classifies local posts versus remote context plus ATProto actor/post placeholders, a user read-only migration preview API exposes the bounded preview, placeholders include deterministic ATProto source-identity metadata, and `POST /v1/soc-net/bluesky/migration/import` starts the existing bounded `socNetImport` async operation after stored-account DID/handle proof or stores the same claimed import in the persistent async-operation queue when `async=true`, without plaintext credential overrides, with bounded cursor pagination through `maxPages`, optional write-time moderation that skips non-allow decisions, and request-level relation/media policy that can preserve, omit/ignore, or reject replies, quotes, repost feed items, images, link previews, and unsupported embed metadata before visible GeeSome posts are created. `POST /v1/soc-net/bluesky/migration/reconcile-relations` now provides a bounded dry-run/apply pass for already-imported native Bluesky posts in one group selected by `groupId` or `groupName`, resolving stored `reply.parentUri`/`reply.rootUri` and `quote.uri` metadata to local `replyToId`/`repostOfId` only when the target imported post has matching Bluesky source identity; same-group targets win, cross-group targets must be unambiguous, and reply permissions are checked before writing through `group.updatePost`. ActivityPub now has the equivalent user read-only preview API for public actor `featured`/`outbox` `Create`, direct object, `Announce`, reply, quote, and mention records, with sanitized previews, ownership-report boundaries, ActivityPub actor/object placeholder keys plus source-identity metadata, and bounded `maxPages` collection-page walking; `POST /v1/soc-net/activity-pub/migration/import` caches eligible own-authored public records as remote-object candidates by default and, when `createPosts=true`, requires admin-approved ownership, a matching public profile `ownershipProofToken`, or a short-lived actor-signed `ownershipChallengeProof`, target group, accepted review state, moderation policy checks, and idempotent source identity before creating visible GeeSome remote posts immediately or through the async-operation queue when `async=true`. The signed-challenge path now keeps the detached proof backend bounded with request-IP-aware create/verify abuse limits and cleanup for expired/consumed challenges. `POST /v1/soc-net/activity-pub/migration/reconcile-relations` now adds the matching bounded dry-run/apply pass for already-created visible ActivityPub migration posts, resolving cached ActivityStreams `inReplyTo` and quote references to local `replyToId`/`repostOfId` only when target ActivityPub object identity maps to one published local post, with same-group preference, unambiguous cross-group fallback, and reply permission checks. The geesome-ui social migration wizard now covers preview/import, async import, one-off moderation mode/rules, media/relation import policy controls, relation-reconciliation source/cross-group/force/cursor controls, linked/missing/ambiguous/permission/already-linked status rows, and desktop/mobile e2e. Remaining: deeper live interop and external signed ownership-proof compatibility result runs. This must reuse moderation/review filters, canonical rich text, source identity, update/delete/idempotency, and bounded-page job rules.
- Maintain and expand the native Bluesky frontend/feed path, reusing the ActivityPub Sources UX patterns where they fit while showing ATProto account/credential and bridge-free states honestly. The current frontend source/account/cross-post/review, policy, and reconciliation surfaces exist; further UI work should be driven by live operator feedback from real interop runs.

Research note: [activitypub-research.md](../app/modules/activityPub/docs/activitypub-research.md).

Rich-text content-format design note: [rich-text-content-format.md](./rich-text-content-format.md).

ActivityPub and Bluesky user-flow note: [activitypub-user-flows.md](../app/modules/activityPub/docs/activitypub-user-flows.md). Keep it aligned when adding source-reader, moderation, native Bluesky, credential, or cross-post flows. Current intended moderation direction: admin-configurable review-first or auto-import mode, with keyword/regex/source/group-name filters that can block or quarantine remote content before it becomes a GeeSome post.

Remaining ActivityPub/Bluesky integration plan:

1. Simplify the user-facing ActivityPub/Bluesky UI before calling the phase complete. Default screens should show source subscribe/read, account connect/verify, cross-post, migration preview/start, and visible status/errors first.
2. Keep flexible controls available through task-named expandable groups: advanced import policy, moderation filters, migration ownership proof, reply/quote repair, source refresh settings, and operator diagnostics.
3. Run and record live interop evidence against real Fediverse/Bridgy/native ATProto targets, including skipped capabilities, credentialed Bluesky checks when credentials are available, and ActivityPub ownership proof compatibility where a signer/tool exists.
4. Feed live interop findings back into docs or focused follow-up issues only when they reveal product or protocol gaps. Fedify/ActivityPub.Academy work should stay a targeted conformance spike, not a broad rewrite by default.

Content format direction:

- Do not make raw HTML the canonical user-content format. ActivityStreams/ActivityPub and Matrix need sanitized HTML adapter output, but newer decentralized social protocols such as Bluesky/ATProto, Farcaster, and Nostr-style text notes prefer plain text plus structured facets, mentions, tags, embeds, or protocol tags.
- Add a versioned GeeSome rich-text document format as the source of truth before broad remote social content becomes editable/visible as native posts. The first schema should stay deliberately small: paragraph, line break, blockquote, code block, list/list item, text nodes, attachments by `storageId`, and marks such as strong, emphasis, code, link, mention, hashtag, spoiler, and strike.
- Store sanitized HTML only as derived output/cache for ActivityPub, Matrix, static sites, admin previews, or legacy clients. Inbound remote HTML should be sanitized and normalized into the canonical rich-text model; keeping the original remote object for audit/debug is fine, but it must not be rendered directly.
- Protocol adapters should render from the canonical model: ActivityPub/Matrix get conservative sanitized HTML plus plain-text fallbacks where required; Bluesky/ATProto gets text plus facets; Farcaster gets text plus mention positions/embeds; Nostr-like exports get plaintext plus tags.
- Keep arbitrary `style`, `class`, `iframe`, `script`, form controls, active content, and raw-HTML nodes out of the first canonical schema. New rich features should be added as explicit typed nodes/marks with migration/rendering policy, not by widening the HTML allowlist.

Scope:

- Map GeeSome identities/groups to ActivityPub actors. Group actor URL helpers now use `/ap/groups/{groupName}` and require GeeSome-valid group names so WebFinger `acct:` handles stay valid.
- Expose WebFinger and NodeInfo discovery for local actors/nodes. The dedicated ActivityPub module now serves public `/.well-known/webfinger`, `/.well-known/nodeinfo`, and `/nodeinfo/2.1` endpoints for federatable local group actors and node metadata.
- Add actor, outbox, inbox, followers, and following endpoints. Read-only actor, outbox, followers, following, and post-object routes are exposed; following lists accepted outbound follows after a signed remote `Accept` is recorded.
- Represent published group posts as ActivityPub `Create` activities with `Note`/attachment objects and stable GeeSome/IPFS links. Read-only serializers now cover Note/Create and outbox collection payloads, and public route wiring dereferences actor, outbox, and Note object URLs.
- Verify HTTP signatures for inbound activities and sign outbound activities. Raw JSON request bytes are now available to route callbacks for digest/signature checks; outbound RSA-SHA256 signing helpers, stable local actor keys, and inbound signature/signed `Digest` or `Content-Digest`/Date verification exist. Actual inbox activity acceptance still waits for remote actor cache/follow state.
- Store inbound/outbound follow state and minimal remote actor metadata. Remote actor key/inbox metadata is now cached for signature verification and outbound follow requests, signed inbound `Follow` activities are persisted idempotently for group inboxes, signed embedded `Undo(Follow)` cancels stored inbound follows, accepted follows enqueue outbound `Accept(Follow)` delivery rows, admin-triggered outbound follows enqueue signed `Follow` delivery rows, signed remote `Accept`/`Reject` responses update outbound follow state, published local posts enqueue outbound `Create(Note)` delivery rows, and the opt-in delivery worker can claim/sign/send/retry queued rows.
- Add user-facing source subscription/feed support. Status: geesome-ui now has the ActivityPub Sources reader, and backend source APIs resolve ActivityPub actors/handles, store subscription state independently from review/import decisions, manually or asynchronously refresh public `featured`/`outbox` source objects into the cache, enqueue stale active subscriptions through an opt-in poller, optionally queue federation-level source follows from explicit local group actors, and return sanitized feed items suitable for the reader with optional `(publishedAt, id)` cursor pages. Acceptance state uses the existing signed remote `Accept(Follow)` handling for group actors.
- Before cached remote ActivityPub objects become visible posts, audit how posts render in webviews/static sites because post text is HTML. Status: generated static-site post text, post-list title/description HTML, content-list text, header/footer HTML, title/meta headers, and backend admin remote-object preview fields now have a conservative sanitizer/escaping layer with XSS fixtures. Backend admin remote-object previews also expose a canonical rich-text projection of sanitized ActivityStreams `content`, bounded sanitized remote attachment/media metadata including media category, alt text, dimensions, duration, blurhash, sensitive flag, and embed policy, accepted-review-gated post-draft readiness, local reply target mapping, manual native-post creation from accepted public Notes with opt-in supported HTTP(S), IPFS, and IPNS media/document attachment backup, review-only caching for non-Note ActivityStreams objects, signed remote update sync for linked imported Note posts, signed remote tombstone cleanup for linked imported posts, persistent review-state decisions, and review-state filtering for review/import follow-ups. The next moderation-policy slice should let admins choose review-first or auto-import for user-requested/trusted remote sources and configure keyword/regex/source/group-name filters that block or quarantine content before post creation. The geesome-ui admin review screen renders escaped preview text and exposes review/create actions; link-preview UI policy, moderation-policy UI, auto-import UI, and other visible surfaces still need review.
- Add native Bluesky/ATProto import/cross-posting after the ActivityPub MVP hardening path. Keep it in a dedicated Bluesky/ATProto module or socNet import driver, use canonical rich text and `socNetAccount` credentials, and verify public-account import plus optional credentialed posting without bypassing review/moderation gates.
- Add a user-facing migration path from Bluesky or ActivityPub personal pages into GeeSome personal groups. Preserve remote relation context for reposts/reblogs, replies, quotes, mentions, and referenced external groups/accounts, and reconcile remote placeholders when those groups/accounts migrate later.
- Before remote/social-network content can become native editable GeeSome posts, design and implement the canonical rich-text schema plus import/export adapters described above. Until then, sanitized HTML should remain display-only adapter output rather than a trusted source format for post edits, migrations, search snippets, or cross-network publishing.
- Keep configurable moderation policy, deletes/updates, rich media federation, and full timeline syncing for later slices.
- Decide whether to adopt Fedify or keep the custom module. The repo now targets Node 22 and the current custom MVP already owns routing, key storage, delivery queues, review records, and object storage, so a future Fedify spike should focus on replacing brittle protocol boilerplate or adding interop/test tooling rather than a broad dependency swap inside the current review path.

Likely modules:

- New `app/modules/activityPub` module.
- `app/modules/group` for local group/post mapping.
- `app/modules/content` for attachment URLs and media metadata.
- `app/modules/api` for unversioned POST/raw body support.
- ActivityPub-specific Sequelize models for actor, remote actor, follow, flag, object, object review, and delivery records. Model-sync `ActivityPubActor` stores local group actor URLs and encrypted signing keys, `ActivityPubRemoteActor` stores fetched remote actor URL/key/inbox metadata, `ActivityPubFollow` stores inbound follow/cancel state, pending outbound follow requests, and signed remote outbound follow responses, `ActivityPubFlag` stores pending moderation reports from signed `Flag` activities and backs admin listing with target context plus state updates, `ActivityPubObject` stores local public post Note/Create IDs from outbox/post-object/publish-hook serialization plus signed remote `Create` replies and mentions to known local group actors for supported review object types, AdminRead remote-object review with sanitized preview fields and bounded remote attachment/media metadata, accepted-review-gated post-draft readiness, resolved local reply targets, review-state filtering, manual native-post creation from accepted public Notes only, linked imported-post updates from signed remote Note updates, and linked imported-post soft-deletes from signed remote tombstones, `ActivityPubObjectReview` stores pending/accepted/rejected review decisions that remote object updates/tombstones reset to pending, and `ActivityPubDelivery` stores queued outbound `Follow`, follow `Accept`, and post `Create(Note)` payloads plus retry/delivery/claim state.

Do not reuse `remoteGroup` as the ActivityPub remote actor store; it is GeeSome/IPFS-manifest oriented, while ActivityPub uses HTTPS actor IDs and signed HTTP.

First deliverable:

- Decide actor type and URL shape for GeeSome groups.
- Keep the custom ActivityPub module for the MVP; treat future Fedify work as a focused protocol-tooling or boilerplate-replacement spike.
- Design the ActivityPub data model and endpoint contract.
- Implement read-only actor/outbox/WebFinger for one local group.
- Add tests with deterministic JSON-LD payloads and signature fixtures.
- Reuse the shared deterministic ActivityPub helper contract from `geesome-libs` [#121](https://github.com/galtproject/geesome-libs/issues/121) for actor, WebFinger, Note/Create, digest, and request-signature fixtures.
- Before remote object moderation can create visible posts, add HTML render-path tests that prove untrusted ActivityPub/local post HTML is sanitized or escaped consistently in API/webview/static-site/admin preview surfaces. Static-site generated output and backend admin remote-object preview output now have focused helper/render tests; backend remote-object previews also expose canonical rich-text converted from sanitized ActivityStreams `content`, bounded sanitized remote attachment/media metadata with embed policy, accepted-review-gated post-draft readiness metadata, resolved local reply targets, pending/accepted/rejected review decisions, review-state filtering, review-only non-Note object caching, manual native-post creation from accepted public Notes with opt-in supported HTTP(S), IPFS, and IPNS media/document attachment backup, signed remote update sync for linked imported Note posts, signed remote tombstone cleanup for linked imported posts, and a geesome-ui admin review screen that renders escaped previews and exposes review/create controls. Remaining moderation tests should cover review-first versus auto-import behavior, blocked/quarantined filter matches, safe bounded regex handling, and source/group-name filtering. Link-preview UI policy remains.
- Add a rich-text content-format design note with schema versioning, IPLD/DAG-CBOR storage shape, allowed blocks/marks, attachment references, migrations, sanitization boundaries, and ActivityPub/Matrix/ATProto/Farcaster/Nostr export adapters before implementing native remote-post ingestion or cross-network publishing. Status: documented in [rich-text-content-format.md](./rich-text-content-format.md); helper implementation now covers canonical validation, unsafe HTML import, sanitized HTML rendering, ActivityPub local-post rendering with mention/hashtag tags, Matrix `m.text` body/formatted_body export, ATProto-compatible UTF-8 byte-indexed text facets, Farcaster CastAdd-style text/embeds/FID mention positions, Nostr-like text-note tags, native post storage/write input, static-site rendering, geesome-ui post rendering, and geesome-ui composer publishing. Future protocol additions should use typed adapters instead of raw HTML source.

Verification:

- New module tests for actor serialization, WebFinger, and outbox payloads.
- Local deterministic smoke with `npm run activitypub:interop-smoke` for WebFinger, NodeInfo, actor, Note/Create, outbox, content-type, rich-text/tag, and attachment payloads.
- Existing `test/group.test.ts` for post compatibility.
- Rich-text adapter tests that import unsafe ActivityPub/Matrix-style HTML into the canonical model, render sanitized ActivityPub/Matrix HTML, and export deterministic plain text plus facets/tags for ATProto/Farcaster/Nostr-style protocols. Status: unsafe HTML import, sanitized HTML rendering, ActivityPub local-post rendering with mention/hashtag tags, Matrix body/formatted-body export, ATProto-compatible link/DID-mention/tag facet export with UTF-8 byte offsets, Farcaster CastAdd-style text/embed/FID mention export with byte offsets, and Nostr-like `r`/`p`/`t` tag export are covered.
- Live remote-server smoke with `npm run activitypub:remote-server-smoke`; it covers configurable WebFinger/direct actor discovery, public featured/outbox Note fetch, and local signed shared-inbox storage/review/post-create behavior with clear skips when the actor has no public Note.
- Live Bluesky bridge smoke with the protocol boundary explicit: `npm run activitypub:bluesky-bridge-smoke` covers public Bridgy Fed discovery/conversion for a configurable account such as `bsky.app` and verifies that fixture-equivalent received updates store expected local group/post state without bypassing review gates. Native Bluesky/ATProto import or cross-post testing belongs to the planned bridge-free phase and should use a dedicated Bluesky module/socNet import path with a seeded test `socNetAccount` database row when credentials are required, verifying ownership, credential handling, idempotency, source identity, moderation/signature boundaries, and native ATProto storage semantics.
- Native Bluesky/ATProto smoke and tests: status: public unauthenticated XRPC smoke for a configurable account exists as `npm run bluesky:atproto-smoke`, optional credentialed native smoke exists as `npm run bluesky:credentialed-smoke` with secret-free skip reports, optional report-path artifacts, account verification/source preview, local source import and source-subscription refresh coverage, best-effort imported-post sync coverage, explicit write opt-in, create/idempotency/update/delete, and optional media-fallback coverage, unit tests cover native ATProto feed URL/fetch injection plus `app.bsky.feed.post` facet/embed/reply projection into canonical rich text and source identity, module/API tests cover the read-only admin preview route, one-page async import route, request-level import relation/media policy controls, ActivityPub actor-signed migration ownership challenge creation/verification/consumption plus cleanup/rate-limit operability, read-only imported source-feed route, bounded imported-post sync route, cached source-review listing/state/import routes, source-subscription tests cover model-backed subscribe/list/update/remove state including moderation mode/rules plus persisted import policy defaults, refresh tests cover direct import, stored/request import policy controls, moderation blocking/review-first caching, queued processing, and due polling, sync tests cover changed-CID re-import plus record-not-found soft deletion, review/import tests cover rejecting and importing cached records plus stored source import policy defaults, account tests cover credentialed Bluesky login/verification plus encrypted credential override boundaries, and cross-post tests cover text/facet record creation, supported-image upload/embed creation, public image-link fallback after upload failure, storage-backed non-image attachment link/card publishing, safe JSON link-preview external-card publishing, native reply/quote publishing from stored/imported Bluesky URI/CID relation targets, missing relation identity rejection, unsafe link-preview rejection, missing-public-URL attachment rejection, per-account idempotency, stored cross-post in-place update, stored cross-post delete cleanup, unsupported attachment rejection, remote-post rejection, and user route registration. geesome-ui e2e coverage now includes native source feed, source import policy controls, account connect/verify, cross-post/update/delete, publish-time cross-post policy controls, migration/import media/relation policy controls, relation-reconciliation status/action UI, reply/quote guidance, source-review history/import/reject flows, post-card canonical rendering, and native rich-text composer publishing. Remaining: deeper Fedify/ActivityPub.Academy conformance, external signed ownership-proof compatibility runs, and broader remote-server exchange.
- geesome-ui ActivityPub Sources e2e with mocked `$geesome` APIs: status implemented for the source section, `@bsky.app via Bridgy Fed` preset subscription, feed rendering with safe rich text, links, attachment `embedPolicy`, unread/error states, and mobile/desktop screenshot sidecars for no broken images or horizontal overflow. Keep this coverage aligned when backend refresh/polling states evolve.

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
