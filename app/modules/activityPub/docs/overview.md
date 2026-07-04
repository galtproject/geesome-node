# ActivityPub Module

## Purpose

The `activityPub` module exposes GeeSome public groups/posts as ActivityPub actors/objects, verifies inbound federation activity, stores remote objects for review/import, and reads remote ActivityPub sources.

## Owns

- ActivityPub/WebFinger/NodeInfo route serialization for local group actors, outboxes, followers, following, and post objects.
- Local actor keys, remote actor cache, HTTP signature verification/signing, follow/block/flag/object/delivery state, and source subscriptions.
- Delivery queue processing for outbound follows, follow accepts, and local post `Create(Note)` deliveries.
- Remote-object caching, review state, sanitized previews, explicit local post draft/creation for accepted public Notes, tombstone/update handling, and attachment backup retries.
- ActivityPub source resolve/subscribe/read/refresh flows, including optional source refresh worker and poller.

## Queue And Worker Boundaries

- ActivityPub delivery uses `ActivityPubDelivery` rows with DB-backed due-delivery claims when supported.
- Source refresh uses the shared `asyncOperation` queue under `activitypub-source-refresh`.
- Remote attachment backup retry uses the shared `asyncOperation` queue under `activitypub-attachment-backup`.
- Delivery worker, source refresh worker, and source refresh poller are disabled unless ActivityPub is enabled and the matching config flag is set.
- Queue processors are bounded by configured limits and use in-process guards to avoid overlapping runs in one node process.

## Boundaries

- Do not send federation requests inline from post creation; enqueue delivery work.
- Do not render raw remote HTML; use sanitized previews and canonical rich-text projection before import.
- Do not let arbitrary unsolicited remote inbox activity become visible local content; apply verification, source identity, moderation policy, and filters first.
- Do not mix ActivityPub signing keys with user chat/E2EE keys or Bluesky credentials.
- Keep direct Bluesky/ATProto behavior in the `bluesky` module.

## Related Docs

- [ActivityPub/Fediverse research](./activitypub-research.md)
- [ActivityPub and Bluesky user flows](./activitypub-user-flows.md)
- [Rich-text content format](../../../../docs/rich-text-content-format.md)
