import type {IGeesomeApp} from '../../interface.js';
import type IGeesomeImageCompositionModule from './interface.js';
import {ImageCompositionApiError} from './helpers.js';

export default function registerImageCompositionApi(app: IGeesomeApp, module: IGeesomeImageCompositionModule) {
	/**
	 * @apiDefine ImageCompositionErrors
	 * @apiError (403) composition_not_permitted The actor cannot view or edit this composition.
	 * @apiError (403) composition_content_not_permitted The original Content is private to another user.
	 * @apiError (403) composition_dependency_not_permitted A stored dependency crosses an unauthorized ownership boundary.
	 * @apiError (404) composition_not_found The catalog-backed composite Content does not exist.
	 * @apiError (404) composition_content_not_found The requested original Content does not exist.
	 * @apiError (422) composition_invalid The request or stored version-1 recipe is malformed.
	 * @apiError (422) composition_dependency_not_found A recipe dependency is missing or inconsistent.
	 * @apiError (422) composition_template_unknown A sticker template is unsupported.
	 * @apiError (422) composition_version_unknown The recipe version is unsupported.
	 * @apiError (422) composition_renderer_unknown The stored renderer version is unsupported.
	 * @apiError (422) composition_render_limit The encoded or decoded image exceeds a render safety limit.
	 * @apiError (422) composition_render_failed A supported raster could not be decoded or baked.
	 * @apiError (422) composition_preview_generation_failed The mandatory baked-image preview could not be generated.
	 * @apiError (409) composition_idempotency_conflict An idempotency identity was reused with a different request.
	 * @apiError (409) composition_revision_conflict The expected revision is no longer current.
	 * @apiError (500) composition_svg_generation_failed Sticker SVG generation failed.
	 * @apiError (500) composition_storage_failed Durable storage failed.
	 * @apiErrorExample {json} Revision conflict
	 *   HTTP/1.1 409 Conflict
	 *   {"message":"composition_revision_conflict","errorCode":"composition_revision_conflict","details":{"currentRevision":3,"currentContentManifestId":"current-manifest-cid"}}
	 */
	/**
	 * @api {post} /v1/user/image-compositions Create composite content
	 * @apiName UserCreateImageCompositionContent
	 * @apiGroup ImageComposition
	 * @apiUse ApiKey
	 * @apiUse AuthErrors
	 * @apiUse ImageCompositionErrors
	 * @apiBody {String} idempotencyKey Stable retry key.
	 * @apiBody {String} compositionId Stable composition lineage id.
	 * @apiBody {String} originalContentManifestId Original raster Content manifest id.
	 * @apiBody {Object} [render] Optional bounded server render hint.
	 * @apiBody {Number} [render.maxDimension] Maximum output width or height.
	 * @apiBody {Object[]} stickers Complete semantic text-bubble list; may be empty.
	 * @apiSuccess {Object} composition Resolved composite, original, generated stickers, and stable fileCatalogItemId.
	 * @apiExample {curl} Create content-only composition
	 *   curl -X POST http://localhost:2052/v1/user/image-compositions -H "Authorization: Bearer geesome-api-key" -H "Content-Type: application/json" -d '{"idempotencyKey":"request-1","compositionId":"card-1","originalContentManifestId":"manifest-cid","stickers":[]}'
	 */
	app.ms.api.onAuthorizedPost('user/image-compositions', async (req, res) => {
		await withImageCompositionErrorResponse(res, async () => {
			res.send(await module.createImageCompositionContent(req.user.id, req.body), 200);
		});
	});

	/**
	 * @api {get} /v1/user/image-compositions/:contentManifestId Get composite content recipe
	 * @apiName UserGetImageCompositionContent
	 * @apiGroup ImageComposition
	 * @apiUse ApiKey
	 * @apiUse AuthErrors
	 * @apiUse ImageCompositionErrors
	 * @apiParam {String} contentManifestId Baked composite Content manifest id.
	 * @apiSuccess {Object} composition Resolved composite, original, generated stickers, and stable fileCatalogItemId.
	 */
	app.ms.api.onAuthorizedGet('user/image-compositions/:contentManifestId', async (req, res) => {
		await withImageCompositionErrorResponse(res, async () => {
			res.send(await module.getImageCompositionContent(req.user.id, req.params.contentManifestId), 200);
		});
	});

	/**
	 * @api {post} /v1/user/image-compositions/:contentManifestId/revisions Create immutable composite revision
	 * @apiName UserCreateImageCompositionContentRevision
	 * @apiGroup ImageComposition
	 * @apiUse ApiKey
	 * @apiUse AuthErrors
	 * @apiUse ImageCompositionErrors
	 * @apiParam {String} contentManifestId Current baked composite Content manifest id.
	 * @apiBody {String} idempotencyKey Stable retry key.
	 * @apiBody {Number} expectedRevision Optimistic concurrency revision.
	 * @apiBody {Object[]} stickers Complete next semantic text-bubble list; may be empty.
	 * @apiSuccess {Object} composition Resolved immutable successor and the unchanged fileCatalogItemId.
	 */
	app.ms.api.onAuthorizedPost('user/image-compositions/:contentManifestId/revisions', async (req, res) => {
		await withImageCompositionErrorResponse(res, async () => {
			res.send(await module.createImageCompositionContentRevision(req.user.id, req.params.contentManifestId, req.body), 200);
		});
	});
	/**
	 * @api {get} /v1/user/image-compositions List catalog-backed image compositions
	 * @apiName UserListImageCompositionCatalogItems
	 * @apiGroup ImageComposition
	 * @apiUse ApiKey
	 * @apiUse AuthErrors
	 * @apiUse ImageCompositionErrors
	 * @apiQuery {Number} [limit=50] Page size, capped at 200.
	 * @apiQuery {Number} [offset=0] Page offset.
	 * @apiQuery {String} [search] File item name search.
	 * @apiQuery {String} [sortBy=updatedAt] One of createdAt, updatedAt, id, position, or name.
	 * @apiQuery {String} [sortDir=desc] asc or desc.
	 * @apiSuccess {Object[]} list Baked-only composition summaries with stable fileCatalogItemId and catalog name/position fields.
	 * @apiSuccess {Number} total Total matching catalog items before pagination.
	 */
	app.ms.api.onAuthorizedGet('user/image-compositions', async (req, res) => {
		await withImageCompositionErrorResponse(res, async () => {
			res.send(await module.getImageCompositionCatalogItems(req.user.id, req.query), 200);
		});
	});
}

export async function withImageCompositionErrorResponse(res, callback) {
	try {
		return await callback();
	} catch (error) {
		if (!(error instanceof ImageCompositionApiError)) {
			const message = String((error as Error)?.message || error || '');
			error = /not[_ -]?permitted|permission|forbidden/i.test(message)
				? new ImageCompositionApiError('composition_not_permitted', 403)
				: new ImageCompositionApiError('composition_storage_failed', 500);
		}
		const apiError = error as ImageCompositionApiError;
		const body = {
			message: apiError.errorCode,
			errorCode: apiError.errorCode,
			...(apiError.details ? {details: apiError.details} : {}),
		};
		if (res.stream && typeof res.stream.status === 'function') {
			return res.stream.status(apiError.statusCode).send(body);
		}
		return res.send(body, apiError.statusCode);
	}
}
