import assert from 'node:assert';
import {readFileSync} from 'node:fs';

import {
	escapeImageCompositionXml,
	generateImageCompositionStickerSvg,
	getImageCompositionStickerSemanticHash,
	wrapImageCompositionStickerText,
} from '../app/modules/imageComposition/svg.js';

const goldenSvg = readFileSync(new URL('./fixtures/imageCompositionSpeechV1.svg', import.meta.url), 'utf8').trimEnd();
const goldenSemanticHash = readFileSync(
	new URL('./fixtures/imageCompositionSpeechV1.semantic-hash.txt', import.meta.url),
	'utf8',
).trim();

describe('image composition SVG generation', () => {
	it('matches the deterministic speech-v1 golden SVG and semantic hash', () => {
		const first = generateImageCompositionStickerSvg(getSticker('Hello & <world>'));
		const second = generateImageCompositionStickerSvg(getSticker('Hello & <world>', {
			x: 0.8,
			y: 0.7,
			width: 0.1,
			height: 0.2,
			rotationDeg: 27,
			zIndex: 9,
		}));

		assert.equal(first.svg, goldenSvg);
		assert.equal(first.semanticHash, goldenSemanticHash);
		assert.equal(second.svg, first.svg);
		assert.equal(second.semanticHash, first.semanticHash);
		assert.equal(first.mimeType, 'image/svg+xml');
		assert.equal(first.templateVersion, 1);
	});

	it('hashes canonical semantic fields in contract order without geometry', () => {
		assert.equal(
			getImageCompositionStickerSemanticHash({
				kind: 'text-bubble',
				template: 'speech-v1',
				templateVersion: 1,
				text: 'Hello & <world>',
			}),
			goldenSemanticHash,
		);
		assert.notEqual(
			getImageCompositionStickerSemanticHash({kind: 'text-bubble', template: 'speech-v1', text: 'Hello'}),
			getImageCompositionStickerSemanticHash({kind: 'text-bubble', template: 'speech-v1', text: 'hello'}),
		);
	});

	it('escapes every XML metacharacter and never interprets user text as markup', () => {
		const attack = `</text><script>alert("x")</script><foreignObject onload='run()'>&`;
		const generated = generateImageCompositionStickerSvg(getSticker(attack));

		assert.equal(
			escapeImageCompositionXml(`&<>"'`),
			'&amp;&lt;&gt;&quot;&apos;',
		);
		assert.ok(generated.svg.includes('&lt;/text&gt;&lt;script&gt;'));
		assert.ok(generated.svg.includes('&lt;foreignObject'));
		assert.ok(generated.svg.includes('&quot;x&quot;'));
		assert.ok(generated.svg.includes('&apos;run()&apos;'));
		assert.ok(!generated.svg.includes('<script'));
		assert.ok(!generated.svg.includes('<foreignObject'));
		assert.ok(!generated.svg.includes(' href='));
		assert.ok(!generated.svg.includes('url('));
	});

	it('wraps words, long tokens, explicit lines, and emoji deterministically', () => {
		assert.deepEqual(
			wrapImageCompositionStickerText('  alpha    beta\r\ngamma\t🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂  '),
			['alpha beta', 'gamma', '🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂', '🙂'],
		);
		const longText = Array.from({length: 500}, (_, index) => index % 7 === 0 ? ' ' : 'a').join('');
		const lines = wrapImageCompositionStickerText(longText);
		assert.ok(lines.length <= 12);
		assert.deepEqual(lines, wrapImageCompositionStickerText(longText));
	});

	it('rejects unknown semantics, unsupported versions, invalid XML, and text beyond limits', () => {
		assert.throws(
			() => generateImageCompositionStickerSvg({...getSticker('text'), kind: 'image'} as any),
			/composition_invalid/,
		);
		assert.throws(
			() => generateImageCompositionStickerSvg({...getSticker('text'), template: 'custom'} as any),
			/composition_template_unknown/,
		);
		assert.throws(
			() => generateImageCompositionStickerSvg({
				kind: 'text-bubble',
				template: 'speech-v1',
				templateVersion: 2,
				text: 'text',
			}),
			/composition_version_unknown/,
		);
		assert.throws(() => generateImageCompositionStickerSvg(getSticker('bad\u0000text')), /composition_invalid/);
		assert.throws(() => generateImageCompositionStickerSvg(getSticker('\uD800')), /composition_invalid/);
		assert.throws(() => generateImageCompositionStickerSvg(getSticker('x'.repeat(501))), /composition_invalid/);
		assert.throws(() => generateImageCompositionStickerSvg(getSticker(Array(13).fill('line').join('\n'))), /composition_invalid/);
		assert.throws(() => generateImageCompositionStickerSvg(getSticker('   ')), /composition_invalid/);
	});

	it('accepts the maximum Unicode text length without external SVG resources', () => {
		const generated = generateImageCompositionStickerSvg(getSticker('🙂'.repeat(500)));

		assert.ok(generated.lines.length <= 12);
		assert.ok(generated.svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"'));
		assert.ok(generated.svg.endsWith('</svg>'));
		assert.ok(!generated.svg.includes('<style'));
		assert.ok(!generated.svg.includes('<image'));
		assert.ok(!generated.svg.includes('@import'));
	});
});

function getSticker(text: string, overrides: Record<string, unknown> = {}) {
	return {
		id: 'sticker-1',
		kind: 'text-bubble' as const,
		template: 'speech-v1' as const,
		text,
		x: 0.12,
		y: 0.18,
		width: 0.34,
		height: 0.19,
		rotationDeg: 0,
		zIndex: 1,
		...overrides,
	};
}
