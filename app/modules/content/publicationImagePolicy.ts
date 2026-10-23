import sharp from 'sharp';
import {ensureWatermark} from './imageWatermark.js';
import {Readable} from 'node:stream';
import {ApiProblemError} from '../api/problem.js';

export const policy = 'publication-webp-v1';
export const maxImagesPerSite = 1000;
export const maxImageBytes = 64 * 1024 * 1024;
export const maxImagePixels = 40 * 1000 * 1000;

export function problem(code: string, status = 409): never {
    throw new ApiProblemError(status, code, code.replace(/_/g, ' '));
}

export function contentIds(value): number[] {
    if (!Array.isArray(value) || !value.length || value.length > maxImagesPerSite
        || new Set(value).size !== value.length || value.some(id => !Number.isSafeInteger(id) || id <= 0)) {
        problem('image_optimization_ids_invalid', 400);
    }
    return value;
}

export function requestKey(value): string {
    if (typeof value !== 'string' || value.length < 1 || value.length > 200) {
        problem('image_optimization_key_invalid', 400);
    }
    return value;
}

export async function encodePublicationImage(stream: Readable, watermark = null, watermarkApplied = false) {
    const chunks: Buffer[] = [];
    let size = 0;
    try {
        for await (const chunk of stream) {
            size += chunk.length;
            if (size > maxImageBytes) {
                problem('image_optimization_image_too_large', 413);
            }
            chunks.push(Buffer.from(chunk));
        }
    } finally {
        stream.destroy();
    }
    const bytes = Buffer.concat(chunks);
    const options = {limitInputPixels: maxImagePixels, failOn: 'error' as const};
    const metadata = await sharp(bytes, options).metadata();
    if (!['png', 'jpeg', 'webp', 'avif', 'heif', 'tiff'].includes(metadata.format) || (metadata.pages || 1) !== 1) {
        problem('image_optimization_format_unsupported', 415);
    }
    const input = watermark && !watermarkApplied ? await ensureWatermark(bytes, watermark) : bytes;
    const result = await sharp(input, options).rotate().webp({quality: 95, effort: 6})
        .timeout({seconds: 30}).toBuffer({resolveWithObject: true});
    return {bytes: result.data, width: result.info.width, height: result.info.height,
        codec: `sharp:${sharp.versions.sharp};webp:${sharp.versions.webp}`};
}
