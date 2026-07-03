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
}
