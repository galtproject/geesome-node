# Static ID Module

## Purpose

The `staticId` module maps stable static identities to current dynamic storage IDs, keeps a bounded history of those bindings, and exposes public IPNS-style resolve/stream routes.

## Owns

- Static ID history rows and current binding rows.
- Static ID binding, group binding, resolution, fallback from history, and history compaction.
- Static account creation/rename helpers for user and group identities.
- Static ID peer lookup delegation through the communicator.
- Public static-ID HTTP routes for self-account ID, storage resolution, and `/ipns/*` content GET/HEAD streaming through the `content` module.
- Startup compaction when configured.

## Security Boundaries

- Binding a static ID requires the caller to own the local static account.
- Group static binding requires group edit permission and resolves to the group creator account.
- Current binding rows should be the fast path; history is a fallback and audit/repair source.
- Communicator results are online signals; database binding remains the durable local state.

## Boundaries

- Private/public key storage belongs to `accountStorage`.
- Network propagation and peer lookup belong to `communicator`.
- Dynamic object creation belongs to the producing module, such as `content`, `group`, or `staticSiteGenerator`.
- Keep history compaction bounded so large static-id histories do not become startup or maintenance hazards.

## Related Docs

- [Account Storage module overview](../../accountStorage/docs/overview.md)
- [Communicator module overview](../../communicator/docs/overview.md)
- [Group module overview](../../group/docs/overview.md)
