import assert from 'node:assert/strict';
import sharp from 'sharp';
import {Readable} from 'node:stream';
import {watermarkDriver, addWatermark} from '../app/modules/content/imageWatermark.js';
import {encodePublicationImage} from '../app/modules/content/publicationImagePolicy.js';
import {ImageWatermarkDriver} from '../app/modules/drivers/convert/imageWatermark.js';

describe('optimized publication watermark strip', () => {
    const driver = watermarkDriver({name: 'imageWatermark', module: 'convert', params: {
        text: 'eraofwave.com', color: '#874ee6', background: 'black', font: 'monospace', spacing: 50, sizeRatio: 1 / 50}});
    for (const mark of [driver, {...driver, params: {...driver.params, text: 'eraofmeat.com', color: '#ffffff80'}}]) {
        it(`adds ${mark.params.text} only when explicitly requested, preserving a known mark on resave`, async () => {
            const source = await sharp({create: {width: 1200, height: 1600, channels: 3, background: '#acbdef'}}).png().toBuffer();
            const result = await encodePublicationImage(Readable.from([source]), mark);
            assert.equal(result.height, 1664);
            assert.equal((await sharp(result.bytes).metadata()).format, 'jpeg');
            const pixels = await sharp(result.bytes).extract({left: 0, top: 1600, width: 1200, height: 64}).raw().toBuffer();
            assert.ok(pixels.filter(value => value > 60).length > 100, 'domain text is visible on the black strip');
            const repeated = await encodePublicationImage(Readable.from([result.bytes]), mark, true);
            assert.equal(repeated.height, 1664, 'recorded provenance prevents a repeated strip');
            const legacy = await new ImageWatermarkDriver().processByStream(Readable.from([source]), {...mark.params, extension: 'jpg'});
            const chunks = [];
            for await (const chunk of legacy.stream as any) {
                chunks.push(chunk);
            }
            const preserved = await encodePublicationImage(Readable.from([Buffer.concat(chunks)]));
            assert.equal(preserved.height, 1664, 'ordinary resave does not add a strip to legacy Upload');
        });
    }
    it('uses a white background for transparent JPEG originals and keeps the legacy encoder available', async () => {
        const source = await sharp({create: {width: 100, height: 100, channels: 4, background: '#00000000'}}).png().toBuffer();
        const jpeg = await encodePublicationImage(Readable.from([source]));
        const metadata = await sharp(jpeg.bytes).metadata();
        assert.equal(metadata.format, 'jpeg');
        assert.equal(metadata.hasAlpha, false);
        const pixel = await sharp(jpeg.bytes).extract({left: 0, top: 0, width: 1, height: 1}).raw().toBuffer();
        assert.ok([...pixel].every(value => value >= 250));
        const legacy = await encodePublicationImage(Readable.from([source]), null, false, 'publication-webp-v1');
        assert.equal((await sharp(legacy.bytes).metadata()).format, 'webp');
    });
    it('validates drivers and escapes text markup', async () => {
        assert.throws(() => watermarkDriver({name: 'archive', module: 'upload'}), /Only the image watermark/);
        assert.throws(() => watermarkDriver({...driver, params: {...driver.params, text: ''}}), /Invalid watermark/);
        const source = await sharp({create: {width: 1200, height: 1600, channels: 3, background: 'white'}}).png().toBuffer();
        await addWatermark(source, {...driver, params: {...driver.params, text: 'a&b<site>'}});
    });
});
