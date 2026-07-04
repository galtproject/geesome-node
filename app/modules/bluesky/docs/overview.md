# Bluesky Module

## Purpose

The `bluesky` module provides native ATProto/XRPC public-feed preview, import, subscription, refresh, bounded imported-post sync, and local GeeSome feed reading for Bluesky sources.

## Owns

- Public Bluesky author-feed preview through configured public XRPC origin/timeout.
- Projection of ATProto posts into canonical rich text, source identity, replies, and embed metadata.
- One-page public feed import through the shared `socNetImport` pipeline.
- Per-user source subscriptions with actor, filter, display name, local group name, account ID, import limit, moderation mode/rules, cursor, and error state.
- Manual refresh, queued refresh, due-subscription polling, and source-feed reads over already-imported GeeSome posts through the linked social-import channel.
- Bounded source-post sync that verifies stored Bluesky AT URIs with `com.atproto.repo.getRecord`, updates changed CIDs, and soft-deletes only records confirmed missing.
- Source moderation policy application before refresh creates visible posts and before sync keeps/updates visible posts.
- Optional refresh worker and poller cron services.

## Queue And Worker Boundaries

- Queue module name is `bluesky-source-refresh`.
- Manual `refreshSourceSubscription` fetches one bounded page immediately.
- `queueSourceSubscriptionRefresh` stores a unique async-operation queue row and may kick bounded processing.
- The optional worker processes queued refreshes; the optional poller only queues stale active subscriptions and can also process when the worker is enabled.
- Imported posts must go through `socNetImport` and preserve Bluesky AT URI source identity.
- Source refreshes and syncs apply `remoteContentModeration` decisions first. `autoImport` allows posts unless a rule blocks/quarantines/reviews them; `reviewFirst` keeps fetched posts out of visible GeeSome posts until a review/import state exists.
- Source refreshes do not advance the stored cursor when a fetched page contains review/quarantine decisions, because native Bluesky review/import state is not persisted yet.

## Boundaries

- Bluesky is ATProto, not ActivityPub. Bridge-backed ActivityPub sources belong to `activityPub`.
- Public feed reads do not require stored credentials; credentialed account ownership and cross-posting need explicit `socNetAccount` handling.
- Refreshes should stay page-bounded and avoid bypassing moderation/source-identity rules.
- The current review-first path is a safety gate, not a full native Bluesky review queue. A future slice should persist review/import state for skipped native records before exposing a moderation UI.
- Sync is explicit and page-bounded; absence from an author-feed page is not enough to delete a local post.
- Credentialed cross-post semantics remain follow-up work.

## Related Docs

- [ActivityPub and Bluesky user flows](../../activityPub/docs/activitypub-user-flows.md)
- [Remote content moderation helpers](../../remoteContentModeration/docs/overview.md)
- [Social Network Import module overview](../../socNetImport/docs/overview.md)
- [Rich-text content format](../../../../docs/rich-text-content-format.md)
