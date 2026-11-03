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
flags must all match. Explicit groupId additionally permits other caller-owned ordinary closed local channels. Encrypted, foreign, open, remote and deleted groups remain forbidden.

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
no origin URL, headers or credentials; producer metadata remains provenance only; Girls checks policy before enqueue and the executor needs no Girls connection.

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
Bound targets remain frozen. Network-only jobs in explicit groups may resolve missing channel/chat routing exactly once at atomic claim, as documented below.

Bluesky confirmed AT URIs fit the existing opaque remoteId limit of 500; no
column/type expansion is needed. Result URLs retain the existing HTTPS/no-query
rule and previously documented strict Rule34 exception. Tumblr was never a
supported node queue network and remains unsupported. Existing queue payloads,
source schema, ownership checks, indexes and non-producer hashes are unchanged.


## Selected group queue sources (#1528)

GET `user/local-publications/sources` returns `{ownerId,groups}` for owned
ordinary closed local channels, including empty groups. Each group exposes
`id,name,title,lastPostAt`; the last nondeleted post creation time is computed
for only the bounded group page (limit 1–100, offset <=1000000). Optional `ids`
accepts 1–100 distinct positive IDs intersected with owner/eligibility filters.
POST the same path with stable `{requestKey,title?}` creates a native private
channel deterministically; identical retries recover the group and changed
title under the same key conflicts. This does not create posts/jobs.

Compose accepts explicit `groupId`; its identity is included in replay hashing
only when present, preserving old requests. Only with groupId may a destination
omit `localAccountId` (stored as empty string). Discord/Telegram unbound targets
may omit route channel/chat, but authored sensitivity remains exact. Rule34
still requires authored tags/source/rating. Source posts with no jobs remain
unassigned drafts; selecting a group never schedules them.

List jobs and outbox accept comma-separated `groupIds` (maximum 100), and claim
accepts a numeric array. Explicit empty selection yields no work; omission keeps
legacy account/outbox behavior. Job source group IDs are hydrated in one bounded
query without a schema column/backfill or N+1. Drafts include groupId.

Claim `routes:[{groupId,network,localAccountId,target?}]` is authoritative when
present, including for bound jobs: exact group/network/account route is required;
empty routes cannot dispatch anything. Omission retains legacy account filters.
Each route must reference an account also supplied in accounts. Route targets
are only Discord `{channelId,guildId?,sfwChannelId?}` or Telegram
`{chatId,sfwChatId?}`. For unbound jobs only, missing account and destination
fields are filled and persisted under the same SKIP LOCKED job transaction.
SFW alternatives apply only when authored sensitive=false; authored fields win.
No local routing can replace authored content, sensitivity, tags or an already
bound target. Group ownership and private eligibility are rechecked before the
claim is returned. Processing/uncertain jobs never requeue or rebind.

`producer.digest` always represents the original enqueue intent (including empty
account and authored target), not the effective claim route. It is never rewritten
at claim. Producer receipts reconcile through node IDs/key/group/digest without
a direct local-executor request to Girls. Deploy this node contract before the
matching Girls/client versions. No social credentials are stored in groups/jobs.
