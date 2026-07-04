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
- `entityJsonManifest`: [overview](../app/modules/entityJsonManifest/docs/overview.md)
- `fileCatalog`: [overview](../app/modules/fileCatalog/docs/overview.md)
- `group`: [overview](../app/modules/group/docs/overview.md)
- `pin`: [overview](../app/modules/pin/docs/overview.md)
- `remoteGroup`: [overview](../app/modules/remoteGroup/docs/overview.md)
- `socNetImport`: [overview](../app/modules/socNetImport/docs/overview.md)
- `staticSiteGenerator`: [overview](../app/modules/staticSiteGenerator/docs/overview.md)
- `storage`: [overview](../app/modules/storage/docs/overview.md)
- `storageSpace`: [overview](../app/modules/storageSpace/docs/overview.md)
- `telegramClient`: [overview](../app/modules/telegramClient/docs/overview.md)
- `tgContentBot`: [overview](../app/modules/tgContentBot/docs/overview.md)
- `twitterClient`: [overview](../app/modules/twitterClient/docs/overview.md)

## Module Inventory

| Module | Purpose | Docs |
| --- | --- | --- |
| `accountStorage` | Stores static-id account keys and peer identity records for users and groups. | Planned |
| `activityPub` | Federates public GeeSome groups/posts and reads remote ActivityPub source feeds. | [Overview](../app/modules/activityPub/docs/overview.md), [research](../app/modules/activityPub/docs/activitypub-research.md), [flows](../app/modules/activityPub/docs/activitypub-user-flows.md) |
| `api` | Runs the HTTP API server, auth wrappers, route registry, and generated API docs surface. | Planned |
| `asyncOperation` | Tracks long-running user operations and processes queued background work. | [Overview](../app/modules/asyncOperation/docs/overview.md) |
| `autoActions` | Stores and claims scheduled module function calls. | [Overview](../app/modules/autoActions/docs/overview.md) |
| `bluesky` | Imports and refreshes native Bluesky/ATProto public source feeds. | [Overview](../app/modules/bluesky/docs/overview.md) |
| `communicator` | Provides network communication, static-id lookup/binding, and pubsub-style event hooks. | [Overview](../app/modules/communicator/docs/overview.md) |
| `content` | Creates, serves, previews, restores, and deletes user content records. | [Overview](../app/modules/content/docs/overview.md) |
| `database` | Owns Sequelize setup, models, permissions, API keys, sessions, and shared query helpers. | [Overview](../app/modules/database/docs/overview.md) |
| `drivers` | Registers media/file preview, upload, metadata, and conversion drivers. | Planned |
| `entityJsonManifest` | Builds and reads GeeSome JSON manifests for groups, posts, categories, and generated state. | [Overview](../app/modules/entityJsonManifest/docs/overview.md) |
| `ethereumAuthorization` | Authenticates users through Ethereum account signature challenges. | Planned |
| `fileCatalog` | Manages user/group folder trees and path-based content organization. | [Overview](../app/modules/fileCatalog/docs/overview.md) |
| `foreignAccounts` | Stores external account identities and auth-message records. | Planned |
| `gateway` | Serves the frontend/static gateway and routes DNSLink-style requests. | Planned |
| `group` | Owns groups, memberships, posts, permissions, post contents, and group manifests. | [Overview](../app/modules/group/docs/overview.md) |
| `groupCategory` | Organizes groups/posts into categories and group sections. | Planned |
| `invite` | Manages invite-code status, registration, permissions, and invite lifecycle. | Planned |
| `pin` | Stores pinning accounts and sends storage pin requests. | [Overview](../app/modules/pin/docs/overview.md) |
| `remoteGroup` | Imports GeeSome groups/posts from remote manifest storage IDs. | [Overview](../app/modules/remoteGroup/docs/overview.md) |
| `rss` | Generates RSS feeds for group posts. | Planned |
| `socNetAccount` | Stores account credentials and identity data for social-network integrations. | Planned |
| `socNetImport` | Provides the shared channel/message/post pipeline for social-network imports. | [Overview](../app/modules/socNetImport/docs/overview.md) |
| `staticId` | Manages static ID history, account/group bindings, and static identity resolution. | Planned |
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
4. Add API/security docs where behavior is cross-cutting: `api`, `invite`, `foreignAccounts`, `ethereumAuthorization`, `socNetAccount`, `accountStorage`, and `staticId`.
5. Add utility/feed docs for remaining local modules: `drivers`, `gateway`, `groupCategory`, and `rss`.
6. Keep this index updated whenever a module gains docs, but keep detailed behavior, schemas, route lists, and migration notes inside the module docs folder.
