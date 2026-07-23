import {createHash} from 'node:crypto';
import {load as cheerioLoad} from 'cheerio';

import {IMAGE_COMPOSITION_LIMITS} from './contract.js';

const ALLOWED_SVG_TAGS = new Set([
	'svg', 'title', 'desc', 'g', 'path', 'circle', 'ellipse', 'rect', 'line',
	'polyline', 'polygon', 'text', 'tspan',
]);
const ALLOWED_SVG_ATTRIBUTES = new Set([
	'xmlns', 'viewBox', 'role', 'aria-label',
	'd', 'fill', 'fill-rule', 'fill-opacity', 'stroke', 'stroke-width',
	'stroke-linejoin', 'stroke-linecap', 'stroke-opacity', 'opacity',
	'transform', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'rx',
	'ry', 'width', 'height', 'points', 'text-anchor', 'dominant-baseline',
	'font-family', 'font-size', 'font-style', 'font-weight',
]);
const FORBIDDEN_SVG_SOURCE = /(?:<!DOCTYPE|<!ENTITY|<\?xml|url\s*\()/i;
const SVG_ROOT_SOURCE = /^<svg(?:\s|>)[\s\S]*(?:<\/svg>|\/>)$/i;

export interface ValidatedImageCompositionStickerSvg {
	mimeType: 'image/svg+xml';
	svg: string;
	svgHash: string;
}

export function validateAndNormalizeImageCompositionStickerSvg(value: unknown): ValidatedImageCompositionStickerSvg {
	if (typeof value !== 'string') {
		throw new Error('composition_invalid');
	}
	const svg = value.trim();
	const bytes = Buffer.byteLength(svg, 'utf8');
	if (!svg || bytes > IMAGE_COMPOSITION_LIMITS.maxStickerSvgBytes
		|| FORBIDDEN_SVG_SOURCE.test(svg) || !SVG_ROOT_SOURCE.test(svg)) {
		throw new Error('composition_invalid');
	}

	let $;
	try {
		$ = cheerioLoad(svg, {xmlMode: true, decodeEntities: false});
	} catch (_error) {
		throw new Error('composition_invalid');
	}
	const rootChildren = $.root().children().toArray();
	if (rootChildren.length !== 1 || rootChildren[0].tagName !== 'svg') {
		throw new Error('composition_invalid');
	}

	let valid = true;
	$(' *').addBack('svg').each((_index, element: any) => {
		if (!valid || element.type !== 'tag' || !ALLOWED_SVG_TAGS.has(element.tagName)) {
			valid = false;
			return;
		}
		for (const [attributeName, attributeValue] of Object.entries(element.attribs || {})) {
			if (!ALLOWED_SVG_ATTRIBUTES.has(attributeName)
				|| /^on/i.test(attributeName)
				|| (attributeName !== 'xmlns'
					&& /(?:url\s*\(|javascript:|data:|https?:|ipfs:|ipns:)/i.test(String(attributeValue)))) {
				valid = false;
				return;
			}
		}
	});
	const root = rootChildren[0] as any;
	if (!valid || root.attribs?.xmlns !== 'http://www.w3.org/2000/svg'
		|| !isSafeViewBox(root.attribs?.viewBox)) {
		throw new Error('composition_invalid');
	}

	return {
		mimeType: 'image/svg+xml',
		svg,
		svgHash: getImageCompositionStickerSvgHash(svg),
	};
}

export function getImageCompositionStickerSvgHash(svg: string) {
	return `sha256:${createHash('sha256').update(svg, 'utf8').digest('hex')}`;
}

function isSafeViewBox(value: unknown) {
	if (typeof value !== 'string') return false;
	const numbers = value.trim().split(/[\s,]+/).map(Number);
	return numbers.length === 4
		&& numbers.every(Number.isFinite)
		&& numbers[2] > 0
		&& numbers[3] > 0
		&& numbers.every(number => Math.abs(number) <= 1_000_000);
}
