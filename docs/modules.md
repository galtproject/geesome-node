# Module Docs

This is the root index for module-owned docs. Keep each entry short here: what the
module is for, and where its docs live when it has them. Detailed plans, flows,
and implementation notes belong under `app/modules/<module>/docs/`.

## Documented Modules

### ActivityPub

Purpose: ActivityPub federation for public GeeSome groups/posts and remote ActivityPub source reading.

- [ActivityPub/Fediverse research](../app/modules/activityPub/docs/activitypub-research.md)
- [ActivityPub and Bluesky user flows](../app/modules/activityPub/docs/activitypub-user-flows.md)

## Module Inventory

| Module | Purpose | Docs |
| --- | --- | --- |
| `accountStorage` | Stores static-id account keys and peer identity records for users and groups. | Planned |
| `activityPub` | Federates public GeeSome groups/posts and reads remote ActivityPub source feeds. | [Research](../app/modules/activityPub/docs/activitypub-research.md), [flows](../app/modules/activityPub/docs/activitypub-user-flows.md) |
| `api` | Runs the HTTP API server, auth wrappers, route registry, and generated API docs surface. | Planned |
| `asyncOperation` | Tracks long-running user operations and processes queued background work. | Planned |
| `autoActions` | Stores and claims scheduled module function calls. | Planned |
| `bluesky` | Imports and refreshes native Bluesky/ATProto public source feeds. | Planned |
| `communicator` | Provides network communication, static-id lookup/binding, and pubsub-style event hooks. | Planned |
| `content` | Creates, serves, previews, restores, and deletes user content records. | Planned |
| `database` | Owns Sequelize setup, models, permissions, API keys, sessions, and shared query helpers. | Planned |
| `drivers` | Registers media/file preview, upload, metadata, and conversion drivers. | Planned |
| `entityJsonManifest` | Builds and reads GeeSome JSON manifests for groups, posts, categories, and generated state. | Planned |
| `ethereumAuthorization` | Authenticates users through Ethereum account signature challenges. | Planned |
| `fileCatalog` | Manages user/group folder trees and path-based content organization. | Planned |
| `foreignAccounts` | Stores external account identities and auth-message records. | Planned |
| `gateway` | Serves the frontend/static gateway and routes DNSLink-style requests. | Planned |
| `group` | Owns groups, memberships, posts, permissions, post contents, and group manifests. | Planned |
| `groupCategory` | Organizes groups/posts into categories and group sections. | Planned |
| `invite` | Manages invite-code status, registration, permissions, and invite lifecycle. | Planned |
| `pin` | Stores pinning accounts and sends storage pin requests. | Planned |
| `remoteGroup` | Imports GeeSome groups/posts from remote manifest storage IDs. | Planned |
| `rss` | Generates RSS feeds for group posts. | Planned |
| `socNetAccount` | Stores account credentials and identity data for social-network integrations. | Planned |
| `socNetImport` | Provides the shared channel/message/post pipeline for social-network imports. | Planned |
| `staticId` | Manages static ID history, account/group bindings, and static identity resolution. | Planned |
| `staticSiteGenerator` | Generates static sites for groups/posts and manages render state. | Planned |
| `storage` | Wraps the configured storage backend for files, directories, streams, and storage IDs. | Planned |
| `storageSpace` | Analyzes storage usage, reference state, cleanup blockers, and availability signals. | Planned |
| `telegramClient` | Imports Telegram account/channel data through the shared social-import pipeline. | Planned |
| `tgContentBot` | Provides Telegram bot flows for content upload and user interaction. | Planned |
| `twitterClient` | Imports Twitter/X account/channel data through the shared social-import pipeline. | Planned |

## Documentation Plan

1. Add module-local `docs/overview.md` files for the highest-risk core modules first: `database`, `group`, `content`, `storage`, `entityJsonManifest`, `fileCatalog`, and `storageSpace`.
2. Add background-worker docs for modules that run or schedule asynchronous work: `asyncOperation`, `autoActions`, `pin`, `staticSiteGenerator`, `socNetImport`, `activityPub`, and `bluesky`.
3. Add integration docs for external network modules: `bluesky`, `telegramClient`, `twitterClient`, `tgContentBot`, `remoteGroup`, and `communicator`.
4. Add API/security docs where behavior is cross-cutting: `api`, `invite`, `foreignAccounts`, `ethereumAuthorization`, `socNetAccount`, `accountStorage`, and `staticId`.
5. Keep this index updated whenever a module gains docs, but keep detailed behavior, schemas, route lists, and migration notes inside the module docs folder.
