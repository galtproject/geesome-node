# Agent Docs Map

Use this map after loading the repo instructions in `AGENTS.md`.

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

- Read `app/modules/activityPub/docs/activitypub-research.md`.
- Read `app/modules/activityPub/docs/activitypub-user-flows.md`.
- Read `app/modules/activityPub/docs/overview.md` and
  `app/modules/bluesky/docs/overview.md`.

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
