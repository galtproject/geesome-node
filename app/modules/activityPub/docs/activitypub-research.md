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

## User Content Format Direction

Research update: 2026-07-01.

ActivityPub/ActivityStreams is HTML-friendly: object `content` is HTML by default unless `mediaType` says otherwise, and `summary` is also HTML. Mastodon and Matrix make that workable by requiring strict allowlist sanitization for rendered HTML. That does not make raw HTML a good canonical GeeSome storage format.

Newer decentralized social protocols point the other way:

- Bluesky/ATProto stores plain `text` plus rich-text facets for links, mentions, and tags; markup syntax may be used by an editor, but should be stripped before publishing.
- Farcaster casts store text plus structured mentions, byte positions, and embeds.
- Nostr kind-1 text notes are plaintext and explicitly discourage Markdown/HTML markup.

Recommendation: GeeSome should store post text as a versioned semantic rich-text document, not raw HTML. HTML should be an adapter/rendering format for ActivityPub, Matrix, static sites, admin previews, and legacy clients. Plain text plus facets/tags should be exported for ATProto, Farcaster, Nostr-like networks, and other protocols that do not accept HTML as source data.

Detailed schema and adapter plan: [rich-text-content-format.md](../../../../docs/rich-text-content-format.md).

Initial canonical shape should be deliberately small:

- blocks: paragraph, line break, blockquote, code block, list, list item, and attachment references by `storageId`;
- inline text with marks: strong, emphasis, code, link, mention, hashtag, spoiler, and strike;
- metadata: schema version, optional language, attachment MIME/alt/title data, and stable source/origin IDs for imported remote content.

Do not allow arbitrary raw HTML nodes, inline styles, arbitrary classes, iframes, scripts, forms, or active content in the canonical schema. Add future features as explicit typed nodes/marks with migration, sanitizer, and protocol-adapter behavior.

Adapter policy:

- ActivityPub and Matrix: render from canonical rich text to conservative sanitized HTML, with plain text fallbacks where the target protocol expects them. Status: ActivityPub local post serialization now renders canonical rich-text HTML and emits ActivityStreams mention/hashtag tags from canonical marks; `richTextToMatrixMessageContent` exports Matrix `m.text` body/formatted_body payloads.
- Bluesky/ATProto: render plain text plus facets for links, mentions, and tags. Status: `richTextToAtProtoTextWithFacets` exports deterministic UTF-8 byte-indexed link, DID mention, and tag facets from canonical rich text; native `app/modules/bluesky` helper and read-only API groundwork now imports public `app.bsky.feed.post` text/facets back into canonical rich text and source-identity projection metadata. `BlueskyImportClient` can now feed those projections into the existing `socNetImport` contract while storing post text as canonical rich-text content instead of HTML, the first AdminAll/UserGroupManagement import route runs one public feed page through that adapter as an async social-import operation, account-level source subscription rows can store actor/filter/import preferences, stored subscriptions can refresh one public feed page manually, through the async-operation queue, or through opt-in due-subscription polling, and a bounded manual source sync verifies stored AT URIs with `com.atproto.repo.getRecord` before updating changed CIDs or soft-deleting confirmed-missing records. Credentialed import and cross-post wiring remain planned for the native ATProto phase.
- Farcaster: render plain text plus mention positions and embeds. Status: `richTextToFarcasterCast` exports CastAdd-style `text`, safe URL `embeds`, empty `embedsDeprecated`, FID `mentions`, and byte-based `mentionsPositions`; account/signer and hub submission wiring remain future work.
- Nostr-like protocols: render plaintext plus protocol tags. Status: `richTextToNostrTextNote` exports plain content with `r` link, `p` pubkey mention, and `t` hashtag tags; real account/event signing remains future work.
- Inbound ActivityPub/Matrix HTML: sanitize, normalize, and parse into canonical rich text before it can become a native editable GeeSome post. The original remote object may be stored for audit/debug, but it must not be rendered directly. Status: cached remote ActivityPub object previews expose sanitized `contentHtml`, plain `contentText`, canonical `contentRichText` converted from the sanitized content, accepted-review-gated post-draft metadata, local reply target mapping, manual native-post creation from accepted public Notes, persistent review-state decisions, and review-state filtering for review/import follow-ups.

Bluesky protocol boundary: Bluesky uses AT Protocol, not ActivityPub. ActivityPub testing against Bluesky should therefore go through an ActivityPub bridge such as Bridgy Fed and treat bridge availability/opt-in as part of the smoke result. The first user-facing ActivityPub Sources UI should follow that same boundary for the official Bluesky account preset, for example by resolving `acct:bsky.app@bsky.brid.gy` and showing honest bridge/empty/error states. Direct public Bluesky account import, timeline refresh, and cross-posting are part of the broader social interoperability plan, but they should be implemented as a separate Bluesky/ATProto module or socNet import driver that uses ATProto/XRPC APIs, the ATProto adapter output, seeded `socNetAccount` credentials when needed, and GeeSome moderation/source-identity rules. Status: the first native helper/smoke/API slices are bridge-free: `npm run bluesky:atproto-smoke` reads public author feeds through `app.bsky.feed.getAuthorFeed`, `POST /v1/admin/bluesky/public-author-feed/preview` exposes configured public-XRPC projections of `app.bsky.feed.post` records into canonical rich text plus GeeSome source identity metadata, `BlueskyImportClient` maps those projected records into the existing social-import client shape with AT URI idempotency and canonical rich-text content storage, `POST /v1/admin/bluesky/public-author-feed/import` imports one public feed page into a created/reused GeeSome social-import channel/group through an async operation, `admin/bluesky/sources` routes store native per-user subscription state, stored subscriptions can refresh one public feed page through manual, queued, or opt-in poller paths, and a bounded sync route updates or tombstones already-imported posts only after direct AT record lookup. Credentialed account ownership, frontend bridge-free feeds, and cross-posting still need explicit follow-up APIs/workers.

## Security Requirements

The ActivityPub spec leaves authentication/verification mechanisms flexible, but real Fediverse interop depends on signed HTTP requests.

Mastodon currently supports:

- Historical HTTP Signatures using the `Signature` header.
- RFC 9421 HTTP Message Signatures.
- RSA-SHA256 signatures tied to the actor's public key.
- `Digest` or `Content-Digest` on signed POST requests.
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
- `https://{nodeDomain}/.well-known/nodeinfo`
- `https://{nodeDomain}/nodeinfo/2.1`

Suggested WebFinger:

- `/.well-known/webfinger?resource=acct:{groupName}@{nodeDomain}`
- Return `application/activity+json` self link to the actor URL.

Implementation status: the first config/helper slice added explicit `activityPubConfig.enabled`, `activityPubConfig.publicUrl`, and `activityPubConfig.domain` values, sourced from `ACTIVITYPUB_ENABLED`, `ACTIVITYPUB_PUBLIC_URL`, and `ACTIVITYPUB_DOMAIN`, with `activityPubConfig.publicUrl` falling back to `https://DOMAIN` when the explicit public URL is omitted. `ACTIVITYPUB_DELIVERY_WORKER=1` enables the delivery worker, with optional `ACTIVITYPUB_DELIVERY_WORKER_INTERVAL_MS`, `ACTIVITYPUB_DELIVERY_WORKER_LIMIT`, and `ACTIVITYPUB_DELIVERY_CLAIM_TTL_MS` tuning. `ACTIVITYPUB_SOURCE_REFRESH_WORKER=1` enables queued ActivityPub source-refresh processing, with optional `ACTIVITYPUB_SOURCE_REFRESH_WORKER_INTERVAL_MS` and `ACTIVITYPUB_SOURCE_REFRESH_WORKER_LIMIT` tuning. `ACTIVITYPUB_SOURCE_REFRESH_POLLER=1` enables due-subscription polling that enqueues stale active source subscriptions without doing remote fetches inline, with optional `ACTIVITYPUB_SOURCE_REFRESH_POLLER_INTERVAL_MS`, `ACTIVITYPUB_SOURCE_REFRESH_POLLER_LIMIT`, and `ACTIVITYPUB_SOURCE_REFRESH_POLLER_STALE_MS` tuning. The helper layer normalizes the public URL, derives the domain from it when needed, and builds group actor, inbox/outbox/followers/following, shared-inbox, post-object, WebFinger resource, WebFinger URL/response data, and NodeInfo discovery/document data. It requires the group name to pass GeeSome username validation before producing an `acct:` handle.

Read-only route, key, object-record, and inbound verification status: group actor, Note, Create, `Follow`, `Accept(Follow)`, outbox collection, followers collection, following collection, and NodeInfo payload builders exist behind safety gates that reject private, encrypted, remote, deleted, draft, and personal-chat data where relevant. The dedicated `activityPub` module now exposes disabled-by-default public WebFinger, NodeInfo discovery/document, actor, outbox, followers, following, post-object, group inbox, and shared-inbox routes plus an AdminAll outbound follow request route with protocol content types. Local group actors now get model-sync-created `ActivityPubActor` records with encrypted RSA private keys, public keys are embedded in actor documents, reusable outbound RSA-SHA256 HTTP-signature helpers exist, inbound requests can be checked for HTTP Signature, signed `Digest` or `Content-Digest`, and Date freshness, `ActivityPubRemoteActor` caches fetched remote actor key/inbox metadata for signature verification and outbound follow requests, `ActivityPubFollow` stores idempotent inbound group-inbox `Follow` state plus signed embedded `Undo(Follow)`, signed `Block` cancellations, and pending outbound `Follow` requests plus signed remote `Accept(Follow)`/`Reject(Follow)` responses for outbound follows, `ActivityPubFlag` stores signed `Flag` moderation reports for local actors or known local objects and exposes AdminRead listing with local actor/post target context plus AdminAll pending/resolved state updates, `ActivityPubObject` records local post Note/Create IDs when outbox, post-object, or publish hooks run, signed shared-inbox `Create` replies to known local objects and mentions of known local group actors are stored as remote object rows for supported review object types (`Note`, `Article`, `Page`, `Image`, `Video`, `Audio`, `Document`, `Question`, and `Event`) and exposed through AdminRead remote-object review plus accepted-review-gated post-draft projection, bounded sanitized remote attachment/media metadata including media category, alt text, dimensions, duration, blurhash, sensitive flag, and embed policy, local reply target mapping, and manual native-post creation for accepted public Notes only, `ActivityPubObjectReview` stores pending/accepted/rejected admin decisions for cached remote objects, and the remote-object list can be filtered by pending/accepted/rejected state with objects that have no review row treated as pending. Signed shared-inbox `Update` refreshes cached supported remote objects, updates linked imported GeeSome Note posts when the source identity still matches and the updated object remains a public Note with sanitized content, and resets review decisions to pending; signed shared-inbox `Delete` and `Undo(Create)` tombstone cached remote objects from the same actor, soft-delete linked imported GeeSome posts when the source identity still matches, and reset review decisions to pending, and `ActivityPubDelivery` stores queued outbound `Follow`, follow `Accept`, and local post `Create(Note)` payloads. Followers routes list accepted inbound remote actor URLs, following routes list accepted outbound actor URLs once a signed remote `Accept` is recorded, post manifest updates enqueue `Create(Note)` delivery rows only for accepted followers, signed `Block` activities remove the remote actor from followers and future post delivery, signed `Flag` activities are recorded, inspectable, and manually resolvable without hiding or deleting content, imported remote posts are excluded from ActivityPub local-post federation to avoid loops, manual remote-post creation can opt into backing up supported HTTP(S), IPFS, and IPNS media/document attachments into GeeSome content storage, already-imported posts can queue async retries for missing supported attachment backups through the normal user operation queue, and `processDeliveryQueue` signs due delivery rows, sends them through an injectable/default sender, and marks them delivered, retry-pending, or failed after bounded attempts. The opt-in delivery worker drains that processor on an interval and uses DB-backed `FOR UPDATE SKIP LOCKED` claims when the model-synced claim shape is active; the geesome-ui admin review screen now consumes escaped preview/post-draft APIs for review-state changes, optional attachment backup, and manual post creation. Generic live remote-server smoke now checks a configurable Fediverse actor/public Note and feeds a signed fixture-equivalent `Create(Note)` through the GeeSome review/import harness; deeper Fedify/ActivityPub.Academy style checks remain future slices.

Local smoke status: `npm run activitypub:interop-smoke` now checks representative WebFinger, NodeInfo, actor, Note/Create, outbox filtering, content-type, sanitized rich-text, ActivityStreams tag, and attachment payloads without live network dependencies. `npm run activitypub:remote-server-smoke` is an operator-run live Fediverse smoke: it resolves a configurable WebFinger resource or direct actor URL, fetches a public Note from featured/outbox collections when available, and feeds a signed fixture-equivalent `Create(Note)` through GeeSome's existing shared-inbox storage/review/post-create path. `npm run activitypub:bluesky-bridge-smoke` adds the Bluesky boundary check through Bridgy Fed: it discovers a bridged public Bluesky actor, converts a public ATProto feed item to ActivityPub when available, and feeds that same local harness path. Remaining interop smoke refers to Fedify CLI, ActivityPub.Academy, and deeper remote-server exchange.

ActivityPub source-feed UI status/backlog: geesome-ui now has a top-level ActivityPub Sources reader where operators can subscribe to remote ActivityPub actors and read cached posts in a chronological feed, with the first preset covering the official Bluesky account via Bridgy Fed. The backend exposes source-oriented APIs instead of requiring the UI to scrape admin remote-object review routes directly: resolve actor handle/URL, list/add/update/remove subscriptions, manually or asynchronously refresh public `featured`/`outbox` source objects into the local cache, enqueue stale active subscriptions through an opt-in poller, process queued refresh jobs through the shared async-operation queue/worker, store subscription read/refresh/error state, optionally request a federation-level outbound Follow from an explicit local group actor to the subscribed source actor, and list sanitized feed items with source actor metadata, canonical rich text or escaped text, bounded attachment metadata, `embedPolicy`, remote URLs, review/import state, and optional `(publishedAt, id)` cursor pagination that skips expensive totals. Source follow acceptance reuses the existing signed remote `Accept(Follow)` handling and group following collection. Native Bluesky/ATProto import/cross-posting is now tracked as the next bridge-free phase, through a dedicated Bluesky module or socNet import driver rather than the ActivityPub module; public read/projection smoke, an admin preview API, the reusable social-import adapter, one-page async import, local source subscription CRUD, queued/polled one-page subscription refresh, and bounded imported-post update/delete sync exist, while credentialed import/cross-posting and frontend native Bluesky feed UX remain future slices. The frontend implementation plan and dual-viewport e2e/screenshot coverage live in `geesome-ui/docs/activitypub-source-feed-plan.md`.

End-user and admin usage flows are described in [activitypub-user-flows.md](./activitypub-user-flows.md). Keep that document aligned when changing federation, source-reader, native Bluesky, moderation, or cross-post behavior. The intended moderation model is configurable: admins can keep review-first mode for remote content, or enable auto-import for user-requested/trusted sources after signature/source checks, rich-text sanitization, and keyword/regex/source/group-name filters pass. Auto-import must not allow arbitrary unsolicited inbox activity to create local posts.

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
- `Create` with `Note` and other supported review object types: store remote replies/mentions in the remote-object cache, then apply the admin moderation policy. Review-first mode requires accepted public Notes before native post creation; auto-import mode can create GeeSome posts for allowed public Notes from user-requested/trusted sources after filters pass.
- `Delete`: tombstone cached remote objects.

Keep moderation-sensitive activities behind explicit storage/review/import boundaries: `Flag` stores pending reports, `Block` cancels follower delivery state, and remote `Create`/`Update` objects must pass signature, source identity, sanitization, configured moderation mode, and filter checks before becoming visible GeeSome posts.

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

Signed POST verification needs the raw request body to verify `Digest` or `Content-Digest`. The JSON parser now accepts `application/*+json` payloads and captures raw request bytes for signed/protocol-style JSON posts such as `/ap/*`, exposing them as `req.rawBody` on module inputs. ActivityPub inbox verification uses that exact buffer for signed legacy `Digest` or RFC-style `Content-Digest` verification instead of serializing the parsed body again.

ActivityPub responses should set:

- `Content-Type: application/activity+json; charset=utf-8` for actor/object/outbox/inbox collections.
- `Content-Type: application/jrd+json; charset=utf-8` for WebFinger.
- `Content-Type: application/json; charset=utf-8` for NodeInfo discovery and `application/json; profile="http://nodeinfo.diaspora.software/ns/schema/2.1#"; charset=utf-8` for NodeInfo documents.

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
- `ActivityPubFlag`: local actor id, remote actor id, activity id, reported object id, state, and raw activity JSON. Status: signed group-inbox `Flag` activities for the local group actor or known local ActivityPub objects are stored idempotently as pending moderation reports without automatic content changes, and admins can list those reports per group actor with remote actor metadata, parsed activity JSON, and derived target context for the group actor or known local post object, then mark them pending/resolved.
- `ActivityPubDelivery`: local actor id, remote actor id, optional follow id, activity id/type, inbox URL, raw JSON body, state, attempts, next attempt time, delivered/error metadata, and short-lived delivery claim timestamps. Status: outbound follow requests enqueue `Follow` payloads, accepted inbound follows enqueue `Accept(Follow)` payloads, `processDeliveryQueue` can sign/send/retry due rows, and an opt-in interval worker can drain the queue with DB-backed claims.
- `ActivityPubObject`: local post id or remote object URL, activity id, object id, type, origin, visibility, published time, and raw JSON. Status: local public group post Note/Create IDs are recorded idempotently when outbox or post-object serializers run, signed shared-inbox `Create` replies to known local objects and mentions of known local group actors are recorded idempotently as remote rows for supported review object types, AdminRead users can list and fetch actor-scoped cached remote objects per group for review with sanitized HTML/text plus canonical rich-text content previews, bounded sanitized remote attachment/media metadata and embed policy, review-state filtering, accepted-review-gated post-draft readiness, and resolved local `replyToPostId` when `inReplyTo` targets a known local object in the same group actor, AdminAll users can manually create a native remote GeeSome post from an accepted public Note using only the sanitized canonical rich-text content and remote attachment/media provenance, signed shared-inbox `Update` mutates cached supported remote rows from the same actor and updates linked imported Note posts when their source identity still matches and the updated object remains a public Note with sanitized content, signed shared-inbox `Delete` plus `Undo(Create)` tombstone cached remote rows from the same actor and soft-delete linked imported posts when their source identity still matches, and geesome-ui now exposes remote-object review/create controls. Async attachment-backup retry exists; broad interop smoke remains future work.
- `ActivityPubObjectReview`: cached remote object id, review state, reviewed time, and reviewing user id. Status: AdminAll users can mark cached remote objects pending, accepted, or rejected without changing visible GeeSome content, and AdminRead users can filter cached remote object lists by pending/accepted/rejected review state; remote `Update`, `Delete`, and `Undo(Create)` activities reset the decision to pending so changed remote content must be reviewed again.

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

Remote `Create` replies and mentions are stored as `ActivityPubObject` records when they target a known local ActivityPub object or actor and use one of the supported review object types: `Note`, `Article`, `Page`, `Image`, `Video`, `Audio`, `Document`, `Question`, or `Event`. Creating visible GeeSome posts from those records is moderation-policy-gated: review-first mode requires an accepted public `Note`; auto-import mode can create posts for allowed public Notes from user-requested/trusted sources after filters pass. Non-Note objects remain review/audit records until richer native object policies exist. Remote attachments default to provenance-only; preview/draft payloads expose bounded sanitized remote URL/media metadata such as media category, alt text, dimensions, duration, blurhash, sensitive flag, per-attachment embed policy, and remote-byte backup eligibility/reason fields, plus an explicit `attachmentImportPolicy` showing the default mode and opt-in backup mode. The initial manual or auto import creates `Post` rows with:

- `isRemote: true`
- `source: 'activityPub'`
- `sourceChannelId`: bounded `remoteActor:<id>` import identity
- `sourcePostId`: bounded `remoteObject:<id>` import identity
- `replyToId`: mapped local post if `inReplyTo` matches a known local ActivityPub object for the same group actor
- full remote actor/object/activity URLs in `propertiesJson.activityPub` for audit and UI linking
- bounded sanitized remote attachment/media metadata plus embed policy and backup eligibility in `propertiesJson.activityPub.attachments`, `propertiesJson.activityPub.attachmentImportPolicy`, and `propertiesJson.activityPub.attachmentImportMode`; when AdminAll requests `importRemoteAttachments`, supported HTTP(S), IPFS, and IPNS media/document attachments are also backed up into GeeSome content storage and recorded in `propertiesJson.activityPub.attachmentBackups`

Before any remote ActivityPub object becomes a visible GeeSome/webview post or user-facing source-feed item, review the existing post rendering path because post bodies are HTML. Store the remote raw object for audit, but render only sanitized/escaped content with an explicit allowlist for tags, attributes, links, media embeds, and IPFS/IPNS URLs. Static-site generated post text, list title/description HTML, content-list text, header/footer HTML, generated title/meta headers, and admin remote-object API preview fields now have conservative sanitizer/escaping coverage with XSS fixtures; the admin post-draft route reports sanitized rich-text readiness only for accepted, not-yet-linked remote objects plus resolved local reply targets, bounded sanitized remote attachment/media metadata with embed policy, and explicit remote attachment import policy, and the manual create route writes that canonical rich-text payload as native post content while optionally backing up supported HTTP(S), IPFS, and IPNS media/document attachments when requested. The next moderation-policy slice should add admin-configurable review-first versus auto-import behavior plus bounded keyword/regex/source/group-name filters that can block or quarantine remote content before post creation. Signed remote tombstones now soft-delete linked imported posts when their source identity still matches. The geesome-ui admin review screen renders escaped preview text and exposes review/create controls; link-preview UI policy, ActivityPub Sources feed rendering, direct webview surfaces, and auto-import/filter UI still need explicit review.

Attachments are represented first as remote URLs in `propertiesJson` with `attachmentImportPolicy.mode = 'provenanceOnly'`; each attachment now exposes an `embedPolicy` for inline media, document links, external links, or provenance-only rendering, plus whether `backupOnCreate` can fetch remote bytes with unsupported category or URL-scheme reasons for provenance-only entries. AdminAll post creation can opt into HTTP(S), IPFS, and IPNS media/document backup, and already-imported posts can queue async retries for missing supported backups; link-preview UI rendering remains follow-up policy work.

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

- The current custom module already owns GeeSome-specific route wiring, actor key storage, delivery queue semantics, remote-object review state, and moderation-gated native post creation.
- Integrating Fedify cleanly may require exposing the underlying Express service or refactoring the API module middleware path.
- Adds a major protocol framework dependency.

Recommendation: keep the current custom module for the MVP path because the repo already targets Node 22 and the custom ActivityPub layer now owns the GeeSome-specific storage/review/delivery boundary. A future Fedify spike should focus on replacing brittle protocol boilerplate, adding conformance tooling, or improving live interop diagnostics, not on a broad dependency swap inside the current review/import path.

## Suggested Delivery Plan

### Slice 0: Design And Compatibility Decision

- Decide whether the ActivityPub actor is `Group`, `Service`, or compatibility `Person`.
- Keep the custom module for the MVP; use any future Fedify work as a focused protocol-tooling or boilerplate-replacement spike.
- Define database records for actor keypairs, remote actors, follows, ActivityPub objects, and delivery attempts. Status: local actor keypair records, remote actor key/inbox cache records, inbound follow-state records, local and remote object/mention records including review-only non-Note ActivityStreams objects, queued delivery records, bounded delivery retry processor, opt-in claim-backed delivery worker, moderation-gated GeeSome post creation from accepted remote Notes, async retry queue for missing supported remote attachment backups, linked imported-post updates from signed remote Note updates, linked imported-post soft-deletes from signed remote tombstones, geesome-ui remote-object review UI, deterministic local smoke, live Bluesky bridge smoke, and generic live remote-server smoke exist; richer media/link policy and deeper conformance tooling remain future work.
- Document exact public URL shape. Status: group actor and post-object URL helpers now pin the `/ap/groups/{groupName}` and `/ap/groups/{groupName}/posts/{localId}` shapes, group inbox uses `/ap/groups/{groupName}/inbox`, followers and empty following collections use `/ap/groups/{groupName}/followers` and `/ap/groups/{groupName}/following`, shared inbox uses `/ap/shared-inbox`, WebFinger uses `acct:{groupName}@{domain}` resources, and NodeInfo uses `/.well-known/nodeinfo` plus `/nodeinfo/2.1`. The remaining design decision is whether later remote actor/follow/delivery implementation uses Fedify or the minimal custom module.

### Slice 1: Discovery And Read-Only Federation

- Implement actor document for one local group.
- Implement WebFinger.
- Implement NodeInfo discovery/document.
- Implement outbox collection from published group posts.
- Implement object dereference for federated posts.
- Add deterministic tests for JSON payloads.
- Add local deterministic interop smoke for discovery, actor, outbox, object, content-type, rich-text/tag, and attachment payloads. Status: `npm run activitypub:interop-smoke` covers this without live network dependencies.

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

- Process remote `Create` replies/mentions. Status: signed replies to known local objects and mentions of known local group actors are stored idempotently as `ActivityPubObject` rows for supported review object types and exposed through AdminRead remote-object list/detail/post-draft routes with raw parsed objects for audit plus sanitized preview fields, canonical rich-text content previews, bounded attachment/media metadata, explicit attachment import policy, accepted-review-gated import-readiness metadata, resolved local reply targets, persistent review-state decisions, pending/accepted/rejected list filtering, and AdminAll manual native-post creation from accepted public Notes only with optional supported HTTP(S), IPFS, and IPNS media/document attachment backup; signed remote Note updates can refresh already-linked imported posts when source identity still matches.
- Define and test the HTML rendering/sanitization boundary before turning cached remote objects into visible GeeSome posts. Status: static-site generated post/content-list/header/footer HTML, generated title/meta headers, and backend admin remote-object previews now sanitize or escape unsafe markup with XSS fixtures; backend manual post creation and linked-post update sync store only sanitized canonical rich text plus remote attachment metadata/embed policy/import policy and optional supported HTTP(S), IPFS, and IPNS media/document backups from public Notes, signed shared-inbox caching accepts supported non-Note object types for review/audit only, signed remote tombstones soft-delete linked imported posts, and the geesome-ui admin review screen renders escaped remote preview text. Link-preview UI policy remains future work.
- Add moderation controls. Status: the admin post-draft projection now reports whether a cached remote object is accepted, not yet linked to a local post, and a public `Note` with sanitized rich-text content ready for import, AdminAll users can persist pending/accepted/rejected review decisions and manually create the native remote post only for Notes, AdminRead users can filter the remote-object queue by review state, signed remote updates reset review state to pending and update linked imported Note posts only when source identity still matches, signed remote tombstones soft-delete linked imported posts, flag-report APIs expose local actor/post target context, and geesome-ui exposes the remote-object review/create actions. Flag-report content moderation UI/actions remain future work.
- Handle remote `Update`. Status: signed shared-inbox `Update` mutates cached supported remote object rows from the same actor and refreshes linked imported GeeSome Note posts when the source identity still matches, the cached object actually changed, and the updated object remains a public Note with sanitized content.
- Handle remote `Delete`. Status: signed shared-inbox `Delete` tombstones cached remote object rows from the same actor and soft-deletes the linked imported GeeSome post when its source identity still matches.
- Handle non-follow `Undo`. Status: signed shared-inbox `Undo(Create)` tombstones cached remote object rows from the same actor and soft-deletes the linked imported GeeSome post when its source identity still matches; other non-follow `Undo` targets remain unsupported.
- Handle `Block`. Status: signed group-inbox `Block` cancels inbound follower state for that remote actor and local group, removing it from followers and future post delivery.
- Handle `Flag`. Status: signed group-inbox `Flag` activities for the local actor or known local objects are stored as pending reports, exposed through a read-only AdminRead list route, and can be marked pending/resolved by AdminAll users; content moderation UI/actions remain future work.

## Test Strategy

- Unit tests for actor, WebFinger, Note, and Create serializers.
- Signature fixtures for inbound and outbound HTTP signatures. Status: focused unit coverage now checks outbound signing plus inbound RSA-SHA256 signature, signed `Digest`/`Content-Digest`, and Date-window verification with tamper/stale-date rejection.
- Route tests for ActivityPub content negotiation and `application/activity+json`. Status: focused unit coverage now checks the public WebFinger, NodeInfo, actor, outbox, post-object, group inbox, and shared-inbox route registrations and response content types.
- Local deterministic interop smoke. Status: `npm run activitypub:interop-smoke` checks representative WebFinger, NodeInfo, actor, Note/Create, outbox, content-type, sanitized rich-text, ActivityStreams tag, and attachment payloads before remote-server smoke.
- Live remote-server smoke. Status: `npm run activitypub:remote-server-smoke` resolves a configurable ActivityPub actor, fetches a public Note from featured/outbox collections when available, and verifies that a signed fixture-equivalent received Note reaches GeeSome's remote-object review/import path. It reports clear skips when an actor has no bridge/public Note available.
- Live Bluesky bridge smoke. Status: `npm run activitypub:bluesky-bridge-smoke` defaults to the official public `bsky.app` account, follows the Bridgy Fed ActivityPub discovery/conversion path, signs a fixture-equivalent `Create(Note)` with a disposable harness key for the bridged actor URL, and asserts local `ActivityPubRemoteActor`, `ActivityPubObject`, review, idempotency, and accepted-post creation behavior. This is a bridge-boundary smoke, not native ATProto import.
- Fedify testing utilities if Fedify is adopted.
- Manual/local federation tests with `fedify lookup`, `fedify inbox`, ActivityPub.Academy, and one Mastodon-compatible server.
- Bluesky compatibility smoke must be explicit about protocol boundaries. Bluesky uses AT Protocol, so ActivityPub exchange should be tested through a bridge such as Bridgy Fed: local GeeSome group post delivery should appear on the bridged Bluesky side, and a Bluesky reply/mention should come back as a signed ActivityPub inbox/shared-inbox activity that GeeSome stores as a remote object. The current `npm run activitypub:bluesky-bridge-smoke` covers public bridged-account discovery, public post conversion, and local shared-inbox storage/review/post-create behavior with a fixture-equivalent signature; it cleanly skips when the account is not bridge-enabled or no bridge-visible public Note is available. The native ATProto phase now also has `npm run bluesky:atproto-smoke`, which verifies unauthenticated public XRPC reads and canonical projection for configurable public handles without writing to the database, plus a read-only admin preview route for the same configured public-XRPC projection. Next direct Bluesky data-exchange slices should add a dedicated Bluesky module or socNet account path with a test `socNetAccount` database row (`socNet` set to the final Bluesky module name, test account identity, and non-production app password/OAuth credentials when writes are needed), verifying credential ownership, import/cross-post semantics, idempotency, local group/post storage, and that the direct ATProto path does not bypass ActivityPub signature/moderation gates.

## Sources

- W3C ActivityPub Recommendation: https://www.w3.org/TR/activitypub/
- W3C ActivityStreams Core: https://www.w3.org/TR/activitystreams-core/
- W3C Activity Vocabulary: https://www.w3.org/TR/activitystreams-vocabulary/
- RFC 7033 WebFinger: https://www.rfc-editor.org/rfc/rfc7033
- Mastodon ActivityPub compatibility documentation: https://docs.joinmastodon.org/spec/activitypub/
- Mastodon WebFinger documentation: https://docs.joinmastodon.org/spec/webfinger/
- Mastodon security/signature documentation: https://docs.joinmastodon.org/spec/security/
- AT Protocol FAQ: https://atproto.com/guides/faq
- Bluesky AT Protocol guide: https://docs.bsky.app/docs/advanced-guides/atproto
- Official Bluesky account: https://bsky.app/profile/bsky.app
- Bridgy Fed docs: https://fed.brid.gy/docs
- Fedify documentation: https://fedify.dev/
