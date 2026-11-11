# Publication queue: native Site Group

The existing publishing worker can deliver a frozen image batch to one owned
public GeeSome channel. The catalog exposes `network: geesome`,
`executionMode: native`, `target: {groupId}` and no social account/client fields.
Discover `capabilities.nativeGroupPublishing` through the existing outbox API.

## Setup

Deploy the Node API and worker together, then the Girls integration. No schema
migration or additional service is required. `SOC_NET_PUBLISHING_WORKER=0`
explicitly disables all automatic publishing; otherwise the normal worker is
enabled by default. Native delivery does not require the `socNetAccount` module.

Use the existing authenticated `POST /v1/user/social-publications/destinations`
endpoint with publishing-local/group-management authorization:

```json
{
  "destinations": [{
    "localKey": "site-group",
    "network": "geesome",
    "executionMode": "native",
    "label": "Site Group",
    "contentPolicy": "nsfw",
    "sourceGroupId": null,
    "target": {"groupId": 123},
    "enabled": true
  }]
}
```

Replace 123 with the verified existing site group ID. Registration checks the
creator, public/unencrypted/local channel state and write permission; it never
creates a target group. A single owner record is reused across producer API keys.
The target and source binding cannot be rebound by replaying registration.
`contentPolicy: nsfw` allows both SFW and NSFW delivery requests under the current
policy rules; it does not create a classification filter on the site.

Add the returned **same destination ID** to both existing SFW and NSFW publication
destination groups through their revision-checked update endpoint. Retain each
group's other destination IDs and order. Do not create separate site destinations.
The private source queue group remains separate from this public target.

## Delivery and recovery

Native jobs use the existing schedule and worker batch cap. Native and external
server work alternate while both queues are busy. Desktop clients cannot claim
native work or report its result.

One job produces one native post from its frozen text and ordered image references
(at most 20 JPEG/PNG/WebP images). It uses owned original content and does not need
social image preparation. The post ID is saved in `publicationJob.remoteId` by
`group.createPost`'s transaction callback before manifest/storage effects.
Post creation, public attachment joins and that ID commit together. A stale claim
rolls its new post back instead of duplicating the accepted publication.

After a crash or transient storage error, a processing job becomes eligible again
after its five-minute processing lease. The worker resumes the saved post's
manifests and result; it does not recreate the post or re-read a mutable source
caption. Results link to the existing GeeSome UI group/post route. A separate new
intent may intentionally repost the same image bytes.

Disabling a destination blocks its unstarted jobs, matching external server
delivery behavior. Re-enable the same registration to continue them. Already
created native posts can finish manifest recovery after their destination is
disabled. Target deletion/privacy changes or revoked write permission produce a
failed job with an actionable error; they do not trigger publication elsewhere.

Publishing updates the same post/group manifests and hooks as normal group
publication. Existing site display/autoActions stay in control of HTML generation;
this delivery path does not add a separate site rebuild or membership Page job.

## Shuffle and rollback

The existing queue shuffle accepts the native destination ID alongside social
IDs. It independently permutes future queued slots per destination, preserving
the slot set and frozen payload. Processing, posted, due, other-owner and
other-source jobs are excluded. Repeat a lost request with its original shuffle
key; do not generate a replacement key for an unknown outcome.

Before rolling back to a Node version without native support, remove Site Group
from new group selections and drain/reconcile native processing jobs. Disable the
native destination to block queued delivery. Keep the destination and existing
job/post IDs for reconciliation; do not delete accepted receipts or public posts.

Focused PostgreSQL coverage lives in `test/socNetPublishingNative.test.ts` and
`test/publicationQueueShuffle.test.ts`; worker startup/config coverage lives in
`test/publishingWorkerConfig.test.mjs`. The native suite invokes the real group
`createPost` and Post model with disposable SQL fixtures and stubbed storage/auth.
