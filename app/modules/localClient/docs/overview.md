# Local Client Publishing

PublicationJob is the one node-owned delivery table. Provider credentials stay
local. Existing public-post scheduling remains compatible; normal composition
creates text/pictures in a designated native ordinary closed owner channel.

API, relative to the discovered base:

- POST user/local-publications/compose: requestKey, text, imageStorageIds,
  explicit destinations and optional scheduledAt/internal draft postId. Omit time
  for send-now. Identical retries return the original source and jobs.
- GET user/local-publications/outbox: bounded unassigned owned sources. Read-only;
  group=null before first composition. No history/cancelled source reactivation.
- POST user/local-publications: legacy source-ID scheduling.
- GET user/local-publications: owner-only paginated delivery history/tokens.
- POST user/local-publications/claim: configured accounts -> one due job or null.
- POST user/local-publications/:jobId/result: original claimToken and confirmed
  posted/failed/needs_review. Identical reports are idempotent.
- POST user/local-publications/:jobId/cancel: queued cancellation only.

All use publishing:local scope and existing group rights. Compose additionally
requires assets:write, which grants the native save-data permission for text.
Upload through POST assets, preserve its idempotency key, and use returned
storageId. Node validates caller-owned Asset+Content. Unchanged owned native draft
pictures may reuse caller-owned Content without re-uploading. Target includes
Reddit subreddit/title/flairId and kind=self|link|image; credentials are forbidden.

One source plus all jobs commit atomically through native createPost's trusted
internal afterPersist callback. The callback performs only job writes using its
provided transaction. A duplicate compose key rolls back the competing source.
Draft activation locks the source, rejects changed text/images and any previous
jobs. This avoids nested storage/group DB calls while holding a transaction.
The native group's deterministic identity, creator, marker and closed/plaintext
flags must all match. Other private/encrypted/remote sources remain forbidden.

Draft discovery never supplies a network or send time. Unsupported attachments
produce unavailable=true with an error for that item, without hiding valid drafts.
A user must edit that source in GeeSome before activating it. A source with any
historical job is excluded, even if its jobs were cancelled.

Claims lock a due row with SKIP LOCKED and commit ownership before source checks.
There is no lease expiry or automatic requeue. A crash/uncertain send requires
manual review, using the original owner-only claim token. Stop/settle the original
executor before confirming a result or deliberately scheduling another send.

Payloads freeze text and attachments {storageId,size,url,mimeType,name}. Public
sources require public HTTPS URLs; the owned ordinary private outbox may use a
local node URL. Native unencrypted CIDs are not promised confidential storage.
No social token/cookie appears in node properties, payloads or job records.

PublicationJob is unreleased model-synced state; additive compose columns/indexes
use non-dropping model sync. Existing Group/Post table schemas are unchanged.
See the [delivery plan](../../../../docs/plans/local-social-publishing.md).

Explicit immediate delivery uses optional `jobId` in claim. Only that owner's
queued job for a supplied configured account may be claimed; its schedule is
bypassed, while source eligibility and atomic single-claim checks stay intact.
Other queued jobs and completed/processing statuses are never selected instead.
