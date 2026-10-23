import {withStorageFence, withStorageWorker} from '../../storageLifecycle.js';
import {withStorageJobSnapshot} from '../asyncOperation/storageHolds.js';
import {cleanupDue, cleanupFailure} from './cleanupRetry.js';
import {policy, imagePolicies} from '../drivers/convert/imageOptimize.js';

export function configureSiteReplacements(app, service) {
    service.retryCleanup = async (userId, id, apiKeyId) => {
        const row = await service.replacement(userId, id);
        await service.authorize(userId, apiKeyId, true);
        if (row.status === 'cleanup_failed') {
            await row.update({status: row.result?.cleanupRetry?.resumeStatus || 'retiring',
                result: {...row.result, cleanupRetry: {failures: 0}}, error: null});
        }
        return service.status(userId, id);
    };
    Object.defineProperty(service, 'capabilities', {get: () => ({contract: 1, policy, imagePolicies, resave: true, watermark: true, imageOptimizeDriver: true,
        retirement: Boolean(app.ms.storageSpace && app.ms.storage.node?.repo?.gc && app.ms.storage.node?.files?.rm)})});
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
        const retiring = (await service.jobs.list(['retiring'])).filter(row => cleanupDue(row));
        const pending = (await service.jobs.list(['gc_pending'], 100)).filter(row => cleanupDue(row));
        if (!retiring.length && !pending.length) {
            return;
        }
        await withStorageFence(app, 'exclusive', async assertHeld => {
            await withStorageJobSnapshot(app, async () => {
                for (const row of retiring) {
                    try {
                        await app.ms.storageSpace.retireSiteReplacement(service, row, assertHeld);
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
