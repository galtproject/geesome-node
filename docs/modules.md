# Module Docs

This is the root index for module-owned docs. Keep each entry short here: what the
module is for, and where its docs live when it has them. Detailed plans, flows,
and implementation notes belong under `app/modules/<module>/docs/`.

## Documented Modules

- `activityPub`: [overview](../app/modules/activityPub/docs/overview.md), [research](../app/modules/activityPub/docs/activitypub-research.md), [flows](../app/modules/activityPub/docs/activitypub-user-flows.md)
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
| `accountStorage` | Stores static-id account keys and peer identity records for users and groups. | [Overview](../app/modules/accountStorage/docs/overview.md) |
| `activityPub` | Federates public GeeSome groups/posts and reads remote ActivityPub source feeds. | [Overview](../app/modules/activityPub/docs/overview.md), [research](../app/modules/activityPub/docs/activitypub-research.md), [flows](../app/modules/activityPub/docs/activitypub-user-flows.md) |
| `api` | Runs the HTTP API server, auth wrappers, route registry, and generated API docs surface. | [Overview](../app/modules/api/docs/overview.md) |
| `asyncOperation` | Tracks long-running user operations and processes queued background work. | [Overview](../app/modules/asyncOperation/docs/overview.md) |
| `autoActions` | Stores and claims scheduled module function calls. | [Overview](../app/modules/autoActions/docs/overview.md) |
| `bluesky` | Imports and refreshes native Bluesky/ATProto public source feeds. | [Overview](../app/modules/bluesky/docs/overview.md) |
| `communicator` | Provides network communication, static-id lookup/binding, and pubsub-style event hooks. | [Overview](../app/modules/communicator/docs/overview.md) |
| `content` | Creates, serves, previews, restores, and deletes user content records. | [Overview](../app/modules/content/docs/overview.md) |
| `database` | Owns Sequelize setup, models, permissions, API keys, sessions, and shared query helpers. | [Overview](../app/modules/database/docs/overview.md) |
| `drivers` | Registers media/file preview, upload, metadata, and conversion drivers. | [Overview](../app/modules/drivers/docs/overview.md) |
| `entityJsonManifest` | Builds and reads GeeSome JSON manifests for groups, posts, categories, and generated state. | [Overview](../app/modules/entityJsonManifest/docs/overview.md) |
| `ethereumAuthorization` | Authenticates users through Ethereum account signature challenges. | [Overview](../app/modules/ethereumAuthorization/docs/overview.md) |
| `fileCatalog` | Manages user/group folder trees and path-based content organization. | [Overview](../app/modules/fileCatalog/docs/overview.md) |
| `foreignAccounts` | Stores external account identities and auth-message records. | [Overview](../app/modules/foreignAccounts/docs/overview.md) |
| `gateway` | Serves the frontend/static gateway and routes DNSLink-style requests. | [Overview](../app/modules/gateway/docs/overview.md) |
| `group` | Owns groups, memberships, posts, permissions, post contents, and group manifests. | [Overview](../app/modules/group/docs/overview.md) |
| `groupCategory` | Organizes groups/posts into categories and group sections. | [Overview](../app/modules/groupCategory/docs/overview.md) |
| `invite` | Manages invite-code status, registration, permissions, and invite lifecycle. | [Overview](../app/modules/invite/docs/overview.md) |
| `pin` | Stores pinning accounts and sends storage pin requests. | [Overview](../app/modules/pin/docs/overview.md) |
| `remoteGroup` | Imports GeeSome groups/posts from remote manifest storage IDs. | [Overview](../app/modules/remoteGroup/docs/overview.md) |
| `rss` | Generates RSS feeds for group posts. | [Overview](../app/modules/rss/docs/overview.md) |
| `socNetAccount` | Stores account credentials and identity data for social-network integrations. | [Overview](../app/modules/socNetAccount/docs/overview.md) |
| `socNetImport` | Provides the shared channel/message/post pipeline for social-network imports. | [Overview](../app/modules/socNetImport/docs/overview.md) |
| `staticId` | Manages static ID history, account/group bindings, and static identity resolution. | [Overview](../app/modules/staticId/docs/overview.md) |
| `staticSiteGenerator` | Generates static sites for groups/posts and manages render state. | [Overview](../app/modules/staticSiteGenerator/docs/overview.md) |
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
6. TODO: Review every module with subagents against its inventory row and overview doc, checking code ownership, public API, models/storage, background jobs, user-facing behavior, and integration boundaries for anything misleading or missing; update the short descriptions and module docs from those findings.
7. Keep this index updated whenever a module gains docs, but keep detailed behavior, schemas, route lists, and migration notes inside the module docs folder.
