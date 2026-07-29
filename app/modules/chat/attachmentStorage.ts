import type IGeesomeStorageModule from '../storage/interface.js';

const defaultAttachmentPinTimeoutMs = 10 * 1000;
const maximumAttachmentPinTimeoutMs = 12 * 1000;

export async function pinRemoteChatAttachments(
	storage: IGeesomeStorageModule,
	storageIds: string[],
	options: {timeoutMs?: number} = {}
) {
	const timeoutMs = parseAttachmentPinTimeout(options.timeoutMs);
	if (!storageIds.length) {
		return;
	}
	let activeStorageId = storageIds[0];
	let timedOut = false;
	const pinAll = async () => {
		for (const storageId of storageIds) {
			if (timedOut) {
				return;
			}
			activeStorageId = storageId;
			await storage.addPin(storageId);
		}
	};
	let timeout;
	try {
		await Promise.race([
			pinAll(),
			new Promise((_resolve, reject) => {
				timeout = setTimeout(() => {
					timedOut = true;
					reject(new Error('chat_attachment_pin_timeout'));
				}, timeoutMs);
			})
		]);
	} catch {
		throw createAttachmentFetchError(activeStorageId);
	} finally {
		clearTimeout(timeout);
	}
}

function parseAttachmentPinTimeout(value): number {
	const parsed = Number(value);
	if (!Number.isFinite(parsed) || parsed <= 0) {
		return defaultAttachmentPinTimeoutMs;
	}
	return Math.min(Math.floor(parsed), maximumAttachmentPinTimeoutMs);
}

function createAttachmentFetchError(storageId: string) {
	const error: any = new Error('chat_attachment_fetch_failed');
	error.code = 503;
	error.retryable = true;
	error.storageId = storageId;
	return error;
}
