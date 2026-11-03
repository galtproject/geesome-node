import assert from 'node:assert/strict';
import sharp from 'sharp';
import {encodeSocialImage, preparedMediaDigest, validatePreparedPublication, imageLimit, socialImageMaxEdge} from '../app/modules/localClient/imagePreparation.js';
import {publicationDigest} from '../app/modules/localClient/producer.js';

describe('local publication image preparation', function () {
	this.timeout(90000);
	it('decodes PNG/WebP to compatible JPEG while flattening transparency and preserving orientation', async () => {
		const png = await sharp({create: {width: 120, height: 80, channels: 4, background: {r: 255, g: 0, b: 0, alpha: 0}}}).png().toBuffer();
		for (const [bytes, mime] of [[png, 'image/png'], [await sharp(png).webp().toBuffer(), 'image/webp']] as any) {
			const result = await encodeSocialImage(bytes, mime, imageLimit('twitter'));
			const metadata = await sharp(result.bytes).metadata();
			assert.equal(metadata.format, 'jpeg');
			assert.equal(metadata.width, 120);
			assert.equal(metadata.height, 80);
			const pixel = await sharp(result.bytes).raw().toBuffer();
			assert(pixel[0] > 250 && pixel[1] > 250 && pixel[2] > 250);
		}
		const rotated = await sharp({create: {width: 120, height: 80, channels: 3, background: '#9349ae'}}).jpeg().withMetadata({orientation: 6}).toBuffer();
		const result = await encodeSocialImage(rotated, 'image/jpeg', imageLimit('twitter'));
		assert.equal(result.width, 80);
		assert.equal(result.height, 120);
	});
	it('bounds dimensions even for tiny files and does not enlarge small images', async () => {
		const tall = await sharp({create: {width: 1, height: 20000, channels: 3, background: '#456789'}}).png().toBuffer();
		const result = await encodeSocialImage(tall, 'image/png', imageLimit('bluesky'));
		assert.equal(result.width, 1);
		assert.equal(result.height, socialImageMaxEdge);
		const small = await sharp({create: {width: 7, height: 9, channels: 3, background: '#456789'}}).png().toBuffer();
		assert.equal((await encodeSocialImage(small, 'image/png', imageLimit('telegram'))).height, 9);
	});
	it('deterministically fits noisy images within the Bluesky cap using bounded encoding', async () => {
		const raw = Buffer.alloc(1800 * 1800 * 3);
		let random = 123456789;
		for (let index = 0; index < raw.length; index++) {
			random = (Math.imul(random, 1664525) + 1013904223) >>> 0;
			raw[index] = random >>> 24;
		}
		const input = await sharp(raw, {raw: {width: 1800, height: 1800, channels: 3}}).png().toBuffer();
		const a = await encodeSocialImage(input, 'image/png', 2000000);
		const b = await encodeSocialImage(input, 'image/png', 2000000);
		assert(a.bytes.length <= 2000000);
		assert.deepEqual(a.bytes, b.bytes);
		assert.equal((await sharp(a.bytes).metadata()).format, 'jpeg');
		assert.notEqual(a.codec.split(';').pop(), 'jpg:95');
	});
	it('rejects unsupported, mislabeled, truncated and animated input with controlled errors', async () => {
		const jpeg = await sharp({create: {width: 64, height: 64, channels: 3, background: '#123456'}}).jpeg().toBuffer();
		await assert.rejects(encodeSocialImage(jpeg, 'image/png', 2000000), {code: 'local_publication_image_input_invalid'});
		await assert.rejects(encodeSocialImage(jpeg.subarray(0, 60), 'image/jpeg', 2000000), {code: 'local_publication_image_decode_failed'});
		await assert.rejects(encodeSocialImage(Buffer.from('not an image'), 'image/webp', 2000000), {code: 'local_publication_image_decode_failed'});
		const png = await sharp({create: {width: 8, height: 8, channels: 3, background: '#123456'}}).png().toBuffer();
		// acTL advertises animation; policy rejects it before a frame could be silently dropped.
		const chunk = Buffer.alloc(20); chunk.writeUInt32BE(8, 0); chunk.write('acTL', 4); chunk.writeUInt32BE(2, 8);
		await assert.rejects(encodeSocialImage(Buffer.concat([png.subarray(0, 33), chunk, png.subarray(33)]), 'image/png', 2000000));
	});
	it('validates every network text/image limit before preparation', () => {
		const request = (network, text, images = 1, target = {}) => ({text, imageStorageIds: Array.from({length: images}, (_, n) => String(n)), destinations: [{network, target}]});
		for (const [network, max] of [['twitter', 280], ['threads', 500], ['instagram', 2200], ['discord', 2000], ['telegram', 1024], ['reddit', 39000]] as any) {
			assert.throws(() => validatePreparedPublication(request(network, 'a'.repeat(max + 1))), {code: 'local_publication_text_too_long'});
		}
		assert.throws(() => validatePreparedPublication(request('bluesky', '🙂'.repeat(301))), {code: 'local_publication_text_too_long'});
		validatePreparedPublication(request('bluesky', '👨‍👩‍👧‍👦'.repeat(50)));
		for (const network of ['discord', 'telegram', 'threads', 'instagram', 'reddit', 'rule34xxx']) {
			assert.throws(() => validatePreparedPublication(request(network, 'text', 2)), {code: 'local_publication_image_count_invalid'});
		}
		assert.throws(() => validatePreparedPublication(request('instagram', 'text', 0)), {code: 'local_publication_image_count_invalid'});
		assert.throws(() => validatePreparedPublication(request('rule34xxx', 'text', 0)), {code: 'local_publication_image_count_invalid'});
		validatePreparedPublication(request('telegram', 'a'.repeat(4096), 0));
		assert.equal(imageLimit('discord'), 8 * 1024 * 1024);
		assert.equal(imageLimit('bluesky'), 2000000);
		assert.equal(imageLimit('twitter'), 10 * 1024 * 1024);
	});
	it('binds prepared manifests to policy/network/original and prepared refs independently of producer intent', () => {
		const source = [{storageId: 'original', mimeType: 'image/webp'}];
		const attachments = [{storageId: 'prepared', mimeType: 'image/jpeg'}];
		const digest = preparedMediaDigest('twitter', source, attachments);
		assert.equal(digest, preparedMediaDigest('twitter', [{...source[0], url: 'https://example.com/ignored'}], attachments));
		assert.notEqual(digest, preparedMediaDigest('bluesky', source, attachments));
		assert.notEqual(digest, preparedMediaDigest('twitter', source, [{...attachments[0], storageId: 'different'}]));
		assert.notEqual(publicationDigest('twitter', '', {text: 'Text', attachments: source}), publicationDigest('twitter', '', {text: 'Text', attachments}));
	});
});
