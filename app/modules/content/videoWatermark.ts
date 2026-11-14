import {createReadStream, createWriteStream} from 'node:fs';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Transform} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {createHash} from 'node:crypto';
import {plain, sameCid} from '../../storageIdentity.js';
import {withStorageFence, withStorageWorker} from '../../storageLifecycle.js';
import {ContentResave, imageSourceSnapshot, properties} from './resave.js';
import {problem} from './publicationInput.js';
import {maxVideoBytes, normalizeVideoWatermark, videoWatermarkPolicy} from '../drivers/convert/videoWatermark.js';

export const videoWatermarkModule = 'video-watermark';

export class VideoWatermark {
	constructor(public app) {}
	async owned(userId, id, transaction = undefined) {
		const content = plain(await this.app.ms.database.getContent(id, {transaction}));
		if (!content || Number(content.userId) !== Number(userId) || content.isDeleted || content.isRemote || content.isEncrypted) {
			problem('video_watermark_content_unavailable', 403);
		}
		return content;
	}
	identity(input) {
		return createHash('sha256').update(JSON.stringify([videoWatermarkPolicy, input.svgHash])).digest('hex');
	}
	async saved(userId, source, identity) {
		const saved = properties(source).videoWatermarks?.[identity];
		if (!saved || !sameCid(saved.sourceStorageId, source.storageId)) {
			return null;
		}
		const content = plain(await this.app.ms.database.getContent(saved.resultContentId));
		if (!content || Number(content.userId) !== Number(userId) || content.isDeleted || content.isRemote || content.isEncrypted) {
			return null;
		}
		if (!sameCid(content.storageId, saved.resultStorageId) || content.mimeType !== 'video/mp4'
			|| properties(content).videoWatermark?.identity !== identity) {
			return null;
		}
		return content;
	}
	async request(userId, apiKeyId, rawInput) {
		const input = normalizeVideoWatermark(rawInput);
		await new ContentResave(this.app).authorize(userId, apiKeyId);
		return withStorageFence(this.app, 'shared', () => this.app.ms.database.sequelize.transaction(async transaction => {
			const row = await this.app.ms.database.sequelize.model('content').findByPk(input.sourceContentId,
				{transaction, lock: transaction.LOCK.UPDATE});
			const source = plain(row);
			if (!source || Number(source.userId) !== Number(userId) || source.isDeleted || source.isRemote || source.isEncrypted) {
				problem('video_watermark_content_unavailable', 403);
			}
			if (!['video/mp4', 'video/webm', 'video/quicktime'].includes(source.mimeType)) {
				problem('video_watermark_format_unsupported', 415);
			}
			if (!(Number(source.size) > 0 && Number(source.size) <= maxVideoBytes)) {
				problem('video_watermark_render_limit', 422);
			}
			const applied = properties(source).videoWatermark;
			if (source.mimeType === 'video/mp4' && applied?.version === 1 && applied.policy === videoWatermarkPolicy
				&& applied.svgHash === input.svgHash && applied.identity === this.identity(input)) {
				return {status: 'completed', alreadyApplied: true, sourceContentId: source.id, content: source, policy: videoWatermarkPolicy};
			}
			const content = await this.saved(userId, source, this.identity(input));
			if (content) {
				return {status: 'completed', sourceContentId: source.id, content, policy: videoWatermarkPolicy};
			}
			const queue = await this.app.ms.asyncOperation.addUniqueUserOperationQueue(userId, videoWatermarkModule, apiKeyId,
				{...input, source: imageSourceSnapshot(source)}, {transaction});
			return {status: 'queued', sourceContentId: source.id, id: queue.id, asyncOperationId: queue.asyncOperationId || null};
		}));
	}
	async execute(queue, operation, input) {
		await new ContentResave(this.app).authorize(queue.userId, queue.userApiKeyId);
		const normalized = normalizeVideoWatermark(input);
		if (input.policy !== videoWatermarkPolicy || input.svgHash !== normalized.svgHash) {
			problem('video_watermark_input_invalid', 400);
		}
		const source = await this.owned(queue.userId, input.sourceContentId);
		if (!sameCid(source.storageId, input.source.storageId)) {
			problem('video_watermark_source_changed');
		}
		const identity = this.identity(input);
		let content = await this.saved(queue.userId, source, identity);
		if (!content) {
			const directory = await mkdtemp(join(tmpdir(), 'geesome-video-watermark-'));
			try {
				await this.app.ms.asyncOperation.handleOperationCancel(queue.userId, operation.id);
				let bytes = 0;
				const limit = new Transform({transform(chunk, _encoding, callback) {
					bytes += chunk.length;
					callback(bytes > maxVideoBytes ? new Error('video_watermark_render_limit') : null, chunk);
				}});
				const path = join(directory, 'original');
				await pipeline(await this.app.ms.storage.getFileStream(source.storageId), limit, createWriteStream(path, {mode: 0o600}));
				const rendered = await this.app.ms.drivers.convert.videoWatermark.processByPath(path, {svg: input.svg, directory, mimeType: source.mimeType, sourceStorageId: source.storageId});
				await this.app.ms.asyncOperation.handleOperationCancel(queue.userId, operation.id);
				content = plain(await this.app.ms.content.saveData(queue.userId, createReadStream(rendered.path), 'branded-video.mp4', {
					mimeType: 'video/mp4', driver: {raw: true}, waitForPin: true, skipFileCatalog: true,
					properties: {width: rendered.width, height: rendered.height, duration: rendered.duration,
						videoWatermark: {version: 1, identity, policy: videoWatermarkPolicy, sourceStorageId: source.storageId, svgHash: input.svgHash}},
				}));
				await this.app.ms.database.sequelize.transaction(async transaction => {
					const locked = await this.app.ms.database.sequelize.model('content').findByPk(source.id, {transaction, lock: transaction.LOCK.UPDATE});
					if (!sameCid(locked.storageId, source.storageId)) {
						problem('video_watermark_source_changed');
					}
					const metadata = properties(locked);
					const receipts = Object.fromEntries(Object.entries(metadata.videoWatermarks || {}).slice(-7));
					await locked.update({propertiesJson: JSON.stringify({...metadata, videoWatermarks: {...receipts,
						[identity]: {sourceStorageId: source.storageId, resultContentId: content.id, resultStorageId: content.storageId}}})}, {transaction});
				});
			} finally {
				await rm(directory, {recursive: true, force: true});
			}
		}
		return {sourceContentId: source.id, sourceStorageId: source.storageId, policy: videoWatermarkPolicy, content};
	}
	async processQueue() {
		return withStorageWorker(this.app, () => this.app.ms.asyncOperation.processModuleOperationQueue(videoWatermarkModule, {
			limit: 1, resumeInterrupted: true,
			getAsyncOperationData: queue => ({name: 'watermark-video', channel: `video-watermark:${queue.id}`}),
			run: (queue, operation) => this.execute(queue, operation, JSON.parse(queue.inputJson)),
		}));
	}
}
