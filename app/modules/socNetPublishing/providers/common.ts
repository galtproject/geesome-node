import {Buffer} from 'node:buffer';

export class ServerPublicationError extends Error {
	readonly ambiguous: boolean;
	httpStatus?: number;
	constructor(message: string, ambiguous = false) {
		super(message);
		this.name = 'ServerPublicationError';
		this.ambiguous = ambiguous;
	}
}

export function check(condition: any, message: string, ambiguous = false): asserts condition {
	if (!condition) {
		throw new ServerPublicationError(message, ambiguous);
	}
}

export function secret(value: any) {
	check(typeof value === 'string' && value.length > 0 && value.length <= 4096 && !/[\x00-\x20\x7f]/.test(value), 'Server account credential is invalid');
	return value;
}

export const snowflake = (value: any) => typeof value === 'string' && /^[1-9][0-9]{0,19}$/.test(value);
export const didPattern = /^did:(?:plc:[a-z0-9]{24}|web:[A-Za-z0-9._:%-]+)$/;
export const handlePattern = /^(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63}$/;
export const jsonOptions = (body: any, headers = {}) => ({method: 'POST', headers: {'content-type': 'application/json', ...headers}, body: JSON.stringify(body)});

// Only adapter-owned fixed hosts reach this transport. Never interpolate a job URL.
export function createTransport(fetchImpl: typeof fetch = fetch) {
	return async (url: string, options: any = {}, mayPublish = false): Promise<Response> => {
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), 30000);
		try {
			let response: Response;
			try {
				response = await fetchImpl(url, {...options, redirect: 'error', signal: controller.signal});
			} catch {
				throw new ServerPublicationError('Social provider connection did not confirm completion', mayPublish);
			}
			if (!response.ok) {
				throw Object.assign(new ServerPublicationError(`Social provider rejected request (HTTP ${Number(response.status) || 0})`, mayPublish && (response.status >= 500 || response.status < 400)), {httpStatus: response.status});
			}
			try {
				check(Number(response.headers.get('content-length')) <= 1024 * 1024 && response.body, 'Social provider response is unavailable', mayPublish);
				const reader = response.body.getReader();
				const chunks: Buffer[] = [];
				let size = 0;
				try {
					while (true) {
						const item = await reader.read();
						if (item.done) {
							break;
						}
						size += item.value.length;
						check(size <= 1024 * 1024, 'Social provider response exceeds limit', mayPublish);
						chunks.push(Buffer.from(item.value));
					}
				} finally {
					await reader.cancel().catch(() => undefined);
				}
				return new Response(Buffer.concat(chunks), {status: response.status, headers: {'content-type': 'application/json'}});
			} catch (error) {
				if (error instanceof ServerPublicationError) {
					throw error;
				}
				throw new ServerPublicationError('Social provider response could not be read', mayPublish);
			}
		} finally {
			clearTimeout(timeout);
		}
	};
}

export async function readJson(transport: any, url: string, options: any = {}, mayPublish = false) {
	const response = await transport(url, options, mayPublish);
	try {
		return await response.json();
	} catch {
		throw new ServerPublicationError('Social provider response is invalid', mayPublish);
	}
}

export function validatePayload(network: string, payload: any) {
	check(payload && typeof payload.text === 'string' && Array.isArray(payload.attachments) && payload.target && typeof payload.target === 'object', 'Server publication payload is invalid');
	check(payload.text.trim() || payload.attachments.length, 'Server publication is empty');
	check(payload.attachments.length <= (network === 'bluesky' ? 4 : 1), 'Server publication image count is invalid');
	check(network !== 'deviantart' || payload.attachments.length === 1, 'DeviantArt requires exactly one image');
	const maximum = network === 'deviantart' ? 50000 : network === 'bluesky' ? 300 : network === 'discord' ? 2000 : payload.attachments.length ? 1024 : 4096;
	const length = network === 'bluesky' ? [...new Intl.Segmenter('en', {granularity: 'grapheme'}).segment(payload.text)].length : payload.text.length;
	check(length <= maximum && (network !== 'bluesky' || Buffer.byteLength(payload.text) <= 3000), 'Server publication text exceeds provider limits');
	check(['sfw', 'nsfw'].includes(payload.contentType), 'Server publication sensitivity is invalid');
}

export async function loadImages(payload: any, loadMedia: any, maxBytes: number) {
	const result = [];
	for (const attachment of payload.attachments) {
		check(attachment && /^[A-Za-z0-9]{1,256}$/.test(attachment.storageId || '') && ['image/jpeg', 'image/png'].includes(attachment.mimeType), 'Server publication media reference is invalid');
		check(typeof loadMedia === 'function', 'Owned media loader is required');
		let image;
		try {
			image = await loadMedia(attachment, maxBytes);
		} catch {
			throw new ServerPublicationError('Owned publication image is unavailable');
		}
		const bytes = image?.bytes;
		check(Buffer.isBuffer(bytes) && bytes.length > 0 && bytes.length <= maxBytes && image.mimeType === attachment.mimeType &&
			(image.mimeType === 'image/jpeg' ? bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255])) : bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))), 'Owned publication image format or size is invalid');
		result.push(image);
	}
	return result;
}
