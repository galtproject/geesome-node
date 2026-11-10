import fs from 'node:fs';
import {promises as fsp} from 'node:fs';
import path from 'node:path';
import {randomUUID, createHash} from 'node:crypto';
import {finished} from 'node:stream/promises';
import {Op, literal} from 'sequelize';
import asyncBusboy from './asyncBusboy.js';
import {ApiProblemError} from '../api/problem.js';
import {CorePermissionName, UserLimitName} from '../database/interface.js';
import {withStorageFence, withStorageWorker} from '../../storageLifecycle.js';

export const durableUploadModule = 'durable-upload';
const MiB = 1024 * 1024;

export function uploadStagingPolicy(environment = process.env) {
	const integer = (name, fallback) => {
		const raw = environment[name];
		if (raw === undefined || raw === '') {
			return fallback;
		}
		const value = Number(raw);
		if (!/^[1-9][0-9]*$/.test(raw) || !Number.isSafeInteger(value)) {
			throw new Error(`invalid_${name.toLowerCase()}`);
		}
		return value;
	};
	return {directory: path.resolve(environment.DATA_DIR || 'data', 'upload-staging'),
		maxFileBytes: integer('GEESOME_MAX_UPLOAD_BYTES', 2000 * MiB),
		maxBytes: integer('GEESOME_UPLOAD_STAGING_BYTES', 8192 * MiB),
		userBytes: integer('GEESOME_UPLOAD_STAGING_USER_BYTES', 4096 * MiB),
		minFreeBytes: integer('GEESOME_UPLOAD_STAGING_MIN_FREE_BYTES', 256 * MiB),
		maxJobs: integer('GEESOME_UPLOAD_STAGING_MAX_JOBS', 1000),
		receiveTimeoutMs: integer('GEESOME_UPLOAD_RECEIVE_TIMEOUT_MS', 30 * 60 * 1000)};
}

// Files are private local staging, not IPFS objects. Only execution enters the
// shared writer fence. Queue + ordinary operation form the durable receipt.
export class DurableUploads {
	policy;
	constructor(public app, policy = uploadStagingPolicy()) {
		this.policy = policy;
	}
	get sequelize() { return this.app.ms.database.sequelize; }
	get Queue() { return this.sequelize.model('userOperationQueue'); }
	get Operation() { return this.sequelize.model('userAsyncOperation'); }
	file(id) {
		if (!/^[a-f0-9-]{36}$/.test(id)) {
			throw new Error('upload_staging_identity_invalid');
		}
		return path.join(this.policy.directory, id, 'file.bin');
	}
	async authorize(userId, apiKeyId) {
		const key = apiKeyId ? await this.app.ms.database.getApiKey(apiKeyId) : null;
		if (apiKeyId && !key) {
			throw new ApiProblemError(403, 'not_permitted', 'Upload API key is unavailable');
		}
		// Match ordinary save-file authorization, including legacy permissions and
		// assets:write keys; source-resave's stricter scopes are a separate API.
		await this.app.checkUserCan(userId, CorePermissionName.UserSaveData, key);
		return key;
	}
	async reserve(userId, apiKeyId, contentLength?: string) {
		await this.authorize(userId, apiKeyId);
		await fsp.mkdir(this.policy.directory, {recursive: true, mode: 0o700});
		const remaining = await this.app.getUserLimitRemained(userId, UserLimitName.SaveContentSize);
		return this.sequelize.transaction(async transaction => {
			await this.sequelize.query('SELECT pg_advisory_xact_lock(17422, 1)', {transaction});
			const live = await this.Queue.findAll({attributes: ['userId', 'inputJson'],
				where: {module: durableUploadModule, [Op.and]: literal("(\"userOperationQueue\".\"inputJson\"::jsonb->>'reservedBytes')::bigint > 0")}, transaction, limit: this.policy.maxJobs + 1});
			const reservations = live.map(row => ({userId: row.userId, bytes: JSON.parse(row.inputJson).reservedBytes || 0}));
			const total = reservations.reduce((sum, item) => sum + item.bytes, 0);
			const owned = reservations.filter(item => item.userId === userId).reduce((sum, item) => sum + item.bytes, 0);
			const stat = await fsp.statfs(this.policy.directory);
			const capacity = Math.min(this.policy.maxFileBytes, this.policy.maxBytes - total,
				this.policy.userBytes - owned, remaining == null ? Infinity : remaining - owned,
				stat.bavail * stat.bsize - this.policy.minFreeBytes - total);
			if (capacity < 1 || live.length >= this.policy.maxJobs) {
				throw new ApiProblemError(413, 'upload_staging_full', 'Upload staging or owner quota exhausted');
			}
			const declared = typeof contentLength === 'string' && /^[1-9][0-9]*$/.test(contentLength)
				&& Number.isSafeInteger(Number(contentLength)) ? Number(contentLength) : 16 * MiB;
			const input = {fileId: randomUUID(), reservedBytes: Math.min(capacity, declared)};
			const operation = await this.Operation.create({userId, userApiKeyId: apiKeyId, module: durableUploadModule,
				name: 'save-data', channel: `upload:${input.fileId}`, inProcess: true,
				output: JSON.stringify({upload: {phase: 'receiving'}})}, {transaction});
			const queue = await this.Queue.create({userId, userApiKeyId: apiKeyId, module: durableUploadModule,
				inputHash: input.fileId, inputJson: JSON.stringify(input), isWaiting: false, asyncOperationId: operation.id}, {transaction});
			return {queue, operation, input};
		});
	}
	async extendReservation(queue, input, bytes) {
		if (bytes <= input.reservedBytes) {
			return;
		}
		const remaining = await this.app.getUserLimitRemained(queue.userId, UserLimitName.SaveContentSize);
		const reserved = await this.sequelize.transaction(async transaction => {
			await this.sequelize.query('SELECT pg_advisory_xact_lock(17422, 1)', {transaction});
			const current = await this.Queue.findByPk(queue.id, {attributes: ['inputJson'], transaction});
			if (!current || !JSON.parse(current.inputJson).reservedBytes) {
				throw new ApiProblemError(409, 'upload_not_receiving', 'Upload reception already closed');
			}
			const live = await this.Queue.findAll({attributes: ['userId', 'inputJson'],
				where: {module: durableUploadModule, [Op.and]: literal('(\"userOperationQueue\".\"inputJson\"::jsonb->>\'reservedBytes\')::bigint > 0')}, transaction,
				limit: this.policy.maxJobs + 1});
			const reservations = live.map(row => ({userId: row.userId, bytes: JSON.parse(row.inputJson).reservedBytes || 0}));
			const total = reservations.reduce((sum, item) => sum + item.bytes, 0) - input.reservedBytes;
			const owned = reservations.filter(item => item.userId === queue.userId).reduce((sum, item) => sum + item.bytes, 0) - input.reservedBytes;
			const stat = await fsp.statfs(this.policy.directory);
			const capacity = Math.min(this.policy.maxFileBytes, this.policy.maxBytes - total,
				this.policy.userBytes - owned, remaining == null ? Infinity : remaining - owned,
				stat.bavail * stat.bsize - this.policy.minFreeBytes - total);
			if (bytes > capacity) {
				throw new ApiProblemError(413, 'upload_staging_full', 'Upload staging or owner quota exhausted');
			}
			const next = Math.min(capacity, Math.max(bytes, input.reservedBytes * 2));
			await queue.update({inputJson: JSON.stringify({...input, reservedBytes: next})}, {transaction});
			return next;
		});
		input.reservedBytes = reserved;
	}

	async accept(req) {
		const {queue, operation, input} = await this.reserve(req.user.id, req.apiKey.id, req.headers['content-length']);
		let files = [];
		let accepted = false;
		const receiveTimer = setTimeout(() => req.stream.destroy(
			new ApiProblemError(408, 'upload_receive_timeout', 'Upload reception timed out')), this.policy.receiveTimeoutMs);
		receiveTimer.unref();
		try {
			await fsp.mkdir(path.dirname(this.file(input.fileId)), {recursive: true, mode: 0o700});
			const parsed = await asyncBusboy(req.stream, {headers: req.headers, tempDir: path.dirname(this.file(input.fileId)),
				fileByteBudget: bytes => this.extendReservation(queue, input, bytes),
				limits: {files: 1, fields: 30, parts: 32, fieldSize: 16384, fileSize: this.policy.maxFileBytes}});
			clearTimeout(receiveTimer);
			files = parsed.files;
			const body = parsed.fields;
			if (files.length !== 1 || files[0].fieldname !== 'file') {
				throw new ApiProblemError(400, 'upload_file_required', 'Expected one file field');
			}
			if (body.imagePolicy !== undefined || body.optimize !== undefined) {
				throw new ApiProblemError(400, 'image_optimization_driver_required', 'Use the imageOptimize driver');
			}
			const file = files[0];
			file.destroy();
			await finished(file).catch(() => {});
			const options: any = {userApiKeyId: req.apiKey.id};
			for (const key of ['driver', 'groupId', 'folderId', 'path', 'chatAttachmentReservationId']) {
				if (body[key] !== undefined) {
					options[key] = body[key];
				}
			}
			options.skipFileCatalog = Boolean(options.chatAttachmentReservationId);
			const destination = this.file(input.fileId);
			await fsp.rename(file.tempPath, destination);
			const handle = await fsp.open(destination, 'r');
			try { await handle.sync(); } finally { await handle.close(); }
			const directory = await fsp.open(path.dirname(destination), 'r');
			try { await directory.sync(); } finally { await directory.close(); }
			const parent = await fsp.open(this.policy.directory, 'r');
			try { await parent.sync(); } finally { await parent.close(); }
			const stored = {...input, reservedBytes: Math.max(1, file.bytes), filename: file.filename, bytes: file.bytes, sha256: file.sha256, options};
			await this.sequelize.transaction(async transaction => {
				await queue.update({inputJson: JSON.stringify(stored), isWaiting: true}, {transaction});
				await operation.update({output: JSON.stringify({upload: {phase: 'staged', acceptedAt: new Date().toISOString()}})}, {transaction});
			});
			accepted = true;
			return {receipt: {asyncOperationId: operation.id, channel: operation.channel},
				async: Boolean(body.async)};
		} finally {
			clearTimeout(receiveTimer);
			for (const file of files) {
				file.on('error', () => {});
				file.destroy();
				file.emitFinish();
			}
			if (!accepted) {
				await this.removeFile(queue, input);
				await operation.update({inProcess: false, finishedAt: new Date(), errorType: 'upload_not_accepted',
					errorMessage: 'Upload was not accepted.'});
			}
		}
	}
	async removeFile(queue, input) {
		await fsp.rm(path.dirname(this.file(input.fileId)), {force: true, recursive: true});
		const parent = await fsp.open(this.policy.directory, 'r');
		try { await parent.sync(); } finally { await parent.close(); }
		await this.sequelize.transaction(async transaction => {
			await this.sequelize.query('SELECT pg_advisory_xact_lock(17422, 1)', {transaction});
			await queue.update({isWaiting: false, inputJson: JSON.stringify({...input, reservedBytes: 0})}, {transaction});
		});
	}
	async recover() {
		await fsp.mkdir(this.policy.directory, {recursive: true, mode: 0o700});
		// The node's startup recovery runs before workers. Only staged, never
		// started bytes can be replayed. Interrupted imports remain explicit unknowns.
		const rows = await this.Queue.findAll({where: {module: durableUploadModule, [Op.and]: literal("(\"userOperationQueue\".\"inputJson\"::jsonb->>'reservedBytes')::bigint > 0")},
			include: [{association: 'asyncOperation', required: true}]});
		for (const queue of rows) {
			const input = JSON.parse(queue.inputJson);
			const operation = queue.asyncOperation;
			const output = JSON.parse(operation.output || '{}');
			if (output.upload?.phase === 'staged') {
				await operation.update({inProcess: true, errorType: null, errorMessage: null});
			} else if (output.upload?.phase === 'imported' && output.content?.id) {
				await operation.update({inProcess: false, contentId: output.content.id, finishedAt: new Date(), errorType: null, errorMessage: null});
				await this.removeFile(queue, input);
			} else if (output.upload?.phase === 'receiving') {
				await this.removeFile(queue, input);
				await operation.update({inProcess: false, finishedAt: new Date(), errorType: 'upload_not_accepted', errorMessage: 'Upload interrupted before acceptance.'});
			} else {
				await this.markUnknown(operation);
				await queue.update({isWaiting: false});
			}
		}
	}
	async markUnknown(operation) {
		await operation.update({inProcess: false, finishedAt: new Date(), errorType: 'upload_outcome_unknown',
			errorMessage: 'Upload import outcome is unknown. Check Media before uploading again; original staged bytes are retained.',
			output: JSON.stringify({upload: {phase: 'unknown', retained: true}})});
	}
	async execute(queue, operation) {
		const input = JSON.parse(queue.inputJson);
		const key = await this.authorize(queue.userId, queue.userApiKeyId);
		await this.app.checkUserCan(queue.userId, CorePermissionName.UserSaveData, key);
		const previous = await this.Operation.findByPk(operation.id);
		if (previous.cancel) {
			await this.removeFile(queue, input);
			throw new Error('upload_cancelled');
		}
		const file = this.file(input.fileId);
		const hash = createHash('sha256');
		let bytes = 0;
		for await (const chunk of fs.createReadStream(file)) {
			hash.update(chunk);
			bytes += chunk.length;
		}
		if (bytes !== input.bytes || hash.digest('hex') !== input.sha256) {
			throw new Error('upload_staging_integrity_failed');
		}
		const remaining = await this.app.getUserLimitRemained(queue.userId, UserLimitName.SaveContentSize);
		if (remaining != null && remaining < input.bytes) {
			throw new ApiProblemError(413, 'upload_quota_exhausted', 'Owner upload quota exhausted before import');
		}
		await this.Operation.update({output: JSON.stringify({upload: {phase: 'importing', startedAt: new Date().toISOString()}})}, {where: {id: operation.id}});
		const stream = fs.createReadStream(file);
		let saved: any;
		try {
			saved = await this.app.runWithApiKey(key, () => this.app.ms.content.saveData(queue.userId,
				stream, input.filename, {...input.options, waitForPin: true}));
		} catch (error) {
			await this.markUnknown(previous);
			throw new Error('upload_outcome_unknown: Check Media before uploading again. Staged bytes retained.');
		} finally {
			stream.destroy();
		}
		const content = saved.toJSON ? saved.toJSON() : saved;
		const result = {content, upload: {phase: 'imported', completedAt: new Date().toISOString()}};
		// Checkpoint confirmed result before deleting the only local original.
		await this.Operation.update({output: JSON.stringify(result), contentId: content.id, inProcess: false, finishedAt: new Date()}, {where: {id: operation.id}});
		try {
			await this.removeFile(queue, input);
		} catch {
			// Keep the confirmed result and quota reservation; startup retries only
			// local cleanup, never the import. Do not downgrade known success.
			console.error('upload_staging_cleanup_pending');
		}
		return result;
	}

	async processQueue() {
		const pending = await this.Queue.findOne({where: {module: durableUploadModule, isWaiting: true},
			include: [{association: 'asyncOperation', required: true, where: {finishedAt: null}}]});
		if (!pending) {
			return {processed: 0};
		}
		try {
			return await withStorageWorker(this.app, () => withStorageFence(this.app, 'shared', () =>
				this.app.ms.asyncOperation.processModuleOperationQueue(durableUploadModule, {
					limit: 10, resumeInterrupted: true,
					isPendingOperation: queue => JSON.parse(queue.asyncOperation?.output || '{}').upload?.phase === 'staged',
					getAsyncOperationData: () => ({name: 'save-data'}),
					onError: async (_error, queue, operation) => {
						const latest = await this.Operation.findByPk(operation.id);
						if (JSON.parse(latest.output || '{}').upload?.phase === 'staged') {
							await this.removeFile(queue, JSON.parse(queue.inputJson));
						}
					},
					run: (queue, operation) => this.execute(queue, operation)
				}), {wait: false}));
		} catch (error) {
			if (['storage_busy', 'storage_maintenance_busy'].includes(error.code)) {
				return {processed: 0};
			}
			throw error;
		}
	}
	async wait(receipt, req, res) {
		while (!req.stream?.aborted && !res.stream?.destroyed) {
			await this.processQueue();
			const operation = await this.Operation.findByPk(receipt.asyncOperationId);
			if (!operation.inProcess) {
				if (operation.errorMessage) {
					throw new ApiProblemError(409, operation.errorType || 'upload_failed', operation.errorMessage);
				}
				return JSON.parse(operation.output).content;
			}
			await new Promise(resolve => setTimeout(resolve, 250));
		}
		throw new Error('upload_client_disconnected');
	}
}
