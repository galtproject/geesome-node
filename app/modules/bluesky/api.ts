import {IGeesomeApp} from '../../interface.js';
import {CorePermissionName} from '../database/interface.js';
import IGeesomeBlueskyModule from './interface.js';

export default (app: IGeesomeApp, blueskyModule: IGeesomeBlueskyModule) => {
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
	 * @apiSuccess {Object[]} list Source subscription rows with actor, filter, import settings, channel link, and last refresh metadata.
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
	 * @apiSuccess {Object} result Refresh result with updated source row, fetched/imported counts, cursor, and channel summary.
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
	 * @apiSuccess {Object} result Sync result with checked, updated, deleted, skipped, failed, bounded errors, and optional nextCursor.
	 */
	app.ms.api.onAuthorizedPost('admin/bluesky/sources/:sourceId/sync', async (req, res) => {
		await app.checkUserCan(req.user.id, CorePermissionName.AdminAll);
		await app.checkUserCan(req.user.id, CorePermissionName.UserGroupManagement);
		return res.send(await blueskyModule.syncSourceSubscriptionPosts(req.user.id, req.params.sourceId, req.body || {}));
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
