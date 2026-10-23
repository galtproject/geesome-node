import sharp from 'sharp';
import {digest} from '../../../storageIdentity.js';
import {ApiProblemError} from '../../api/problem.js';

export function watermarkDriver(value) {
    if (!value) {
        return null;
    }
    let driver;
    try {
        driver = typeof value === 'string' ? JSON.parse(value) : value;
    } catch {
        throw new ApiProblemError(400, 'image_watermark_invalid', 'Invalid watermark driver');
    }
    if (driver?.name !== 'imageWatermark' || driver.module !== 'convert') {
        throw new ApiProblemError(400, 'image_optimization_driver_conflict', 'Only the image watermark driver supports optimization');
    }
    const p = driver.params || {};
    if (typeof p.text !== 'string' || !p.text.trim() || p.text.length > 200
        || p.sizeRatio !== undefined && (!Number.isFinite(p.sizeRatio) || p.sizeRatio < 0.005 || p.sizeRatio > 0.1)
        || p.spacing !== undefined && (!Number.isFinite(p.spacing) || p.spacing < 0 || p.spacing > 500)
        || [p.color, p.background, p.font].some(v => v !== undefined && (typeof v !== 'string' || v.length > 100))) {
        throw new ApiProblemError(400, 'image_watermark_invalid', 'Invalid watermark parameters');
    }
    return {name: 'imageWatermark', module: 'convert', params: {text: p.text, color: p.color || '#ffffff80',
        background: p.background || 'black', font: p.font || 'monospace', spacing: p.spacing ?? 50,
        sizeRatio: p.sizeRatio || 1 / 50}};
}

export function watermarkIdentity(driver) {
    return driver ? digest(watermarkDriver(driver).params) : null;
}

export function watermarkProperties(driver) {
    return driver ? {imageWatermark: {version: 1, identity: watermarkIdentity(driver)}} : {};
}

const escape = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export async function watermarkBand(width, height, params) {
    const size = Math.max(1, Math.round(Math.max(width, height) * params.sizeRatio));
    const padding = Math.round(size / 2);
    const text = {text: `<span foreground="${escape(params.color)}">${escape(params.text)}</span>`,
        font: params.font, justify: true, align: 'left' as const, rgba: true, spacing: params.spacing,
        height: size, width: Math.round(size * params.text.length * 0.7)};
    return {size, bytes: await sharp({create: {width, height: size * 2, channels: 4, background: params.background}})
        .composite([{input: {text}, left: size, top: padding}]).png().toBuffer()};
}

export async function addWatermark(bytes: Buffer, driver) {
    const params = watermarkDriver(driver).params;
    const oriented = await sharp(bytes).rotate().png().toBuffer({resolveWithObject: true});
    const {width, height} = oriented.info;
    const band = await watermarkBand(width, height, params);
    return sharp(oriented.data).extend({bottom: band.size * 2, top: 0, left: 0, right: 0, background: params.background})
        .composite([{input: band.bytes, left: 0, top: height}]).png().toBuffer();
}
