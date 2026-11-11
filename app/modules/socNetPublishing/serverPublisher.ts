import {createServerProviders} from './providers/index.js';
import {assertContentPolicy} from './contentPolicy.js';

export function createServerPublisher(app, module, options: any = {}) {
	const providers = options.providers || createServerProviders({fetch: options.fetch});
	let pending = null;
	let running = false;
	async function report() {
		await module.reportResult(pending.userId, pending.id, pending.result, 'server');
		pending = null;
	}
	return {
		async process(options: any = {}) {
			if (running) {
				return {processed: 0};
			}
			running = true;
			let processed = 0;
			try {
				if (pending) {
					await report();
				}
				const limit = Math.max(1, Math.min(20, Number(options.limit) || 3));
				for (let index = 0; index < limit; index++) {
					const claimed = await module.claimServerJob();
					if (!claimed) {
						break;
					}
					const {job, account} = claimed;
					let result;
					try {
						try {
							assertContentPolicy(job.contentType, job.contentPolicy);
						} catch (error) {
							throw Object.assign(error, {ambiguous: false});
						}
						const published = await providers.publish(job.network, account, {...job.payload, target: job.target, contentType: job.contentType},
							(attachment, maxBytes) => loadOwnedMedia(app, job.userId, attachment, maxBytes));
						if (!published?.remoteId) {
							throw Object.assign(new Error(), {ambiguous: true});
						}
						result = {status: 'posted', remoteId: String(published.remoteId), remoteUrl: published.remoteUrl || ''};
					} catch (error) {
						result = {status: error.ambiguous === false ? 'failed' : 'needs_review', error: error.ambiguous === false
							? 'Server publication validation or provider request was rejected.' : 'Server publication outcome is unknown. Check the provider before retrying.'};
					}
					pending = {userId: job.userId, id: job.id, result: {...result, claimToken: job.claimToken}};
					await report();
					processed++;
				}
				return {processed};
			} finally {
				running = false;
			}
		}
	};
}

export async function loadOwnedMedia(app, userId, attachment, maxBytes) {
	if (!attachment || !/^[A-Za-z0-9]{1,256}$/.test(attachment.storageId || '') || !['image/jpeg', 'image/png'].includes(attachment.mimeType)) {
		throw Object.assign(new Error('Server media reference is invalid'), {ambiguous: false});
	}
	const content = await app.ms.database.getContentByStorageAndUserId(attachment.storageId, userId);
	if (!content || Number(content.userId) !== Number(userId) || content.isDeleted || content.isRemote || content.isEncrypted || content.mimeType !== attachment.mimeType ||
		!Number.isSafeInteger(Number(content.size)) || Number(content.size) < 1 || Number(content.size) > maxBytes) {
		throw Object.assign(new Error('Server media is unavailable'), {ambiguous: false});
	}
	const chunks = [];
	let size = 0;
	const stream = await app.ms.storage.getFileStream(content.storageId);
	try {
		for await (const chunk of stream) {
			const bytes = Buffer.from(chunk);
			size += bytes.length;
			if (size > maxBytes) {
				throw new Error('Server media exceeds byte limit');
			}
			chunks.push(bytes);
		}
	} finally {
		stream.destroy?.();
	}
	if (size !== Number(content.size)) {
		throw Object.assign(new Error('Server media size mismatch'), {ambiguous: false});
	}
	return {bytes: Buffer.concat(chunks), mimeType: content.mimeType};
}
