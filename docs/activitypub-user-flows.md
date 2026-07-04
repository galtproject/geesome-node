# ActivityPub And Bluesky User Flows

This document describes how ActivityPub, ActivityPub Sources, and native Bluesky/ATProto should be used by admins, group owners, and readers when the interoperability milestone is complete.

The goal is to keep protocol machinery out of ordinary publishing. Admins manage node health, trust, moderation, and credentials. Users manage their groups, feeds, and posts inside normal GeeSome permissions.

## Roles

- **Node admin/operator**: configures federation, workers, moderation queues, source refreshes, credentials, and health checks.
- **Group owner/editor**: publishes public group posts, chooses whether the group federates, subscribes to sources the group should read/import, and decides where posts cross-post.
- **Reader/member**: reads GeeSome groups and subscribed feeds through the UI without needing to know whether content came from GeeSome, ActivityPub, Bridgy Fed, or native Bluesky.
- **Remote Fediverse actor**: follows, replies, mentions, flags, updates, or deletes content through signed ActivityPub requests.
- **Remote Bluesky account**: is read through native ATProto/XRPC, or through Bridgy Fed only when the user explicitly chooses the ActivityPub bridge path.

## Admin Flow: Enable Federation

1. Admin configures the node public federation identity:
   - `ACTIVITYPUB_ENABLED=1`
   - `ACTIVITYPUB_PUBLIC_URL=https://node.example`
   - optional `ACTIVITYPUB_DOMAIN=node.example`
2. Admin enables only the workers the node is ready to run:
   - delivery worker for outbound ActivityPub sends;
   - ActivityPub source refresh worker/poller for remote ActivityPub source feeds;
   - Bluesky source refresh worker/poller for native ATProto subscriptions.
3. Admin runs local or live smoke checks before exposing the feature:
   - deterministic ActivityPub interop smoke;
   - optional live Fediverse actor smoke;
   - optional Bluesky-through-Bridgy smoke;
   - native Bluesky public XRPC smoke.
4. Admin reviews the federation screens for:
   - actor discovery status;
   - delivery failures and retry state;
   - source refresh errors;
   - moderation/review queues;
   - async operation progress.

Success state: public groups on the node can be discovered by WebFinger/actor URL, outbound delivery is queued instead of blocking post creation, and remote inbound content is reviewable before it becomes visible as GeeSome content.

## User Flow: Publish A Public Group To The Fediverse

1. Group owner creates or edits a public GeeSome group.
2. The group has a valid handle-shaped name, for example `my-group`.
3. GeeSome exposes the group as an ActivityPub actor:
   - `acct:my-group@node.example`
   - `https://node.example/ap/groups/my-group`
4. Owner publishes a normal GeeSome post in that group.
5. GeeSome serializes the post as an ActivityPub `Create(Note)` only when it is safe:
   - post is published;
   - group is public;
   - group is not encrypted;
   - group is not a personal chat;
   - post is not an imported remote post that would create a federation loop.
6. The ActivityPub delivery queue sends the signed `Create(Note)` to accepted followers' shared inboxes or inboxes.
7. If delivery fails, admin sees retry/error state while the user post remains published locally.

User-facing result: the group owner publishes once in GeeSome, and accepted remote followers can see the post through their Fediverse server.

## Remote Flow: Follow A GeeSome Group

1. Remote user searches for `@my-group@node.example` from a Fediverse server.
2. The remote server resolves WebFinger and fetches the GeeSome actor document.
3. The remote server sends a signed `Follow` activity to the group inbox.
4. GeeSome verifies signature, digest, date freshness, actor identity, and local actor target.
5. GeeSome stores inbound follow state and queues a signed `Accept(Follow)` delivery when the group is public and policy allows auto-accept.
6. Accepted followers appear in the group followers collection and receive future post deliveries.
7. A signed `Undo(Follow)` or `Block` cancels follower state and stops future delivery to that actor.

Admin-facing result: follow state is inspectable and cancellable by protocol activity without sending content to stale/cancelled followers.

## Remote Flow: Replies, Mentions, Flags, Updates, Deletes

1. Remote actor sends a signed inbox/shared-inbox activity.
2. GeeSome verifies the request before trusting the activity body.
3. Supported remote `Create` objects are cached as `ActivityPubObject` rows when they target a known local actor or local ActivityPub object.
4. Cached remote objects do not immediately become visible GeeSome posts.
5. Admin reviews sanitized preview text, canonical rich-text projection, attachments, local reply mapping, and source provenance.
6. Admin can mark remote objects pending, accepted, or rejected.
7. Only accepted public `Note` objects can be manually converted into native GeeSome posts.
8. Remote `Update`, `Delete`, and `Undo(Create)` reset review state and update or soft-delete linked imported posts only when source identity still matches.
9. Remote `Flag` activities become moderation reports with target context, not automatic deletions.

Safety result: remote content is signed, cached, sanitized, reviewed, and source-bound before it appears in local feeds.

## Admin/User Flow: ActivityPub Sources Reader

This flow is for reading remote ActivityPub actors as a source feed, including bridge accounts such as Bluesky via Bridgy Fed.

1. User opens the ActivityPub Sources section.
2. User resolves a source by:
   - direct actor URL;
   - WebFinger resource such as `acct:alice@example.com`;
   - handle such as `alice@example.com`;
   - preset such as official Bluesky through Bridgy Fed.
3. GeeSome resolves and caches remote actor metadata.
4. User subscribes to the source.
5. User can manually refresh, queue refresh, or let the optional poller enqueue stale active subscriptions.
6. Refresh reads public `featured` and/or `outbox` collections and caches supported public objects.
7. The source feed lists sanitized cached items with:
   - source actor metadata;
   - plain text/canonical rich text preview;
   - bounded attachment metadata and embed policy;
   - review/import state;
   - unread marker;
   - cursor pagination for large feeds.
8. User can mark the source read.
9. Optional: user can request a real federation-level `Follow` from one local group actor to the remote source actor.

Boundary: this is an ActivityPub source reader. It should be honest when a Bluesky source is bridge-backed, unavailable, empty, or not opted into Bridgy Fed.

## User Flow: Native Bluesky Source Reader

This flow is bridge-free and belongs to the dedicated Bluesky/ATProto module, not the ActivityPub module.

1. User opens the native Bluesky source section.
2. User previews a public Bluesky actor such as `bsky.app` through public ATProto/XRPC.
3. GeeSome projects feed items into canonical rich text, source identity, reply metadata, and embed metadata.
4. User subscribes to the Bluesky source with optional filter, display name, group name, account id, and import limit.
5. User refreshes the subscription manually, via queue, or through the optional poller.
6. Refresh imports one bounded public feed page through the existing `socNetImport` pipeline.
7. GeeSome stores imported posts in the linked local group/channel with stable Bluesky AT URI source identity.
8. User reads the source feed through the cached source-feed API, which returns already-imported group posts with cursor pagination.
9. Future update/delete sync should update or tombstone local posts only when the stored source identity still matches the remote AT URI.

Boundary: public native reads do not need credentials. Credentialed account ownership, private/account-specific reads, and cross-posting require explicit stored `socNetAccount` handling and tests.

## User Flow: Credentialed Bluesky Account And Cross-Posting

This is future work and should be implemented only after the public source-reader path is stable.

1. User connects a Bluesky/ATProto account through a stored `socNetAccount` row.
2. GeeSome validates ownership and stores only the credential material required for the selected operation.
3. User chooses a GeeSome group/post to cross-post.
4. GeeSome converts canonical rich text to ATProto text plus byte-indexed facets.
5. GeeSome applies attachment/embed policy explicitly:
   - links become link facets or external embeds;
   - images need supported upload/alt-text policy;
   - unsupported attachments stay as links or are rejected with a clear reason.
6. GeeSome creates or updates the remote ATProto record and stores source/cross-post identity for idempotency.
7. Later remote update/delete sync uses that identity to avoid changing unrelated local posts.

Safety result: cross-posting is opt-in, source-bound, credential-scoped, and does not bypass rich-text, attachment, or moderation policy.

## Reader Flow: Understand Where Content Came From

Readers should see content in a normal feed, but the UI should preserve source context where it affects trust.

- Local GeeSome posts should look native.
- Imported ActivityPub posts should expose remote actor/source context.
- ActivityPub bridge-backed Bluesky posts should say they came through a bridge.
- Native Bluesky posts should show Bluesky/ATProto source context and link to the public `bsky.app` URL when available.
- Deleted/tombstoned remote content should not silently look like active content.
- Unsafe or unsupported embeds should appear as links or hidden placeholders, not active HTML.

## Error And Empty States

The UI should make these states explicit:

- federation disabled;
- public URL/domain missing;
- group name cannot become an ActivityPub handle;
- source actor cannot be resolved;
- source has no public objects;
- Bluesky bridge account is not enabled or has no bridge-visible posts;
- native Bluesky public API returned an error or timed out;
- subscription exists but has not imported a local channel yet;
- refresh is queued or in progress;
- last refresh failed with a bounded error message;
- content is cached but not accepted for import;
- remote delete/update reset an object to pending review.

## Required Safety Boundaries

- Never render raw remote HTML directly in the Vue frontend, generated static site, webview, or admin preview.
- Store canonical rich text as the trusted editable content shape; render sanitized HTML only as adapter output.
- Do not send federation requests inline from post creation. Use delivery queues.
- Do not import remote objects as visible GeeSome posts without review/import policy.
- Do not let users read another user's source subscription or linked social-import channel by guessing ids.
- Do not let public feed query parameters override published-only/non-deleted post visibility.
- Do not mix ActivityPub server-side signing keys with chat E2EE keys or client account credentials.
- Do not treat Bluesky as ActivityPub unless the user explicitly chooses a bridge path.

## Completion Checklist

- Admin can enable/disable federation and workers with documented env vars.
- Public groups are discoverable as ActivityPub actors and can deliver posts to followers.
- Remote follows, unfollows, blocks, flags, replies, updates, and deletes have safe signed handling.
- Admin review/import flow is available for remote ActivityPub objects.
- ActivityPub source reader can subscribe, refresh, read, and mark sources read.
- Native Bluesky source reader can preview, subscribe, refresh/import, and read cached imported posts.
- Native Bluesky update/delete sync is covered.
- Credentialed Bluesky account and cross-post flows are covered by ownership and idempotency tests.
- UI and e2e tests cover admin review, ActivityPub source feed, native Bluesky source feed, and safe rendering.
- Live smoke scripts cover deterministic local checks, optional live Fediverse actor checks, bridge-backed Bluesky checks, and native ATProto public reads.
