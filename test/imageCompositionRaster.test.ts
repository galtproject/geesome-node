import {addWatermark, watermarkDriver, watermarkProperties} from '../app/modules/drivers/convert/imageWatermarkHelpers.js';
import assert from 'node:assert';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {IMAGE_COMPOSITION_LIMITS} from '../app/modules/imageComposition/contract.js';
import {ImageCompositionApiError} from '../app/modules/imageComposition/helpers.js';
import {bakeImageComposition} from '../app/modules/imageComposition/raster.js';

describe('image composition raster baking', function () {
	it('removes only a verified appended band before stickers and preserves every source pixel', async () => {
		const driver = watermarkDriver({name: 'imageWatermark', module: 'convert', params: {text: 'eraofwave.com', color: '#874ee6'}});
		const original = await sharp({create: {width: 160, height: 100, channels: 4, background: '#49a8cc'}}).png().toBuffer();
		const marked = await addWatermark(original, driver);
		const before = Buffer.from(marked);
		const render = {maxDimension: 160, removeWatermark: driver};
		const baked = await bakeImageComposition(marked, [], render, watermarkProperties(driver));
		assert.deepEqual(baked.source, {width: 160, height: 106});
		assert.deepEqual(baked.output, {width: 160, height: 100});
		assert.deepEqual(await sharp(baked.png).raw().toBuffer(), await sharp(original).raw().toBuffer());
		assert.deepEqual(marked, before);
		const untouched = await bakeImageComposition(marked, []);
		assert.deepEqual(untouched.output, baked.source);
		for (const metadata of ['invalid-json', {}, {imageWatermark: {version: 1, identity: 'wrong'}}, {imageWatermark: {version: 2, identity: watermarkProperties(driver).imageWatermark.identity}}]) {
			await assert.rejects(() => bakeImageComposition(marked, [], render, metadata), (e: ImageCompositionApiError) => e.details?.reason === 'watermark_identity_mismatch');
		}
		const impossible = await sharp({create: {width: 40, height: 77, channels: 4, background: 'black'}}).png().toBuffer();
		await assert.rejects(() => bakeImageComposition(impossible, [], render, watermarkProperties(driver)),
			(e: ImageCompositionApiError) => e.details?.reason === 'watermark_geometry_mismatch');
		const small = await bakeImageComposition(marked, [], {...render, maxDimension: 80}, watermarkProperties(driver));
		assert.deepEqual(small.output, {width: 80, height: 50});
	});

	it('auto-orients the original and derives source/output dimensions from decoded pixels', async () => {
		const original = await sharp({
			create: {width: 4, height: 2, channels: 4, background: {r: 30, g: 60, b: 90, alpha: 1}},
		}).jpeg().withMetadata({orientation: 6}).toBuffer();

		const baked = await bakeImageComposition(original, []);
		assert.deepEqual(baked.source, {width: 2, height: 4});
		assert.deepEqual(baked.output, {width: 2, height: 4});
		const metadata = await sharp(baked.png).metadata();
		assert.equal(metadata.format, 'png');
		assert.equal(metadata.orientation, undefined);
		assert.deepEqual({width: metadata.width, height: metadata.height}, baked.output);
		const previewMetadata = await sharp(baked.previewPng).metadata();
		assert.equal(previewMetadata.format, 'png');
		assert((previewMetadata.width || 0) <= 1024);
	});

	it('supports an explicit bounded fallback size without accepting client output dimensions', async () => {
		const original = await sharp({
			create: {width: 12, height: 6, channels: 4, background: {r: 255, g: 255, b: 255, alpha: 1}},
		}).png().toBuffer();

		const baked = await bakeImageComposition(original, [], {maxDimension: 5});
		assert.deepEqual(baked.source, {width: 12, height: 6});
		assert.deepEqual(baked.output, {width: 5, height: 3});
	});

	it('rejects unsupported source dimensions before maxDimension resizing', async () => {
		const oversizedSource = await sharp({
			create: {
				width: IMAGE_COMPOSITION_LIMITS.maxExportDimension + 1,
				height: 1,
				channels: 4,
				background: {r: 255, g: 255, b: 255, alpha: 1},
			},
		}).png().toBuffer();
		await assert.rejects(
			() => bakeImageComposition(oversizedSource, [], {maxDimension: 1024}),
			(error: ImageCompositionApiError) => error.errorCode === 'composition_render_limit',
		);
	});

	it('bakes client SVG stickers deterministically in stable z-index order', async () => {
		const original = await sharp({
			create: {width: 120, height: 80, channels: 4, background: {r: 240, g: 240, b: 240, alpha: 1}},
		}).png().toBuffer();
		const first = sticker('first', 'First', 2, 0.35);
		const second = sticker('second', 'Second', 1, 0.05);
		const withSvg = [first, second];

		const forward = await bakeImageComposition(original, withSvg);
		const reversed = await bakeImageComposition(original, [...withSvg].reverse());
		assert.deepEqual(forward.png, reversed.png);
		assert.equal(
			createHash('sha256').update(forward.png).digest('hex'),
			createHash('sha256').update(reversed.png).digest('hex'),
		);
	});

	it('rejects vector originals, malformed input, oversized bytes, and sticker-count abuse', async () => {
		const svgOriginal = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>');
		await assert.rejects(
			() => bakeImageComposition(svgOriginal, []),
			(error: ImageCompositionApiError) => error.errorCode === 'composition_render_limit'
				|| error.errorCode === 'composition_render_failed'
				|| error.errorCode === 'composition_invalid',
		);
		await assert.rejects(
			() => bakeImageComposition(Buffer.from('not an image'), []),
			(error: ImageCompositionApiError) => error.errorCode === 'composition_render_failed',
		);
		await assert.rejects(
			() => bakeImageComposition(Buffer.alloc(IMAGE_COMPOSITION_LIMITS.maxInputBytes + 1), []),
			(error: ImageCompositionApiError) => error.errorCode === 'composition_render_limit',
		);

		const original = await sharp({
			create: {width: 2, height: 2, channels: 4, background: {r: 0, g: 0, b: 0, alpha: 1}},
		}).png().toBuffer();
		await assert.rejects(
			() => bakeImageComposition(
				original,
				Array.from({length: IMAGE_COMPOSITION_LIMITS.maxStickers + 1}, (_, index) => ({
					...sticker(`sticker-${index}`, 'Text', index + 1, 0),
					svg: '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>',
				})),
			),
			(error: ImageCompositionApiError) => error.errorCode === 'composition_render_limit',
		);
	});
});

function sticker(id: string, text: string, zIndex: number, x: number) {
	return {
		id,
		svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 60"><rect x="1" y="1" width="98" height="58" fill="#fff" stroke="#111"/><text x="50" y="32" text-anchor="middle">${text}</text></svg>`,
		x,
		y: 0.1,
		width: 0.35,
		height: 0.3,
		rotationDeg: 0,
		zIndex,
	};
}
