import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import sharp from 'sharp';
import {ContentResave} from '../app/modules/content/resave.js';
import {withImageResaveTimings, imageResaveSpan, imageResaveCounter, markImageResaveReused} from '../app/modules/content/resaveTimings.js';
import {encodePublicationImage} from '../app/modules/drivers/convert/imageOptimize.js';
import {ImagePreviewDriver} from '../app/modules/drivers/preview/image.js';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

describe('opt-in publication image stage timings', function () {
    this.timeout(10000);
    it('keeps the disabled path unchanged and isolates parallel/nested spans', async () => {
        const disabled = await withImageResaveTimings(false, null, async () => imageResaveSpan('encode', async () => 12));
        assert.deepEqual(disabled, {value: 12});
        const nested = await withImageResaveTimings(true, null, async () => withImageResaveTimings(false, null, () => imageResaveSpan('encode', async () => 5)));
        assert.deepEqual(nested.timings.spans, [], 'a disabled nested operation cannot leak into its parent');
        const [first, second] = await Promise.all([1, 2].map(id => withImageResaveTimings(true, null, async () => {
            await imageResaveSpan('save_content', async () => {
                await sleep(2);
                await imageResaveSpan('encode', async () => imageResaveCounter('inputBytes', id));
            });
            return id;
        })));
        for (const item of [first, second]) {
            assert.equal(item.timings.counters.inputBytes, item.value);
            assert.equal(item.timings.spans.length, 2);
            assert.equal(item.timings.spans[1].parentId, item.timings.spans[0].id);
            assert.equal(item.timings.queueAgeMs, null);
            assert.ok(item.timings.totalMs >= item.timings.spans[0].durationMs);
        }
    });
    it('bounds diagnostic names/counts and never records arbitrary payload data', async () => {
        const result = await withImageResaveTimings(true, new Date(Date.now() - 1000), async () => {
            imageResaveCounter('COOKIE_SECRET', 10);
            for (let i = 0; i < 150; i++) {
                await imageResaveSpan('encode', async () => 1);
            }
            await imageResaveSpan('COOKIE_SECRET', async () => 'BODY_SECRET');
            markImageResaveReused();
        });
        assert.equal(result.timings.spans.length, 96);
        assert.equal(result.timings.truncated, true);
        assert.equal(result.timings.reused, true);
        assert.ok(result.timings.queueAgeMs >= 1000);
        assert.ok(!JSON.stringify(result.timings).includes('SECRET'));
    });
    it('preserves the original error and releases async-local diagnostics after failure', async () => {
        const failure = new Error('original failure');
        await assert.rejects(withImageResaveTimings(true, null, () => imageResaveSpan('encode', async () => {throw failure;})), error => error === failure);
        const next = await withImageResaveTimings(true, null, async () => 1);
        assert.deepEqual(next.timings.spans, []);
    });
    it('measures actual JPEG and preview processing without changing encoded output', async () => {
        const png = await sharp({create: {width: 90, height: 150, channels: 3, background: '#873217'}}).png().toBuffer();
        const baseline = await encodePublicationImage(Readable.from([png]));
        const measured = await withImageResaveTimings(true, null, async () => {
            const jpeg = await encodePublicationImage(Readable.from([png]));
            const preview = await new ImagePreviewDriver().processByStream(Readable.from([jpeg.bytes]), {size: 'medium'});
            for await (const _ of preview.stream) { /* drain the existing driver result */ }
            return jpeg.bytes;
        });
        assert.deepEqual(measured.value, baseline.bytes);
        assert.equal(measured.timings.counters.inputBytes, png.length);
        assert.equal(measured.timings.counters.encodedBytes, baseline.bytes.length);
        assert.ok(measured.timings.counters.previewOutputBytes > 0);
        for (const name of ['input_read', 'metadata', 'encode', 'preview_queue', 'preview_read_encode']) {
            assert.ok(measured.timings.spans.some(span => span.name === name && span.outcome === 'ok'), name);
        }
    });
    it('adds only opt-in execution diagnostics to existing resave receipts and identifies reuse', async () => {
        const worker: any = new ContentResave({});
        worker.authorize = async () => {};
        worker.saved = async () => ({id: 7, storageId: 'unchanged'});
        const queue = {userId: 1, createdAt: new Date(Date.now() - 500)}, input = {sourceContentId: 5, source: {}, policy: 'publication-jpeg95-v1'};
        const previous = process.env.GEESOME_IMAGE_RESAVE_TIMINGS;
        try {
            delete process.env.GEESOME_IMAGE_RESAVE_TIMINGS;
            const baseline = await worker.execute(queue, {}, input);
            assert.equal(baseline.timings, undefined);
            process.env.GEESOME_IMAGE_RESAVE_TIMINGS = '1';
            const result = await worker.execute(queue, {}, input);
            const {timings, ...receipt} = result;
            assert.deepEqual(receipt, baseline);
            assert.equal(timings.reused, true);
            assert.ok(timings.queueAgeMs >= 500);
        } finally {
            if (previous === undefined) {
                delete process.env.GEESOME_IMAGE_RESAVE_TIMINGS;
            } else {
                process.env.GEESOME_IMAGE_RESAVE_TIMINGS = previous;
            }
        }
    });
});
