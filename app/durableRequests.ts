import {createHash, randomUUID} from 'node:crypto';
import {DataTypes, Op} from 'sequelize';
import {startIntervalWorker} from './backgroundWorker.js';
import {ApiProblemError} from './modules/api/problem.js';

// Accepted requests are permanent retry receipts. Never expire their identity
// while the composed content/jobs can still exist.
export async function defineDurableRequestModel(sequelize) {
	const model = sequelize.models.durableApiRequest || sequelize.define('durableApiRequest', {
		id: {type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4},
		owner: {type: DataTypes.STRING(100), allowNull: false},
		kind: {type: DataTypes.STRING(40), allowNull: false},
		requestKey: {type: DataTypes.STRING(200), allowNull: false},
		requestHash: {type: DataTypes.STRING(64), allowNull: false},
		input: {type: DataTypes.JSONB, allowNull: false},
		context: {type: DataTypes.JSONB, allowNull: false},
		status: {type: DataTypes.STRING(20), allowNull: false, defaultValue: 'queued'},
		result: DataTypes.JSONB,
		errorCode: DataTypes.STRING(100),
		leaseToken: DataTypes.UUID,
		leaseUntil: DataTypes.DATE,
	}, {indexes: [
		{name: 'durable_api_requests_identity', unique: true, fields: ['owner', 'kind', 'requestKey']},
		{name: 'durable_api_requests_pending', fields: ['kind', 'status', 'leaseUntil', 'createdAt']},
		{name: 'durable_api_requests_active', fields: ['status'], where: {status: {[Op.in]: ['queued', 'processing']}}},
	]});
	await model.sync({});
	return model;
}

export function requestHash(input) {
	const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
		? Object.fromEntries(Object.keys(value).sort().filter(key => value[key] !== undefined).map(key => [key, canonical(value[key])])) : value;
	return createHash('sha256').update(JSON.stringify(canonical(input))).digest('hex');
}

export function createDurableRequests(Model, kind, execute, options: any = {}) {
	const leaseMs = options.leaseMs || 360000;
	const now = options.now || (() => new Date());
	let stopped = false;
	let running = null;
	const receipt = row => ({async: true, operationId: row.id, status: row.status,
		...(row.status === 'completed' ? {result: row.result} : {}),
		...(row.status === 'failed' ? {errorCode: row.errorCode} : {}), retryAfterSeconds: 0.25});
	const service = {
		async accept(owner, requestKey, input, context = {}) {
			if (typeof owner !== 'string' || !owner || typeof requestKey !== 'string' || !/^[A-Za-z0-9:_-]{1,200}$/.test(requestKey)) {
				throw new ApiProblemError(400, 'async_request_invalid', 'Invalid asynchronous request');
			}
			const hash = requestHash(input);
			const [created] = await Model.findOrCreate({where: {owner, kind, requestKey}, defaults: {input, context, requestHash: hash}});
			const accepted = await Model.sequelize.transaction(async transaction => {
				const row = await Model.findByPk(created.id, {transaction, lock: transaction.LOCK.UPDATE});
				if (row.requestHash !== hash) {
					throw new ApiProblemError(409, 'async_request_conflict', 'Request key already belongs to different input');
				}
				// Explicit same-key retry is allowed; status reads never replay failed work.
				if (row.status === 'failed') {
					await row.update({status: 'queued', errorCode: null, context: {...row.context, ...(context.apiKeyId ? {apiKeyId: context.apiKeyId} : {})}}, {transaction});
				}
				return receipt(row);
			});
			if (options.autoStart !== false) {
				void service.process().catch(() => console.error('Could not advance accepted asynchronous request.'));
			}
			return accepted;
		},
		async peek(owner, key, input) {
			const row=await Model.findOne({where:{owner,kind,requestKey:key}});
			if (!row) {
				return null;
			}
			if (row.requestHash!==requestHash(input)) {
				throw new ApiProblemError(409,'async_request_conflict','Request key already belongs to different input');
			}
			return receipt(row);
		},
		async get(owner, id) {
			if (typeof id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
				throw new ApiProblemError(404, 'async_request_not_found', 'Operation not found');
			}
			const row = await Model.findOne({where: {id, owner, kind}});
			if (!row) {
				throw new ApiProblemError(404, 'async_request_not_found', 'Operation not found');
			}
			return receipt(row);
		},
		process() {
			if (stopped || running) {
				return running || Promise.resolve();
			}
			running = Promise.resolve().then(() => options.runWorker ? options.runWorker(() => service.runOne()) : service.runOne()).finally(() => { running = null; });
			return running;
		},
		async runOne() {
			const token = randomUUID();
			const row = await Model.sequelize.transaction(async transaction => {
				const row = await Model.findOne({where: {kind, [Op.or]: [{status: 'queued'}, {status: 'processing', leaseUntil: {[Op.lte]: now()}}]},
					order: [['createdAt', 'ASC']], transaction, lock: transaction.LOCK.UPDATE, skipLocked: true});
				if (!row) {
					return null;
				}
				await row.update({status: 'processing', leaseToken: token, leaseUntil: new Date(now().getTime() + leaseMs)}, {transaction});
				return row;
			});
			if (!row) {
				return;
			}
			const where = {id: row.id, status: 'processing', leaseToken: token};
			let heartbeat = Promise.resolve();
			const timer = setInterval(() => {
				heartbeat = heartbeat.then(() => Model.update({leaseUntil: new Date(now().getTime() + leaseMs)}, {where})).then(() => undefined).catch(() => undefined);
			}, Math.max(1000, Math.floor(leaseMs / 6)));
			timer.unref?.();
			try {
				const result = await execute(row.owner, structuredClone(row.input), row.context);
				await Model.update({status: 'completed', result, leaseToken: null, leaseUntil: null, errorCode: null}, {where});
			} catch (error) {
				const code = error?.code || error?.errorCode;
				await Model.update({status: 'failed', errorCode: typeof code==='string' && /^[a-z][a-z0-9_]{0,99}$/.test(code) ? code : 'async_request_failed', leaseToken: null, leaseUntil: null}, {where});
			} finally {
				clearInterval(timer);
				await heartbeat;
			}
		},
		async stop() {
			stopped = true;
			await worker?.stop();
			await running;
		},
	};
	const worker = options.autoStart === false ? null : startIntervalWorker(() => service.process(), {
		intervalMs: 1000, onError: () => console.error('Asynchronous request worker could not advance its saved operation.'),
	});
	return service;
}

export async function runAsAcceptingKey(app, owner, context, scopes, permission, run) {
	const key = await app.ms.database.getApiKey(context.apiKeyId);
	if (!key || String(key.userId) !== owner || key.isDisabled || key.expiredOn && new Date(key.expiredOn).getTime() <= Date.now()) {
		throw new ApiProblemError(403, 'async_request_credentials_revoked', 'Accepting credentials are no longer valid');
	}
	const {requireIntegrationScopes} = await import('./modules/api/integrationScopes.js');
	requireIntegrationScopes(key, scopes);
	await app.checkUserCan(Number(owner), permission, key);
	return app.apiKeyContext.run(key, run);
}

export async function acceptStorageRequest(app, requests, userId, key, input, apiKeyId, ids, extraContext = {}) {
	const existing=await requests.peek(String(userId),key,input);
	if (existing && existing.status!=='failed') {
		return existing;
	}
	const {withStorageFence} = await import('./storageLifecycle.js');
	return withStorageFence(app, 'shared', async () => {
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
