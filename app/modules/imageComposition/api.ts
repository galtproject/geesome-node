import type {IGeesomeApp} from '../../interface.js';
import type IGeesomeImageCompositionModule from './interface.js';
import {ImageCompositionApiError} from './helpers.js';

export default function registerImageCompositionApi(app: IGeesomeApp, module: IGeesomeImageCompositionModule) {
	/**
	 * @api {post} /v1/user/group/create-image-composition Create image composition
	 * @apiName UserGroupCreateImageComposition
	 * @apiGroup ImageComposition
	 * @apiUse ApiKey
	 * @apiBody {Number} groupId Target group id.
	 * @apiBody {String} idempotencyKey Stable retry key.
	 * @apiBody {String} compositionId Stable composition id.
	 * @apiBody {String} baseContentManifestId Base raster content manifest id.
	 * @apiBody {Object} output Natural output dimensions.
	 * @apiBody {Object[]} stickers Validated semantic text bubbles.
	 */
	app.ms.api.onAuthorizedPost('user/group/create-image-composition', async (req, res) => {
		await withImageCompositionErrorResponse(res, async () => {
			res.send(await module.createImageComposition(req.user.id, req.body), 200);
		});
	});

	/**
	 * @api {post} /v1/user/group/update-image-composition/:postId Update image composition
	 * @apiName UserGroupUpdateImageComposition
	 * @apiGroup ImageComposition
	 * @apiUse ApiKey
	 * @apiParam {Number} postId Post id.
	 * @apiBody {String} idempotencyKey Stable retry key.
	 * @apiBody {Number} expectedRevision Optimistic concurrency revision.
	 * @apiBody {Object} output Natural output dimensions.
	 * @apiBody {Object[]} stickers Complete next semantic sticker list.
	 */
	app.ms.api.onAuthorizedPost('user/group/update-image-composition/:postId', async (req, res) => {
		await withImageCompositionErrorResponse(res, async () => {
			res.send(await module.updateImageComposition(req.user.id, req.params.postId, req.body), 200);
		});
	});

	/**
	 * @api {get} /v1/user/group/image-composition/:postId Get image composition
	 * @apiName UserGroupGetImageComposition
	 * @apiGroup ImageComposition
	 * @apiUse ApiKey
	 * @apiParam {Number} postId Post id.
	 * @apiSuccess {Object} composition Resolved portable composition projection.
	 */
	app.ms.api.onAuthorizedGet('user/group/image-composition/:postId', async (req, res) => {
		await withImageCompositionErrorResponse(res, async () => {
			res.send(await module.getImageComposition(req.user.id, req.params.postId), 200);
		});
	});

	/**
	 * @api {get} /v1/user/group/:groupId/image-compositions List image compositions
	 * @apiName UserGroupListImageCompositions
	 * @apiGroup ImageComposition
	 * @apiUse ApiKey
	 * @apiParam {Number} groupId Group id.
	 * @apiSuccess {Object[]} list Resolved image compositions.
	 * @apiSuccess {Object|null} nextCursor Cursor for the next page.
	 * @apiSuccess {String} nextCursor.publishedAt Published timestamp cursor value.
	 * @apiSuccess {Number} nextCursor.id Stable post id cursor tie-breaker.
	 */
	app.ms.api.onAuthorizedGet('user/group/:groupId/image-compositions', async (req, res) => {
		await withImageCompositionErrorResponse(res, async () => {
			res.send(await module.getImageCompositions(req.user.id, req.params.groupId, req.query, req.query), 200);
		});
	});
}

export async function withImageCompositionErrorResponse(res, callback) {
	try {
		return await callback();
	} catch (error) {
		if (!(error instanceof ImageCompositionApiError)) {
			throw error;
		}
		const body = {
			message: error.errorCode,
			errorCode: error.errorCode,
			...(error.details ? {details: error.details} : {}),
		};
		if (res.stream && typeof res.stream.status === 'function') {
			return res.stream.status(error.statusCode).send(body);
		}
		return res.send(body, error.statusCode);
	}
}
