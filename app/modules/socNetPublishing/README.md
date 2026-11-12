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

## DeviantArt server publishing

DeviantArt is a server-only destination (`network: deviantart`, `executionMode:
server`). Discover `capabilities.deviantartPublishing` in the outbox response before
showing its setup form. Existing nodes without that capability cannot run these
jobs. No new schema or migration is required. The separate `geesome-client`
application owns its connection catalog, badges and queue display; `@geesome/ui`
is not the publishing client.

Register a confidential OAuth application and obtain user authorization with
`basic user stash publish` scopes. New DeviantArt applications require Authorization
Code with PKCE. Prefer the managed OAuth flow below; the original advanced setup
endpoint still accepts externally obtained credentials:

```json
{
  "requestKey": "deviantart-main",
  "network": "deviantart",
  "label": "DeviantArt",
  "account": {
    "accessToken": "<current-user-access-token>",
    "clientId": "<application-id>",
    "clientSecret": "<application-secret>",
    "refreshToken": "<user-refresh-token>"
  },
  "target": {},
  "contentPolicy": "sfw",
  "enabled": true
}
```

Send this to the existing owner-authorized server-destinations endpoint. Setup
calls `user/whoami` without publishing and binds the stable user UUID, rather than
a mutable username. Credentials use the existing app-pass encryption and never
appear in destination, job or account listing responses. First connection (or a
new setup key without a saved account binding) requires a current access token:
it refuses expired credentials without rotating an unpersisted refresh token.

For known accounts, setup, settings verification and worker execution renew on
HTTP 401. Rotation reloads current credentials under a per-owner advisory lock,
persists both tokens, then verifies identity before any upload. Concurrent stale
snapshots reuse the latest valid token. Rotated credentials commit separately
from destination settings, so a later stale-settings conflict cannot discard the
refresh token. A bounded encrypted history of retired refresh-token fingerprints
prevents replaying a recently superseded setup pair over the current one. Explicit
new credentials may reconnect an account. A failed database write after the
provider rotates tokens prevents sending, and may require fresh OAuth consent.
Refresh tokens themselves expire; reauthorize if the grant is revoked or expired.

Compose through the existing endpoint with the returned destination ID:

```json
{
  "requestKey": "deviantart-picture-1",
  "contentType": "sfw",
  "text": "Description of the artwork",
  "imageStorageIds": ["<owned-image-storage-id>"],
  "mediaPolicy": "social-images-v1",
  "destinations": [{
    "destinationId": 123,
    "network": "deviantart",
    "target": {
      "title": "Artwork title",
      "tags": ["digital_art"],
      "isAiGenerated": false,
      "noAi": true
    }
  }]
}
```

Exactly one owned JPEG/PNG is sent (maximum 10 MiB); `social-images-v1` can prepare
other supported owned image inputs as JPEG. The title is required and limited by
this integration to 50 Unicode characters. Up to 30 unique tags use ASCII letters,
numbers or underscores (1–64 characters each). `isAiGenerated` is required per
publication and is never inferred from media or account identity. `noAi` defaults
to true. Titles, tags and disclosure flags stay frozen in the job target and
intent digest. `contentType: nsfw` sets `is_mature=true` and `mature_level=strict`;
SFW sets `is_mature=false`. Free original downloads are disabled.

Delivery uploads to `stash/submit`, then publishes its returned item ID via
`stash/publish`. Only a confirmed success with a valid deviation UUID and safe
DeviantArt artwork URL completes the job. An upload failure can leave an
unpublished Sta.sh item but never triggers automatic publication retries. A
publish timeout, server error or malformed receipt is `needs_review`: inspect the
provider and resolve the original job; never blindly recreate it. Explicit HTTP
4xx rejections are known failures. Statistics may filter DeviantArt jobs, but
automatic DeviantArt metric collection is not implemented.

Provider behavior and encrypted PostgreSQL lifecycle are covered in
`test/deviantartPublishing.test.ts` and
`test/deviantartPublishingServer.test.ts`. References:
[OAuth](https://deviantart.readme.io/docs/authentication),
[identity](https://deviantart.readme.io/reference/user_whoami),
[upload](https://deviantart.readme.io/reference/stash_submit),
[publish](https://deviantart.readme.io/reference/stash_publish).


## Managed DeviantArt account connection

The client discovers `capabilities.deviantartOAuth` and offers Connect DeviantArt.
Enter a confidential application's Client ID and Client Secret under advanced
settings, select the destination label/private source/content policy, then approve
access in the provider window. No access/refresh token is copied through the
browser. The existing encrypted server-account mechanism owns the resulting grant;
local social sessions are not moved.

Configure the exact public HTTPS callback in the application's redirect whitelist:

```text
https://example.com/v1/user/social-publications/deviantart/oauth/callback
```

The server derives this URI from `apiConfig.publicUrl`, or an operator can set
`DEVIANTART_OAUTH_REDIRECT_URI` when a separately hosted site proxies the callback.
The override accepts HTTPS only, the exact canonical callback path, and no
credentials, port, query or fragment. It is forwarded by Docker Compose. The
client cannot supply a callback URL. Configure the site's reverse proxy to pass
this exact GET path to the node's `/v1/user/social-publications/deviantart/oauth/callback`
route and disable proxy access logs on it to keep authorization code/state out
of URL logs. Node also suppresses its optional request access log for this path.
Do not rewrite or append query parameters.

The owner-authorized `POST /user/social-publications/deviantart/oauth/start` takes
`requestKey`, `label`, optional `sourceGroupId`, explicit `contentPolicy`, optional
`enabled` (false by default), `clientId` and `clientSecret`. It returns
`flowId`, `authorizationUrl`, `expiresAt` and the exact `redirectUri`. Open the
provider URL in a separate window and poll authenticated
`GET /user/social-publications/deviantart/oauth/:flowId` for safe status and, when
connected, the destination view. Both require UserGroupManagement plus explicit
`publishing:manage` or an owner password session. The callback itself is public,
protected by a random one-use state and S256 PKCE rather than a browser session.
There is no return-to URL or arbitrary redirect.

The new model-sync `publicationOAuthFlow` table stores hashed random state,
owner binding, ten-minute expiry and app-pass-encrypted application credentials /
PKCE verifier. No existing-table migration is required. Pending flows survive
worker restarts; callbacks claim atomically across processes and exchange the
code once. Expired pending/processing flows are scrubbed on subsequent OAuth
operations, old records are pruned, and each owner is limited to ten live flows.
Connected/failed records clear the encrypted flow secret immediately; account
credentials remain in the existing encrypted account record. Provider denial,
malformed replies, token-exchange timeout and setup rejection return generic
failure without reflecting query values or provider messages. Callback HTML has
no-store, no-referrer and a restrictive CSP. It never publishes artwork.

A crash after callback claim can leave `processing` until expiry. Reauthorize with
a fresh flow after expiration; never repeat the one-use authorization code. A
lost code-exchange response or failure to persist the new grant also requires
fresh consent. The client may stop polling when its page closes; the accepted
server callback remains bound to the original owner/setup, and the safe destination
catalog is the source of truth after completion. No automated live consent or
publication is part of deployment verification.

`test/deviantartOAuth.test.ts` verifies real PostgreSQL owner isolation, encrypted
PKCE state, concurrent callbacks, restart-before-callback, denial, expiry,
malformed/unknown outcomes, bounds and API/header/access-log protections.
