import {withStorageFence, withStorageWorker} from '../../storageLifecycle.js';
import {finalizeReplacement} from '../storageSpace/siteRetirement.js';
import {policy} from '../content/publicationImagePolicy.js';

export function configureSiteReplacements(app, service) {
    service.finalize = (userId, id, body, apiKeyId) => finalizeReplacement(service, userId, id, body, apiKeyId);
    service.retryCleanup = async (userId, id, apiKeyId) => {
        const row = await service.replacement(userId, id);
        await service.authorize(userId, apiKeyId, true);
        if (row.status === 'cleanup_failed') {
            await row.update({status: 'retiring', error: null});
        }
        return service.status(userId, id);
    };
    Object.defineProperty(service, 'capabilities', {get: () => ({contract: 1, policy, resave: true,
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
        const retiring = await service.jobs.list(['retiring']);
        const pending = await service.jobs.list(['gc_pending'], 100);
        if (!retiring.length && !pending.length) {
            return;
        }
        await withStorageFence(app, 'exclusive', async assertHeld => {
            for (const row of retiring) {
                try {
                    await app.ms.storageSpace.retireSiteReplacement(service, row, assertHeld);
                } catch (error) {
                    await assertHeld();
                    await row.update({status: 'cleanup_failed', error: error.code || error.message});
                }
            }
            const gc = await service.jobs.list(['gc_pending'], 100);
            if (gc.length) {
                try {
                    await app.ms.storageSpace.collectRetiredSiteBlocks(service, gc, assertHeld);
                } catch (error) {
                    await assertHeld();
                    for (const row of gc) {
                        await row.update({error: error.message});
                    }
                }
            }
        });
    });
}
