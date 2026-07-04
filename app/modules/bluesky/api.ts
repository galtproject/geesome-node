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
}
