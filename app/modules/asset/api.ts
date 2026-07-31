import {IGeesomeApp} from '../../interface.js';
import {ApiProblemError} from '../api/problem.js';
import {requireIntegrationScopes} from '../api/integrationScopes.js';
import {getPublicApiContext} from '../api/publicUrls.js';
import asyncBusboy from '../content/asyncBusboy.js';
import IGeesomeAssetModule from './interface.js';
import {
	getAssetRequestHash,
	validateBytes,
	validateLogicalPath,
	validateMimeType,
	validateSha256
} from './index.js';

export default (app: IGeesomeApp, assetModule: IGeesomeAssetModule) => {
	/**
	 * @api {post} /v1/assets Upload immutable asset
	 * @apiName AssetCreate
	 * @apiGroup Assets
	 * @apiUse ApiKey
	 * @apiHeader {String} Idempotency-Key Owner-scoped retry key.
	 * @apiBody {File} file Asset bytes.
	 * @apiBody {String} expectedSha256 Lowercase SHA-256 hex digest.
	 * @apiBody {String} [logicalPath] Optional release metadata path.
	 * @apiBody {String="none","standard"} [previewPolicy="none"] Preview generation policy.
	 * @apiBody {Boolean} [async=false] Return an operation resource while processing.
	 * @apiSuccess (201) {String} storageId Immutable storage CID.
	 * @apiSuccess (201) {String} sha256 Verified byte digest.
	 * @apiSuccess (201) {Object} urls Public content and metadata URLs.
	 * @apiUse AuthErrors
	 * @apiUse UploadErrors
	 */
	app.ms.api.onAuthorizedPost('assets', async (req, res) => {
		requireIntegrationScopes(req.apiKey, ['assets:write']);
		return handleAssetCreate(app, assetModule, req, res);
	});

	/**
	 * @api {get} /v1/assets/:storageId Get immutable asset metadata
	 * @apiName AssetGet
	 * @apiGroup Assets
	 * @apiUse ApiKey
	 * @apiParam {String} storageId Immutable storage CID.
	 * @apiSuccess {String} storageId Immutable storage CID.
	 * @apiSuccess {String} sha256 Verified byte digest.
	 */
	app.ms.api.onAuthorizedGet('assets/:storageId', async (req, res) => {
		requireIntegrationScopes(req.apiKey, ['assets:read-private']);
		res.send(await assetModule.getAsset(req.user.id, req.params.storageId));
	});

	/**
	 * @api {post} /v1/asset-batches Create resumable asset batch
	 * @apiName AssetBatchCreate
	 * @apiGroup AssetBatches
	 * @apiUse ApiKey
	 * @apiHeader {String} Idempotency-Key Owner-scoped batch retry key.
	 * @apiBody {Object[]} items Expected manifest items.
	 * @apiSuccess {Number} batchId Batch identifier.
	 * @apiSuccess {Object[]} items Batch item upload requirements.
	 */
	app.ms.api.onAuthorizedPost('asset-batches', async (req, res) => {
		requireIntegrationScopes(req.apiKey, ['asset-batches:write']);
		const key = String(req.headers['idempotency-key'] || '').trim();
		res.send(await assetModule.createBatch(req.user.id, req.body, key), 201);
	});

	/**
	 * @api {get} /v1/asset-batches/:batchId Get asset batch
	 * @apiName AssetBatchGet
	 * @apiGroup AssetBatches
	 * @apiUse ApiKey
	 * @apiParam {Number} batchId Batch identifier.
	 */
	app.ms.api.onAuthorizedGet('asset-batches/:batchId', async (req, res) => {
		requireIntegrationScopes(req.apiKey, ['asset-batches:write']);
		res.send(await assetModule.getBatch(req.user.id, Number(req.params.batchId)));
	});

	/**
	 * @api {post} /v1/asset-batches/:batchId/complete Complete asset batch
	 * @apiName AssetBatchComplete
	 * @apiGroup AssetBatches
	 * @apiUse ApiKey
	 * @apiParam {Number} batchId Batch identifier.
	 * @apiSuccess {String="completed"} status Completed status.
	 * @apiSuccess {Object} manifest Immutable hash-bound manifest.
	 */
	app.ms.api.onAuthorizedPost('asset-batches/:batchId/complete', async (req, res) => {
		requireIntegrationScopes(req.apiKey, ['asset-batches:write']);
		res.send(await assetModule.completeBatch(req.user.id, Number(req.params.batchId), req.apiKey.id));
	});
};

async function handleAssetCreate(app: IGeesomeApp, assetModule: IGeesomeAssetModule, req: any, res: any) {
	const maxUploadBytes = Number(app.config?.apiConfig?.maxUploadBytes) || 2000 * 1024 * 1024;
	const {files, fields} = await asyncBusboy(req.stream, {headers: req.headers, limits: {files: 1, fileSize: maxUploadBytes}});
	if (files.length !== 1) {
		throw new ApiProblemError(400, 'asset_file_required', 'One asset file is required');
	}
	const file = files[0];
	let handedToAssetModule = false;
	try {
		const sha256 = validateSha256(fields.expectedSha256);
		if (file.sha256 !== sha256) {
			throw new ApiProblemError(422, 'asset_digest_mismatch', 'Asset digest mismatch', 'The uploaded bytes do not match expectedSha256.', {expectedSha256: sha256, actualSha256: file.sha256});
		}
		const bytes = validateBytes(file.bytes);
		const mimeType = validateMimeType(file.mimeType);
		const logicalPath = validateLogicalPath(fields.logicalPath);
		const previewPolicy = validatePreviewPolicy(fields.previewPolicy);
		const batchId = parseOptionalPositiveInteger(fields.batchId, 'asset_batch_id_invalid');
		const logicalId = fields.logicalId ? String(fields.logicalId).trim() : null;
		const idempotencyKey = String(req.headers['idempotency-key'] || '').trim();
		const requestHash = getAssetRequestHash({sha256, bytes, mimeType, logicalPath, previewPolicy, batchId, logicalId});
		const prepared = await assetModule.prepareAssetRequest(req.user.id, idempotencyKey, requestHash);
		if (prepared.asset) {
			return res.send({...serializeExisting(assetModule, prepared.asset), created: false}, 200);
		}
		if (prepared.operationId) {
			return sendOperation(res, prepared.operationId, app);
		}
		const options = {
			userId: req.user.id,
			userApiKeyId: req.apiKey.id,
			idempotencyRequestId: prepared.request.id,
			sha256,
			bytes,
			mimeType,
			logicalPath,
			previewPolicy,
			batchId,
			logicalId,
			requestId: req.requestId,
			async: isTrue(fields.async)
		};
		if (options.async) {
			handedToAssetModule = true;
			const operation = await app.ms.asyncOperation.asyncOperationWrapper('asset', 'createAssetFromUpload', [req.user.id, file, file.filename, options], options);
			await assetModule.linkAssetOperation(prepared.request.id, operation.asyncOperationId);
			return sendOperation(res, operation.asyncOperationId, app);
		}
		handedToAssetModule = true;
		const asset = await assetModule.createAssetFromUpload(req.user.id, file, file.filename, options);
		return res.send(asset, 201);
	} finally {
		if (!handedToAssetModule) {
			file.emitFinish?.();
		}
	}
}

function validatePreviewPolicy(value): string {
	const policy = String(value || 'none').trim();
	if (!['none', 'standard'].includes(policy)) {
		throw new ApiProblemError(400, 'asset_preview_policy_invalid', 'Invalid preview policy');
	}
	return policy;
}

function parseOptionalPositiveInteger(value, code: string): number | null {
	if (value === undefined || value === null || value === '') {
		return null;
	}
	const parsed = Number(value);
	if (!Number.isSafeInteger(parsed) || parsed <= 0) {
		throw new ApiProblemError(400, code, 'Invalid identifier');
	}
	return parsed;
}

function isTrue(value): boolean {
	return value === true || value === 'true' || value === '1';
}

function sendOperation(res, operationId: number, app: IGeesomeApp) {
	const statusUrl = `${getPublicApiContext(app).apiBaseUrl}/operations/${operationId}`;
	res.setHeader('Location', statusUrl);
	res.setHeader('Retry-After', '2');
	return res.send({schemaVersion: 1, operationId: `op_${operationId}`, status: 'pending', statusUrl}, 202);
}

function serializeExisting(assetModule: any, asset: any) {
	return assetModule.serializeAsset(asset, false);
}
