import sharp from 'sharp';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {Readable} from 'node:stream';
import {ContentResave, properties} from './resave.js';
import {policy, maxImageBytes, maxImagePixels, encodePublicationImage, optimizationRequest} from '../drivers/convert/imageOptimize.js';
import {ImagePreviewDriver, imagePreviewEdge} from '../drivers/preview/image.js';
import {watermarkIdentity, watermarkProperties} from '../drivers/convert/imageWatermarkHelpers.js';
import {plain, sameCid, digest} from '../../storageIdentity.js';
import {withStorageFence} from '../../storageLifecycle.js';
import {problem, contentIds} from './publicationInput.js';

export const preparedImageSlots = ['file', 'small', 'medium', 'large'];
export const preparedImageContract = {contract: 1, policy, producer: 'trusted-client', maxBytes: maxImageBytes,
    slots: preparedImageSlots, previewEdges: {small: 512, medium: 1024, large: 2048}};
export const imageBytesHash = bytes => createHash('sha256').update(bytes).digest('hex');

// Uses the same encoders as server resaves. Preview inputs are the encoded JPEG,
// not the original source, to preserve the existing publication pixel pipeline.
export async function prepareImageBundle(bytes, source, driver = {name: 'imageOptimize', module: 'convert', params: {policy}}) {
    const request = optimizationRequest(driver);
    if (!request || request.policy !== policy) {
        problem('prepared_image_policy_invalid', 400);
    }
    const applied = properties(source).imageWatermark?.identity;
    const image = await encodePublicationImage(Readable.from([bytes]), request.watermark,
        Boolean(request.watermark && applied === watermarkIdentity(request.watermark)), policy);
    const previewDriver = new ImagePreviewDriver();
    const files: Record<string, Buffer> = {file: image.bytes};
    const byEdge = new Map<number, Buffer>();
    for (const slot of preparedImageSlots.slice(1)) {
        const edge = Math.min(imagePreviewEdge(slot), Math.max(image.width, image.height));
        if (!byEdge.has(edge)) {
            const preview = await previewDriver.processByStream(Readable.from([image.bytes]), {size: slot});
            const chunks = [];
            for await (const chunk of preview.stream) {
                chunks.push(Buffer.from(chunk));
            }
            byEdge.set(edge, Buffer.concat(chunks));
        }
        files[slot] = byEdge.get(edge);
    }
    return {files, manifest: {contract: 1, producer: 'trusted-client', sourceContentId: Number(source.id),
        sourceStorageId: source.storageId, driver, watermarkIdentity: watermarkIdentity(request.watermark) || applied || null,
        codec: image.codec, files: Object.fromEntries(preparedImageSlots.map(slot => [slot, imageBytesHash(files[slot])]))}};
}

export async function validateImageBundle(manifest, files: Record<string, Buffer>) {
    const request = optimizationRequest(manifest?.driver);
    if (manifest?.contract !== 1 || manifest.producer !== 'trusted-client' || request?.policy !== policy
        || typeof manifest.codec !== 'string' || manifest.codec.length > 120
        || Object.keys(files).sort().join(',') !== [...preparedImageSlots].sort().join(',')) {
        problem('prepared_image_manifest_invalid', 400);
    }
    contentIds([manifest.sourceContentId]);
    if (typeof manifest.sourceStorageId !== 'string' || !/^[a-zA-Z0-9]{10,200}$/.test(manifest.sourceStorageId)) {
        problem('prepared_image_source_invalid', 400);
    }
    let total = 0;
    const metadata: Record<string, any> = {};
    for (const slot of preparedImageSlots) {
        const bytes = files[slot];
        total += bytes.length;
        if (total > maxImageBytes) {
            problem('prepared_image_too_large', 413);
        }
        if (manifest.files?.[slot] !== imageBytesHash(bytes)) {
            problem('prepared_image_hash_mismatch', 400);
        }
        const image = sharp(bytes, {limitInputPixels: maxImagePixels, failOn: 'error'}).timeout({seconds: 10});
        try {
            metadata[slot] = await image.metadata();
            await image.stats(); // Decode fully: metadata alone accepts truncated images.
        } catch {
            problem('prepared_image_decode_failed', 400);
        }
        const m = metadata[slot];
        if (m.format !== (slot === 'file' ? 'jpeg' : 'webp') || (m.pages || 1) !== 1
            || !m.width || !m.height || m.width * m.height > maxImagePixels || (m.orientation || 1) !== 1) {
            problem('prepared_image_format_invalid', 400);
        }
    }
    const main = metadata.file;
    for (const slot of preparedImageSlots.slice(1)) {
        const scale = Math.min(1, imagePreviewEdge(slot) / Math.max(main.width, main.height));
        const m = metadata[slot];
        if (m.width !== Math.max(1, Math.round(main.width * scale)) || m.height !== Math.max(1, Math.round(main.height * scale))) {
            problem('prepared_image_dimensions_invalid', 400);
        }
    }
    return {request, total};
}

export async function savePreparedImage(app, userId, apiKeyId, manifest, files) {
    const resave = new ContentResave(app);
    await resave.authorize(userId, apiKeyId);
    const {request, total} = await validateImageBundle(manifest, files);
    return withStorageFence(app, 'shared', async () => {
        const checkSource = source => {
            if (!source || Number(source.userId) !== Number(userId) || source.isRemote) {
                problem('image_optimization_content_unavailable', 403);
            }
            if (!['image/png', 'image/jpeg', 'image/webp', 'image/avif', 'image/tiff', 'image/heif'].includes(source.mimeType)) {
                problem('image_optimization_format_unsupported', 415);
            }
            if (!sameCid(source.storageId, manifest.sourceStorageId)) {
                problem('image_optimization_source_changed');
            }
            const appliedIdentity = watermarkIdentity(request.watermark) || properties(source).imageWatermark?.identity || null;
            if (manifest.watermarkIdentity !== appliedIdentity) {
                problem('prepared_image_watermark_mismatch', 400);
            }
        };
        const source = await resave.owned(userId, manifest.sourceContentId, true);
        checkSource(source);
        const saved = await resave.saved(userId, source.id, source, undefined, request.watermark, policy);
        if (saved) {
            return {status: 'completed', reused: true, sourceContentId: source.id, content: saved, policy};
        }
        if (source.isDeleted) {
            problem('image_optimization_content_unavailable', 403);
        }
        // Never hold an application SQL transaction across media/storage I/O:
        // installations with a single SQL connection must keep working.
        const content = plain(await app.ms.content.saveData(userId, files.file, `prepared-${source.id}.jpg`, {
            mimeType: 'image/jpeg', userApiKeyId: apiKeyId, waitForPin: true, requirePreview: true,
            skipFileCatalog: true, forceNewContentEntity: true,
            properties: {...(request.watermark ? watermarkProperties(request.watermark)
                : properties(source).imageWatermark ? {imageWatermark: properties(source).imageWatermark} : {}),
                preparedImage: {contract: 1, producer: 'trusted-client', codec: manifest.codec,
                    sourceContentId: source.id, sourceStorageId: source.storageId,
                    bundleHash: digest(manifest), uploadedBytes: total}},
            previews: preparedImageSlots.slice(1).map(slot => ({previewSize: slot, content: files[slot], mimeType: 'image/webp'}))
        }));
        await resave.recordOptimizedContent(userId, content, policy);
        return app.ms.database.sequelize.transaction(async transaction => {
            const row = await app.ms.database.sequelize.model('content').findByPk(source.id,
                {transaction, lock: transaction.LOCK.UPDATE});
            const latest = plain(row);
            checkSource(latest);
            const completed = await resave.saved(userId, source.id, latest, transaction, request.watermark, policy);
            if (completed) {
                return {status: 'completed', reused: true, sourceContentId: source.id, content: completed, policy};
            }
            if (latest.isDeleted) {
                problem('image_optimization_content_unavailable', 403);
            }
            const receipt = {policy, resultContentId: content.id, resultStorageId: content.storageId,
                sourceStorageId: source.storageId, sourceManifestStorageId: source.manifestStorageId, producer: 'trusted-client'};
            await row.update({propertiesJson: JSON.stringify(resave.receiptProperties(latest, receipt))}, {transaction});
            return {status: 'completed', reused: false, sourceContentId: source.id, content, policy};
        });
    });
}

export async function preparedMultipartFiles(files, remainingBytes) {
    if (files.length !== 4 || new Set(files.map(file => file.fieldname)).size !== 4
        || files.some(file => !preparedImageSlots.includes(file.fieldname))) {
        problem('prepared_image_parts_invalid', 400);
    }
    const total = files.reduce((sum, file) => sum + file.bytes, 0);
    if (!Number.isFinite(total) || total > Math.min(remainingBytes, maxImageBytes)) {
        problem('prepared_image_too_large', 413);
    }
    return Object.fromEntries(await Promise.all(files.map(async file => [file.fieldname, await readFile(file.tempPath)])));
}
