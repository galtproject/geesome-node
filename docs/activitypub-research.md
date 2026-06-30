# ActivityPub/Fediverse Research

Research date: 2026-05-03.

## Why This Matters

ActivityPub is the main interoperability path for GeeSome to participate in the Fediverse. It should be treated as a protocol feature, not a social-network importer. The first goal should be public federation for GeeSome groups and posts while preserving GeeSome's IPFS/IPNS storage model.

## Standards Baseline

ActivityPub is a W3C Recommendation from 2018. It defines:

- A server-to-server federation protocol.
- A client-to-server social API.
- Actors with `inbox` and `outbox` URLs.
- ActivityStreams 2.0 objects and activities such as `Create`, `Note`, `Follow`, `Accept`, `Delete`, `Like`, and `Announce`.

For GeeSome, the server-to-server federation profile is the important first slice. Client-to-server ActivityPub can wait because GeeSome already has its own API and UI.

WebFinger is required for practical Mastodon-style discovery. A remote server needs to resolve a handle such as `@group@example.com` or `acct:group@example.com` into the actor URL. That means GeeSome needs `/.well-known/webfinger` before Mastodon-grade interop will feel real.

## Fediverse Compatibility Baseline

Mastodon is not the whole Fediverse, but it is the compatibility floor worth testing against first.

For statuses, Mastodon handles:

- `Create`, `Delete`, `Like`, `Announce`, `Update`, `Undo`, `Flag`, and quote-related extensions.
- `Note` and `Question` as first-class objects.
- `Article`, `Page`, `Image`, `Audio`, `Video`, and `Event` as best-effort object types.
- `content`, `name`, `summary`, `sensitive`, `inReplyTo`, `published`, `url`, `attributedTo`, `to`, `cc`, and `tag`.

Good news for GeeSome: Mastodon explicitly allows `ipfs` and `ipns` link protocols during HTML sanitization, so GeeSome can include IPFS/IPNS canonical links in posts. For broad compatibility, each ActivityPub object should still also have an HTTPS dereferenceable `id` and `url` hosted by the GeeSome node/gateway.

For profiles, Mastodon expects actor fields such as:

- `preferredUsername`
- `name`
- `summary`
- `url`
- `icon`
- `image`
- `publicKey`
- `featured`
- `manuallyApprovesFollowers`
- `discoverable`

## Security Requirements

The ActivityPub spec leaves authentication/verification mechanisms flexible, but real Fediverse interop depends on signed HTTP requests.

Mastodon currently supports:

- Historical HTTP Signatures using the `Signature` header.
- RFC 9421 HTTP Message Signatures.
- RSA-SHA256 signatures tied to the actor's public key.
- `Digest` on signed POST requests.
- Date freshness checks for signed requests.

Recommended GeeSome MVP:

- Generate one ActivityPub signing key pair per local actor.
- Publish the public key on the actor object.
- Store the private key server-side as an operational delivery key, separate from chat E2EE private keys.
- Sign outbound delivery requests.
- Verify inbound signed POSTs before processing inbox activities.
- Do not implement Linked Data Signatures for the first slice; Mastodon itself advises against relying on them for new work.

Important boundary: ActivityPub signing keys are server-side federation identity keys. They are not user chat encryption keys and must not be confused with frontend-held E2EE keys.

## Actor Mapping For GeeSome

Likely actors:

- GeeSome group/channel as an ActivityPub actor.
- GeeSome node/system actor for service-level signed requests or administration.
- User actors later, if personal accounts need federation.

Actor type choice:

- `Group` is semantically right for GeeSome groups.
- `Service` or `Application` can fit node-level actors.
- `Person` may interoperate more predictably with Mastodon account assumptions, but it is semantically weaker for channels/groups.

Recommendation: start with `Group` for group/channel actors, then verify against Mastodon, Fedify tooling, and ActivityPub.Academy. If Mastodon UX is poor, add a compatibility mode for channel-like actors.

Suggested local actor URL shape:

- `https://{nodeDomain}/ap/groups/{groupName}`
- `https://{nodeDomain}/ap/groups/{groupName}/inbox`
- `https://{nodeDomain}/ap/groups/{groupName}/outbox`
- `https://{nodeDomain}/ap/groups/{groupName}/followers`
- `https://{nodeDomain}/ap/groups/{groupName}/following`
- `https://{nodeDomain}/ap/shared-inbox`

Suggested WebFinger:

- `/.well-known/webfinger?resource=acct:{groupName}@{nodeDomain}`
- Return `application/activity+json` self link to the actor URL.

Implementation status: the first config/helper slice added explicit `activityPubConfig.enabled`, `activityPubConfig.publicUrl`, and `activityPubConfig.domain` values, sourced from `ACTIVITYPUB_ENABLED`, `ACTIVITYPUB_PUBLIC_URL`, and `ACTIVITYPUB_DOMAIN`. `ACTIVITYPUB_DELIVERY_WORKER=1` enables the delivery worker, with optional `ACTIVITYPUB_DELIVERY_WORKER_INTERVAL_MS`, `ACTIVITYPUB_DELIVERY_WORKER_LIMIT`, and `ACTIVITYPUB_DELIVERY_CLAIM_TTL_MS` tuning. The helper layer normalizes the public URL, derives the domain from it when needed, and builds group actor, inbox/outbox/followers/following, shared-inbox, post-object, WebFinger resource, WebFinger URL, and WebFinger response data. It requires the group name to pass GeeSome username validation before producing an `acct:` handle.

Read-only route, key, object-record, and inbound verification status: group actor, Note, Create, `Follow`, `Accept(Follow)`, outbox collection, followers collection, and following collection payload builders exist behind safety gates that reject private, encrypted, remote, deleted, draft, and personal-chat data. The dedicated `activityPub` module now exposes disabled-by-default public WebFinger, actor, outbox, followers, following, post-object, group inbox, and shared-inbox routes plus an AdminAll outbound follow request route with protocol content types. Local group actors now get model-sync-created `ActivityPubActor` records with encrypted RSA private keys, public keys are embedded in actor documents, reusable outbound RSA-SHA256 HTTP-signature helpers exist, inbound requests can be checked for HTTP Signature, `Digest`, and Date freshness, `ActivityPubRemoteActor` caches fetched remote actor key/inbox metadata for signature verification and outbound follow requests, `ActivityPubFollow` stores idempotent inbound group-inbox `Follow` state plus signed embedded `Undo(Follow)`, signed `Block` cancellations, and pending outbound `Follow` requests plus signed remote `Accept(Follow)`/`Reject(Follow)` responses for outbound follows, `ActivityPubFlag` stores signed `Flag` moderation reports for local actors or known local objects and exposes AdminRead listing plus AdminAll pending/resolved state updates, `ActivityPubObject` records local post Note/Create IDs when outbox, post-object, or publish hooks run, signed shared-inbox `Create(Note)` replies to known local objects and mentions of known local group actors are stored as remote object rows and exposed through AdminRead remote-object review, signed shared-inbox `Update(Note)` updates cached remote objects, signed shared-inbox `Delete` and `Undo(Create)` tombstone cached remote objects from the same actor, and `ActivityPubDelivery` stores queued outbound `Follow`, follow `Accept`, and local post `Create(Note)` payloads. Followers routes list accepted inbound remote actor URLs, following routes list accepted outbound remote actor URLs once a signed remote `Accept` is recorded, post manifest updates enqueue `Create(Note)` delivery rows only for accepted followers, signed `Block` activities remove the remote actor from followers and future post delivery, signed `Flag` activities are recorded, inspectable, and manually resolvable without hiding or deleting content, and `processDeliveryQueue` signs due delivery rows, sends them through an injectable/default sender, and marks them delivered, retry-pending, or failed after bounded attempts. The opt-in delivery worker drains that processor on an interval and uses DB-backed `FOR UPDATE SKIP LOCKED` claims when the model-synced claim shape is active; broader shared-inbox activity handling, content moderation actions, and GeeSome post creation/update/deletion from remote objects remain future slices.

## Post Mapping

GeeSome public post to ActivityPub:

- Activity: `Create`
- Object: `Note` for short/status-like posts; consider `Article` for long-form/static-site posts later.
- Actor: group actor URL.
- `attributedTo`: group actor URL, optionally with original author metadata in extensions later.
- `content`: sanitized HTML/plain text preview.
- `url`: HTTPS permalink on the GeeSome node/gateway.
- `attachment`: media/content links with MIME type, dimensions, and IPFS/IPNS canonical links where useful.
- `published`: `publishedAt`.
- `to`: public collection or followers collection, depending on group visibility.
- `cc`: followers collection or mentions.
- `inReplyTo`: mapped when GeeSome replies/threading are exposed.

ActivityPub IDs must be stable HTTPS URLs. IPFS/IPNS hashes can be canonical content references, but should not replace dereferenceable HTTPS actor/object IDs for federation.

Current repo mapping:

- `app/modules/group/index.ts` is the source of truth for group and post creation. `createGroup()` creates static IDs; `createPost()` assigns `localId`, stores author/group static IDs, sets contents, generates post/group manifests, and updates the group manifest.
- `app/modules/group/models/group.ts` already stores `name`, `title`, `description`, `homePage`, `type`, `isPublic`, `isOpen`, `isRemote`, `avatarImageId`, `coverImageId`, `manifestStorageId`, and `manifestStaticStorageId`. These fields map cleanly to actor profile fields.
- `app/modules/group/models/post.ts` already stores `publishedAt`, `localId`, `replyToId`, `repostOfId`, `source`, `sourceChannelId`, `sourcePostId`, `manifestStorageId`, `groupStaticStorageId`, `authorStaticStorageId`, and content relations. These fields are enough for read-only outbox serialization and future inbound idempotency.
- `app/modules/group/index.ts#getPostContentDataWithUrl()` already prepares ordered post contents with text/image/video typing and URLs. ActivityPub serializers should reuse this instead of re-reading `Content` directly.
- `app/modules/entityJsonManifest/index.ts` is GeeSome/IPFS manifest logic. ActivityPub should reference those manifests, but should not be implemented inside this module because ActivityPub needs HTTP actor/object URLs, WebFinger, signatures, inbox/outbox state, and delivery queues.

## Inbox MVP

Handle only the smallest useful inbound set first:

- `Follow`: store remote actor metadata, create follow request or auto-accept for public groups.
- `Undo` of `Follow`: remove follower.
- `Accept`/`Reject`: record follow state for outbound follows when signed by the remote actor and matched to a stored outbound `Follow` activity.
- `Create` with `Note`: optional later, for remote replies/mentions.
- `Delete`: optional later, tombstone cached remote objects.

Avoid implementing moderation-sensitive activities such as `Flag`, `Block`, and rich remote replies until the storage and moderation model is explicit.

## Outbox MVP

Read-only first:

- Actor document.
- WebFinger.
- Followers/following empty or real collections.
- Outbox collection from published group posts.
- Object dereference endpoint for each federated group post.

Delivery second:

- On post publish, create `Create(Note)` and deliver to followers. Status: post manifest completion calls an ActivityPub hook that records the local object and queues one delivery row per accepted follower.
- Use shared inbox when available. Status: delivery rows prefer remote `sharedInboxUrl` and fall back to actor `inboxUrl`.
- Queue delivery through a dedicated queue so publish actions do not block on remote servers. Status: publishing enqueues `ActivityPubDelivery` rows; the opt-in worker sends them later.

In this repo, start with read-only outbox endpoints and add delivery after that. `updatePostManifest()` now calls a post-manifest hook after the post/group manifests are refreshed; the ActivityPub module uses that hook to enqueue delivery for published, public, non-encrypted posts. Do not send federation requests inline from `createPost()`.

Only federate posts that satisfy all of these conditions in the first slice:

- `post.status === PostStatus.Published`
- `post.isDeleted !== true`
- `group.isPublic === true`
- `group.isEncrypted !== true`
- `group.type !== GroupType.PersonalChat`

This avoids leaking private, deleted, or PoC-encrypted chat content.

## Where To Implement In geesome-node

Add a new module under `app/modules/activityPub/`:

- `index.ts`: build the module, require `api`, `database`, `group`, `content`, and probably `asyncOperation`.
- `api.ts`: register WebFinger, actor, inbox, shared inbox, outbox, followers/following, and object routes.
- `interface.ts`: expose serializer and inbox/delivery methods used by tests and future hooks.
- `models.ts` or `models/index.ts`: define ActivityPub-specific Sequelize models.
- Optional `httpSignatures.ts`, `serializers.ts`, and `delivery.ts` helpers once implementation starts.

Add the module to `app/config.ts` after `group`, `content`, and `asyncOperation` are available. A small `federation` pack would be clean, but adding `activityPub` to `modulePacks.improve` is the least disruptive first move.

Extend `IGeesomeApp.ms` in `app/interface.ts` with an optional `activityPub` property once the module exists. Current typings only list core modules and already omit some optional modules, so this is not a blocker for a docs/design PR but should be fixed during implementation.

Do not overload `remoteGroup` for ActivityPub. `remoteGroup` imports GeeSome manifests by IPFS/IPNS static IDs. ActivityPub remote actors, follows, inbox activities, and delivery records need their own model because their identifiers are HTTPS ActivityPub IDs and their trust model is signed HTTP, not GeeSome static IDs.

## Required Model And API Adjustments

The existing GeeSome `Group`, `Post`, and `Content` models are useful domain sources, but they are not sufficient ActivityPub records. ActivityPub needs stable HTTPS identities, remote actor cache, follow state, signature keys, object ID mapping, and delivery retries. Add these as an adapter layer instead of mixing many federation-only columns into GeeSome's core models.

Required model changes:

- Keep `Group` and `Post` as GeeSome/IPFS domain models.
- Add dedicated ActivityPub models listed below.
- Store server-side ActivityPub signing keys separately from chat/E2EE keys.
- Store both ActivityPub activity IDs and object IDs, because a `Create` activity ID and its `Note` object ID are distinct.
- Store delivery state per remote inbox/shared inbox, not on `Post`.
- Store remote actors by canonical actor URL and cache their inbox/sharedInbox/publicKey data.

Required API changes:

- Add unversioned POST route support for ActivityPub inbox endpoints.
- Preserve raw request bodies for signed POST verification.
- Return ActivityPub/WebFinger content types.
- Use absolute HTTPS URLs from explicit ActivityPub config.
- Keep ActivityPub routes outside `/v1`; federation peers expect public protocol URLs, not GeeSome API versioning.

Do not federate directly from the existing public `group/:groupId/posts` endpoint. That endpoint can stay GeeSome API shape. ActivityPub should expose separate actor, collection, and object endpoints that serialize the same underlying group/post data into ActivityStreams JSON-LD.

### API Layer Changes Needed

The API wrapper in `app/modules/api/index.ts` supports:

- versioned GET/POST/HEAD through `/v1/...`
- unversioned GET/POST/HEAD through `/...`

ActivityPub needs unversioned POST for actor inbox and shared inbox routes:

- `POST /ap/groups/:groupName/inbox`
- `POST /ap/shared-inbox`

`IGeesomeApiModule.onUnversionPost()` is available for these routes and through `prefix()`.

Signed POST verification needs the raw request body to verify `Digest`/`Content-Digest`. The JSON parser now accepts `application/*+json` payloads and captures raw request bytes for signed/protocol-style JSON posts such as `/ap/*`, exposing them as `req.rawBody` on module inputs. ActivityPub inbox verification uses that exact buffer for HTTP digest/signature verification instead of serializing the parsed body again; `Content-Digest` support remains future work.

ActivityPub responses should set:

- `Content-Type: application/activity+json; charset=utf-8` for actor/object/outbox/inbox collections.
- `Content-Type: application/jrd+json; charset=utf-8` for WebFinger.

The current response wrapper can set headers, so the ActivityPub module can do this directly.

### URL And Domain Config

ActivityPub requires stable absolute HTTPS IDs. Current code often derives public links ad hoc from request host or storage routes. Add explicit config for the public federation origin, for example:

- `activityPub.publicUrl`
- `activityPub.domain`
- `activityPub.enabled`

Do not derive canonical actor IDs from `PORT`, internal Docker hostnames, or forwarded local test URLs except in test mode. If GeeSome runs behind nginx/Cloudflare, the public URL must match the domain used for WebFinger and signatures.

### Database Models

Use ActivityPub-specific models instead of adding many nullable columns to `Group` and `Post`:

- `ActivityPubActor`: local actor binding, `entityType`, `entityId`, `preferredUsername`, `actorUrl`, `inboxUrl`, `outboxUrl`, `followersUrl`, `followingUrl`, `privateKeyPemEncrypted`, `publicKeyPem`, `isEnabled`. Status: local group actor rows and signing keys exist.
- `ActivityPubRemoteActor`: remote `actorUrl`, `publicKeyId`, `preferredUsername`, `domain`, `inboxUrl`, `sharedInboxUrl`, `publicKeyPem`, `lastFetchedAt`, `rawJson`. Status: fetched remote actor key/inbox metadata is cached for inbox signature verification.
- `ActivityPubFollow`: local actor id, remote actor id, direction, state, remote activity id, accepted/rejected timestamps. Status: signed inbound group-inbox `Follow` activities are persisted idempotently, accepted follows enqueue outbound `Accept(Follow)` delivery rows, signed embedded `Undo(Follow)` or signed `Block` moves inbound follow state to cancelled so follower collections and future post delivery exclude it, AdminAll users can create pending outbound follows that enqueue signed `Follow` delivery rows, and signed remote `Accept(Follow)`/`Reject(Follow)` responses update matching outbound follows.
- `ActivityPubFlag`: local actor id, remote actor id, activity id, reported object id, state, and raw activity JSON. Status: signed group-inbox `Flag` activities for the local group actor or known local ActivityPub objects are stored idempotently as pending moderation reports without automatic content changes, and admins can list those reports per group actor or mark them pending/resolved.
- `ActivityPubDelivery`: local actor id, remote actor id, optional follow id, activity id/type, inbox URL, raw JSON body, state, attempts, next attempt time, delivered/error metadata, and short-lived delivery claim timestamps. Status: outbound follow requests enqueue `Follow` payloads, accepted inbound follows enqueue `Accept(Follow)` payloads, `processDeliveryQueue` can sign/send/retry due rows, and an opt-in interval worker can drain the queue with DB-backed claims.
- `ActivityPubObject`: local post id or remote object URL, activity id, object id, type, origin, visibility, published time, and raw JSON. Status: local public group post Note/Create IDs are recorded idempotently when outbox or post-object serializers run, signed shared-inbox `Create(Note)` replies to known local objects and mentions of known local group actors are recorded idempotently as remote rows, AdminRead users can list cached remote objects per group actor for review, signed shared-inbox `Update(Note)` mutates cached remote rows from the same actor, and signed shared-inbox `Delete` plus `Undo(Create)` tombstone cached remote rows from the same actor. Creating, updating, or deleting visible GeeSome posts from remote objects remains future work.

The current code uses `Model.sync({})` in module model files. While ActivityPub tables are still unreleased `dev` work, keep iterative table, column, and index changes in the model definition instead of committing temporary migrations; fresh dev tables receive the current shape through model sync, and older dev/local tables without newer optional columns should keep safe runtime fallbacks. Before promoting ActivityPub beyond dev, add release migrations for any schema changes that must upgrade deployed production tables.

### Serializer Reuse Points

ActivityPub serializers should depend on module methods rather than raw model queries where possible:

- Actor serializer: `group.getGroupByParams({name})` or `group.getGroup(id)` with avatar/cover includes.
- Outbox serializer: `group.getGroupPosts(group.id, {status: PostStatus.Published, isDeleted: false}, listParams)`.
- Object serializer: `group.getGroupPostRefsByLocalIds(...)` to resolve the public local ID, then `group.getGroupPosts(...)` for the hydrated published post.
- Content serializer: `group.getPostContentDataWithUrl(post, `${publicUrl}/ipfs/`)`.

Use existing `localId` for human-readable/stable post paths. Suggested object URL:

- `https://{domain}/ap/groups/{groupName}/posts/{localId}`

Keep `post.manifestStorageId`, `post.directoryStorageId`, and content `storageId` as ActivityPub `url`/attachment links, not as ActivityPub `id`.

### Delivery Queue

`asyncOperation` is user-facing and useful for long-running imports/renders, but ActivityPub delivery is service-level retry work. Keep the dedicated `ActivityPubDelivery` queue, `processDeliveryQueue` processor, and opt-in `activityPub/cron.ts` worker for both `Accept(Follow)` and `Create(Note)` delivery. The worker is disabled by default and enabled with `ACTIVITYPUB_DELIVERY_WORKER=1`.

Delivery claims mirror the auto-action claim pattern for row selection. Fresh model-sync tables include the claim columns/index; older dev/local tables without the unreleased claim shape keep the previous bounded fallback path until recreated or adjusted before release. With claims active, due delivery selection uses `FOR UPDATE SKIP LOCKED`.

If implementation needs a shortcut for the first outbound delivery spike, `asyncOperation.addUserOperationQueue()` can prove the concept, but it should not be the long-term delivery queue because remote inbox retries are not user file operations.

### Inbound Activity Handling

Inbound `Follow` can map to GeeSome group followers without making the remote actor a GeeSome group. For the first slice:

- Resolve and store remote actor metadata in `ActivityPubRemoteActor`. Status: key/inbox metadata is cached.
- Store idempotent inbound follow state in `ActivityPubFollow`. Status: group inbox `Follow` activities are persisted when the signed actor matches a fetched remote actor and the `object` is the local group actor; signed embedded `Undo(Follow)` cancels that state when the embedded Follow actor and object match.
- If local group is public, auto-accept and create `ActivityPubFollow`.
- If local group is not public, reject or leave pending until moderation UI exists.

Remote `Create(Note)` replies and mentions are currently stored only as `ActivityPubObject` records when they target a known local ActivityPub object or actor. Creating visible GeeSome posts from those replies should wait until moderation is explicit. When added, they can create `Post` rows with:

- `isRemote: true`
- `source: 'activitypub'`
- `sourceChannelId`: remote actor URL
- `sourcePostId`: remote object URL
- `replyToId`: mapped local post if `inReplyTo` matches a known ActivityPub object

Before any remote ActivityPub object becomes a visible GeeSome/webview post, review the existing post rendering path because post bodies are HTML. Store the remote raw object for audit, but render only sanitized/escaped content with an explicit allowlist for tags, attributes, links, media embeds, and IPFS/IPNS URLs. The safety pass should cover local text posts, remote ActivityStreams `content`, static-site/webview rendering, and admin remote-object previews, with regression fixtures for `<script>`, event handlers, `javascript:` URLs, iframe/object/embed tags, CSS injection, malformed HTML, and oversized markup.

Attachments can be represented first as remote URLs in `propertiesJson`; importing them into GeeSome/IPFS content should be a later, explicit backup feature.

## Implementation Options

### Custom Minimal Module

Pros:

- Fits the current `app.ms.api` route wrapper.
- Avoids raising the runtime requirement immediately.
- Lets the first slice stay small and testable.

Cons:

- Must implement WebFinger, ActivityStreams serialization, HTTP Signatures/RFC 9421, key storage, delivery queues, and interop edge cases carefully.
- Easy to drift into an incomplete Mastodon-compatible subset.

### Fedify

Fedify is a TypeScript ActivityPub server framework with WebFinger, Activity Vocabulary objects, HTTP Signatures, HTTP Message Signatures, NodeInfo, framework integration, testing utilities, and CLI debugging.

Pros:

- Covers the brittle federation boilerplate.
- Has Express integration and testing utilities.
- Reduces risk around signatures and ActivityStreams shape.

Cons:

- Current `@fedify/fedify` 2.2.0 declares Node `>=22.0.0`; `geesome-node` currently declares Node `>=18`.
- Integrating Fedify cleanly may require exposing the underlying Express service or refactoring the API module middleware path.
- Adds a major protocol framework dependency.

Recommendation: create a short Fedify spike before implementation. If Node 22 is acceptable for the GeeSome stack, use Fedify for the federation layer. If Node 18 compatibility must stay, either pin/research an older Fedify line with Node 18 support or implement a minimal custom module with strong signature tests.

## Suggested Delivery Plan

### Slice 0: Design And Compatibility Decision

- Decide whether the ActivityPub actor is `Group`, `Service`, or compatibility `Person`.
- Decide whether runtime can move to Node 22 for Fedify.
- Define database records for actor keypairs, remote actors, follows, ActivityPub objects, and delivery attempts. Status: local actor keypair records, remote actor key/inbox cache records, inbound follow-state records, local and remote object/mention records, queued delivery records, bounded delivery retry processor, and opt-in claim-backed delivery worker exist; creating GeeSome posts from remote objects remains future work.
- Document exact public URL shape. Status: group actor and post-object URL helpers now pin the `/ap/groups/{groupName}` and `/ap/groups/{groupName}/posts/{localId}` shapes, group inbox uses `/ap/groups/{groupName}/inbox`, followers and empty following collections use `/ap/groups/{groupName}/followers` and `/ap/groups/{groupName}/following`, shared inbox uses `/ap/shared-inbox`, and WebFinger uses `acct:{groupName}@{domain}` resources. The remaining design decision is whether later remote actor/follow/delivery implementation uses Fedify or the minimal custom module.

### Slice 1: Discovery And Read-Only Federation

- Implement actor document for one local group.
- Implement WebFinger.
- Implement outbox collection from published group posts.
- Implement object dereference for federated posts.
- Add deterministic tests for JSON payloads.

### Slice 2: Follow Graph

- Accept inbound `Follow` for public groups. Status: signed group-inbox `Follow` activities are stored idempotently.
- Send `Accept`. Status: accepted follows enqueue an `Accept(Follow)` delivery row targeting the remote shared inbox or actor inbox, and the opt-in worker can sign/send/retry queued rows.
- Store followers and remote actor metadata. Status: remote actor cache records and inbound follow records exist.
- Expose followers collection. Status: public followers route lists accepted inbound remote actor URLs.
- Send outbound `Follow`. Status: AdminAll users can request a local group actor to follow a remote ActivityPub actor; the remote actor is fetched/cached, an outbound pending follow row is stored idempotently, and a signed `Follow` delivery is queued.
- Expose following collection. Status: public following route lists accepted outbound follows; pending and rejected outbound follows stay hidden until a signed remote `Accept` is recorded.
- Handle inbound `Accept`/`Reject` for outbound follows. Status: signed group-inbox responses update the matching outbound follow only when the response references the stored local `Follow` activity.
- Handle `Undo(Follow)`. Status: signed embedded `Undo(Follow)` cancels the stored inbound follow so the actor is removed from followers and no longer receives new post deliveries.

### Slice 3: Outbound Delivery

- Sign POST requests.
- Deliver `Create(Note)` to follower inbox/sharedInbox. Status: post manifest updates enqueue idempotent `Create(Note)` delivery rows for accepted followers.
- Queue retries and record delivery failures. Status: the shared delivery processor handles bounded attempts and retry/failure metadata.

### Slice 4: Remote Replies And Moderation

- Process remote `Create(Note)` replies/mentions. Status: signed replies to known local objects and mentions of known local group actors are stored idempotently as `ActivityPubObject` rows and exposed through an AdminRead remote-object list; moderation and GeeSome post creation remain future work.
- Define and test the HTML rendering/sanitization boundary before turning cached remote objects into visible GeeSome posts. This must cover webview/static-site post rendering, admin review previews, ActivityStreams `content`, local text posts, allowed HTML/media/link policy, and XSS fixtures.
- Add moderation controls.
- Handle remote `Update(Note)`. Status: signed shared-inbox `Update(Note)` mutates cached remote object rows from the same actor; updating visible GeeSome posts from remote objects remains future moderation work.
- Handle remote `Delete`. Status: signed shared-inbox `Delete` tombstones cached remote object rows from the same actor; deleting visible GeeSome posts from remote objects remains future moderation work.
- Handle non-follow `Undo`. Status: signed shared-inbox `Undo(Create)` tombstones cached remote object rows from the same actor; other non-follow `Undo` targets remain unsupported.
- Handle `Block`. Status: signed group-inbox `Block` cancels inbound follower state for that remote actor and local group, removing it from followers and future post delivery.
- Handle `Flag`. Status: signed group-inbox `Flag` activities for the local actor or known local objects are stored as pending reports, exposed through a read-only AdminRead list route, and can be marked pending/resolved by AdminAll users; content moderation UI/actions remain future work.

## Test Strategy

- Unit tests for actor, WebFinger, Note, and Create serializers.
- Signature fixtures for inbound and outbound HTTP signatures. Status: focused unit coverage now checks outbound signing plus inbound RSA-SHA256 signature, `Digest`, and Date-window verification with tamper/stale-date rejection.
- Route tests for ActivityPub content negotiation and `application/activity+json`. Status: focused unit coverage now checks the public WebFinger, actor, outbox, post-object, group inbox, and shared-inbox route registrations and response content types.
- Fedify testing utilities if Fedify is adopted.
- Manual/local federation tests with `fedify lookup`, `fedify inbox`, ActivityPub.Academy, and one Mastodon-compatible server.
- Bluesky compatibility smoke must be explicit about protocol boundaries. Bluesky uses AT Protocol, so ActivityPub exchange should be tested through a bridge such as Bridgy Fed: local GeeSome group post delivery should appear on the bridged Bluesky side, and a Bluesky reply/mention should come back as a signed ActivityPub inbox/shared-inbox activity that GeeSome stores as a remote object. Separately, test any direct Bluesky/ATProto data exchange through the socNet account path with a test `socNetAccount` database row (`socNet` set to the final Bluesky module name, test account identity, and non-production app password/OAuth credentials), verifying credential ownership, import/cross-post semantics, idempotency, and that the direct ATProto path does not bypass ActivityPub signature/moderation gates.

## Sources

- W3C ActivityPub Recommendation: https://www.w3.org/TR/activitypub/
- W3C ActivityStreams Core: https://www.w3.org/TR/activitystreams-core/
- W3C Activity Vocabulary: https://www.w3.org/TR/activitystreams-vocabulary/
- RFC 7033 WebFinger: https://www.rfc-editor.org/rfc/rfc7033
- Mastodon ActivityPub compatibility documentation: https://docs.joinmastodon.org/spec/activitypub/
- Mastodon WebFinger documentation: https://docs.joinmastodon.org/spec/webfinger/
- Mastodon security/signature documentation: https://docs.joinmastodon.org/spec/security/
- Fedify documentation: https://fedify.dev/
- Bluesky AT Protocol documentation: https://docs.bsky.app/docs/advanced-guides/atproto
- Bridgy Fed bridge documentation: https://fed.brid.gy/docs
