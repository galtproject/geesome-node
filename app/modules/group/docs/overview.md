# Group Module

## Purpose

The `group` module owns GeeSome groups, posts, memberships, permissions, post contents, read state, counters, and group/post manifest lifecycle.

## Owns

- Group and post creation, update, deletion, source-identity import, and remote-post update paths.
- Membership/admin permissions, friends, group reads, tags, mentions, auto-tags, and post-event audit state.
- Post content relations and content projection helpers for API/static/RSS/federation consumers.
- Group/post manifest updates, queued derived-state work, static-directory refreshes, and counter reconciliation.
- Large-list helpers for post refs, hydrated post batches, cursor pagination, and all-post scans.

## Boundaries

- Published post state, `localId`, manifest refs, reply/repost counters, group size, and available-post counters must stay transactionally consistent.
- Content bytes and physical storage metadata belong to `content`, `storage`, and `database` storage-object helpers; `group` links them into posts.
- Manifest JSON shape belongs to `entityJsonManifest`; `group` decides when derived manifests need regeneration.
- Imported remote posts must keep source identity stable and avoid ActivityPub/local federation loops.
- High-volume listing changes should update the database scalability inventory/review.

## Related Docs

- [Database scalability review](../../../../docs/database-scalability-review.md)
- [Group manifest IPLD scalability](../../../../docs/group-manifest-ipld-scalability.md)
- [Rich-text content format](../../../../docs/rich-text-content-format.md)

## Private Read Boundary

Only groups explicitly marked `isPublic: true` allow anonymous post reads.
Private/unspecified groups require a valid authenticated creator, administrator,
or member on group detail, post detail and post list API routes. Public lookup
routes accept an optional bearer token; invalid tokens are rejected rather than
silently becoming guests. Internal `*Pure` and batch query methods remain trusted
server helpers and must not be exposed directly by new routes.

Ordinary unencrypted private groups keep post manifests and directories in DB-only
state. Their published group manifest contains public group identity metadata but
no post index or directory ref. Browser encrypted `PrivateGroup` behavior is
preserved. Content numeric-id metadata attached exclusively to private posts is
restricted to a group participant or the Content owner. Known immutable byte CIDs
and intentionally public Pages/media are outside this ACL boundary.

See [delivery and rollout notes](../../../../docs/private-group-read-acl-delivery.md).


## Trusted composition callbacks

Internal createPost callers may supply afterPersist(post, transaction) to write
prepared dependent rows atomically with native post/contents/events. The callback
must use the provided transaction and must not invoke storage or group APIs that
open another pooled connection. Throwing rolls back the new source. This is not
a JSON API parameter. localClient uses it for private-outbox jobs.

Internal createGroup reuseOwnedStaticAccount supports recovery of caller-owned
static accounts left by an interrupted outbox initialization; foreign ownership
is rejected. Normal API group creation retains its existing behavior.
