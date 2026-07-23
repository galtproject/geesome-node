# ActivityPub Module

## Purpose

The `activityPub` module exposes GeeSome public groups/posts as ActivityPub actors/objects, verifies inbound federation activity, stores remote objects for review/import, and reads remote ActivityPub sources.

## Owns

- ActivityPub/WebFinger/NodeInfo route serialization for local group actors, outboxes, followers, following, and post objects.
- Local actor keys, remote actor cache, HTTP signature verification/signing, follow/block/flag/object/delivery state, and source subscriptions.
- Delivery queue processing for outbound follows, follow accepts, and local post `Create(Note)` deliveries.
- Remote-object caching, review state, sanitized previews, explicit local post draft/creation for accepted public Notes, tombstone/update handling, and attachment backup retries.
- ActivityPub source resolve/subscribe/read/refresh flows, including optional source refresh worker and poller.
- ActivityPub migration preview/import/reconcile APIs that resolve a public source actor, fetch bounded `featured`/`outbox` pages with explicit `maxPages` controls, classify them, expose stable placeholder source-identity metadata, cache eligible own-authored public remote-object candidates by default, create visible GeeSome remote posts only when an admin-approved ownership claim, matching public profile proof token, or short-lived actor-signed ownership challenge plus target group and moderation policy allow it, clean up/rate-limit detached signed challenge records, and repair imported-post reply/quote relations after matching target posts exist.

## Queue And Worker Boundaries

- ActivityPub delivery uses `ActivityPubDelivery` rows with DB-backed due-delivery claims when supported.
- Source refresh uses the shared `asyncOperation` queue under `activitypub-source-refresh`.
- ActivityPub migration candidate imports use the shared `asyncOperation` queue under `activitypub-migration-import`.
- Remote attachment backup retry uses the shared `asyncOperation` queue under `activitypub-attachment-backup`.
- Ownership challenge cleanup runs once at module startup and then through the ActivityPub cron service with configurable interval, limit, and retention.
- Delivery worker, source refresh worker, and source refresh poller are disabled unless ActivityPub is enabled and the matching config flag is set.
- Queue processors are bounded by configured limits and use in-process guards to avoid overlapping runs in one node process.

## Boundaries

- Do not send federation requests inline from post creation; enqueue delivery work.
- Do not render raw remote HTML; use sanitized previews and canonical rich-text projection before import.
- Do not let arbitrary unsolicited remote inbox activity become visible local content; apply verification, source identity, moderation policy, and filters first.
- Do not treat ActivityPub migration preview as a write. The import job may cache eligible own-authored public remote objects for later review/import, and `createPosts=true` may create visible posts only after admin-approved ownership, a matching public profile proof token, or a verified short-lived actor-signed ownership challenge plus target-group validation, moderation checks, accepted review state, idempotency, and bounded-page controls. The signed challenge path is currently a detached proof submitted through GeeSome APIs, not a public remote callback endpoint. Relation reconciliation is an explicit bounded dry-run/apply operation, not an implicit side effect of preview/import.
- Do not mix ActivityPub signing keys with user chat/E2EE keys or Bluesky credentials.
- Keep direct Bluesky/ATProto behavior in the `bluesky` module.

## Related Docs

- [ActivityPub/Fediverse research](./activitypub-research.md)
- [ActivityPub and Bluesky user flows](./activitypub-user-flows.md)
- [Live ActivityPub and Bluesky interoperability](./live-interoperability.md)
- [Rich-text content format](../../../../docs/rich-text-content-format.md)
