import type IGeesomeStorageModule from '../storage/interface.js';

const defaultAttachmentPinTimeoutMs = 10 * 1000;
const maximumAttachmentPinTimeoutMs = 12 * 1000;
const defaultMaximumAttachmentBytes = 25 * 1024 * 1024;
const defaultMaximumEventAttachmentBytes = 100 * 1024 * 1024;

export interface IChatAttachmentLimits {
	maxAttachmentBytes?: number;
	maxEventAttachmentBytes?: number;
}

export async function pinRemoteChatAttachments(
	storage: IGeesomeStorageModule,
	storageIds: string[],
	options: {timeoutMs?: number} & IChatAttachmentLimits = {}
) {
	const timeoutMs = parseAttachmentPinTimeout(options.timeoutMs);
	const limits = getChatAttachmentLimits(options);
	if (!storageIds.length) {
		return;
	}
	let activeStorageId = storageIds[0];
	let timedOut = false;
	let totalBytes = 0;
	const pinAll = async () => {
		for (const storageId of storageIds) {
			if (timedOut) {
				return;
			}
			activeStorageId = storageId;
			const stat = await storage.getFileStat(storageId);
			if (stat?.size === undefined || stat?.size === null) {
				throw new Error('chat_attachment_stat_missing');
			}
			const size = parseAttachmentSize(stat?.size);
			totalBytes = assertChatAttachmentSize(storageId, size, totalBytes, limits);
		}
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
	} catch (error) {
		if (isChatAttachmentQuotaError(error)) {
			throw error;
		}
		throw createAttachmentFetchError(activeStorageId);
	} finally {
		clearTimeout(timeout);
	}
}

export function assertOwnedChatAttachmentQuota(
	contents: Array<{storageId?: string; size?: number | string}>,
	options: IChatAttachmentLimits = {}
) {
	const limits = getChatAttachmentLimits(options);
	let totalBytes = 0;
	for (const content of contents) {
		const storageId = String(content.storageId || '');
		const size = parseAttachmentSize(content.size);
		totalBytes = assertChatAttachmentSize(storageId, size, totalBytes, limits);
	}
	return totalBytes;
}

export function getChatAttachmentLimits(
	options: IChatAttachmentLimits = {}
) {
	return {
		maxAttachmentBytes: parsePositiveByteLimit(
			options.maxAttachmentBytes,
			defaultMaximumAttachmentBytes
		),
		maxEventAttachmentBytes: parsePositiveByteLimit(
			options.maxEventAttachmentBytes,
			defaultMaximumEventAttachmentBytes
		)
	};
}

function parseAttachmentPinTimeout(value): number {
	const parsed = Number(value);
	if (!Number.isFinite(parsed) || parsed <= 0) {
		return defaultAttachmentPinTimeoutMs;
	}
	return Math.min(Math.floor(parsed), maximumAttachmentPinTimeoutMs);
}

function parsePositiveByteLimit(value, fallback: number): number {
	const parsed = Number(value);
	if (!Number.isSafeInteger(parsed) || parsed <= 0) {
		return fallback;
	}
	return parsed;
}

function parseAttachmentSize(value): number {
	const parsed = Number(value);
	if (!Number.isSafeInteger(parsed) || parsed < 0) {
		throw createAttachmentQuotaError('', 'chat_attachment_size_invalid');
	}
	return parsed;
}

function assertChatAttachmentSize(
	storageId: string,
	size: number,
	currentTotalBytes: number,
	limits: {maxAttachmentBytes: number; maxEventAttachmentBytes: number}
): number {
	if (size > limits.maxAttachmentBytes) {
		throw createAttachmentQuotaError(storageId, 'chat_attachment_too_large');
	}
	const totalBytes = currentTotalBytes + size;
	if (!Number.isSafeInteger(totalBytes) || totalBytes > limits.maxEventAttachmentBytes) {
		throw createAttachmentQuotaError(storageId, 'chat_attachment_quota_exceeded');
	}
	return totalBytes;
}

function createAttachmentQuotaError(storageId: string, message: string) {
	const error: any = new Error(message);
	error.code = 413;
	error.retryable = false;
	error.storageId = storageId || undefined;
	return error;
}

function isChatAttachmentQuotaError(error): boolean {
	return error?.code === 413 && error?.retryable === false;
}

function createAttachmentFetchError(storageId: string) {
	const error: any = new Error('chat_attachment_fetch_failed');
	error.code = 503;
	error.retryable = true;
	error.storageId = storageId;
	return error;
}
