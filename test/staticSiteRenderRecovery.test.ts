import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {Sequelize} from 'sequelize';
import databaseConfig from '../app/modules/database/config.js';
import syncOperations from '../app/modules/asyncOperation/models.js';
import syncSites from '../app/modules/staticSiteGenerator/models.js';
import {getModule as operationsModule} from '../app/modules/asyncOperation/index.js';
import {getModule as siteModule, normalizeStaticSiteOptions} from '../app/modules/staticSiteGenerator/index.js';
import {StaticSiteRenderRecovery} from '../app/modules/staticSiteGenerator/renderRecovery.js';
import {SiteReplacements} from '../app/modules/staticSiteGenerator/replacements.js';
import {digest} from '../app/storageIdentity.js';
import {stopStorageFence} from '../app/storageLifecycle.js';

describe('static-site restart recovery with persisted receipts', function () {
    this.timeout(30000);
    let sequelize, models, app, recovery, generator, replacements, operations;
    let userId, sources;
    const storageId = 'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclqavt3bvrrzi';

    before(async () => {
        const config = databaseConfig;
        sequelize = new Sequelize(config.database, config.username, config.password,
            {...config, logging: false, pool: {max: 2, min: 0, acquire: 2000}});
        models = {...await syncOperations(sequelize), ...await syncSites(sequelize)};
        app = {ms: {database: {sequelize, getApiKey: async () => null}}, checkUserCan: async () => {}};
        operations = operationsModule(app, models);
        app.ms.asyncOperation = operations;
        generator = await siteModule(app, models);
        app.ms.staticSiteGenerator = generator;
        replacements = new SiteReplacements(app, models);
        generator.replacements = replacements;
        recovery = new StaticSiteRenderRecovery(app, models);
    });
    beforeEach(() => {
        userId = Math.floor(Math.random() * 100000000) + 100000000;
        sources = [{id: 1, storageId, manifestStorageId: storageId}];
        app.ms.database.getUserContentListByIds = async (_userId, ids) => sources.filter(row => ids.includes(row.id));
    });
    afterEach(async () => {
        await models.RenderReceipt.destroy({where: {userId}});
        await models.RenderRecovery.destroy({where: {userId}});
        await models.Revision.destroy({where: {userId}});
        await models.StaticSite.destroy({where: {userId}});
        await models.UserOperationQueue.destroy({where: {userId}});
        await models.UserAsyncOperation.destroy({where: {userId}});
    });
    after(async () => { await stopStorageFence(app); await sequelize?.close(); });

    async function interrupted(retain = false) {
        const previousSite = retain ? await models.StaticSite.create({userId, name: 'held_' + randomUUID().replaceAll('-', ''), storageId}) : null;
        const replacement = await replacements.jobs.create(userId, null, randomUUID(), {
            requestKey: randomUUID(), requestHash: randomUUID(), status: 'preparing',
            input: {contentIds: [1], sources: retain ? [{id: 1, userId, storageId, manifestStorageId: storageId}] : [],
                ...(retain ? {deleteReplacedFiles: true, previous: {siteId: previousSite.id, storageId, archiveStorageId: storageId}} : {})},
            result: null, error: null});
        const options = {archive: true, replacementId: replacement.id, site: {name: 'recovery_' + randomUUID().replaceAll('-', '')}};
        const queue = await operations.addUserOperationQueue(userId, 'static-site-generator', null,
            {renderArgs: {entityType: 'content-list', entityIds: [1]}, options});
        const operation = await operations.addAsyncOperation(userId, {module: 'static-site-generator', name: 'render', channel: randomUUID()});
        await operations.setAsyncOperationToUserOperationQueue(queue.id, operation.id);
        await operations.closeAllAsyncOperation();
        await operations.closeUserOperationQueue(queue.id);
        return {queue: await operations.getUserOperationQueue(userId, queue.id), operation, replacement, options};
    }

    it('recovers a closed interrupted queue exactly once under concurrent calls and preserves the original receipt', async () => {
        const {queue, operation} = await interrupted();
        const original = (await models.UserAsyncOperation.findByPk(operation.id)).toJSON();
        const input = queue.inputJson;
        const results = await Promise.all(Array.from({length: 4}, () => recovery.recover(userId, queue.id, operation.id)));
        assert.equal(new Set(results.map(result => result.asyncOperationId)).size, 1);
        assert.notEqual(results[0].asyncOperationId, operation.id);
        assert.equal(results[0].asyncOperation.id, results[0].asyncOperationId);
        assert.equal(results[0].asyncOperation.inProcess, true);
        assert.equal(await models.RenderRecovery.count({where: {queueId: queue.id}}), 1);
        assert.deepEqual((await models.UserAsyncOperation.findByPk(operation.id)).toJSON(), original);
        assert.deepEqual(JSON.parse((await models.RenderRecovery.findOne({where: {queueId: queue.id}})).interruptedReceipt),
            JSON.parse(JSON.stringify(original)));
        assert.equal((await operations.getUserOperationQueue(userId, queue.id)).inputJson, input);
        assert.equal((await operations.getUserOperationQueue(userId, queue.id)).isWaiting, true);
    });

    it('admits concurrent retained recoveries with only two application SQL connections and bounded storage RPCs', async () => {
        const first = await interrupted(true);
        const second = await interrupted(true);
        const oldStorage = app.ms.storage, oldArchive = app.ms.archive;
        const paths = new Map();
        let entered = 0, release;
        const both = new Promise(resolve => {release = resolve;});
        const bounded = options => {
            assert.equal(options.timeout, 30000);
            assert.ok(options.signal instanceof AbortSignal);
        };
        app.ms.archive = {getArchive: async () => ({archivedStorageId: storageId})};
        app.ms.storage = {getFileStat: async () => ({size: 1}), addPin: async () => {}, node: {files: {
            mkdir: async (_path, options) => {bounded(options);},
            cp: async (_cid, path, options) => {
                bounded(options);
                paths.set(path, storageId);
                if (++entered === 2) {
                    release();
                }
                await both;
            },
            stat: async (path, options) => {bounded(options); return {cid: paths.get(path)};},
        }}};
        const attempts = [first, second].map(item => recovery.recover(userId, item.queue.id, item.operation.id, null,
            {retainOriginalForExternalLinks: true}));
        try {
            const accepted = await Promise.all(attempts);
            assert.equal(entered, 2);
            assert.equal(new Set(accepted.map(item => item.asyncOperationId)).size, 2);
            assert.equal(await models.Revision.count({where: {userId}}), 2);
            assert.equal(await models.RenderRecovery.count({where: {userId}}), 2);
            assert.equal((await replacements.replacement(userId, first.replacement.id)).input.deleteReplacedFiles, true);
        } finally {
            release();
            await Promise.allSettled(attempts);
            app.ms.storage = oldStorage;
            app.ms.archive = oldArchive;
        }
    });

    it('runs the accepted attempt on the original queue and reconciles archive admission before finishing', async () => {
        const {queue, operation} = await interrupted();
        const accepted = await recovery.recover(userId, queue.id, operation.id);
        const unrelated = await operations.addUserOperationQueue(userId, 'static-site-generator', null,
            {renderArgs: {entityType: 'content-list', entityIds: [2]}, options: {}});
        const render = generator.generateContentListSite;
        let renders = 0, archives = 0;
        generator.generateContentListSite = async (_userId, _args, options) => {
            assert.equal(options.asyncOperationId, accepted.asyncOperationId);
            renders++;
            return {storageId, staticSiteId: 1};
        };
        app.ms.archive = {requestArchive: async (_userId, cid) => {assert.equal(cid, storageId); archives++;}};
        try {
            await generator.processPendingRenderRecoveries();
            const current = await operations.getUserOperationQueue(userId, queue.id);
            assert.equal(current.isWaiting, false);
            assert.equal(current.asyncOperation.finishedAt instanceof Date, true);
            assert.deepEqual(JSON.parse(current.asyncOperation.output), {storageId, staticSiteId: 1});
            const replay = await recovery.recover(userId, queue.id, operation.id);
            assert.equal(replay.asyncOperationId, accepted.asyncOperationId);
            assert.equal(replay.recovery.state, 'complete');
            await generator.processQueue({userId, queueId: queue.id});
            assert.equal(renders, 1);
            assert.equal(archives, 1);
            const untouched = await operations.getUserOperationQueue(userId, unrelated.id);
            assert.equal(untouched.isWaiting, true);
            assert.equal(untouched.asyncOperationId, null);
        } finally {
            generator.generateContentListSite = render;
        }
    });

    it('adopts a completed revision when confirmation was lost before the replacement checkpoint', async () => {
        const {replacement, options} = await interrupted();
        const normalized = normalizeStaticSiteOptions(options);
        normalized.archiveApiBase = '/api/v1';
        const renderArgs = {entityType: 'content-list', entityIds: [1]};
        const revisionId = randomUUID();
        const site = await models.StaticSite.create({userId, name: options.site.name});
        await models.Revision.create({id: revisionId, userId, staticSiteId: site.id, replacementId: replacement.id,
            workPath: '/ssg-revisions/' + revisionId, storageId});
        await replacement.update({result: {renderHash: digest({renderArgs, options: normalized}), renderRevisionId: revisionId}});
        const run = generator.generateContentListSiteRevision;
        generator.generateContentListSiteRevision = async () => {throw Error('must adopt saved output');};
        try {
            const result = await generator.generateContentListSite(userId, renderArgs, {...options, asyncOperationId: 100});
            assert.equal(result.storageId, storageId);
            assert.equal((await replacements.replacement(userId, replacement.id)).status, 'rendered');
            assert.equal((await models.StaticSite.findByPk(site.id)).storageId, storageId);
            assert.equal((await generator.generateContentListSite(userId, renderArgs, options)).storageId, storageId);
            await assert.rejects(() => generator.generateContentListSite(userId, {...renderArgs, entityIds: [2]}, options),
                {code: 'image_replacement_render_conflict'});
        } finally {
            generator.generateContentListSiteRevision = run;
        }
    });

    it('bounds repeated node restarts without resetting the accepted identities', async () => {
        const {queue, operation} = await interrupted();
        let expected = operation.id;
        for (let index = 0; index < 3; index++) {
            const accepted = await recovery.recover(userId, queue.id, expected);
            await models.UserAsyncOperation.update({inProcess: false, errorType: 'node-restart'}, {where: {id: accepted.asyncOperationId}});
            expected = accepted.asyncOperationId;
        }
        await assert.rejects(() => recovery.recover(userId, queue.id, expected), {code: 'static_site_recovery_exhausted'});
        const replay = await recovery.recover(userId, queue.id, operation.id);
        assert.equal(replay.asyncOperationId, expected);
        assert.equal(await models.RenderRecovery.count({where: {queueId: queue.id}}), 3);
    });

    it('refuses a foreign owner, active or non-restart operation, changed identity and cancellation', async () => {
        const {queue, operation} = await interrupted();
        await assert.rejects(() => recovery.recover(userId + 1, queue.id, operation.id), {code: 'operation_queue_not_found'});
        await assert.rejects(() => recovery.recover(userId, queue.id, operation.id + 1), {code: 'static_site_recovery_operation_changed'});
        for (const patch of [{inProcess: true}, {errorType: 'other'}, {cancel: true}, {finishedAt: new Date()}]) {
            await models.UserAsyncOperation.update({inProcess: false, errorType: 'node-restart', cancel: false, finishedAt: null, output: null, ...patch},
                {where: {id: operation.id}});
            await assert.rejects(() => recovery.recover(userId, queue.id, operation.id), {code: 'static_site_recovery_not_interrupted'});
        }
        assert.equal(await models.RenderRecovery.count({where: {queueId: queue.id}}), 0);
        await models.UserAsyncOperation.update({inProcess: false, errorType: 'node-restart', cancel: false, finishedAt: null, output: '{}'},
            {where: {id: operation.id}});
        await assert.rejects(() => recovery.recover(userId, queue.id, operation.id), {code: 'static_site_recovery_output_conflict'});
    });

    async function genericInterrupted(freeze = true) {
        const renderArgs = {entityType: 'content-list', entityIds: [1]};
        const options = normalizeStaticSiteOptions({archive: true, site: {name: 'frozen_' + randomUUID().replaceAll('-', ''), title: 'Frozen'}});
        const queue = freeze ? await recovery.admit(userId, null, renderArgs, options)
            : await operations.addUserOperationQueue(userId, 'static-site-generator', null, {renderArgs, options});
        const operation = await operations.addAsyncOperation(userId, {module: 'static-site-generator', name: 'render', channel: randomUUID()});
        await operations.setAsyncOperationToUserOperationQueue(queue.id, operation.id);
        await operations.closeAllAsyncOperation();
        await operations.closeUserOperationQueue(queue.id);
        return {queue: await operations.getUserOperationQueue(userId, queue.id), operation, renderArgs, options};
    }

    it('recovers a newly frozen rebuild-only render and adopts its queue-bound output after another lost confirmation', async () => {
        const {queue, operation} = await genericInterrupted();
        assert.equal(queue.renderRecoveryPolicy.mode, 'frozen-content-list');
        assert.equal(queue.renderRecoveryPolicy.supported, true);
        const accepted = await recovery.recover(userId, queue.id, operation.id);
        const render = generator.generateContentListSite;
        let renders = 0;
        generator.generateContentListSite = async () => {renders++; return {storageId, staticSiteId: 20};};
        app.ms.archive = {requestArchive: async () => {}};
        try {
            await generator.processPendingRenderRecoveries();
            const output = JSON.parse((await operations.getUserOperationQueue(userId, queue.id)).asyncOperation.output);
            await models.UserAsyncOperation.update({inProcess: false, errorType: 'node-restart', finishedAt: null, output: JSON.stringify(output)},
                {where: {id: accepted.asyncOperationId}});
            sources = [];
            const resumed = await recovery.recover(userId, queue.id, accepted.asyncOperationId);
            assert.notEqual(resumed.asyncOperationId, accepted.asyncOperationId);
            await generator.processPendingRenderRecoveries();
            assert.equal(renders, 1, 'saved queue result must avoid source reads and rendering');
            assert.deepEqual(JSON.parse((await operations.getUserOperationQueue(userId, queue.id)).asyncOperation.output), output);
            assert.equal((await models.RenderReceipt.findOne({where: {queueId: queue.id}})).renderOperationId, accepted.asyncOperationId,
                'adoption preserves the original artifact operation receipt');
        } finally {
            generator.generateContentListSite = render;
        }
    });

    it('refuses mutable source or changed queue input before accepting a generic recovery', async () => {
        const {queue, operation} = await genericInterrupted();
        sources[0].manifestStorageId = null;
        await assert.rejects(() => recovery.recover(userId, queue.id, operation.id), {code: 'static_site_render_source_changed'});
        assert.equal(await models.RenderRecovery.count({where: {queueId: queue.id}}), 0);
        sources[0].manifestStorageId = storageId;
        sources[0].description = 'changed';
        await assert.rejects(() => recovery.recover(userId, queue.id, operation.id), {code: 'static_site_render_source_changed'});
        delete sources[0].description;
        await models.UserOperationQueue.update({inputHash: 'changed'}, {where: {id: queue.id}});
        await assert.rejects(() => recovery.recover(userId, queue.id, operation.id), {code: 'static_site_recovery_input_changed'});
    });

    it('adopts a newly frozen render saved just before the queue-result checkpoint', async () => {
        const {queue, operation, renderArgs, options} = await genericInterrupted();
        const receipt = await models.RenderReceipt.findOne({where: {queueId: queue.id}});
        const originalSources = receipt.sources;
        const site = await models.StaticSite.create({userId, name: options.site.name, entityType: 'content-list',
            entityId: generator.entityIdsToKey(renderArgs.entityIds), storageId,
            options: JSON.stringify({...options, archiveApiBase: '/api/v1', asyncOperationId: operation.id})});
        await receipt.update({renderOperationId: operation.id});
        const output = {storageId, staticSiteId: site.id};
        await models.UserAsyncOperation.update({output: JSON.stringify(output)}, {where: {id: operation.id}});
        sources = [];
        await recovery.recover(userId, queue.id, operation.id);
        const adopted = await models.RenderReceipt.findByPk(receipt.id);
        assert.equal(adopted.sources, originalSources);
        assert.deepEqual(JSON.parse(adopted.result), output);
        const render = generator.generateContentListSite;
        generator.generateContentListSite = async () => {throw Error('must adopt completed frozen render');};
        app.ms.archive = {requestArchive: async () => {}};
        try {
            await generator.processPendingRenderRecoveries();
            assert.deepEqual(JSON.parse((await operations.getUserOperationQueue(userId, queue.id)).asyncOperation.output), output);
        } finally {
            generator.generateContentListSite = render;
        }
    });

    it('adopts only an exactly correlated legacy result and refuses unverifiable legacy input', async () => {
        const {queue, operation, renderArgs, options} = await genericInterrupted(false);
        assert.equal(queue.renderRecoveryPolicy.supported, false);
        await assert.rejects(() => recovery.recover(userId, queue.id, operation.id), {code: 'static_site_recovery_requires_frozen_input'});
        const site = await models.StaticSite.create({userId, name: options.site.name, entityType: 'content-list',
            entityId: generator.entityIdsToKey(renderArgs.entityIds), storageId,
            options: JSON.stringify({...options, archiveApiBase: '/api/v1', asyncOperationId: operation.id})});
        const current = await operations.getUserOperationQueue(userId, queue.id);
        assert.equal(current.renderRecoveryPolicy.mode, 'legacy-result-only');
        await models.UserAsyncOperation.update({output: JSON.stringify({storageId, staticSiteId: site.id})}, {where: {id: operation.id}});
        await recovery.recover(userId, queue.id, operation.id);
        const render = generator.generateContentListSite;
        generator.generateContentListSite = async () => {throw Error('must adopt legacy proof');};
        app.ms.archive = {requestArchive: async () => {}};
        try {
            await generator.processPendingRenderRecoveries();
            assert.equal((await operations.getUserOperationQueue(userId, queue.id)).asyncOperation.errorMessage, null);
        } finally {
            generator.generateContentListSite = render;
        }
    });

    it('does not admit recovery with invalid or read-only API keys', async () => {
        const {queue, operation} = await interrupted();
        await assert.rejects(() => recovery.recover(userId, queue.id, operation.id, 1), {code: 'not_permitted'});
        app.ms.database.getApiKey = async () => ({id: 1, scopes: ['operations:read']});
        try {
            await assert.rejects(() => recovery.recover(userId, queue.id, operation.id, 1), {code: 'insufficient_scope'});
        } finally {
            app.ms.database.getApiKey = async () => null;
        }
    });
});
