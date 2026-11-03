import {createHash} from 'node:crypto';
import {Readable} from 'node:stream';
import sharp from 'sharp';
import {ApiProblemError} from '../api/problem.js';
import {encodePublicationImage, maxImageBytes, maxImagePixels} from '../drivers/convert/imageOptimize.js';

export const socialImagePolicy = 'social-images-v1';
const namespace = 'local-social-images-v1';
export const socialImageMaxEdge = 4096;
export const imageLimit = network => network === 'bluesky' ? 2000000 : network === 'discord' ? 8 * 1024 * 1024 : 10 * 1024 * 1024;
const hash = value => createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest('hex');
function problem(code, status = 400): never {
	throw new ApiProblemError(status, code, code.replaceAll('_', ' '));
}
export function preparedMediaDigest(network, sourceAttachments, attachments) {
	const refs = items => items.map(({storageId, mimeType}) => ({storageId, mimeType}));
	return hash({policy: socialImagePolicy, network, sourceAttachments: refs(sourceAttachments), attachments: refs(attachments)});
}

// Validate every destination before reading or storing any rendition. Credentials
// and bot-channel authorization remain local to the executor.
export function validatePreparedPublication(request) {
	const count = request.imageStorageIds.length;
	const text = request.text;
	const characters = [...text].length;
	for (const {network, target} of request.destinations) {
		if (count > (['twitter', 'bluesky'].includes(network) ? 4 : 1) || (['instagram', 'rule34xxx'].includes(network) && count !== 1)) {
			problem('local_publication_image_count_invalid');
		}
		if ((network === 'twitter' && characters > 280) || (network === 'threads' && characters > 500) ||
			(network === 'instagram' && characters > 2200) || (network === 'discord' && text.length > 2000) ||
			(network === 'telegram' && text.length > (count ? 1024 : 4096)) || (network === 'reddit' && characters > 39000)) {
			problem('local_publication_text_too_long');
		}
		if (network === 'bluesky' && (Buffer.byteLength(text, 'utf8') > 3000 || [...new Intl.Segmenter('en', {granularity: 'grapheme'}).segment(text)].length > 300)) {
			problem('local_publication_text_too_long');
		}
		if (network === 'reddit') {
			if (!/^[A-Za-z0-9_]{2,21}$/.test(target.subreddit || '') || typeof target.title !== 'string' || !target.title.trim() || [...target.title].length > 300 ||
				(target.kind === 'image' && count !== 1) || (target.kind === 'link' && (count !== 1 || text.length !== 0))) {
				problem('local_publication_target_invalid');
			}
			if (count && (target.kind === 'image' || target.kind === undefined) && text.trim().replace(/\s+/g, ' ') !== target.title.trim().replace(/\s+/g, ' ')) {
				problem('local_publication_reddit_image_title_invalid');
			}
		}
	}
}

async function readImage(app, source) {
	if (!['image/jpeg', 'image/png', 'image/webp'].includes(source.mimeType)) {
		problem('local_publication_image_input_invalid');
	}
	if (Number(source.size) > maxImageBytes) {
		problem('local_publication_image_too_large', 413);
	}
	const stream = await app.ms.storage.getFileStream(source.storageId);
	const timeout = setTimeout(() => stream.destroy(new Error('local_publication_image_read_timeout')), 30000);
	const chunks = [];
	let size = 0;
	try {
		for await (const chunk of stream) {
			size += chunk.length;
			if (size > maxImageBytes) {
				problem('local_publication_image_too_large', 413);
			}
			chunks.push(Buffer.from(chunk));
		}
	} finally {
		clearTimeout(timeout);
		stream.destroy();
	}
	if (!size) {
		problem('local_publication_image_input_invalid');
	}
	return Buffer.concat(chunks);
}

export async function encodeSocialImage(bytes, mimeType, maxBytes) {
	try {
		const image = sharp(bytes, {limitInputPixels: maxImagePixels, failOn: 'warning'}).timeout({seconds: 10});
		const metadata = await image.metadata();
		const expected = {'image/jpeg': 'jpeg', 'image/png': 'png', 'image/webp': 'webp'}[mimeType];
		if (!expected || metadata.format !== expected || (metadata.pages || 1) !== 1 || !metadata.width || !metadata.height || metadata.width * metadata.height > maxImagePixels ||
			(metadata.format === 'png' && hasPngAnimation(bytes))) {
			problem('local_publication_image_input_invalid');
		}
		await image.stats(); // Decode fully; metadata alone accepts truncated images.
		const initial = await encodePublicationImage(Readable.from([bytes]), null, false, undefined, socialImageMaxEdge);
		if (initial.bytes.length <= maxBytes) {
			return initial;
		}
		// The versioned ladder is finite and deterministic. Always resize from the
		// original source rather than repeatedly recompressing a previous JPEG.
		const edge = Math.max(initial.width, initial.height);
		for (const [quality, scale] of [[90, 1], [85, 1], [80, .85], [75, .7], [70, .55], [65, .4], [60, .25], [60, .125]]) {
			const result = await sharp(bytes, {limitInputPixels: maxImagePixels, failOn: 'warning'}).rotate().flatten({background: 'white'})
				.resize({width: Math.max(1, Math.round(edge * scale)), height: Math.max(1, Math.round(edge * scale)), fit: 'inside', withoutEnlargement: true})
				.jpeg({quality, chromaSubsampling: '4:4:4'}).timeout({seconds: 10}).toBuffer({resolveWithObject: true});
			if (result.data.length <= maxBytes) {
				return {bytes: result.data, width: result.info.width, height: result.info.height, codec: `sharp:${sharp.versions.sharp};jpg:${quality};scale:${scale}`};
			}
		}
		problem('local_publication_image_cannot_fit', 413);
	} catch (error) {
		if (error instanceof ApiProblemError) {
			throw error;
		}
		problem('local_publication_image_decode_failed');
	}
}
function hasPngAnimation(bytes) {
	let offset = 8;
	while (offset + 12 <= bytes.length) {
		const length = bytes.readUInt32BE(offset);
		if (bytes.toString('ascii', offset + 4, offset + 8) === 'acTL') {
			return true;
		}
		if (length > bytes.length - offset - 12) {
			return false;
		}
		offset += length + 12;
	}
	return false;
}

export function createImagePreparation(app) {
	const active = new Map();
	const sequelize = app.ms.database?.sequelize;
	const Asset = sequelize?.models.asset;
	const Key = sequelize?.models.assetIdempotencyKey;
	async function cached(userId, key, requestHash, maxBytes) {
		const record = await Key.findOne({where: {userId, namespace, key, status: 'succeeded'}});
		if (!record || record.requestHash !== requestHash || !record.assetId) {
			return null;
		}
		const asset = await Asset.findOne({where: {id: record.assetId, userId}});
		const content = asset ? await app.ms.database.getContent(asset.contentId) : null;
		if (!content || Number(content.userId) !== Number(userId) || content.isDeleted || content.isRemote || content.isEncrypted ||
			content.storageId !== asset.storageId || content.mimeType !== 'image/jpeg' || asset.mimeType !== 'image/jpeg' ||
			!(Number(asset.bytes) > 0 && Number(asset.bytes) <= maxBytes) || Number(content.size) !== Number(asset.bytes)) {
			return null;
		}
		return content;
	}
	async function prepare(userId, source, maxBytes) {
		if (Number(source.userId) !== Number(userId) || source.isDeleted || source.isRemote || source.isEncrypted || !['image/jpeg', 'image/png', 'image/webp'].includes(source.mimeType)) {
			problem('local_publication_image_input_invalid');
		}
		if (Number(source.size) > maxImageBytes) {
			problem('local_publication_image_too_large', 413);
		}
		const identity = {policy: socialImagePolicy, sourceStorageId: source.storageId, sourceMimeType: source.mimeType, maxBytes, maxEdge: socialImageMaxEdge};
		const requestHash = hash(identity);
		const key = requestHash;
		const existing = await cached(userId, key, requestHash, maxBytes);
		if (existing) {
			return existing;
		}
		const bytes = await readImage(app, source);
		const image = await encodeSocialImage(bytes, source.mimeType, maxBytes);
		const content = await app.ms.content.saveData(userId, image.bytes, `${socialImagePolicy}-${requestHash}.jpg`, {
			mimeType: 'image/jpeg', driver: {raw: true}, skipFileCatalog: true, waitForPin: true,
			properties: {socialImage: {...identity, codec: image.codec, width: image.width, height: image.height}}
		});
		if (typeof app.ms.database.setStorageObjectSha256 === 'function') {
			await app.ms.database.setStorageObjectSha256(content.storageId, hash(image.bytes));
		}
		const [asset, created] = await Asset.findOrCreate({where: {userId, storageId: content.storageId}, defaults: {userId, storageId: content.storageId,
			contentId: content.id, sha256: hash(image.bytes), bytes: image.bytes.length, mimeType: 'image/jpeg', pinStatus: 'stored'}});
		if (!created) {
			await asset.update({contentId: content.id, sha256: hash(image.bytes), bytes: image.bytes.length, mimeType: 'image/jpeg', pinStatus: 'stored'});
		}
		const [record] = await Key.findOrCreate({where: {userId, namespace, key}, defaults: {userId, namespace, key, requestHash, assetId: asset.id, status: 'succeeded'}});
		if (record.requestHash !== requestHash) {
			problem('local_publication_media_cache_conflict', 409);
		}
		if (record.assetId !== asset.id || record.status !== 'succeeded') {
			await record.update({assetId: asset.id, status: 'succeeded', errorCode: null});
		}
		return content;
	}
	return async function prepareImages(userId, sources, destinations) {
		const results = new Map();
		for (const maxBytes of new Set(destinations.map(destination => imageLimit(destination.network)))) {
			const contents = [];
			for (const source of sources) {
				const key = `${userId}:${source.storageId}:${source.mimeType}:${maxBytes}`;
				if (!active.has(key)) {
					active.set(key, prepare(userId, source, maxBytes));
				}
				try {
					contents.push(await active.get(key));
				} finally {
					active.delete(key);
				}
			}
			results.set(maxBytes, contents);
		}
		return results;
	};
}
