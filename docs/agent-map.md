# Agent Docs Map

Use this map after loading the repo instructions in `AGENTS.md`.

## Planning And History

- Read [todo.md](./todo.md) for unfinished work only.
- Use `npm run todo:sections`, then
  `npm run todo:context -- <section-id>` before implementing a plan section.
- Read [implemented.md](./implemented.md) for delivered foundations and preserved
  verification history.
- When a section is delivered, move its durable outcome to `implemented.md`
  instead of leaving completed implementation history in the active TODO.

## API Work

- Read `AGENTS.md` for required API-doc and security-inventory upkeep.
- Update apiDoc annotations near changed route handlers.
- Check [module docs](./modules.md) for the owner module.
- Run or update the security route inventory when route auth, permissions, or
  endpoint shape changes.

Useful live endpoints:

- `GET /v1`
- `GET /v1/openapi.json`
- `GET /v1/apidoc.json`
- `GET /.well-known/openapi.json`

## Module Behavior

- Start with [modules.md](./modules.md).
- Read the matching `app/modules/<module>/docs/overview.md`.
- Keep detailed behavior, model ownership, queues, and integration notes inside
  the module docs folder.

## ActivityPub And Bluesky

- Run `npm run todo:sections`, then `npm run todo:context -- <section-id>` for
  the next ActivityPub/Bluesky implementation slice before editing.
- Read `app/modules/activityPub/docs/activitypub-research.md`.
- Read `app/modules/activityPub/docs/activitypub-user-flows.md`.
- Read `app/modules/activityPub/docs/overview.md` and
  `app/modules/bluesky/docs/overview.md`.
- For review-first/auto-import policy or remote-source filters, also read
  `app/modules/remoteContentModeration/docs/overview.md`.

## Secure Chat

- Treat browser-encrypted direct messages as the implemented foundation, not as
  completion of production-secure group chat.
- Read [Reliable IPFS Chat Research](./ipfs-chat-reliability-research.md) before
  changing chat storage, delivery, PubSub, peering, or browser transport.
- Read [Group Chat E2EE Protocol Decision](./chat-group-e2ee-protocol-decision.md)
  before changing group membership, device leaves, epoch ordering, MLS browser
  state, KeyPackages, Welcome messages, or group-chat wire contracts.
- Read `app/modules/chat/docs/overview.md` before changing device, envelope,
  delivery, acknowledgement, or reconciliation contracts.
- Read `app/modules/privateGroup/docs/overview.md` before changing encrypted
  group/post policy, private post callbacks, or author-controlled mutation.
- Load the `browser-first-chat-e2ee` TODO section before chat implementation.
- Coordinate protocol/envelope changes through `geesome-libs`, browser/device
  key handling through `geesome-ui`, and opaque storage/delivery through
  `geesome-node`.
- Keep private keys, plaintext messages, and plaintext attachments outside
  `geesome-node`; realtime communicator/PubSub events remain optional hints.

## Data Scale, Migrations, And Storage

- Read [database-scalability-review.md](./database-scalability-review.md).
- Read [group-manifest-ipld-scalability.md](./group-manifest-ipld-scalability.md)
  for group manifest storage shape.
- Use migration integrity and restored-backup rehearsal commands from `AGENTS.md`
  when migrations or derived state are involved.
- Read `app/modules/storageSpace/docs/overview.md` for storage analyzer work.

## Security And Auth

- Read [security-review.md](./security-review.md).
- Read [security-route-inventory.md](./security-route-inventory.md).
- Keep route ownership and permission docs aligned when changing protected routes.

## Operations

- Read [../DEBUG.md](../DEBUG.md) for log flags and debug namespaces.
- Use `npm run docker-upgrade` for production update guidance.
- Prefer Docker-backed verification for full-suite checks when host services are
  not already available.
