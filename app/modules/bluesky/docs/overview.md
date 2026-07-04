# Bluesky Module

## Purpose

The `bluesky` module provides native ATProto/XRPC public-feed preview, import, subscription, refresh, and cached feed reading for Bluesky sources.

## Owns

- Public Bluesky author-feed preview through configured public XRPC origin/timeout.
- Projection of ATProto posts into canonical rich text, source identity, replies, and embed metadata.
- One-page public feed import through the shared `socNetImport` pipeline.
- Per-user source subscriptions with actor, filter, display name, local group name, account ID, import limit, cursor, and error state.
- Manual refresh, queued refresh, due-subscription polling, and cached source-feed reads.
- Optional refresh worker and poller cron services.

## Queue And Worker Boundaries

- Queue module name is `bluesky-source-refresh`.
- Manual `refreshSourceSubscription` fetches one bounded page immediately.
- `queueSourceSubscriptionRefresh` stores a unique async-operation queue row and may kick bounded processing.
- The optional worker processes queued refreshes; the optional poller only queues stale active subscriptions and can also process when the worker is enabled.
- Imported posts must go through `socNetImport` and preserve Bluesky AT URI source identity.

## Boundaries

- Bluesky is ATProto, not ActivityPub. Bridge-backed ActivityPub sources belong to `activityPub`.
- Public feed reads do not require stored credentials; credentialed account ownership and cross-posting need explicit `socNetAccount` handling.
- Refreshes should stay page-bounded and avoid bypassing moderation/source-identity rules.
- Update/delete sync and credentialed cross-post semantics remain follow-up work.

## Related Docs

- [ActivityPub and Bluesky user flows](../../activityPub/docs/activitypub-user-flows.md)
- [Social Network Import module overview](../../socNetImport/docs/overview.md)
- [Rich-text content format](../../../../docs/rich-text-content-format.md)
