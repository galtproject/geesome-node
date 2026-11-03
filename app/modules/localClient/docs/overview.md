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

## Microwave Girls producer bridge (#1526)

Queue account filters and create/compose targets now accept `twitter` and
`rule34xxx`. Rule34 requires only explicit tags (1–10000 characters), credential-
free HTTP(S) source (up to 2000) and rating s/q/e. These Rule34 fields are rejected
for other destinations. Twitter accepts only optional target.sensitive boolean;
explicit false is retained in snapshots and digest, not treated as omitted.
The node still performs no social-provider requests.

Authorized outbox GET exposes numeric ownerId even before group creation. Job
listing accepts a bounded comma-separated `ids` filter (1–100 distinct positive
safe integers), always intersected with owner/status and normal limit/offset.
Use limit=100 when resolving a complete 100-ID reconciliation batch. An exact
owner-scoped composeKey filter (1–128 identifier characters) supports read-only
recovery after compose committed but the producer lost its returned job IDs.
It intersects owner/status/ids and normal pagination; it never composes again.

Compose accepts producer `{type:"microwave-girls",postId:number}` for exactly one
destination. It freezes that reference and a server-computed SHA-256 digest in
nullable PublicationJob.producer JSONB. The digest uses exact text, ordered
storageId/MIME pairs, network/account and lexicographically sorted target keys.
Download URLs, names and schedule are not digest fields. New producer references
are part of compose replay identity; ordinary compose requests retain their old
normalized hash representation and replay compatibility. Producer metadata has
no origin URL, headers or credentials; the local executor owns policy preflight.

The unreleased job table uses additive non-dropping model sync, including this
nullable field. Existing jobs have producer=null. Existing Group/Post schema and
integration scopes are unchanged. Rule34 confirmed URLs may use only the exact
rule34.xxx/index.php?page=post&s=view&id=remoteId query shape for Rule34 jobs;
other result URLs keep their no-query rule. Deploy node support before the new client and
Girls consumers; protocol extensions alone do not establish live-provider support.

### Expanded migrated networks

The same contract additionally accepts Bluesky, Discord and Telegram. Bluesky
allows only optional sensitive boolean. Discord freezes required channelId and
optional guildId/sensitive; snowflakes are nonzero decimal strings of at most 20
digits, never JSON numbers. Telegram freezes required chatId (signed nonzero
at-most-20-digit string or validated @username) and optional sensitive boolean.
Unknown fields, bot credentials and destination URLs are rejected. Explicit false
is retained exactly, including in producer digest and request replay identity.
No target is resolved from mutable local account defaults by the node.

Bluesky confirmed AT URIs fit the existing opaque remoteId limit of 500; no
column/type expansion is needed. Result URLs retain the existing HTTPS/no-query
rule and previously documented strict Rule34 exception. Tumblr was never a
supported node queue network and remains unsupported. Existing queue payloads,
source schema, ownership checks, indexes and non-producer hashes are unchanged.
