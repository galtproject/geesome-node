import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import ipfsHelper from 'geesome-libs/src/ipfsHelper.js';
import {IGeesomeApp} from '../../interface.js';
import {CorePermissionName} from '../database/interface.js';
import {startIntervalWorker} from '../../backgroundWorker.js';
import {requireIntegrationScopes} from '../api/integrationScopes.js';
import {ApiProblemError} from '../api/problem.js';
import {buildArchive} from './buildArchive.js';
import IGeesomeArchiveModule from './interface.js';

const queueModuleName = 'content-archive';

export default async (app: IGeesomeApp) => {
	app.checkModules(['database', 'storage', 'asyncOperation', 'content', 'api']);
	const models = await (await import('./models.js')).default(app.ms.database.sequelize);
	const module = getModule(app, models);
	(await import('./api.js')).default(app, module);
	return module;
};

export function getModule(app: IGeesomeApp, models): IGeesomeArchiveModule {
	let processing: Promise<any> | null = null;
	let stopped = false;
	const worker = startIntervalWorker(() => module.processQueue(), {
		intervalMs: 5000,
		runImmediately: true,
		onError: error => console.error('archive_queue_error', error),
	});
	const module = {
		async requestArchive(userId, storageId, apiKeyId = null) {
			await app.checkUserCan(userId, CorePermissionName.UserSaveData);
			const originalStorageId = normalizeStorageId(storageId);
			await checkOwnership(userId, originalStorageId);
			const archive = await this.getArchive(originalStorageId);
			if (archive) {
				return {status: 'completed', ...archive};
			}
			const queue = await app.ms.asyncOperation.addUniqueUserOperationQueue(userId, queueModuleName, apiKeyId, {userId, originalStorageId});
			void this.processQueue().catch(error => console.error('archive_queue_error', error));
			return {status: 'queued', originalStorageId, queueId: queue.id};
		},

		async getArchive(storageId) {
			const row = await models.ContentArchive.findOne({where: {originalStorageId: normalizeStorageId(storageId)}});
			return row ? {originalStorageId: row.originalStorageId, archivedStorageId: row.archivedStorageId} : null;
		},

		processQueue() {
			if (stopped) {
				return Promise.resolve({processed: 0});
			}
			if (processing) {
				return processing;
			}
			processing = app.ms.asyncOperation.processModuleOperationQueue(queueModuleName, {
				limit: 10,
				getPayload: queue => JSON.parse(queue.inputJson),
				getAsyncOperationData: (_queue, payload) => ({name: 'archive', channel: payload.originalStorageId}),
				run: async (queue, operation, payload) => {
					const originalStorageId = normalizeStorageId(payload.originalStorageId);
					const apiKey = queue.userApiKeyId ? await app.ms.database.getApiKey(queue.userApiKeyId) : null;
					if (queue.userApiKeyId && !apiKey) {
						throw new Error('not_permitted');
					}
					await app.checkUserCan(queue.userId, CorePermissionName.UserSaveData, apiKey);
					if (apiKey) {
						requireIntegrationScopes(apiKey, ['content:write']);
					}
					await checkOwnership(queue.userId, originalStorageId);
					const existing = await module.getArchive(originalStorageId);
					if (existing) {
						return existing;
					}
					const checkpoint = () => app.ms.asyncOperation.handleOperationCancel(queue.userId, operation.id);
					const directory = await mkdtemp(path.join(tmpdir(), 'geesome-archive-'));
					const signal = AbortSignal.timeout(10 * 60 * 1000);
					try {
						const filePath = path.join(directory, 'archive.tar.gz');
						await buildArchive(app.ms.storage, originalStorageId, filePath, checkpoint, signal);
						await checkpoint();
						const saved = await app.ms.storage.saveFileByPath(filePath, {waitForPin: true});
						await checkpoint();
						await models.ContentArchive.findOrCreate({where: {originalStorageId}, defaults: {archivedStorageId: saved.id, userId: queue.userId}});
						return module.getArchive(originalStorageId);
					} finally {
						await rm(directory, {recursive: true, force: true});
					}
				},
			}).finally(() => { processing = null; });
			return processing;
		},

		async flushDatabase() {
			await models.ContentArchive.destroy({where: {}});
		},

		async stop() {
			stopped = true;
			await worker.stop();
			await processing;
		},
	};

	async function checkOwnership(userId, storageId) {
		const cid = ipfsHelper.ipfsHashToCid(storageId);
		const variants = [storageId];
		if (cid.code === 0x70) {
			variants.push(cid.toV0().toString());
		}
		const contents = await app.ms.database.getContentByStorageIdListAndUserId(variants, userId);
		if (contents.some(content => !content.isRemote)) {
			return;
		}
		const generator = app.ms['staticSiteGenerator'];
		for (const variant of variants) {
			const site = await generator?.getStaticSiteByStorageId(variant);
			if (site && Number(site.userId) === Number(userId)) {
				return;
			}
		}
		throw new Error('not_permitted');
	}
	return module;
}

export function normalizeStorageId(value: string): string {
	try {
		if (typeof value !== 'string' || value.length > 100 || !/^[a-zA-Z0-9]+$/.test(value)) {
			throw new Error('invalid_storage_id');
		}
		const cid = ipfsHelper.ipfsHashToCid(value);
		if (cid.code !== 0x70 && cid.code !== 0x55) {
			throw new Error('invalid_storage_id');
		}
		return cid.toV1().toString();
	} catch (_error) {
		throw new ApiProblemError(400, 'invalid_storage_id', 'Invalid storage id', 'invalid_storage_id');
	}
}
