# Database Module

## Purpose

The `database` module owns GeeSome's Sequelize connection, shared models, schema migrations, sessions, API keys, permissions, and low-level persistence helpers used by feature modules.

## Owns

- Sequelize setup, model registration, and migration configuration.
- Core user, content, object-cache, API-key, permission, value, quota/action, storage-object, storage-reference, and storage-space snapshot models.
- Shared helpers for list params, content lookup, deleted-content retention, user limits, storage-object identity, storage-object references, and delete-safety checks.
- Postgres/session integration used by the API and app runtime.

## Boundaries

- Feature workflows should stay in their feature modules; keep `database` focused on persistence primitives and shared integrity helpers.
- Do not add migrations only to create brand-new model-sync tables while the work is still unreleased on `dev`.
- Production-relevant schema changes, indexes, constraints, data cleanup, and type changes need real migrations plus migration-integrity coverage.
- Use storage-object/reference helpers for physical storage metadata and delete safety instead of ad hoc scans in feature modules.
- Use list-param helpers and stable ordering for large table queries; avoid unbounded totals in hot paths.

## Related Docs

- [Database scalability review](../../../../docs/database-scalability-review.md)
- [Migration integrity rules](../../../../AGENTS.md)
