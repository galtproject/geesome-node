import sharp from 'sharp';
import {createHash} from 'node:crypto';
import {canonicalizeImageCompositionRequest} from '../imageComposition/operationRepository.js';
import {validateAndNormalizeImageCompositionStickerSvg} from '../imageComposition/svg.js';
import {COMIC_PAGE_LIMITS as L, ComicPageError} from './contract.js';

export function hash(value) {
	return `sha256:${createHash('sha256').update(canonicalizeImageCompositionRequest(value)).digest('hex')}`;
}

export function identity(value, max = 100) {
	if (typeof value !== 'string' || !value || value.length > max || !/^[a-zA-Z0-9._:-]+$/.test(value)) {
		throw new ComicPageError('comic_page_invalid');
	}
	return value;
}

export function normalize(raw) {
	if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
		throw new ComicPageError('comic_page_invalid');
	}
	const input = {
		idempotencyKey: identity(raw.idempotencyKey, 200), comicId: identity(raw.comicId), pageId: identity(raw.pageId),
		pageRevision: raw.pageRevision, previousVersionRef: raw.previousVersionRef || null, folderId: raw.folderId,
		recipe: raw.recipe, pngBase64: raw.pngBase64, bubbles: raw.bubbles,
	};
	if (!Number.isSafeInteger(input.pageRevision) || input.pageRevision < 1 || !Number.isSafeInteger(input.folderId) || input.folderId < 1) {
		throw new ComicPageError('comic_page_invalid');
	}
	if (input.previousVersionRef) {
		identity(input.previousVersionRef, 200);
	}
	if ((input.pageRevision === 1) !== (input.previousVersionRef === null)) {
		throw new ComicPageError('comic_page_invalid');
	}
	validateRecipe(input.recipe);
	const r = input.recipe;
	if (r.comicId !== input.comicId || r.pageId !== input.pageId || r.pageRevision !== input.pageRevision
		|| (r.previousVersionRef || null) !== input.previousVersionRef) {
		throw new ComicPageError('comic_page_invalid');
	}
	if (!Array.isArray(input.bubbles) || input.bubbles.length !== r.bubbles.length) {
		throw new ComicPageError('comic_page_invalid');
	}
	const ids = new Set();
	input.bubbles = input.bubbles.map(bubble => {
		const id = identity(bubble?.id);
		if (ids.has(id) || !r.bubbles.some(item => item.bubbleId === id)) {
			throw new ComicPageError('comic_page_invalid');
		}
		ids.add(id);
		try {
			return {id, svg: validateAndNormalizeImageCompositionStickerSvg(bubble.svg).svg};
		} catch (_) {
			throw new ComicPageError('comic_page_svg_invalid');
		}
	});
	return input;
}

export function validateRecipe(r) {
	if (!r || r.type !== 'comic-page' || r.version !== 1) {
		throw new ComicPageError('comic_page_version_unknown');
	}
	const canonical = canonicalizeImageCompositionRequest(r);
	if (Buffer.byteLength(canonical) > L.maxRecipeBytes) {
		throw new ComicPageError('comic_page_render_limit');
	}
	const walk = (value, depth = 0) => {
		if (depth > 20 || (typeof value === 'number' && !Number.isFinite(value))) {
			throw new ComicPageError('comic_page_invalid');
		}
		if (value && typeof value === 'object') {
			for (const [key, item] of Object.entries(value)) {
				if (['__proto__', 'constructor', 'prototype'].includes(key)) {
					throw new ComicPageError('comic_page_metadata_key_unsupported');
				}
				walk(item, depth + 1);
			}
		}
	};
	walk(r);
	if (!r.canvas || !Number.isSafeInteger(r.canvas.width) || !Number.isSafeInteger(r.canvas.height)
		|| r.canvas.width < 1 || r.canvas.height < 1 || r.canvas.width > L.maxWidth || r.canvas.height > L.maxHeight
		|| !Array.isArray(r.sourceAssets) || r.sourceAssets.length < 1 || r.sourceAssets.length > L.sources
		|| !Array.isArray(r.panels) || r.panels.length < 1 || r.panels.length > L.panels
		|| !Array.isArray(r.bubbles) || r.bubbles.length > L.bubbles) {
		throw new ComicPageError('comic_page_render_limit');
	}
	const sourceIds = unique(r.sourceAssets, 'sourceId');
	const panelIds = unique(r.panels, 'panelId');
	unique(r.bubbles, 'bubbleId');
	for (const source of r.sourceAssets) {
		identity(source.originalManifestId, 200);
		identity(source.storageId, 200);
		if (!Number.isSafeInteger(source.width) || !Number.isSafeInteger(source.height) || source.width < 1 || source.height < 1 || source.width * source.height > 64_000_000) {
			throw new ComicPageError('comic_page_source_mismatch');
		}
	}
	for (const panel of r.panels) {
		if (!sourceIds.has(panel.sourceId)) {
			throw new ComicPageError('comic_page_invalid');
		}
		rect(panel.frame, r.canvas.width, r.canvas.height, true);
		rect(panel.crop, 1, 1, false);
	}
	for (const bubble of r.bubbles) {
		if (typeof bubble.text !== 'string' || bubble.text.length > 4000
			|| !['speech', 'caption'].includes(bubble.kind) || (bubble.panelId !== null && !panelIds.has(bubble.panelId))) {
			throw new ComicPageError('comic_page_invalid');
		}
		rect(bubble.rect, r.canvas.width, r.canvas.height, true);
		if (bubble.tail !== null && bubble.tail !== undefined
			&& (!Number.isSafeInteger(bubble.tail.x) || !Number.isSafeInteger(bubble.tail.y)
				|| bubble.tail.x < 0 || bubble.tail.y < 0 || bubble.tail.x > r.canvas.width || bubble.tail.y > r.canvas.height)) {
			throw new ComicPageError('comic_page_invalid');
		}
	}
}

function unique(values, key) {
	const ids = new Set<string>();
	for (const item of values) {
		const id = identity(item?.[key]);
		if (ids.has(id)) {
			throw new ComicPageError('comic_page_invalid');
		}
		ids.add(id);
	}
	return ids;
}

function rect(value, maxWidth, maxHeight, integerPixels) {
	if (!value || ![value.x, value.y, value.width, value.height].every(Number.isFinite)
		|| value.x < 0 || value.y < 0 || value.width <= 0 || value.height <= 0
		|| (integerPixels && ![value.x, value.y, value.width, value.height].every(Number.isSafeInteger))
		|| value.x + value.width > maxWidth || value.y + value.height > maxHeight) {
		throw new ComicPageError('comic_page_invalid');
	}
}

export async function validatePng(base64, canvas) {
	if (typeof base64 !== 'string' || base64.length > Math.ceil(L.maxPngBytes * 4 / 3) + 4
		|| base64.length % 4 !== 0 || /[^A-Za-z0-9+/=]/.test(base64)) {
		throw new ComicPageError('comic_page_png_invalid');
	}
	const bytes = Buffer.from(base64, 'base64');
	if (bytes.toString('base64') !== base64) {
		throw new ComicPageError('comic_page_png_invalid');
	}
	try {
		const image = sharp(bytes, {limitInputPixels: L.maxWidth * L.maxHeight, animated: false});
		const metadata = await image.metadata();
		if (metadata.format !== 'png' || metadata.width !== canvas.width || metadata.height !== canvas.height || (metadata.pages || 1) !== 1) {
			throw new Error('png');
		}
		await image.timeout({seconds: 10}).raw().toBuffer();
	} catch (_) {
		throw new ComicPageError('comic_page_png_invalid');
	}
	return bytes;
}
