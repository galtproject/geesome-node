import {Op} from 'sequelize';
import {startIntervalWorker} from '../../backgroundWorker.js';
import {withStorageFence, withStorageWorker} from '../../storageLifecycle.js';
import createModels from './models.js';
import {ImageOptimizationService, resaveModule} from './service.js';
import {finalizeReplacement, retireReplacement, collectRetiredBlocks} from './retirement.js';
import {policy} from './policy.js';
import registerApi from './api.js';

export default async function (app) {
    app.checkModules(['database', 'content', 'storage', 'asyncOperation', 'archive', 'staticSiteGenerator']);
    const models = await createModels(app.ms.database.sequelize);
    const service: any = new ImageOptimizationService(app, models);
    app.ms.database.registerStorageIdReferenceSource({model: models.Reference, columns: ['storageId']});
    app.ms.database.registerStorageIdReferenceSource({model: models.Revision, columns: ['storageId']});
    let stopped = false;
    let processing = null;
    const worker = startIntervalWorker(() => service.processQueue(), {intervalMs: 2000,
        onError: error => console.error('image_replacement_worker_error', error)});

    service.finalize = (userId, id, body, apiKeyId) => finalizeReplacement(service, userId, id, body, apiKeyId);
    service.processQueue = () => {
        if (stopped) {
            return Promise.resolve({processed: 0});
        }
        if (processing) {
            return processing;
        }
        processing = withStorageWorker(app, async () => {
            let processed = 0;
            // Existing queue and existing async-operation receipts, resumable at
            // the same queue/operation ID after a process crash.
            const Queue = app.ms.database.sequelize.model('userOperationQueue');
            for (const queue of await Queue.findAll({where: {module: resaveModule, isWaiting: true}, order: [['id', 'ASC']], limit: 10})) {
                await withStorageFence(app, 'shared', async () => {
                    let operation = queue.asyncOperationId
                        ? await app.ms.asyncOperation.getAsyncOperation(queue.userId, queue.asyncOperationId) : null;
                    if (operation?.cancel) {
                        await app.ms.asyncOperation.errorAsyncOperation(queue.userId, operation.id, 'canceled');
                        await app.ms.asyncOperation.closeUserOperationQueue(queue.id);
                        return;
                    }
                    if (!operation) {
                        operation = await app.ms.asyncOperation.addAsyncOperation(queue.userId, {module: resaveModule,
                            name: 'resave-content', channel: `content-resave:${queue.id}`, userApiKeyId: queue.userApiKeyId});
                        await app.ms.asyncOperation.setAsyncOperationToUserOperationQueue(queue.id, operation.id);
                    }
                    try {
                        await app.ms.asyncOperation.updateUserAsyncOperation(operation.id, {inProcess: true, errorType: null, errorMessage: null});
                        const output = await service.executeResave(queue, operation, JSON.parse(queue.inputJson));
                        await app.ms.asyncOperation.finishAsyncOperation(queue.userId, operation.id, output.content.id, JSON.stringify(output));
                    } catch (error) {
                        await app.ms.asyncOperation.errorAsyncOperation(queue.userId, operation.id, error.code || error.message);
                    }
                    await app.ms.asyncOperation.closeUserOperationQueue(queue.id);
                });
                processed++;
            }
            // Recover a crash between renderer completion and archive admission.
            // Use the archive module's existing idempotent queue, not another job.
            for (const row of await models.Replacement.findAll({where: {status: 'rendered'}, order: [['updatedAt', 'ASC']], limit: 10})) {
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
            const retiring = await models.Replacement.findAll({where: {status: 'retiring'}, order: [['createdAt', 'ASC']], limit: 10});
            const pending = await models.Replacement.count({where: {status: 'gc_pending'}});
            if (retiring.length || pending) {
                await withStorageFence(app, 'exclusive', async assertHeld => {
                    for (const row of retiring) {
                        try {
                            await retireReplacement(service, row, assertHeld);
                        } catch (error) {
                            await assertHeld();
                            await row.update({status: 'cleanup_failed', error: error.code || error.message});
                        }
                    }
                    const gc = await models.Replacement.findAll({where: {status: 'gc_pending'}, limit: 100});
                    if (gc.length) {
                        try {
                            await collectRetiredBlocks(service, gc, assertHeld);
                        } catch (error) {
                            await assertHeld();
                            await models.Replacement.update({error: error.message}, {where: {id: {[Op.in]: gc.map(row => row.id)}, status: 'gc_pending'}});
                        }
                    }
                });
            }
            return {processed};
        }).finally(() => { processing = null; });
        return processing;
    };
    service.retryCleanup = async (userId, id, apiKeyId) => {
        const row = await service.replacement(userId, id);
        await service.authorize(userId, apiKeyId, true);
        if (row.status === 'cleanup_failed') {
            await row.update({status: 'retiring', error: null});
        }
        return service.status(userId, id);
    };
    service.capabilities = {contract: 1, policy, resave: true,
        retirement: Boolean(app.ms.storage.node?.repo?.gc && app.ms.storage.node?.files?.rm)};
    service.stop = async () => {
        stopped = true;
        await worker.stop();
        await processing;
    };
    service.flushDatabase = async () => {
        for (const model of [models.Reference, models.Replacement, models.Revision, models.Rendition, models.RetiredStorage]) {
            await model.destroy({where: {}});
        }
    };
    registerApi(app, service);
    return service;
}
