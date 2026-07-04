import {IGeesomeApp} from '../../interface.js';
import {CorePermissionName} from '../database/interface.js';
import IGeesomeBlueskyModule from './interface.js';

export default (app: IGeesomeApp, blueskyModule: IGeesomeBlueskyModule) => {
	/**
	 * @api {post} /v1/soc-net/bluesky/login Connect Bluesky account
	 * @apiName UserBlueskyLogin
	 * @apiGroup UserBluesky
	 *
	 * @apiUse ApiKey
	 * @apiUse AuthErrors
	 *
	 * @apiDescription Verifies a Bluesky/ATProto app password by creating an authenticated XRPC session, reads the account profile, and stores or updates a user-scoped `socNetAccount` row with `socNet=bluesky`. The plaintext app password is never returned. If `isEncrypted=true`, pass `encryptedApiKey`; the route still needs the plaintext app password only for this verification request.
	 * @apiBody {String} identifier Bluesky handle, DID, or login identifier.
	 * @apiBody {String} [appPassword] Bluesky app password. Alias: `password` or `apiKey`.
	 * @apiBody {Object} [accountData] Optional existing account selector.
	 * @apiBody {Number} [accountData.id] Existing local social account id to update.
	 * @apiBody {Boolean} [isEncrypted=false] Whether the stored API key is already encrypted by the caller.
	 * @apiBody {String} [encryptedApiKey] Encrypted app password to store when `isEncrypted=true`.
	 * @apiSuccess {Object} account Secret-free local account summary with `hasApiKey` flags.
	 * @apiSuccess {Object} profile Current Bluesky profile returned by ATProto.
	 * @apiSuccess {String} did Authenticated account DID.
	 * @apiSuccess {String} [handle] Current Bluesky handle.
	 */
	app.ms.api.onAuthorizedPost('soc-net/bluesky/login', async (req, res) => {
		return res.send(await blueskyModule.loginAccount(req.user.id, req.body || {}));
	});

	/**
	 * @api {post} /v1/soc-net/bluesky/verify-account Verify Bluesky account
	 * @apiName UserBlueskyVerifyAccount
	 * @apiGroup UserBluesky
	 *
	 * @apiUse ApiKey
	 * @apiUse AuthErrors
	 *
	 * @apiDescription Verifies that a stored user-scoped Bluesky `socNetAccount` still authenticates to the same ATProto DID/handle. Unencrypted stored app passwords can be used directly; encrypted accounts must pass the plaintext app password for this request. The route does not create posts, update remote records, or expose secret material.
	 * @apiBody {Object} accountData Account selector.
	 * @apiBody {Number} [accountData.id] Local social account id.
	 * @apiBody {String} [accountData.accountId] Stored Bluesky DID.
	 * @apiBody {String} [accountData.username] Stored Bluesky handle.
	 * @apiBody {String} [appPassword] Optional app password override. Alias: `password` or `apiKey`.
	 * @apiSuccess {Object} account Secret-free local account summary with `hasApiKey` flags.
	 * @apiSuccess {Object} profile Current Bluesky profile returned by ATProto.
	 * @apiSuccess {String} did Authenticated account DID.
	 * @apiSuccess {String} [handle] Current Bluesky handle.
	 */
	app.ms.api.onAuthorizedPost('soc-net/bluesky/verify-account', async (req, res) => {
		return res.send(await blueskyModule.verifyAccount(req.user.id, req.body || {}));
	});

	/**
	 * @api {post} /v1/soc-net/bluesky/posts/:postId/cross-post Cross-post GeeSome post to Bluesky
	 * @apiName UserBlueskyCrossPost
	 * @apiGroup UserBluesky
	 *
	 * @apiUse ApiKey
	 * @apiUse AuthErrors
	 *
	 * @apiDescription Creates an authenticated native ATProto `app.bsky.feed.post` record from one published local GeeSome post and stores the returned Bluesky URI/CID in the post `propertiesJson` for idempotency. The write path supports text/rich-text facets plus up to four supported image media/attachments. Images are uploaded as ATProto blobs before record creation; if blob upload fails and `BLUESKY_PUBLIC_URL`, `ACTIVITYPUB_PUBLIC_URL`, or `DOMAIN` is configured, GeeSome adds the public image URL as a link fallback and uses a Bluesky external card when no image embed succeeded. Storage-backed non-image media/attachments are added as public link facets and can become a Bluesky external card when there is exactly one fallback link and no image embed. JSON link-preview records with safe `http(s)` URLs are added as link facets and can become an external card; unsafe link-preview URLs, encrypted posts, remote/imported posts, unpublished posts, non-public groups, and attachments without a public node URL are rejected until richer publishing policy is implemented. Repeating the request for the same post/account returns the stored record unless `force=true`.
	 * @apiParam {Number} postId Local GeeSome post id.
	 * @apiBody {Object} accountData Account selector.
	 * @apiBody {Number} [accountData.id] Local Bluesky social account id.
	 * @apiBody {String} [accountData.accountId] Stored Bluesky DID.
	 * @apiBody {String} [accountData.username] Stored Bluesky handle.
	 * @apiBody {String} [appPassword] Optional app password override. Alias: `password` or `apiKey`.
	 * @apiBody {String[]} [langs] Optional ATProto language tags, capped by Bluesky helper validation.
	 * @apiBody {Date} [createdAt] Optional ATProto record creation time; defaults to now.
	 * @apiBody {Boolean} [force=false] Create another Bluesky record even when this post/account already has stored cross-post metadata.
	 * @apiSuccess {Object} account Secret-free local account summary.
	 * @apiSuccess {Object} profile Current Bluesky profile returned by ATProto.
	 * @apiSuccess {String} did Authenticated account DID.
	 * @apiSuccess {String} [handle] Current Bluesky handle.
	 * @apiSuccess {Object} post Local post summary.
	 * @apiSuccess {Object} record Bluesky `uri` and `cid` returned by `com.atproto.repo.createRecord`.
	 * @apiSuccess {Boolean} alreadyExists Whether the stored idempotency record was returned without writing to Bluesky.
	 */
	app.ms.api.onAuthorizedPost('soc-net/bluesky/posts/:postId/cross-post', async (req, res) => {
		return res.send(await blueskyModule.crossPostPost(req.user.id, req.params.postId, req.body || {}));
	});

	/**
	 * @api {post} /v1/soc-net/bluesky/posts/:postId/update-cross-post Update stored Bluesky cross-post
	 * @apiName UserBlueskyUpdateCrossPost
	 * @apiGroup UserBluesky
	 *
	 * @apiUse ApiKey
	 * @apiUse AuthErrors
	 *
	 * @apiDescription Rebuilds the authenticated account's stored native ATProto `app.bsky.feed.post` record for one GeeSome post and replaces it in place through `com.atproto.repo.putRecord`. The route requires an existing `propertiesJson.bluesky.crossPosts` metadata entry for the authenticated DID, verifies the stored URI belongs to that DID and the feed-post collection, reuses the stored rkey instead of creating a duplicate post, and sends the stored CID as `swapRecord` so remote changes are not overwritten silently. The same public/local post, rich-text, media, attachment, and link-preview safety gates as `cross-post` apply.
	 * @apiParam {Number} postId Local GeeSome post id.
	 * @apiBody {Object} accountData Account selector.
	 * @apiBody {Number} [accountData.id] Local Bluesky social account id.
	 * @apiBody {String} [accountData.accountId] Stored Bluesky DID.
	 * @apiBody {String} [accountData.username] Stored Bluesky handle.
	 * @apiBody {String} [appPassword] Optional app password override. Alias: `password` or `apiKey`.
	 * @apiBody {String[]} [langs] Optional ATProto language tags, capped by Bluesky helper validation.
	 * @apiBody {Date} [createdAt] Optional ATProto record creation time; defaults to now.
	 * @apiSuccess {Object} account Secret-free local account summary.
	 * @apiSuccess {Object} profile Current Bluesky profile returned by ATProto.
	 * @apiSuccess {String} did Authenticated account DID.
	 * @apiSuccess {String} [handle] Current Bluesky handle.
	 * @apiSuccess {Object} post Local post summary.
	 * @apiSuccess {Object} record Bluesky `uri` and new `cid` returned by `com.atproto.repo.putRecord`.
	 * @apiSuccess {Object} previousRecord Previous stored Bluesky `uri` and `cid` used for the update.
	 * @apiSuccess {Boolean} updated Whether the remote record was updated.
	 */
	app.ms.api.onAuthorizedPost('soc-net/bluesky/posts/:postId/update-cross-post', async (req, res) => {
		return res.send(await blueskyModule.updateCrossPostPost(req.user.id, req.params.postId, req.body || {}));
	});

	/**
	 * @api {post} /v1/soc-net/bluesky/posts/:postId/delete-cross-post Delete stored Bluesky cross-post
	 * @apiName UserBlueskyDeleteCrossPost
	 * @apiGroup UserBluesky
	 *
	 * @apiUse ApiKey
	 * @apiUse AuthErrors
	 *
	 * @apiDescription Deletes the authenticated account's stored native ATProto `app.bsky.feed.post` record for one GeeSome post through `com.atproto.repo.deleteRecord`, then removes only that account/DID entry from the local post `propertiesJson.bluesky.crossPosts`. The route uses the previously stored Bluesky URI for repo/collection/rkey selection, verifies it belongs to the authenticated DID and feed-post collection, and treats an already-missing remote record as a successful local cleanup. It does not delete the local GeeSome post or any other account's cross-post metadata.
	 * @apiParam {Number} postId Local GeeSome post id.
	 * @apiBody {Object} accountData Account selector.
	 * @apiBody {Number} [accountData.id] Local Bluesky social account id.
	 * @apiBody {String} [accountData.accountId] Stored Bluesky DID.
	 * @apiBody {String} [accountData.username] Stored Bluesky handle.
	 * @apiBody {String} [appPassword] Optional app password override. Alias: `password` or `apiKey`.
	 * @apiSuccess {Object} account Secret-free local account summary.
	 * @apiSuccess {Object} profile Current Bluesky profile returned by ATProto.
	 * @apiSuccess {String} did Authenticated account DID.
	 * @apiSuccess {String} [handle] Current Bluesky handle.
	 * @apiSuccess {Object} post Local post summary.
	 * @apiSuccess {Object} record Stored Bluesky record identity that was targeted for deletion.
	 * @apiSuccess {Object} deleteRecord Remote delete result with `deleted` and `alreadyDeleted` flags.
	 */
	app.ms.api.onAuthorizedPost('soc-net/bluesky/posts/:postId/delete-cross-post', async (req, res) => {
		return res.send(await blueskyModule.deleteCrossPostPost(req.user.id, req.params.postId, req.body || {}));
	});

	/**
	 * @api {post} /v1/admin/bluesky/public-author-feed/preview Preview public Bluesky author feed
	 * @apiName AdminBlueskyPublicAuthorFeedPreview
	 * @apiGroup AdminBluesky
	 *
	 * @apiUse ApiKey
	 * @apiUse AuthErrors
	 * @apiUse AdminErrors
	 *
	 * @apiDescription Fetches a public Bluesky account feed through native ATProto/XRPC and projects `app.bsky.feed.post` records into GeeSome source-identity, canonical rich-text, reply, and embed metadata. This route is read-only: it does not use stored credentials, create social import channels, create GeeSome posts, follow ActivityPub actors, or write to the database.
	 * @apiBody {String} actor Bluesky handle or DID, for example `bsky.app`.
	 * @apiBody {String="posts_with_replies","posts_no_replies","posts_with_media","posts_and_author_threads"} [filter] Optional ATProto author-feed filter.
	 * @apiBody {Number} [limit=10] Maximum feed items to inspect, capped at 100.
	 * @apiBody {String} [cursor] Optional ATProto feed cursor for the next page.
	 * @apiSuccess {String} actor Normalized actor handle or DID used for the XRPC request.
	 * @apiSuccess {String} [cursor] Cursor returned by the public ATProto API.
	 * @apiSuccess {Object[]} list Projected public feed posts with source identity, canonical rich text, reply metadata, and embed metadata.
	 */
	app.ms.api.onAuthorizedPost('admin/bluesky/public-author-feed/preview', async (req, res) => {
		await app.checkUserCan(req.user.id, CorePermissionName.AdminRead);
		return res.send(await blueskyModule.getPublicAuthorFeedPreview(req.body || {}));
	});

	/**
	 * @api {post} /v1/admin/bluesky/public-author-feed/import Import public Bluesky author feed
	 * @apiName AdminBlueskyPublicAuthorFeedImport
	 * @apiGroup AdminBluesky
	 *
	 * @apiUse ApiKey
	 * @apiUse AuthErrors
	 * @apiUse AdminErrors
	 *
	 * @apiDescription Fetches one public Bluesky account feed page through native ATProto/XRPC, creates or reuses the local social-import channel/group for that author, and starts an async import that stores projected `app.bsky.feed.post` records as GeeSome posts through the existing social-import pipeline. Imported text is stored as canonical rich-text content with Bluesky AT URI source identity. The route does not create a persistent subscription, poller, credentialed account, or cross-post configuration; those are separate follow-up flows.
	 * @apiBody {String} actor Bluesky handle or DID, for example `bsky.app`.
	 * @apiBody {String="posts_with_replies","posts_no_replies","posts_with_media","posts_and_author_threads"} [filter] Optional ATProto author-feed filter.
	 * @apiBody {Number} [limit=10] Maximum feed items to import from this page, capped by the public ATProto helper.
	 * @apiBody {String} [cursor] Optional ATProto feed cursor for the page to import.
	 * @apiBody {Number} [accountId] Optional stored social account id to associate with the import channel.
	 * @apiBody {String} [groupName] Optional local group name to use when the import channel creates a new group.
	 * @apiBody {Boolean} [force=false] Re-import posts even when matching social-import messages already exist.
	 * @apiBody {Number} [mergeSeconds] Optional existing social-import merge window.
	 * @apiBody {Object} [advancedSettings] Optional low-level social-import settings for this batch.
	 * @apiSuccess {String} actor Normalized actor handle or DID used for the XRPC request.
	 * @apiSuccess {String} [cursor] Cursor returned by the public ATProto API.
	 * @apiSuccess {Number} projectedPostsCount Number of projected feed items queued for import.
	 * @apiSuccess {Object} dbChannel Local social-import channel summary.
	 * @apiSuccess {Object} asyncOperation Async import operation to track or cancel.
	 */
	app.ms.api.onAuthorizedPost('admin/bluesky/public-author-feed/import', async (req, res) => {
		await app.checkUserCan(req.user.id, CorePermissionName.AdminAll);
		await app.checkUserCan(req.user.id, CorePermissionName.UserGroupManagement);
		return res.send(await blueskyModule.importPublicAuthorFeed(req.user.id, req.apiKey?.id || null, req.body || {}));
	});

	/**
	 * @api {get} /v1/admin/bluesky/sources List native Bluesky source subscriptions
	 * @apiName AdminBlueskySources
	 * @apiGroup AdminBluesky
	 *
	 * @apiUse ApiKey
	 * @apiUse AuthErrors
	 * @apiUse AdminErrors
	 *
	 * @apiDescription Lists stored native Bluesky/ATProto source subscriptions for the current admin user. Removed subscriptions are hidden unless `status=removed` is requested explicitly. This route only reads local subscription state; it does not fetch Bluesky, import posts, poll feeds, or write GeeSome content.
	 * @apiInterface (../../interface.ts) {IListQueryInput} apiQuery
	 * @apiQuery {String="active","paused","removed"} [status] Filter by subscription status.
	 * @apiQuery {String} [actor] Filter by normalized Bluesky handle or DID.
	 * @apiSuccess {Object[]} list Source subscription rows with actor, filter, import settings, moderation policy, channel link, and last refresh metadata.
	 * @apiSuccess {Number} total Total matching subscriptions.
	 */
	app.ms.api.onAuthorizedGet('admin/bluesky/sources', async (req, res) => {
		await app.checkUserCan(req.user.id, CorePermissionName.AdminRead);
		return res.send(await blueskyModule.getSourceSubscriptions(req.user.id, req.query, req.query));
	});

	/**
	 * @api {get} /v1/admin/bluesky/sources/:sourceId/feed List native Bluesky source feed
	 * @apiName AdminBlueskySourceFeed
	 * @apiGroup AdminBluesky
	 *
	 * @apiUse ApiKey
	 * @apiUse AuthErrors
	 * @apiUse AdminErrors
	 *
	 * @apiDescription Lists already-imported GeeSome posts for a native Bluesky source subscription through the linked social-import channel. Passing `cursorPublishedAt` and `cursorId` enables the existing group-post keyset pagination path and skips expensive totals. This route is read-only: it does not fetch Bluesky, import posts, poll feeds, delete content, or use credentials.
	 * @apiParam {Number} sourceId Source subscription id.
	 * @apiInterface (../../interface.ts) {IListQueryInput} apiQuery
	 * @apiQuery {Date} [cursorPublishedAt] Keyset cursor timestamp for source-feed pages.
	 * @apiQuery {Number} [cursorId] Keyset cursor id for source-feed pages.
	 * @apiSuccess {Object} source Source subscription row with refresh/channel metadata.
	 * @apiSuccess {Object} dbChannel Linked local social-import channel summary.
	 * @apiSuccess {Object} posts Imported GeeSome post page with `list`, `total`, and optional `nextCursor`.
	 */
	app.ms.api.onAuthorizedGet('admin/bluesky/sources/:sourceId/feed', async (req, res) => {
		await app.checkUserCan(req.user.id, CorePermissionName.AdminRead);
		return res.send(await blueskyModule.getSourceFeed(req.user.id, req.params.sourceId, req.query, req.query));
	});

	/**
	 * @api {get} /v1/admin/bluesky/sources/:sourceId/reviews List native Bluesky source review records
	 * @apiName AdminBlueskySourceReviews
	 * @apiGroup AdminBluesky
	 *
	 * @apiUse ApiKey
	 * @apiUse AuthErrors
	 * @apiUse AdminErrors
	 *
	 * @apiDescription Lists cached native Bluesky records that were fetched from a subscribed source but not auto-imported because review-first mode or a moderation filter returned review/quarantine/block. Imported and rejected records are hidden by default unless `state` is requested explicitly.
	 * @apiParam {Number} sourceId Source subscription id.
	 * @apiInterface (../../interface.ts) {IListQueryInput} apiQuery
	 * @apiQuery {String="pending","quarantined","blocked","rejected","imported"} [state] Optional review/import state filter.
	 * @apiSuccess {Object} source Source subscription row.
	 * @apiSuccess {Object[]} list Review records with source identity, moderation decision, sanitized projection preview, review metadata, and import metadata.
	 * @apiSuccess {Number} total Total matching review records.
	 */
	app.ms.api.onAuthorizedGet('admin/bluesky/sources/:sourceId/reviews', async (req, res) => {
		await app.checkUserCan(req.user.id, CorePermissionName.AdminRead);
		return res.send(await blueskyModule.getSourceReviews(req.user.id, req.params.sourceId, req.query, req.query));
	});

	/**
	 * @api {post} /v1/admin/bluesky/sources Subscribe native Bluesky source
	 * @apiName AdminBlueskySourceSubscribe
	 * @apiGroup AdminBluesky
	 *
	 * @apiUse ApiKey
	 * @apiUse AuthErrors
	 * @apiUse AdminErrors
	 *
	 * @apiDescription Creates or reactivates a native Bluesky/ATProto source subscription for the current admin user. Duplicate subscribes for the same normalized actor are idempotent updates. This stores refresh/import preferences only; it does not fetch Bluesky, import posts, create a social-import channel, or configure credentialed cross-posting.
	 * @apiBody {String} actor Bluesky handle or DID, for example `bsky.app`.
	 * @apiBody {String="posts_with_replies","posts_no_replies","posts_with_media","posts_and_author_threads"} [filter] Optional ATProto author-feed filter for future refreshes/imports.
	 * @apiBody {String} [displayName] Optional UI label.
	 * @apiBody {String} [groupName] Optional local group name to use when future refresh/import creates a channel.
	 * @apiBody {Number} [accountId] Optional stored social account id to associate with future imports.
	 * @apiBody {Number} [importLimit] Optional page import limit, capped at 100.
	 * @apiBody {String="autoImport","reviewFirst"} [moderationMode="autoImport"] Source moderation mode. `reviewFirst` fetches source records but keeps them out of visible GeeSome posts until a review/import flow exists.
	 * @apiBody {Object[]} [moderationRules] Optional bounded keyword/regex filter rules for this source.
	 * @apiBody {String} [moderationRules.name] Optional rule label returned in moderation decisions.
	 * @apiBody {String="keyword","regex"} [moderationRules.type="keyword"] Rule match type.
	 * @apiBody {String="text","source","groupName"} [moderationRules.field="text"] Field to match.
	 * @apiBody {String} moderationRules.value Bounded keyword or regex pattern.
	 * @apiBody {String="block","quarantine","review"} [moderationRules.action="block"] Action to take when the rule matches.
	 * @apiSuccess {Object} result Source subscription row.
	 */
	app.ms.api.onAuthorizedPost('admin/bluesky/sources', async (req, res) => {
		await app.checkUserCan(req.user.id, CorePermissionName.AdminAll);
		return res.send(await blueskyModule.subscribeSource(req.user.id, req.body || {}));
	});

	/**
	 * @api {post} /v1/admin/bluesky/sources/:sourceId/update Update native Bluesky source subscription
	 * @apiName AdminBlueskySourceUpdate
	 * @apiGroup AdminBluesky
	 *
	 * @apiUse ApiKey
	 * @apiUse AuthErrors
	 * @apiUse AdminErrors
	 *
	 * @apiDescription Updates local native Bluesky source subscription metadata such as display label, feed filter, future import settings, or active/paused status. It does not fetch Bluesky, import posts, delete GeeSome posts, or alter credentials.
	 * @apiParam {Number} sourceId Source subscription id.
	 * @apiBody {String="posts_with_replies","posts_no_replies","posts_with_media","posts_and_author_threads"} [filter] Optional ATProto author-feed filter, or empty to clear.
	 * @apiBody {String} [displayName] Optional UI label, or empty to clear.
	 * @apiBody {String="active","paused"} [status] New subscription status.
	 * @apiBody {String} [groupName] Optional local group name for future imports, or empty to clear.
	 * @apiBody {Number} [accountId] Optional stored social account id for future imports, or empty to clear.
	 * @apiBody {Number} [importLimit] Optional page import limit, capped at 100, or empty to clear.
	 * @apiBody {String="autoImport","reviewFirst"} [moderationMode] Optional source moderation mode. If omitted while rules are updated, the previous mode is preserved.
	 * @apiBody {Object[]} [moderationRules] Optional replacement moderation rules. If omitted while mode is updated, previous rules are preserved.
	 * @apiSuccess {Object} result Updated source subscription row.
	 */
	app.ms.api.onAuthorizedPost('admin/bluesky/sources/:sourceId/update', async (req, res) => {
		await app.checkUserCan(req.user.id, CorePermissionName.AdminAll);
		return res.send(await blueskyModule.updateSourceSubscription(req.user.id, req.params.sourceId, req.body || {}));
	});

	/**
	 * @api {post} /v1/admin/bluesky/sources/:sourceId/refresh Refresh native Bluesky source subscription
	 * @apiName AdminBlueskySourceRefresh
	 * @apiGroup AdminBluesky
	 *
	 * @apiUse ApiKey
	 * @apiUse AuthErrors
	 * @apiUse AdminErrors
	 *
	 * @apiDescription Fetches one public ATProto author-feed page for the stored source subscription, imports projected posts through the social-import pipeline, and updates local cursor/channel/error metadata. This is a bounded manual refresh, not a long-running poller or credentialed cross-post operation.
	 * @apiParam {Number} sourceId Source subscription id.
	 * @apiBody {String="posts_with_replies","posts_no_replies","posts_with_media","posts_and_author_threads"} [filter] Optional one-off feed filter override; defaults to the stored subscription filter.
	 * @apiBody {Number} [limit] Optional one-off page import limit, capped at 100; defaults to the stored subscription import limit.
	 * @apiBody {String} [cursor] Optional one-off ATProto cursor; defaults to the stored subscription cursor.
	 * @apiBody {Boolean} [force=false] Re-import posts even when matching social-import messages already exist.
	 * @apiBody {Number} [mergeSeconds] Optional existing social-import merge window.
	 * @apiBody {Object} [advancedSettings] Optional low-level social-import settings for this refresh.
	 * @apiBody {Object} [moderationPolicy] Optional one-off moderation-policy override for this refresh.
	 * @apiBody {String="autoImport","reviewFirst"} [moderationPolicy.mode] Optional one-off moderation mode.
	 * @apiBody {Object[]} [moderationPolicy.rules] Optional one-off bounded keyword/regex/source/group-name rules.
	 * @apiSuccess {Object} result Refresh result with updated source row, fetched/imported counts, moderation summary, cursor, and channel summary.
	 */
	app.ms.api.onAuthorizedPost('admin/bluesky/sources/:sourceId/refresh', async (req, res) => {
		await app.checkUserCan(req.user.id, CorePermissionName.AdminAll);
		await app.checkUserCan(req.user.id, CorePermissionName.UserGroupManagement);
		return res.send(await blueskyModule.refreshSourceSubscription(req.user.id, req.params.sourceId, req.body || {}));
	});

	/**
	 * @api {post} /v1/admin/bluesky/sources/:sourceId/refresh-async Queue native Bluesky source refresh
	 * @apiName AdminBlueskySourceRefreshAsync
	 * @apiGroup AdminBluesky
	 *
	 * @apiUse ApiKey
	 * @apiUse AuthErrors
	 * @apiUse AdminErrors
	 *
	 * @apiDescription Queues one public ATProto author-feed page refresh for the stored source subscription as a normal user async operation. Duplicate waiting jobs for the same source/options are reused. Set `process=false` when an external worker should process the queue later.
	 * @apiParam {Number} sourceId Source subscription id.
	 * @apiBody {String="posts_with_replies","posts_no_replies","posts_with_media","posts_and_author_threads"} [filter] Optional one-off feed filter override.
	 * @apiBody {Number} [limit] Optional one-off page import limit, capped at 100.
	 * @apiBody {String} [cursor] Optional one-off ATProto cursor.
	 * @apiBody {Boolean} [force=false] Re-import posts even when matching social-import messages already exist.
	 * @apiBody {Number} [mergeSeconds] Optional existing social-import merge window.
	 * @apiBody {Object} [advancedSettings] Optional low-level social-import settings for this refresh.
	 * @apiBody {Object} [moderationPolicy] Optional one-off moderation-policy override for this queued refresh.
	 * @apiBody {Boolean} [process=true] Start bounded queue processing immediately after enqueueing.
	 * @apiInterface (../asyncOperation/interface.ts) {IUserOperationQueue} apiSuccess
	 */
	app.ms.api.onAuthorizedPost('admin/bluesky/sources/:sourceId/refresh-async', async (req, res) => {
		await app.checkUserCan(req.user.id, CorePermissionName.AdminAll);
		await app.checkUserCan(req.user.id, CorePermissionName.UserGroupManagement);
		return res.send(await blueskyModule.queueSourceSubscriptionRefresh(
			req.user.id,
			req.params.sourceId,
			req.apiKey?.id || null,
			req.body || {}
		));
	});

	/**
	 * @api {post} /v1/admin/bluesky/sources/:sourceId/sync Sync native Bluesky source posts
	 * @apiName AdminBlueskySourceSync
	 * @apiGroup AdminBluesky
	 *
	 * @apiUse ApiKey
	 * @apiUse AuthErrors
	 * @apiUse AdminErrors
	 *
	 * @apiDescription Verifies a bounded page of already-imported native Bluesky posts against `com.atproto.repo.getRecord`. Posts whose AT records still exist but have a changed CID are re-imported with source identity preserved. Posts are soft-deleted only when the AT record lookup confirms the record is missing; absence from an author feed page is not treated as deletion. Use `cursorPublishedAt` and `cursorId` from `nextCursor` to continue through the next page.
	 * @apiParam {Number} sourceId Source subscription id.
	 * @apiBody {Number} [limit=20] Maximum imported posts to verify, capped at 100.
	 * @apiBody {Date} [cursorPublishedAt] Keyset cursor timestamp from the previous sync result.
	 * @apiBody {Number} [cursorId] Keyset cursor id from the previous sync result.
	 * @apiBody {Boolean} [force=false] Re-import existing records even when the stored CID matches.
	 * @apiSuccess {Object} result Sync result with checked, updated, deleted, skipped, failed, moderation summary, bounded errors, and optional nextCursor.
	 */
	app.ms.api.onAuthorizedPost('admin/bluesky/sources/:sourceId/sync', async (req, res) => {
		await app.checkUserCan(req.user.id, CorePermissionName.AdminAll);
		await app.checkUserCan(req.user.id, CorePermissionName.UserGroupManagement);
		return res.send(await blueskyModule.syncSourceSubscriptionPosts(req.user.id, req.params.sourceId, req.body || {}));
	});

	/**
	 * @api {post} /v1/admin/bluesky/sources/:sourceId/reviews/:reviewId/state Update native Bluesky source review state
	 * @apiName AdminBlueskySourceReviewState
	 * @apiGroup AdminBluesky
	 *
	 * @apiUse ApiKey
	 * @apiUse AuthErrors
	 * @apiUse AdminErrors
	 *
	 * @apiDescription Updates moderation bookkeeping for a cached native Bluesky source review record. Use the dedicated import route to create a visible GeeSome post; setting state here never imports content by itself.
	 * @apiParam {Number} sourceId Source subscription id.
	 * @apiParam {Number} reviewId Review record id.
	 * @apiBody {String="pending","quarantined","blocked","rejected"} state New review state. `imported` is set only by the import route.
	 * @apiSuccess {Object} result Updated review record.
	 */
	app.ms.api.onAuthorizedPost('admin/bluesky/sources/:sourceId/reviews/:reviewId/state', async (req, res) => {
		await app.checkUserCan(req.user.id, CorePermissionName.AdminAll);
		return res.send(await blueskyModule.updateSourceReviewState(req.user.id, req.params.sourceId, req.params.reviewId, req.body || {}));
	});

	/**
	 * @api {post} /v1/admin/bluesky/sources/:sourceId/reviews/:reviewId/import Import native Bluesky source review
	 * @apiName AdminBlueskySourceReviewImport
	 * @apiGroup AdminBluesky
	 *
	 * @apiUse ApiKey
	 * @apiUse AuthErrors
	 * @apiUse AdminErrors
	 *
	 * @apiDescription Imports one pending or quarantined cached native Bluesky review record into the linked local social-import channel/group. This uses the stored ATProto projection and preserves Bluesky AT URI source identity for idempotency.
	 * @apiParam {Number} sourceId Source subscription id.
	 * @apiParam {Number} reviewId Review record id.
	 * @apiBody {Boolean} [force=true] Re-import even when the same social-import message already exists.
	 * @apiSuccess {Object} result Import result with source row, updated review row, channel summary, and imported count.
	 */
	app.ms.api.onAuthorizedPost('admin/bluesky/sources/:sourceId/reviews/:reviewId/import', async (req, res) => {
		await app.checkUserCan(req.user.id, CorePermissionName.AdminAll);
		await app.checkUserCan(req.user.id, CorePermissionName.UserGroupManagement);
		return res.send(await blueskyModule.importSourceReviewPost(req.user.id, req.params.sourceId, req.params.reviewId, req.body || {}));
	});

	/**
	 * @api {post} /v1/admin/bluesky/sources/:sourceId/remove Remove native Bluesky source subscription
	 * @apiName AdminBlueskySourceRemove
	 * @apiGroup AdminBluesky
	 *
	 * @apiUse ApiKey
	 * @apiUse AuthErrors
	 * @apiUse AdminErrors
	 *
	 * @apiDescription Marks a native Bluesky source subscription removed for the current admin user. It does not delete social-import channels, GeeSome groups/posts, cached content, or Bluesky credentials.
	 * @apiParam {Number} sourceId Source subscription id.
	 * @apiSuccess {Object} result Removed source subscription row.
	 */
	app.ms.api.onAuthorizedPost('admin/bluesky/sources/:sourceId/remove', async (req, res) => {
		await app.checkUserCan(req.user.id, CorePermissionName.AdminAll);
		return res.send(await blueskyModule.removeSourceSubscription(req.user.id, req.params.sourceId));
	});
}
