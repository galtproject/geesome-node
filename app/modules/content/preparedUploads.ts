import {promises as fs} from 'node:fs';
import path from 'node:path';
import {ApiProblemError} from '../api/problem.js';
import {ContentResave, imageSourceSnapshot} from './resave.js';
import {digest} from '../../storageIdentity.js';
import {maxImageBytes} from '../drivers/convert/imageOptimize.js';
import {preparedImageSlots, preparedMultipartFiles, validateImageBundle, validatePreparedSource} from './preparedImage.js';
import asyncBusboy from './asyncBusboy.js';

export function preparedReceipt(queue, input) {
    return {asyncOperationId: queue.asyncOperationId, channel: `upload:${input.fileId}`,
        sourceContentId: input.manifest.sourceContentId, sourceStorageId: input.manifest.sourceStorageId,
        bundleHash: input.bundleHash};
}

export async function findPreparedUpload(uploads, userId, apiKeyId, bundleHash, transaction?) {
    await new ContentResave(uploads.app).authorize(userId, apiKeyId);
    if (typeof bundleHash !== 'string' || !/^[a-f0-9]{64}$/.test(bundleHash)) {
        throw new ApiProblemError(400, 'prepared_image_manifest_invalid', 'Invalid bundle identity');
    }
    const queue = await uploads.Queue.findOne({where: {module: 'prepared-image-upload', userId,
        inputHash: `prepared:${bundleHash}`}, transaction, order: [['id', 'ASC']]});
    return queue ? preparedReceipt(queue, JSON.parse(queue.inputJson)) : null;
}

// Local staging never enters the IPFS writer fence. The worker later checks the
// source and key again before committing a publication-image receipt.
export async function acceptPreparedUpload(uploads, req) {
    const resave = new ContentResave(uploads.app);
    await resave.authorize(req.user.id, req.apiKey.id);
    const {queue, operation, input} = await uploads.reserve(req.user.id, req.apiKey.id, req.headers['content-length'], 'prepared-image-upload');
    let files = [], accepted = false;
    const receiveTimer = setTimeout(() => req.stream.destroy(
        new ApiProblemError(408, 'upload_receive_timeout', 'Upload reception timed out')), uploads.policy.receiveTimeoutMs);
    receiveTimer.unref();
    try {
        const directory = path.dirname(uploads.file(input.fileId));
        await fs.mkdir(directory, {recursive: true, mode: 0o700});
        const sizes = new Map<string, number>();
        let budget = Promise.resolve();
        const parsed = await asyncBusboy(req.stream, {headers: req.headers, tempDir: directory,
            fileByteBudget: (bytes, file) => {
                sizes.set(file, bytes);
                budget = budget.then(async () => {
                    const total = [...sizes.values()].reduce((sum, size) => sum + size, 0);
                    if (total > maxImageBytes) {
                        throw new ApiProblemError(413, 'prepared_image_too_large', 'Prepared bundle too large');
                    }
                    await uploads.extendReservation(queue, input, total);
                });
                return budget;
            },
            limits: {files: 4, fields: 2, parts: 7, fieldSize: 8192, fileSize: Math.min(maxImageBytes, uploads.policy.maxFileBytes)}});
        files = parsed.files;
        let manifest;
        try {
            manifest = JSON.parse(parsed.fields.manifest);
        } catch {
            throw new ApiProblemError(400, 'prepared_image_manifest_invalid', 'Invalid prepared image manifest');
        }
        if (Object.keys(parsed.fields).some(key => !['manifest', 'async'].includes(key))) {
            throw new ApiProblemError(400, 'prepared_image_manifest_invalid', 'Unexpected prepared field');
        }
        if (parsed.fields.async !== undefined && !['true', 'false'].includes(parsed.fields.async)) {
            throw new ApiProblemError(400, 'prepared_image_manifest_invalid', 'Invalid async flag');
        }
        const bytes = await preparedMultipartFiles(files, Math.min(maxImageBytes, uploads.policy.maxFileBytes));
        const {total, request} = await validateImageBundle(manifest, bytes);
        const source = await resave.owned(req.user.id, manifest.sourceContentId);
        validatePreparedSource(source, req.user.id, manifest, request);
        const bundleHash = digest(manifest);
        for (const slot of preparedImageSlots) {
            const file = await fs.open(path.join(directory, slot), 'wx', 0o600);
            try {
                await file.writeFile(bytes[slot]);
                await file.sync();
            } finally {
                await file.close();
            }
        }
        for (const dir of [directory, uploads.policy.directory]) {
            const handle = await fs.open(dir, 'r');
            try { await handle.sync(); } finally { await handle.close(); }
        }
        const stored = {...input, kind: 'prepared-image', source: imageSourceSnapshot(source), reservedBytes: Math.max(1, total), manifest, bundleHash, bytes: total};
        // The shared reservation lock serializes same-owner/bundle acceptance,
        // including a retry after the original HTTP receipt was lost.
        const existing = await uploads.sequelize.transaction(async transaction => {
            await uploads.sequelize.query('SELECT pg_advisory_xact_lock(17422, 1)', {transaction});
            const previousQueue = await uploads.Queue.findOne({where: {module: 'prepared-image-upload', userId: req.user.id,
                inputHash: `prepared:${bundleHash}`}, transaction, order: [['id', 'ASC']]});
            const previous = previousQueue ? preparedReceipt(previousQueue, JSON.parse(previousQueue.inputJson)) : null;
            if (previous) {
                return previous;
            }
            await queue.update({inputHash: `prepared:${bundleHash}`, inputJson: JSON.stringify(stored), isWaiting: true}, {transaction});
            await operation.update({name: 'save-prepared-image', output: JSON.stringify({upload: {phase: 'staged', acceptedAt: new Date().toISOString()}})}, {transaction});
            return null;
        });
        if (existing) {
            return {receipt: existing, reused: true, async: parsed.fields.async === 'true'};
        }
        accepted = true;
        return {receipt: preparedReceipt(queue, stored), async: parsed.fields.async === 'true'};
    } finally {
        clearTimeout(receiveTimer);
        for (const file of files) {
            file.on('error', () => {});
            file.destroy();
            file.emitFinish();
        }
        if (!accepted) {
            await uploads.removeFile(queue, input);
            await operation.update({inProcess: false, finishedAt: new Date(), errorType: 'upload_not_accepted',
                errorMessage: 'Upload was not accepted.'});
        }
    }
}
