import {withStorageFence, withStorageWorker} from '../../storageLifecycle.js';
import {withStorageJobSnapshot} from '../asyncOperation/storageHolds.js';
import {cleanupDue, cleanupFailure} from './cleanupRetry.js';
import {cleanupBatchReady} from './cleanupBatch.js';
import {storageActivitySnapshot} from './cleanupActivity.js';
import {cleanupDiskPressure} from './cleanupDisk.js';
import {cleanupPhase} from './cleanupTiming.js';
import {Op} from 'sequelize';
import {policy, imagePolicies} from '../drivers/convert/imageOptimize.js';

export function configureSiteReplacements(app, service) {
    service.retryCleanup = async (userId, id, apiKeyId) => {
        const row = await service.replacement(userId, id);
        await service.authorize(userId, apiKeyId, true);
        if (row.status === 'cleanup_failed') {
            await row.update({status: row.result?.cleanupRetry?.resumeStatus || 'retiring',
                result: {...row.result, cleanupRetry: {failures: 0, force: true}}, error: null});
        }
        return service.status(userId, id);
    };
    Object.defineProperty(service, 'capabilities', {get: () => ({contract: 1, policy, imagePolicies, resave: true, watermark: true, imageOptimizeDriver: true,
        retirement: Boolean(app.ms.storageSpace && app.ms.storage.node?.repo?.gc && app.ms.storage.node?.files?.rm),
        retainOriginalForExternalLinks: true})});
    service.processQueue = () => withStorageWorker(app, async () => {
        for (const row of await service.jobs.list(['rendered'])) {
            try {
                if (!await app.ms.archive.getArchive(row.result.storageId)) {
                    await withStorageFence(app, 'shared', () => app.ms.archive.requestArchive(row.userId, row.result.storageId, row.apiKeyId));
                }
                if (row.error) {
                    await row.update({error: null});
                }
            } catch (error) {
                await row.update({error: error.code || error.message});
            }
        }
        if (!app.ms.storageSpace) {
            return;
        }
        const retiring = (await service.jobs.list(['retiring'], 100)).filter(row => cleanupDue(row));
        const pending = (await service.jobs.list(['gc_pending'], 100)).filter(row => cleanupDue(row));
        if (!retiring.length && !pending.length) {
            return;
        }
        const batch = [...retiring, ...pending];
        for (const row of batch) {
            const waiting = row.result?.cleanupTiming?.waiting;
            if (!row.result?.cleanupQueuedAt || !waiting || waiting.finishedAt) {
                const startedAt = new Date().toISOString();
                await row.update({result: {...row.result, cleanupQueuedAt: row.result?.cleanupQueuedAt || startedAt,
                    cleanupTiming: {...row.result?.cleanupTiming,
                        waiting: {startedAt, attempts: (waiting?.attempts || 0) + 1}}}});
            }
        }
        const foregroundWaiting = () => service.jobs.Queue.findOne({attributes: ['id'], where: {isWaiting: true,
            module: {[Op.in]: ['content-resave', 'static-site-generator', 'content-archive', 'durable-upload']}}});
        const foreground = await foregroundWaiting();
        const activity = storageActivitySnapshot(app);
        if (!cleanupBatchReady(batch, Boolean(foreground), Date.now(), activity, await cleanupDiskPressure())) {
            return;
        }
        await withStorageFence(app, 'exclusive', async assertHeld => {
            // Writers arriving while this exclusive lock waited also reset quiet
            // time. Recheck after acquisition; disk pressure is the sole bypass.
            if (!cleanupBatchReady(batch, Boolean(await foregroundWaiting()), Date.now(), storageActivitySnapshot(app), await cleanupDiskPressure())) {
                return;
            }
            for (const row of batch) {
                const waiting = row.result.cleanupTiming.waiting;
                const finishedAt = Date.now();
                await assertHeld();
                await row.update({result: {...row.result, cleanupTiming: {...row.result.cleanupTiming,
                    waiting: {...waiting, finishedAt: new Date(finishedAt).toISOString(),
                        durationMs: Math.max(0, finishedAt - Date.parse(waiting.startedAt)), outcome: 'complete'}}}});
            }
            await withStorageJobSnapshot(app, async () => {
                for (const row of retiring) {
                    try {
                        await cleanupPhase([row], 'retirement', () => app.ms.storageSpace.retireSiteReplacement(service, row, assertHeld), Date.now, assertHeld);
                    } catch (error) {
                        await assertHeld();
                        await row.update(cleanupFailure(row, error));
                    }
                }
            });
            const gc = (await service.jobs.list(['gc_pending'], 100)).filter(row => cleanupDue(row));
            if (gc.length) {
                try {
                    await withStorageJobSnapshot(app, () => app.ms.storageSpace.collectRetiredSiteBlocks(service, gc, assertHeld));
                } catch (error) {
                    await assertHeld();
                    for (const row of gc) {
                        if (row.status !== 'gc_pending') {
                            continue;
                        }
                        await row.update(cleanupFailure(row, error));
                    }
                }
            }
        });
    });
}
