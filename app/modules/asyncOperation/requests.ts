import {createHash} from 'node:crypto';
import {ApiProblemError} from '../api/problem.js';
import {withStorageFence, withStorageWorker} from '../../storageLifecycle.js';

export const retainedRequestModules = ['image-composition', 'publication-compose'];
export function requestHash(input) {
	const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
		? Object.fromEntries(Object.keys(value).sort().filter(key => value[key] !== undefined).map(key => [key, canonical(value[key])])) : value;
	return createHash('sha256').update(JSON.stringify(canonical(input))).digest('hex');
}

// Admission/status adapter only. Persistence, execution, cancellation, restart
// recovery and shutdown belong to the existing asyncOperation queue processor.
export function createQueuedRequests(app, kind, execute, options: {autoStart?: boolean} = {}) {
	const sequelize = app.ms.database.sequelize;
	const Queue = sequelize.model('userOperationQueue');
	const Operation = sequelize.model('userAsyncOperation');
	const load = (where, transaction?) => Queue.findOne({where: {module: kind, ...where}, include: [{association: 'asyncOperation'}], transaction});
	const view = queue => {
		const operation = queue.asyncOperation;
		const status = operation?.finishedAt ? 'completed' : operation?.inProcess ? 'processing'
			: operation?.errorMessage || operation?.cancel ? 'failed' : queue.isWaiting ? 'queued' : 'failed';
		return {async: true, operationId: Number(queue.id), asyncOperationId: queue.asyncOperationId || null, status,
			...(status === 'completed' ? {result: JSON.parse(operation.output || 'null')} : {}),
			...(status === 'failed' ? {errorCode: /^[a-z][a-z0-9_]{0,99}$/.test(operation?.errorMessage || '') ? operation.errorMessage : 'async_request_failed'} : {}), retryAfterSeconds: 0.25};
	};
	function identity(owner, key) {
		if (!Number.isSafeInteger(Number(owner)) || Number(owner) < 1 || typeof key !== 'string' || !/^[A-Za-z0-9:_-]{1,200}$/.test(key)) {
			throw new ApiProblemError(400, 'async_request_invalid', 'Invalid asynchronous request');
		}
		return {userId: Number(owner), inputHash: requestHash([Number(owner), kind, key])};
	}
	function assertInput(queue, input) {
		if (JSON.parse(queue.inputJson).requestHash !== requestHash(input)) {
			throw new ApiProblemError(409, 'async_request_conflict', 'Request key already belongs to different input');
		}
	}
	const requests = {
		async accept(owner, key, input, context = {}) {
			const where = identity(owner, key);
			const result = await sequelize.transaction(async transaction => {
				await sequelize.query('SELECT pg_advisory_xact_lock(hashtextextended(:identity, 0))', {replacements: {identity: `${kind}:${where.inputHash}`}, transaction});
				let queue = await load(where, transaction);
				if (!queue) {
					queue = await app.ms.asyncOperation.addUserOperationQueue(where.userId, kind, context['apiKeyId'], {requestHash: requestHash(input), request: input, context}, {transaction});
					await queue.update({inputHash: where.inputHash}, {transaction});
				} else {
					assertInput(queue, input);
					if (view(queue).status === 'failed') {
						// The frozen request/context stay unchanged. An explicit owner retry
						// may restore authorization using a currently valid accepting key.
						await Operation.update({inProcess: false, finishedAt: null, output: null, errorMessage: null, errorType: null, cancel: false, userApiKeyId: context['apiKeyId']}, {where: {id: queue.asyncOperationId}, transaction});
						await queue.update({isWaiting: true, userApiKeyId: context['apiKeyId']}, {transaction});
						queue.asyncOperation = null;
					}
				}
				return view(queue);
			});
			if (options.autoStart !== false) {
				void requests.process().catch(() => console.error('Could not advance accepted async operation.'));
			}
			return result;
		},
		async peek(owner, key, input) {
			const queue = await load(identity(owner, key));
			if (!queue) {
				return null;
			}
			assertInput(queue, input);
			return view(queue);
		},
		async get(owner, id) {
			const queue = Number.isSafeInteger(Number(id)) && Number(id) > 0 ? await load({id: Number(id), userId: Number(owner)}) : null;
			if (!queue) {
				throw new ApiProblemError(404, 'async_request_not_found', 'Operation not found');
			}
			return view(queue);
		},
		process() {
			return withStorageWorker(app, () => app.ms.asyncOperation.processModuleOperationQueue(kind, {
				limit: 1, resumeInterrupted: true,
				getAsyncOperationData: queue => ({name: kind, channel: `${kind}:${queue.id}`}),
				shouldRetry: error => error.retryable === true,
				run: async queue => {
					const saved = JSON.parse(queue.inputJson);
					try {
						return await execute(String(queue.userId), saved.request, {...saved.context, apiKeyId: queue.userApiKeyId});
					} catch (error) {
						const raw = error?.code || error?.errorCode;
						const code = typeof raw === 'string' && /^[a-z][a-z0-9_]{0,99}$/.test(raw) ? raw : 'async_request_failed';
						throw Object.assign(new Error(code), {retryable: error?.details?.retryable === true || ['storage_busy', 'storage_maintenance_busy'].includes(code)});
					}
				},
			}));
		},
	};
	return requests;
}

export async function runAsAcceptingKey(app, owner, context, scopes, permission, run) {
	const key = await app.ms.database.getApiKey(context.apiKeyId);
	if (!key || String(key.userId) !== owner || key.isDisabled || key.expiredOn && new Date(key.expiredOn).getTime() <= Date.now()) {
		throw new ApiProblemError(403, 'async_request_credentials_revoked', 'Accepting credentials are no longer valid');
	}
	const {requireIntegrationScopes} = await import('../api/integrationScopes.js');
	requireIntegrationScopes(key, scopes);
	await app.checkUserCan(Number(owner), permission, key);
	return app.apiKeyContext.run(key, run);
}

export async function acceptStorageRequest(app, requests, userId, key, input, apiKeyId, ids, extraContext = {}) {
	const existing = await requests.peek(String(userId), key, input);
	if (existing && existing.status !== 'failed') {
		return existing;
	}
	return withStorageFence(app, 'shared', async () => {
		const {Op} = await import('sequelize');
		const sources = await app.ms.database.models.Content.findAll({where: {userId,
			[Op.or]: [{storageId: {[Op.in]: ids}}, {manifestStorageId: {[Op.in]: ids}}]}});
		if (ids.some(id => !sources.some(source => !source.isDeleted && !source.isRemote && (source.storageId === id || source.manifestStorageId === id)))) {
			throw new ApiProblemError(403, 'async_request_source_unavailable', 'An original source is unavailable');
		}
		const fields = ['storageId', 'manifestStorageId', 'smallPreviewStorageId', 'mediumPreviewStorageId', 'largePreviewStorageId'];
		return requests.accept(String(userId), key, input, {...extraContext, apiKeyId,
			sources: sources.map(source => Object.fromEntries(fields.map(field => [field, source[field]])))});
	});
}
