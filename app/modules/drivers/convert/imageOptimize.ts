import {Readable} from 'node:stream';
import {DriverInput} from '../interface.js';
import AbstractDriver from '../abstractDriver.js';
import sharp from 'sharp';
import {addWatermark, watermarkDriver} from './imageWatermarkHelpers.js';
import {problem} from '../../content/publicationInput.js';

export class ImageOptimizeDriver extends AbstractDriver {
    supportedInputs = [DriverInput.Stream];

    async processByStream(stream, options: any = {}) {
        const timer = setTimeout(() => stream.destroy(new Error('image_optimization_input_timeout')), 60000);
        try {
            const selectedPolicy = imagePolicy(options.policy ?? options.imagePolicy);
            const result = await encodePublicationImage(stream, options.watermark, options.watermarkApplied, selectedPolicy);
            const format = imageFormat(selectedPolicy);
            return {stream: Readable.from([result.bytes]), type: format.mimeType, extension: format.extension};
        } finally {
            clearTimeout(timer);
            stream.destroy();
        }
    }
}

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
export const maxImageBytes = 64 * 1024 * 1024;
export const maxImagePixels = 40 * 1000 * 1000;

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

// Normalize the driver envelope and the historical optimize/imagePolicy fields to
// the same frozen profile/mark used by existing Content and operation receipts.
export function optimizationRequest(value, selectedPolicy = undefined, optimize = undefined) {
    if (optimize !== undefined && ![true, false, 'true', 'false'].includes(optimize)) {
        problem('image_optimization_flag_invalid', 400);
    }
    let driver = value;
    if (typeof value === 'string') {
        try {
            driver = JSON.parse(value);
        } catch {
            driver = null;
        }
    }
    if (driver?.name === 'imageOptimize') {
        if (driver.module !== 'convert' || optimize === false || optimize === 'false') {
            problem('image_optimization_driver_conflict', 400);
        }
        const params = driver.params || {};
        const selected = imagePolicy(params.policy ?? params.imagePolicy);
        if (selectedPolicy !== undefined && imagePolicy(selectedPolicy) !== selected) {
            problem('image_optimization_policy_conflict', 400);
        }
        return {policy: selected, watermark: watermarkDriver(params.watermark)};
    }
    if (optimize === true || optimize === 'true') {
        return {policy: imagePolicy(selectedPolicy), watermark: watermarkDriver(value)};
    }
    return null;
}
