import {createHash} from 'node:crypto';
import {Op} from 'sequelize';
import {IGeesomeApp} from '../../interface.js';
import {ApiProblemError} from '../api/problem.js';
import {getPublicApiContext} from '../api/publicUrls.js';
import IGeesomeAssetModule from './interface.js';

export default async (app: IGeesomeApp) => {
	app.checkModules(['api', 'database', 'content', 'asyncOperation']);
	const database: any = app.ms.database;
	const models = await (await import('./models.js')).default(database.sequelize, database.models);
	const module = getModule(app, models);
	(await import('./api.js')).default(app, module);
	return module;
};

export function getModule(app: IGeesomeApp, models: any): IGeesomeAssetModule {
	class AssetModule implements IGeesomeAssetModule {
		supportsBatches = true;

		async flushDatabase() {
			await models.AssetBatchItem.destroy({where: {}});
			await models.AssetBatch.destroy({where: {}});
			await models.AssetIdempotencyKey.destroy({where: {}});
			await models.Asset.destroy({where: {}});
		}

		async prepareAssetRequest(userId: number, key: string, requestHash: string) {
			validateIdempotencyKey(key);
			const [request, created] = await models.AssetIdempotencyKey.findOrCreate({
				where: {userId, namespace: 'assets', key},
				defaults: {userId, namespace: 'assets', key, requestHash, status: 'pending'}
			});
			if (created) {
				return {request, created: true};
			}
			if (request.requestHash !== requestHash) {
				throw new ApiProblemError(409, 'idempotency_key_conflict', 'Idempotency key conflict', 'The idempotency key was already used for a different asset request.');
			}
			if (request.status === 'succeeded' && request.assetId) {
				const asset = await models.Asset.findByPk(request.assetId);
				return {request, created: false, asset};
			}
			if (request.asyncOperationId) {
				return {request, created: false, operationId: request.asyncOperationId};
			}
			if (request.status === 'failed') {
				await request.update({status: 'pending', errorCode: null});
				return {request, created: true};
			}
			throw new ApiProblemError(409, 'idempotency_request_in_progress', 'Request in progress', 'An asset request with this idempotency key is already in progress.');
		}

		async createAssetFromUpload(userId: number, data: any, fileName: string, options: any) {
			const request = await models.AssetIdempotencyKey.findOne({where: {id: options.idempotencyRequestId, userId}});
			if (!request) {
				throw new ApiProblemError(409, 'idempotency_request_not_found', 'Idempotency request not found');
			}
			try {
				const content = await app.ms.content.saveData(userId, data, fileName, {
					userApiKeyId: options.userApiKeyId,
					driver: options.previewPolicy === 'standard' ? undefined : {raw: true},
					skipFileCatalog: true,
					mimeType: options.mimeType,
					properties: {
						assetSha256: options.sha256,
						assetLogicalPath: options.logicalPath || null
					}
				});
				await setStorageObjectSha256(app, content.storageId, options.sha256);
				const pinStatus = await getAssetPinStatus(app, content);
				const [asset, created] = await models.Asset.findOrCreate({
					where: {userId, storageId: content.storageId},
					defaults: {
						userId,
						contentId: content.id,
						storageId: content.storageId,
						sha256: options.sha256,
						bytes: options.bytes,
						mimeType: options.mimeType || content.mimeType || 'application/octet-stream',
						logicalPath: options.logicalPath || null,
						pinStatus
					}
				});
				if (!created) {
					await asset.update({sha256: options.sha256, bytes: options.bytes, pinStatus});
				}
				await this.attachAssetToBatch(userId, asset, options.batchId, options.logicalId);
				await request.update({status: 'succeeded', assetId: asset.id, errorCode: null});
				return {...this.serializeAsset(asset, created), contentId: content.id};
			} catch (error) {
				await request.update({status: 'failed', errorCode: getErrorCode(error)});
				throw error;
			} finally {
				data?.emitFinish?.();
			}
		}

		async getAsset(userId: number, storageId: string) {
			const asset = await models.Asset.findOne({where: {userId, storageId}});
			if (!asset) {
				throw new ApiProblemError(404, 'asset_not_found', 'Asset not found', 'No asset visible to the authenticated user has this storage ID.');
			}
			return this.serializeAsset(asset, false);
		}

		async linkAssetOperation(requestId: number, operationId: number) {
			await models.AssetIdempotencyKey.update({asyncOperationId: operationId}, {where: {id: requestId}});
		}

		async createBatch(userId: number, input: any, idempotencyKey: string) {
			validateIdempotencyKey(idempotencyKey);
			const items = validateBatchItems(input?.items);
			const requestHash = sha256(JSON.stringify(items));
			const existingBatch = await models.AssetBatch.findOne({where: {userId, idempotencyKey}});
			if (existingBatch) {
				if (existingBatch.requestHash !== requestHash) {
					throw new ApiProblemError(409, 'idempotency_key_conflict', 'Idempotency key conflict', 'The batch idempotency key was already used for different items.');
				}
				return this.getBatch(userId, existingBatch.id);
			}
			const transaction = await models.AssetBatch.sequelize.transaction();
			let createdBatchId: number | null = null;
			try {
				const batch = await models.AssetBatch.create({userId, idempotencyKey, requestHash, status: 'pending'}, {transaction});
				createdBatchId = batch.id;
				const hashes = Array.from(new Set(items.map(item => item.sha256)));
				const existingAssets = await models.Asset.findAll({where: {userId, sha256: {[Op.in]: hashes}}, transaction});
				const assetsByHash = new Map(existingAssets.map(asset => [asset.sha256, asset]));
				for (const item of items) {
					const candidate: any = assetsByHash.get(item.sha256);
					const asset = candidate && Number(candidate.bytes) === Number(item.bytes) ? candidate : null;
					await models.AssetBatchItem.create({
						...item,
						userId,
						assetBatchId: batch.id,
						assetId: asset?.id || null,
						status: asset ? 'available' : 'missing'
					}, {transaction});
				}
				await transaction.commit();
			} catch (error) {
				if (!transaction.finished) {
					await transaction.rollback();
				}
				const replay = await models.AssetBatch.findOne({where: {userId, idempotencyKey}});
				if (replay) {
					if (replay.requestHash !== requestHash) {
						throw new ApiProblemError(409, 'idempotency_key_conflict', 'Idempotency key conflict');
					}
					return this.getBatch(userId, replay.id);
				}
				throw error;
			}
			return this.getBatch(userId, createdBatchId);
		}

		async getBatch(userId: number, batchId: number) {
			const batch = await models.AssetBatch.findOne({
				where: {id: batchId, userId},
				include: [{model: models.AssetBatchItem, as: 'items', include: [{model: models.Asset, as: 'asset'}]}],
				order: [[{model: models.AssetBatchItem, as: 'items'}, 'logicalId', 'ASC']]
			});
			if (!batch) {
				throw new ApiProblemError(404, 'asset_batch_not_found', 'Asset batch not found');
			}
			return this.serializeBatch(batch);
		}

		async completeBatch(userId: number, batchId: number, userApiKeyId: number) {
			const batch = await models.AssetBatch.findOne({
				where: {id: batchId, userId},
				include: [{model: models.AssetBatchItem, as: 'items', include: [{model: models.Asset, as: 'asset'}]}]
			});
			if (!batch) {
				throw new ApiProblemError(404, 'asset_batch_not_found', 'Asset batch not found');
			}
			if (batch.status === 'completed') {
				return this.serializeBatch(batch);
			}
			const missing = batch.items.filter(item => !item.assetId || item.status !== 'available');
			if (missing.length) {
				throw new ApiProblemError(409, 'asset_batch_incomplete', 'Asset batch incomplete', `${missing.length} batch items still require upload.`, {missingLogicalIds: missing.map(item => item.logicalId)});
			}
			const [claimed] = await models.AssetBatch.update({status: 'processing'}, {where: {id: batch.id, userId, status: 'pending'}});
			if (!claimed) {
				throw new ApiProblemError(409, 'asset_batch_completion_in_progress', 'Batch completion in progress');
			}
			const manifest = buildBatchManifest(batch);
			const manifestJson = JSON.stringify(manifest);
			const manifestSha256 = sha256(manifestJson);
			try {
				const content = await app.ms.content.saveData(userId, manifestJson, `asset-batch-${batch.id}.json`, {
					userApiKeyId,
					driver: {raw: true},
					skipFileCatalog: true,
					mimeType: 'application/json',
					properties: {assetBatchId: batch.id, manifestSha256}
				});
				await setStorageObjectSha256(app, content.storageId, manifestSha256);
				await batch.update({status: 'completed', manifestStorageId: content.storageId, manifestSha256});
				return this.getBatch(userId, batch.id);
			} catch (error) {
				await models.AssetBatch.update({status: 'pending'}, {where: {id: batch.id, status: 'processing'}});
				throw error;
			}
		}

		async attachAssetToBatch(userId: number, asset: any, batchId?: number, logicalId?: string) {
			if (!batchId && !logicalId) {
				return;
			}
			if (!batchId || !logicalId) {
				throw new ApiProblemError(400, 'asset_batch_binding_invalid', 'Invalid batch binding', 'Both batchId and logicalId are required.');
			}
			const item = await models.AssetBatchItem.findOne({where: {assetBatchId: batchId, userId, logicalId}});
			if (!item) {
				throw new ApiProblemError(404, 'asset_batch_item_not_found', 'Asset batch item not found');
			}
			if (item.sha256 !== asset.sha256 || Number(item.bytes) !== Number(asset.bytes)) {
				throw new ApiProblemError(422, 'asset_batch_item_mismatch', 'Asset does not match batch item');
			}
			await item.update({assetId: asset.id, status: 'available'});
		}

		serializeAsset(asset: any, created: boolean) {
			const data = typeof asset.toJSON === 'function' ? asset.toJSON() : asset;
			const context = getPublicApiContext(app);
			return {
				schemaVersion: 1,
				assetId: `asset_${data.id}`,
				storageId: data.storageId,
				sha256: data.sha256,
				bytes: Number(data.bytes),
				mimeType: data.mimeType,
				logicalPath: data.logicalPath || null,
				created,
				pinStatus: data.pinStatus,
				urls: {
					content: `${context.publicUrl}/ipfs/${data.storageId}`,
					metadata: `${context.apiBaseUrl}/assets/${data.storageId}`
				}
			};
		}

		serializeBatch(batch: any) {
			const data = typeof batch.toJSON === 'function' ? batch.toJSON() : batch;
			const context = getPublicApiContext(app);
			return {
				schemaVersion: 1,
				batchId: data.id,
				status: data.status,
				manifest: data.manifestStorageId ? {
					storageId: data.manifestStorageId,
					sha256: data.manifestSha256,
					url: `${context.publicUrl}/ipfs/${data.manifestStorageId}`
				} : null,
				items: (data.items || []).sort((a, b) => a.logicalId.localeCompare(b.logicalId)).map(item => ({
					logicalId: item.logicalId,
					logicalPath: item.logicalPath || null,
					sha256: item.sha256,
					bytes: Number(item.bytes),
					mimeType: item.mimeType,
					status: item.status,
					requiredUpload: item.status !== 'available',
					asset: item.asset ? this.serializeAsset(item.asset, false) : null
				}))
			};
		}
	}

	return new AssetModule();
}

function validateIdempotencyKey(key: string) {
	if (!key || key.length > 200 || !/^[A-Za-z0-9._:/-]+$/.test(key)) {
		throw new ApiProblemError(400, 'idempotency_key_invalid', 'Invalid idempotency key', 'Use 1-200 URL-safe characters.');
	}
}

function validateBatchItems(value: any): any[] {
	if (!Array.isArray(value) || !value.length || value.length > 1000) {
		throw new ApiProblemError(400, 'asset_batch_items_invalid', 'Invalid batch items', 'Provide between 1 and 1000 items.');
	}
	const logicalIds = new Set<string>();
	return value.map(item => {
		const logicalId = String(item?.logicalId || '').trim();
		if (!logicalId || logicalId.length > 200 || logicalIds.has(logicalId)) {
			throw new ApiProblemError(400, 'asset_batch_logical_id_invalid', 'Invalid batch logical ID');
		}
		logicalIds.add(logicalId);
		return {
			logicalId,
			logicalPath: validateLogicalPath(item.logicalPath),
			sha256: validateSha256(item.sha256),
			bytes: validateBytes(item.bytes),
			mimeType: validateMimeType(item.mimeType)
		};
	});
}

export function validateSha256(value): string {
	const digest = String(value || '').trim().toLowerCase();
	if (!/^[a-f0-9]{64}$/.test(digest)) {
		throw new ApiProblemError(400, 'sha256_invalid', 'Invalid SHA-256', 'Expected 64 lowercase hexadecimal characters.');
	}
	return digest;
}

export function validateBytes(value): number {
	const bytes = Number(value);
	if (!Number.isSafeInteger(bytes) || bytes < 0) {
		throw new ApiProblemError(400, 'asset_bytes_invalid', 'Invalid asset byte count');
	}
	return bytes;
}

export function validateMimeType(value): string {
	const mimeType = String(value || 'application/octet-stream').trim().toLowerCase();
	if (mimeType.length > 200 || !/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/.test(mimeType)) {
		throw new ApiProblemError(400, 'asset_mime_type_invalid', 'Invalid asset MIME type');
	}
	return mimeType;
}

export function validateLogicalPath(value): string | null {
	const logicalPath = String(value || '').trim().replace(/^\/+/, '');
	if (!logicalPath) {
		return null;
	}
	if (logicalPath.length > 500 || logicalPath.split('/').includes('..')) {
		throw new ApiProblemError(400, 'asset_logical_path_invalid', 'Invalid logical path');
	}
	return logicalPath;
}

export function getAssetRequestHash(input: any): string {
	return sha256(JSON.stringify({
		sha256: input.sha256,
		bytes: Number(input.bytes),
		mimeType: input.mimeType,
		logicalPath: input.logicalPath || null,
		previewPolicy: input.previewPolicy || 'none',
		batchId: input.batchId || null,
		logicalId: input.logicalId || null
	}));
}

function buildBatchManifest(batch: any) {
	const items = batch.items
		.map(item => ({
			logicalId: item.logicalId,
			logicalPath: item.logicalPath || null,
			storageId: item.asset.storageId,
			sha256: item.sha256,
			bytes: Number(item.bytes),
			mimeType: item.mimeType
		}))
		.sort((a, b) => a.logicalId.localeCompare(b.logicalId));
	return {schemaVersion: 1, batchId: batch.id, items};
}

function sha256(value: string): string {
	return createHash('sha256').update(value).digest('hex');
}

async function setStorageObjectSha256(app: IGeesomeApp, storageId: string, digest: string) {
	const database: any = app.ms.database;
	if (typeof database.setStorageObjectSha256 === 'function') {
		await database.setStorageObjectSha256(storageId, digest);
		return;
	}
	await database.models.StorageObject.update({sha256: digest}, {where: {storageId}});
}

async function getAssetPinStatus(app: IGeesomeApp, content: any): Promise<string> {
	if (content.isPinned === true) {
		return 'pinned';
	}
	const database: any = app.ms.database;
	if (typeof database.getStorageObjectPinProvenance !== 'function') {
		return 'stored';
	}
	const provenance = await database.getStorageObjectPinProvenance(content.storageId);
	return provenance?.isConfirmedPinned ? 'confirmed' : 'stored';
}

function getErrorCode(error): string {
	if (error?.code && typeof error.code === 'string') {
		return error.code;
	}
	if (error?.message && /^[a-z0-9_]+$/.test(error.message)) {
		return error.message;
	}
	return 'asset_upload_failed';
}
