import assert from 'node:assert/strict';
import sharp from 'sharp';
import {Readable} from 'node:stream';
import {watermarkDriver, ensureWatermark, hasWatermarkBand} from '../app/modules/content/imageWatermark.js';
import {encodePublicationImage} from '../app/modules/content/publicationImagePolicy.js';
import {ImageWatermarkDriver} from '../app/modules/drivers/convert/imageWatermark.js';

describe('optimized publication watermark strip', () => {
    const driver = watermarkDriver({name: 'imageWatermark', module: 'convert', params: {
        text: 'eraofwave.com', color: '#874ee6', background: 'black', font: 'monospace', spacing: 50, sizeRatio: 1 / 50}});
    it('marks before the single final JPEG encode and recognizes legacy JPEG Upload strips', async () => {
        const source = await sharp({create: {width: 1200, height: 1600, channels: 3, background: '#acbdef'}}).png().toBuffer();
        const legacy = await new ImageWatermarkDriver().processByStream(Readable.from([source]), {...driver.params, extension: 'jpg'});
        const chunks = [];
        for await (const chunk of legacy.stream as any) {
            chunks.push(chunk);
        }
        const markedJpeg = Buffer.concat(chunks);
        assert.equal(await hasWatermarkBand(markedJpeg, 1200, 1664, driver.params), true);
        for (const bytes of [source, markedJpeg]) {
            const result = await encodePublicationImage(Readable.from([bytes]), driver);
            assert.equal(result.width, 1200);
            assert.equal(result.height, 1664, 'exactly one strip');
            assert.equal((await sharp(result.bytes).metadata()).format, 'jpeg');
            assert.equal(await hasWatermarkBand(result.bytes, 1200, 1664, driver.params), true);
            assert.equal((await sharp(await ensureWatermark(result.bytes, driver)).metadata()).height, 1664);
        }
    });
    it('preserves the legacy translucent white EraOfMeat strip', async () => {
        const meat = {...driver, params: {...driver.params, text: 'eraofmeat.com', color: '#ffffff80'}};
        const source = await sharp({create: {width: 1200, height: 1600, channels: 3, background: '#acbdef'}}).png().toBuffer();
        const legacy = await new ImageWatermarkDriver().processByStream(Readable.from([source]), {...meat.params, extension: 'jpg'});
        const chunks = [];
        for await (const chunk of legacy.stream as any) {
            chunks.push(chunk);
        }
        const result = await encodePublicationImage(Readable.from([Buffer.concat(chunks)]), meat);
        assert.equal(result.height, 1664);
        assert.equal(await hasWatermarkBand(result.bytes, 1200, 1664, meat.params), true);
    });
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
    it('does not mistake an unmarked dark image edge for matching text', async () => {
        const black = await sharp({create: {width: 1200, height: 1664, channels: 3, background: 'black'}}).jpeg().toBuffer();
        assert.equal(await hasWatermarkBand(black, 1200, 1664, driver.params), false);
    });
    it('validates drivers and escapes text markup', async () => {
        assert.throws(() => watermarkDriver({name: 'archive', module: 'upload'}), /Only the image watermark/);
        assert.throws(() => watermarkDriver({...driver, params: {...driver.params, text: ''}}), /Invalid watermark/);
        const source = await sharp({create: {width: 1200, height: 1600, channels: 3, background: 'white'}}).png().toBuffer();
        await ensureWatermark(source, {...driver, params: {...driver.params, text: 'a&b<site>'}});
    });
});
