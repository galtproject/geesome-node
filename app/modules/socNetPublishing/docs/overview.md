# Social network publishing

`socNetPublishing` owns publication sources, destinations, durable jobs and
results. Local clients and the optional node worker use the same PublicationJob
table, isolated by execution mode. No provider credential is stored in a job.

## Compatibility

Canonical API base-relative path: `/user/social-publications`. The previous
`/user/local-publications` routes call the same handlers with the same checks.
The existing `publishing:local` scope remains valid. Old `localClient` module
configuration is normalized to `socNetPublishing`, deduplicated and stopped once;
`app.ms.localClient` is a compatibility alias. Tables, v1–v4 digests, existing
request keys and unknown outcomes are not rewritten. New producers can negotiate
`socialPublishingApi:true`, `publicationDestinations:true`, `serverPublishing:true`
on the outbox response. A paused worker does not disable queue acceptance.

## Server setup

Only Bluesky, Discord and Telegram support server mode. The owner creates a key
with explicit `publishing:manage` (or uses the owner's password session). Producer
keys with only `publishing:local` cannot configure secrets or settle server results.
Account/target verification never creates a post. Use POST
`/user/social-publications/server-destinations` with a private JSON body:

```json
{
  "requestKey": "era-telegram-main",
  "network": "telegram",
  "label": "Era of Wave Telegram",
  "sourceGroupId": 42,
  "contentPolicy": "nsfw",
  "account": {"botToken": "REPLACE_LOCALLY"},
  "target": {"chatId": "-1001234567890"},
  "enabled": false
}
```

Values above are examples, not a production account or group. For Bluesky,
account is `{identifier,appPassword}` and target `{}`. For Discord, account is
`{botToken}`; target contains `channelId` and optional `guildId`.
Telegram target contains `chatId`. Configure each channel as a separate destination
with `contentPolicy: "sfw"` or `"nsfw"`; multiple channels reuse one account.
SFW accepts only explicit sensitive=false; NSFW allows both. These settings never
switch channels automatically. [Content policy and upgrade compatibility](content-policy.md)
explains retained legacy alternate fields and frozen job snapshots. Setup resolves named
Telegram chats to numeric IDs and verifies bot/channel access; Discord guild and
Bluesky DID are confirmed. Sensitive Discord jobs require an NSFW channel.

Repeat the same requestKey with `enabled:true` after review to enable the SAME
destination ID. Repeating setup re-verifies credentials; identity/source scope
cannot change under an existing key. Rotation must prove the same DID/bot ID.
To connect a different profile, create a new destination. No automatic import of
old Girls/client credentials occurs. Partial setup requests are not supported:
include original credentials/target when enabling or rotating.

Keep real secrets out of command arguments, chat, logs and source. Send the body
from a mode0600 file/stdin over authenticated HTTPS; responses expose safe catalog
metadata only. The new socNetAccount.serverCredentialsEncrypted TEXT column uses
existing app.encryptTextWithAppPass/decryptTextWithAppPass. Preserve the existing
`data/app-pass.key` alongside deployment backups; lost/wrong keys block sending.
Existing CryptoJS app-pass encryption is not claimed to be AEAD. `sessionKey`
and client `isEncrypted` semantics remain unchanged. Generic account update
cannot change a server-managed row or write the encrypted credential field.

## Queue and worker

Compose uses the existing route with `{destinationId,network,target}`. Node checks
owner/source, enabled mode and expected producer digest before source/job writes.
Server v5 canonical digest is SHA256(JSON.stringify({version:5,destinationId,
executionMode:'server',accountIdentity,network,text,attachments:[{storageId,mimeType}],
target})); target keys are sorted and attachment order retained. DID or `bot:ID`
is public identity; the frozen private account reference is excluded from API
projection. Client destination jobs retain exact v4 digests.

The server worker is OFF by default. Enable explicitly with
`SOC_NET_PUBLISHING_WORKER=1`; optional interval and bounded batch controls are
`SOC_NET_PUBLISHING_INTERVAL_MS` (default60000, range1000–3600000) and
`SOC_NET_PUBLISHING_BATCH_SIZE` (default3, maximum20). Include socNetAccount in
configured modules. The standard worker defers its first tick, avoids overlap
and waits for the in-flight tick on shutdown. Polling reads only due enabled
server jobs. Disabled/missing credentials do not get claimed; a bounded scan
cursor prevents blocked credentials starving another account. Node claims are
atomic across processes. Media reads are owner scoped and byte bounded.

Pause by disabling the worker configuration and restarting normally. Disabling a
destination blocks new claims, not an already processing send. Stop/settle the
worker before manual reconciliation. queued→processing→posted/failed/needs_review;
queued→cancelled is unchanged. A crash leaves processing for operator review.
Timeout/5xx/unreadable publication responses never automatically resend. When a
provider result is known but DB acknowledgement fails, only that result is retried.

Owner-only manual result resolution: POST
`/user/social-publications/:jobId/server-result` with the original claimToken,
status and confirmed remoteId/remoteUrl when posted. It requires management
scope/password session and never invokes a provider. Client-result endpoints
cannot settle server jobs; client and legacy claims cannot capture them.

## Upgrade and rollback

Run migration `20261110001000-server-social-publishing.cjs` for existing tables.
Fresh tables are created by model sync. It adds the server credential column,
frozen job identity/account columns, nullable client-only fields and a server
request-key uniqueness index. Migration down refuses server jobs, destinations
or encrypted credentials; do not deploy an old node binary while they exist.
Start paused, create disabled server destinations, reconcile old local jobs,
then explicitly disable old local routes before enabling new server ones.
Unknown old sends require manual review. No server/client fallback occurs.

The real-node HTTP tests use PostgreSQL/Kubo and mocked provider transport;
provider tests cover all three protocols. No live publication is required for
verification. Source plan lives in hub
`docs/plans/server-social-publication-bluesky-discord-telegram.md`.

## Retained client and legacy protocol details

The following details apply to client-mode/legacy flows. Server execution and
management use the separate rules above.

## Microwave Girls producer bridge (#1526)

Queue account filters and create/compose targets now accept `twitter` and
`rule34xxx`. Rule34 requires only explicit tags (1–10000 characters), credential-
free HTTP(S) source (up to 2000) and rating s/q/e. These Rule34 fields are rejected
for other destinations. Twitter accepts only optional target.sensitive boolean;
explicit false is retained in snapshots and digest, not treated as omitted.
Client-mode jobs still perform no provider requests on node.

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
title under the same key conflicts. Successful creation/replay returns the current
lastPostAt using the same nondeleted-post definition as GET, including null for
empty groups. This does not create posts/jobs.

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

## Provider-ready images before queue acceptance (#1529)

Compose may explicitly request `mediaPolicy:"social-images-v1"`. The opt-in is
part of compose identity; omission keeps the exact previous normalized request
hashes, source/job refs and producer digest semantics. Do not add it during a
retry of an older intent. Unknown policy strings are rejected.

The ordinary private source post keeps its original owned JPEG/PNG/WebP files.
Before creating any source post or job, all destination text/count requirements
are checked and every required rendition is prepared. Sources are authorized
before conversion/cache lookup. Bounded storage reads accept at most 64 MiB and
Sharp accepts at most 40 million pixels. Still-image decoding is complete and
strict; format mismatch, truncated bytes and animation are rejected. There is no
frame extraction, cropping, enlargement or background preparation worker.

All current destinations receive JPEG, with auto-orientation and transparency
flattened on white. First encoding reuses publication-jpeg95-v1 at quality95,
4:4:4 chroma and a maximum edge of 4096. If its bytes exceed the network limit,
the finite (quality, edge-scale) ladder is (90,1), (85,1), (80,.85), (75,.7),
(70,.55), (65,.4), (60,.25), (60,.125), always from the original image. Each
resize fits inside both dimensions without changing composition. The byte caps
are Bluesky 2,000,000, Discord 8 MiB and other current adapters 10 MiB. These are
the local adapters' supported limits, not a claim of live-provider acceptance.

A server-only completed cache uses the existing assetIdempotencyKey namespace
local-social-images-v1, keyed by owner/source CID+MIME/policy/byte-cap/max-edge.
Renditions with the same profile reuse one cache across networks. Only completed
results are recorded after owned Content and Asset persistence. There is no new
table, pending reservation, retry scheduler or crash-stuck cache claim. Cache
hits recheck owner, Content/Asset CID/type/deletion/byte metadata. Existing
owner/CID Asset uniqueness and deterministic bytes handle concurrent conversion;
compose uniqueness still rolls back duplicate source/jobs. Source authorization
is repeated before lookup, and user-controlled Content properties do not choose
the cached rendition. Failed preparation may leave reusable owned uploads/cache
assets, but accepts no partial source/jobs.

Prepared jobs freeze payload `{text,attachments,mediaPreparation}`; attachments
are the prepared media refs. mediaPreparation is exactly
`{policy,sourceAttachments,digest}` with original safe refs. Its SHA-256 digest
uses UTF-8 JSON.stringify of ordered `{policy,network,sourceAttachments,attachments}`,
projecting both arrays to ordered `[{storageId,mimeType}]`. This binds source and
prepared renditions independently of derived URL/name/size metadata.

Producer.digest continues to represent original authored intent: original
attachments, original local account selection and authored target. It is never
replaced with a prepared-media hash and is not rewritten at route binding. Existing
draft activation compares stored original refs and text before preparing images;
it retains the same source post. Replay returns frozen jobs before any encoding.

Controlled validation errors are local_publication_media_policy_invalid,
local_publication_image_count_invalid, local_publication_text_too_long,
local_publication_image_input_invalid, local_publication_image_decode_failed,
local_publication_image_too_large (413) and local_publication_image_cannot_fit
(413). Reddit target/title checks retain typed target errors. Sharp/storage
internal error text is never exposed through these validation responses.
