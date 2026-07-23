import assert from 'node:assert';

import {IMAGE_COMPOSITION_LIMITS} from '../app/modules/imageComposition/contract.js';
import {
	getImageCompositionStickerSvgHash,
	validateAndNormalizeImageCompositionStickerSvg,
} from '../app/modules/imageComposition/svg.js';

const clientSvg = [
	'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" role="img">',
	'<title>Era of Meat watermark</title>',
	'<circle cx="50" cy="50" r="48" fill="#df1708"/>',
	'<path d="M30 35L50 20L70 35L50 65Z" fill="#fff" fill-rule="evenodd"/>',
	'<text x="50" y="85" text-anchor="middle" font-family="sans-serif" font-size="8" font-weight="700" fill="#fff">eraofmeat.com</text>',
	'</svg>',
].join('');

describe('image composition SVG validation', () => {
	it('accepts and hashes a bounded self-contained client SVG deterministically', () => {
		const first = validateAndNormalizeImageCompositionStickerSvg(`  ${clientSvg}\n`);
		const second = validateAndNormalizeImageCompositionStickerSvg(clientSvg);

		assert.equal(first.svg, clientSvg);
		assert.equal(first.svgHash, second.svgHash);
		assert.equal(first.svgHash, getImageCompositionStickerSvgHash(clientSvg));
		assert.equal(first.mimeType, 'image/svg+xml');
	});

	it('supports the primitive shapes and transforms needed by client-defined stickers', () => {
		const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="-10 -10 200 120"><g transform="translate(2 3) scale(.8)"><rect x="0" y="0" width="20" height="10" rx="2" fill="none" stroke="#fff" stroke-width="2"/><ellipse cx="40" cy="20" rx="8" ry="6"/><polygon points="1,1 2,3 4,5"/></g></svg>';
		assert.equal(validateAndNormalizeImageCompositionStickerSvg(svg).svg, svg);
	});

	it('rejects active content, external resources, CSS URLs, and XML entities', () => {
		const attacks = [
			'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><script>alert(1)</script></svg>',
			'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><image href="https://example.com/a.png"/></svg>',
			'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><use href="#shape"/></svg>',
			'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path style="fill:url(http://example.com/a)"/></svg>',
			'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" onload="alert(1)"/>',
			'<!DOCTYPE svg [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><text>&xxe;</text></svg>',
		];
		for (const attack of attacks) {
			assert.throws(() => validateAndNormalizeImageCompositionStickerSvg(attack), /composition_invalid/);
		}
	});

	it('rejects malformed roots, invalid view boxes, and oversized SVGs', () => {
		for (const invalid of [
			'not svg',
			'<svg xmlns="http://www.w3.org/2000/svg"/>',
			'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 0 10"/>',
			'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 NaN 10"/>',
			'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"/><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"/>',
		]) {
			assert.throws(() => validateAndNormalizeImageCompositionStickerSvg(invalid), /composition_invalid/);
		}
		assert.throws(
			() => validateAndNormalizeImageCompositionStickerSvg(
				`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><desc>${'x'.repeat(IMAGE_COMPOSITION_LIMITS.maxStickerSvgBytes)}</desc></svg>`,
			),
			/composition_invalid/,
		);
	});
});
