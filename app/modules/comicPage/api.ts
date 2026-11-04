import type {IGeesomeApp} from '../../interface.js';
import type IGeesomeComicPageModule from './interface.js';
import {CorePermissionName} from '../database/interface.js';
import {COMIC_PAGE_LIMITS, ComicPageError} from './contract.js';

export default function register(app: IGeesomeApp, module: IGeesomeComicPageModule) {
	/**
	 * @api {get} /v1/user/comic-pages/capabilities Get native comic-page capability
	 * @apiName ComicPageCapabilities
	 * @apiGroup ComicPage
	 * @apiUse ApiKey
	 * @apiSuccess {Number} version Native recipe contract version, currently 1.
	 * @apiSuccess {Object} limits Bounded source, panel, bubble, PNG and canvas limits.
	 */
	app.ms.api.onAuthorizedGet('user/comic-pages/capabilities', async (req, res) => {
		await app.checkUserCan(req.user.id, CorePermissionName.UserSaveData);
		await app.checkUserCan(req.user.id, CorePermissionName.UserFileCatalogManagement);
		res.send({version: 1, limits: COMIC_PAGE_LIMITS});
	});
	/**
	 * @api {post} /v1/user/comic-pages Save an immutable baked comic page
	 * @apiName ComicPageCreate
	 * @apiGroup ComicPage
	 * @apiUse ApiKey
	 * @apiBody {String} idempotencyKey Stable actor-bound retry key.
	 * @apiBody {String} comicId Comic identity.
	 * @apiBody {String} pageId Stable page identity.
	 * @apiBody {Number} pageRevision Positive immutable page revision.
	 * @apiBody {String} [previousVersionRef] Owned preceding baked page manifest; required after revision one.
	 * @apiBody {Number} folderId Owned destination folder.
	 * @apiBody {Object} recipe Version-one comic-page recipe, canvas and selected sourceAssets originalManifestId references.
	 * @apiBody {String} pngBase64 Baked PNG; must decode to recipe.canvas dimensions.
	 * @apiBody {Object[]} bubbles Complete bubble asset list, each with stable id and allowlisted svg.
	 * @apiSuccess {Object} receipt Native recipe, baked/preview manifests, bubble manifests and immutable catalog entry.
	 * @apiError (409) comic_page_idempotency_conflict Key/request or page-version identity conflicts.
	 * @apiError (409) comic_page_operation_pending An identical operation still owns a live claim; reconcile with GET.
	 * @apiError (403) comic_page_source_not_permitted Private source is not owned by this actor.
	 * @apiError (422) comic_page_invalid Recipe, PNG or SVG is malformed or outside bounded limits.
	 */
	app.ms.api.onAuthorizedPost('user/comic-pages', async (req, res) => {
		await respond(res, () => module.create(req.user.id, req.body));
	});
	/**
	 * @api {get} /v1/user/comic-pages/operations/:key Reconcile a native save operation
	 * @apiName ComicPageOperation
	 * @apiGroup ComicPage
	 * @apiUse ApiKey
	 * @apiParam {String} key Original idempotency key.
	 * @apiSuccess {String} status pending, failed or succeeded.
	 * @apiSuccess {Boolean} canResume Original request may be retried after failure or claim expiry.
	 * @apiSuccess {Object} [receipt] Frozen result on success.
	 * @apiSuccess {String} [errorCode] Last failure code.
	 * @apiError (404) comic_page_operation_not_found Key does not exist for this actor.
	 */
	app.ms.api.onAuthorizedGet('user/comic-pages/operations/:key', async (req, res) => {
		await respond(res, () => module.operation(req.user.id, req.params.key));
	});
	/**
	 * @api {get} /v1/user/comic-pages/:manifest Get an owned comic-page recipe
	 * @apiName ComicPageDetail
	 * @apiGroup ComicPage
	 * @apiUse ApiKey
	 * @apiParam {String} manifest Baked page content manifest.
	 * @apiSuccess {Object} receipt Recipe, source references and asset manifests.
	 * @apiError (404) comic_page_not_found No committed owned page matches.
	 */
	app.ms.api.onAuthorizedGet('user/comic-pages/:manifest', async (req, res) => {
		await respond(res, () => module.detail(req.user.id, req.params.manifest));
	});
}

async function respond(res, run) {
	try {
		res.send(await run());
	} catch (error) {
		if (error instanceof ComicPageError) {
			res.send({message: error.errorCode, errorCode: error.errorCode}, error.status);
			return;
		}
		throw error;
	}
}
