# Module Docs

This is the root index for module-owned docs. Keep each entry short here: what the
module is for, and where its docs live when it has them. Detailed plans, flows,
and implementation notes belong under `app/modules/<module>/docs/`.

## Documented Modules

- `accountStorage`: [overview](../app/modules/accountStorage/docs/overview.md)
- `activityPub`: [overview](../app/modules/activityPub/docs/overview.md), [research](../app/modules/activityPub/docs/activitypub-research.md), [flows](../app/modules/activityPub/docs/activitypub-user-flows.md)
- `api`: [overview](../app/modules/api/docs/overview.md)
- `asyncOperation`: [overview](../app/modules/asyncOperation/docs/overview.md)
- `autoActions`: [overview](../app/modules/autoActions/docs/overview.md)
- `bluesky`: [overview](../app/modules/bluesky/docs/overview.md)
- `communicator`: [overview](../app/modules/communicator/docs/overview.md)
- `content`: [overview](../app/modules/content/docs/overview.md)
- `database`: [overview](../app/modules/database/docs/overview.md)
- `drivers`: [overview](../app/modules/drivers/docs/overview.md)
- `entityJsonManifest`: [overview](../app/modules/entityJsonManifest/docs/overview.md)
- `ethereumAuthorization`: [overview](../app/modules/ethereumAuthorization/docs/overview.md)
- `fileCatalog`: [overview](../app/modules/fileCatalog/docs/overview.md)
- `foreignAccounts`: [overview](../app/modules/foreignAccounts/docs/overview.md)
- `gateway`: [overview](../app/modules/gateway/docs/overview.md)
- `group`: [overview](../app/modules/group/docs/overview.md)
- `groupCategory`: [overview](../app/modules/groupCategory/docs/overview.md)
- `invite`: [overview](../app/modules/invite/docs/overview.md)
- `pin`: [overview](../app/modules/pin/docs/overview.md)
- `remoteGroup`: [overview](../app/modules/remoteGroup/docs/overview.md)
- `rss`: [overview](../app/modules/rss/docs/overview.md)
- `socNetAccount`: [overview](../app/modules/socNetAccount/docs/overview.md)
- `socNetImport`: [overview](../app/modules/socNetImport/docs/overview.md)
- `staticId`: [overview](../app/modules/staticId/docs/overview.md)
- `staticSiteGenerator`: [overview](../app/modules/staticSiteGenerator/docs/overview.md)
- `storage`: [overview](../app/modules/storage/docs/overview.md)
- `storageSpace`: [overview](../app/modules/storageSpace/docs/overview.md)
- `telegramClient`: [overview](../app/modules/telegramClient/docs/overview.md)
- `tgContentBot`: [overview](../app/modules/tgContentBot/docs/overview.md)
- `twitterClient`: [overview](../app/modules/twitterClient/docs/overview.md)

## Module Inventory

| Module | Purpose | Docs |
| --- | --- | --- |
| `accountStorage` | Stores local static-id peer keys and remote public-key records used by user, group, and manifest identity flows. | [Overview](../app/modules/accountStorage/docs/overview.md) |
| `activityPub` | Federates public GeeSome groups/posts and reads remote ActivityPub source feeds. | [Overview](../app/modules/activityPub/docs/overview.md), [research](../app/modules/activityPub/docs/activitypub-research.md), [flows](../app/modules/activityPub/docs/activitypub-user-flows.md) |
| `api` | Runs the Express HTTP server, route registration/auth wrappers, discovery/OpenAPI/apiDoc serving, and core setup/auth/user/admin/storage helper routes. | [Overview](../app/modules/api/docs/overview.md) |
| `asyncOperation` | Tracks long-running user operations and processes queued background work. | [Overview](../app/modules/asyncOperation/docs/overview.md) |
| `autoActions` | Stores and claims scheduled module function calls. | [Overview](../app/modules/autoActions/docs/overview.md) |
| `bluesky` | Imports, refreshes, and reads local GeeSome feed views for native Bluesky/ATProto public sources. | [Overview](../app/modules/bluesky/docs/overview.md) |
| `communicator` | Provides network communication, static-id lookup/binding, and pubsub-style event hooks. | [Overview](../app/modules/communicator/docs/overview.md) |
| `content` | Creates, serves, previews, restores, and deletes user content records. | [Overview](../app/modules/content/docs/overview.md) |
| `database` | Owns Sequelize setup, models, permissions, API keys, sessions, and shared query helpers. | [Overview](../app/modules/database/docs/overview.md) |
| `drivers` | Registers media/file preview, upload, metadata, and conversion drivers. | [Overview](../app/modules/drivers/docs/overview.md) |
| `entityJsonManifest` | Builds and reads GeeSome JSON manifests for users, content, groups, posts, categories, and generated group post-index state. | [Overview](../app/modules/entityJsonManifest/docs/overview.md) |
| `ethereumAuthorization` | Verifies Ethereum signatures for auth-message login and registration flows that invoke the registration-validation hook. | [Overview](../app/modules/ethereumAuthorization/docs/overview.md) |
| `fileCatalog` | Manages user/group folder trees and path-based content organization. | [Overview](../app/modules/fileCatalog/docs/overview.md) |
| `foreignAccounts` | Stores user-linked external account claims, provider-address lookups, and manifest proof export. | [Overview](../app/modules/foreignAccounts/docs/overview.md) |
| `gateway` | Serves frontend assets and a DNSLink-based public content gateway for IPFS/IPNS-style GET/HEAD requests. | [Overview](../app/modules/gateway/docs/overview.md) |
| `group` | Owns groups, memberships, posts, permissions, post contents, and group manifests. | [Overview](../app/modules/group/docs/overview.md) |
| `groupCategory` | Manages category records, group/category pivots, category member/admin pivots, category-derived post feeds, and group-section placement. | [Overview](../app/modules/groupCategory/docs/overview.md) |
| `invite` | Manages invite-code status, rate-limited public join/register flows, invite-derived permissions/limits, optional group joins, and invite lifecycle. | [Overview](../app/modules/invite/docs/overview.md) |
| `pin` | Stores pinning accounts and sends storage pin requests. | [Overview](../app/modules/pin/docs/overview.md) |
| `remoteGroup` | Imports or refreshes GeeSome groups/posts from remote manifest storage IDs or static IDs, and backs local-or-remote group lookup. | [Overview](../app/modules/remoteGroup/docs/overview.md) |
| `rss` | Generates bounded public RSS XML feeds for group posts. | [Overview](../app/modules/rss/docs/overview.md) |
| `socNetAccount` | Stores per-user credential and identity rows for social-network client modules, currently Telegram and Twitter/X. | [Overview](../app/modules/socNetAccount/docs/overview.md) |
| `socNetImport` | Provides the shared channel/message/post pipeline for social-network imports. | [Overview](../app/modules/socNetImport/docs/overview.md) |
| `staticId` | Manages static ID binding/history/resolution, account/group static identities, and public IPNS-style resolve/stream routes. | [Overview](../app/modules/staticId/docs/overview.md) |
| `staticSiteGenerator` | Generates static sites for groups and bounded content lists, including group post pages, and manages render state. | [Overview](../app/modules/staticSiteGenerator/docs/overview.md) |
| `storage` | Wraps the configured storage backend for files, directories, streams, and storage IDs. | [Overview](../app/modules/storage/docs/overview.md) |
| `storageSpace` | Analyzes storage usage, reference state, cleanup blockers, and availability signals. | [Overview](../app/modules/storageSpace/docs/overview.md) |
| `telegramClient` | Imports Telegram account/channel data through the shared social-import pipeline. | [Overview](../app/modules/telegramClient/docs/overview.md) |
| `tgContentBot` | Provides Telegram bot flows for content upload and user interaction. | [Overview](../app/modules/tgContentBot/docs/overview.md) |
| `twitterClient` | Imports Twitter/X account/channel data through the shared social-import pipeline. | [Overview](../app/modules/twitterClient/docs/overview.md) |

## Documentation Plan

1. Core module overviews are in place for `database`, `group`, `content`, `storage`, `entityJsonManifest`, `fileCatalog`, and `storageSpace`.
2. Background-worker and async-flow overviews are in place for `asyncOperation`, `autoActions`, `pin`, `staticSiteGenerator`, `socNetImport`, `activityPub`, and `bluesky`.
3. Integration overviews are in place for `telegramClient`, `twitterClient`, `tgContentBot`, `remoteGroup`, and `communicator`.
4. API/security/identity overviews are in place for `api`, `invite`, `foreignAccounts`, `ethereumAuthorization`, `socNetAccount`, `accountStorage`, and `staticId`.
5. Utility/feed overviews are in place for `drivers`, `gateway`, `groupCategory`, and `rss`.
6. Subagent review pass completed across all module inventory rows and overview docs; keep future reviews focused on code ownership, public API, models/storage, background jobs, user-facing behavior, and integration boundaries.
7. Keep this index updated whenever a module gains docs, but keep detailed behavior, schemas, route lists, and migration notes inside the module docs folder.
