# Bluesky Module

## Purpose

The `bluesky` module provides native ATProto/XRPC public-feed preview, import, subscription, refresh, bounded imported-post sync, credentialed account verification, first-pass local post cross-posting, and local GeeSome feed reading for Bluesky sources.

## Owns

- Public Bluesky author-feed preview through configured public XRPC origin/timeout.
- Projection of ATProto posts into canonical rich text, source identity, replies, and embed metadata.
- One-page public feed import through the shared `socNetImport` pipeline.
- Per-user source subscriptions with actor, filter, display name, local group name, account ID, import limit, moderation mode/rules, cursor, and error state.
- Manual refresh, queued refresh, due-subscription polling, and source-feed reads over already-imported GeeSome posts through the linked social-import channel.
- Persistent source-post review records for fetched ATProto posts that were held by review-first mode or moderation filters.
- Admin review APIs to list cached review records, reject/block/quarantine/reset them, and import pending/quarantined records into the linked local channel.
- Bounded source-post sync that verifies stored Bluesky AT URIs with `com.atproto.repo.getRecord`, updates changed CIDs, and soft-deletes only records confirmed missing.
- Source moderation policy application before refresh creates visible posts and before sync keeps/updates visible posts.
- User-scoped Bluesky account login/verification through ATProto `com.atproto.server.createSession` and profile reads, storing only the selected local `socNetAccount` credential material and returning secret-free account reports.
- User-scoped text/rich-text plus supported-image cross-posting for published local public GeeSome posts through `com.atproto.repo.uploadBlob` and `com.atproto.repo.createRecord`, with canonical rich-text to ATProto text/facet conversion and per-account URI/CID idempotency stored in post `propertiesJson`.
- Optional refresh worker and poller cron services.

## Queue And Worker Boundaries

- Queue module name is `bluesky-source-refresh`.
- Manual `refreshSourceSubscription` fetches one bounded page immediately.
- `queueSourceSubscriptionRefresh` stores a unique async-operation queue row and may kick bounded processing.
- The optional worker processes queued refreshes; the optional poller only queues stale active subscriptions and can also process when the worker is enabled.
- Imported posts must go through `socNetImport` and preserve Bluesky AT URI source identity.
- Source refreshes and syncs apply `remoteContentModeration` decisions first. `autoImport` allows posts unless a rule blocks/quarantines/reviews them; `reviewFirst` keeps fetched posts out of visible GeeSome posts until a review/import state exists.
- Source refreshes cache review/quarantine/block decisions before advancing the stored cursor, so later admin import can use the stored projection instead of re-fetching the page.

## Boundaries

- Bluesky is ATProto, not ActivityPub. Bridge-backed ActivityPub sources belong to `activityPub`.
- Public feed reads do not require stored credentials; credentialed login/verification uses explicit `socNetAccount` rows.
- Account verification proves the authenticated DID matches the stored account identity, tolerating handle changes once a DID is known.
- Cross-posting currently supports text/rich-text facets plus up to four supported image media/attachments. Images are normalized before upload, sent as ATProto blobs, and attached as `app.bsky.embed.images` with alt text and aspect ratio where possible.
- If image blob upload fails and a public node URL is configured through `BLUESKY_PUBLIC_URL`, `ACTIVITYPUB_PUBLIC_URL`, or the `ACTIVITYPUB_DOMAIN` fallback, cross-posting adds the public image URL as a link fallback and uses an `app.bsky.embed.external` card when no image embed succeeded. Without a public URL/domain, upload failure still fails the cross-post instead of creating contextless text.
- Non-image GeeSome attachments still need an explicit link-or-reject policy before they are allowed, so they are rejected instead of being silently dropped from Bluesky records.
- Refreshes should stay page-bounded and avoid bypassing moderation/source-identity rules.
- The current review path is backend/API-only. Frontend policy and review-history UI remain follow-up work.
- Sync is explicit and page-bounded; absence from an author-feed page is not enough to delete a local post.
- Richer credentialed cross-post semantics remain follow-up work and must not bypass moderation, canonical rich-text conversion, source identity, attachment policy, upload failure handling, or idempotency rules.

## Related Docs

- [ActivityPub and Bluesky user flows](../../activityPub/docs/activitypub-user-flows.md)
- [Remote content moderation helpers](../../remoteContentModeration/docs/overview.md)
- [Social Network Account module overview](../../socNetAccount/docs/overview.md)
- [Social Network Import module overview](../../socNetImport/docs/overview.md)
- [Rich-text content format](../../../../docs/rich-text-content-format.md)
