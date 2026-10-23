import sharp from 'sharp';
import {addWatermark} from './imageWatermark.js';
import {Readable} from 'node:stream';
import {ApiProblemError} from '../api/problem.js';

export const policy = 'publication-jpeg95-v1';
export const legacyPolicy = 'publication-webp-v1';
export const imagePolicies = [legacyPolicy, policy];
export function imagePolicy(value = legacyPolicy): string {
    if (!imagePolicies.includes(value)) {
        problem('image_optimization_policy_invalid', 400);
    }
    return value;
}
export function imageFormat(value) {
    return imagePolicy(value) === policy ? {extension: 'jpg', mimeType: 'image/jpeg'} : {extension: 'webp', mimeType: 'image/webp'};
}
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

export async function encodePublicationImage(stream: Readable, watermark = null, watermarkApplied = false, selectedPolicy = policy) {
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
    const input = watermark && !watermarkApplied ? await addWatermark(bytes, watermark) : bytes;
    const image = sharp(input, options).rotate();
    const encoder = imagePolicy(selectedPolicy) === policy
        ? image.flatten({background: 'white'}).jpeg({quality: 95, chromaSubsampling: '4:4:4'})
        : image.webp({quality: 95, effort: 6});
    const result = await encoder.timeout({seconds: 30}).toBuffer({resolveWithObject: true});
    return {bytes: result.data, width: result.info.width, height: result.info.height,
        codec: `sharp:${sharp.versions.sharp};${imageFormat(selectedPolicy).extension}:95`};
}
