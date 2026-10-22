import assert from 'node:assert/strict';
import sharp from 'sharp';
import {QueryTypes} from 'sequelize';
import {withStorageFence, withStorageTaskLock} from '../app/storageLifecycle.js';
import {collectRetiredBlocks} from '../app/modules/imageOptimization/retirement.js';
import {randomUUID} from 'node:crypto';
import {digest, pageCid, sameCid} from '../app/modules/imageOptimization/service.js';
import {readArchive} from './helpers/archive.js';

describe('persisted image saving and local site retirement', function () {
    this.timeout(120000);
    let app: any, user: any, group: any;
    before(async () => {
        const config = (await import('../app/config.js')).default;
        config.storageConfig.jsNode.pass = 'test test test test test test test test test test';
        app = await (await import('../app/index.js')).default({storageConfig: config.storageConfig, port: 7771});
        await app.flushDatabase();
        await app.setup({email: 'admin@admin.com', name: 'admin', password: 'admin'});
        user = await app.registerUser({email: 'optimize@test.com', name: 'optimize', password: 'pass', permissions: ['user:all']});
        group = await app.ms.group.createGroup(user.id, {name: 'optimize_private', title: 'Private', isPublic: false});
    });
    after(async () => { await app?.stop(); });

    for (const mode of ['remove', 'keep', 'shared']) {
    it(`${mode}: resaves through the normal queue, publishes WebP, and collects the old archive/site/images locally`, async () => {
        const png = await sharp({create: {width: 1200, height: 1600, channels: 3, background: `#${randomUUID().replace(/-/g, '').slice(0, 6)}`}}).png().toBuffer();
        let source = await app.ms.content.saveData(user.id, png, 'source.png', {waitForPin: true});
        // Reproduce legacy PNG previews, rather than using today's WebP driver.
        const previewBytes = await sharp(png).resize({width: 1024}).png().toBuffer();
        const preview = await app.ms.storage.saveFileByData(previewBytes);
        await app.ms.database.updateContent(source.id, {mediumPreviewStorageId: preview.id, previewExtension: 'png', previewMimeType: 'image/png'});
        source = await app.ms.content.updateContentManifest((await app.ms.database.getContent(source.id)).toJSON());
        const originalBytes = Buffer.from((await app.ms.storage.getFileData(source.storageId)).slice());
        const old = await app.ms.staticSiteGenerator.generateContentListSite(user.id,
            {entityType: 'content-list', entityIds: [source.id]}, {archive: true, site: {name: `old_optimized_site_${mode}`, title: 'Original'}});
        await app.ms.archive.requestArchive(user.id, old.storageId);
        await app.ms.archive.processQueue();
        const oldArchive = await app.ms.archive.getArchive(old.storageId);
        assert.ok(oldArchive);
        const sourceKey = randomUUID();
        const post = await app.ms.group.createPost(user.id, {groupId: group.id, status: 'published', name: `post-${sourceKey}`,
            contents: [{id: source.id, view: 'attachment'}], propertiesJson: JSON.stringify({membership: {sourceKey,
                pageUrl: `https://eraofwave.com/ipfs/${old.storageId}/#/`, title: 'Original', free: false}})});
        const service = app.ms.imageOptimization;
        const receipt = await service.requestReplacement(user.id, {requestKey: randomUUID(), contentIds: [source.id],
            previousSiteStorageId: old.storageId, postId: post.id, deleteReplacedFiles: mode !== 'keep'});
        const admissions = await Promise.all(Array.from({length: 3}, () => service.requestResave(user.id, source.id)));
        assert.equal(new Set(admissions.map(value => value.id)).size, 1, 'concurrent resaves share one queue receipt');
        const accepted = admissions[0];
        assert.equal(accepted.status, 'queued');
        await service.processQueue();
        const queue = await app.ms.asyncOperation.getUserOperationQueue(user.id, accepted.id);
        assert.equal(queue.asyncOperation.errorMessage, null);
        const output = JSON.parse(queue.asyncOperation.output);
        assert.equal(output.content.extension, 'webp');
        assert.equal(output.content.previewExtension, 'webp');
        assert.notEqual(output.content.id, source.id);
        assert.deepEqual(Buffer.from((await app.ms.storage.getFileData(source.storageId)).slice()), originalBytes);
        const beforeQueues = await app.ms.database.sequelize.model('userOperationQueue').count({where: {module: 'content-resave'}});
        for (let index = 0; index < 3; index++) {
            const reused = await service.requestResave(user.id, output.content.id);
            assert.equal(reused.status, 'completed');
            assert.equal(reused.content.storageId, output.content.storageId);
        }
        assert.equal(await app.ms.database.sequelize.model('userOperationQueue').count({where: {module: 'content-resave'}}), beforeQueues);
        const replacement = await app.ms.staticSiteGenerator.generateContentListSite(user.id,
            {entityType: 'content-list', entityIds: [source.id]}, {archive: true, replacementId: receipt.id,
                site: {name: `new_optimized_site_${mode}`, title: 'Original'}});
        const replay = await app.ms.staticSiteGenerator.generateContentListSite(user.id,
            {entityType: 'content-list', entityIds: [source.id]}, {archive: true, replacementId: receipt.id,
                asyncOperationId: 999999, site: {name: `new_optimized_site_${mode}`, title: 'Original'}});
        assert.ok(sameCid(replay.storageId, replacement.storageId), 'lost render response reuses the frozen revision');
        if (mode === 'shared') {
            const site = await app.ms.database.sequelize.model('staticSite').findByPk(old.staticSiteId);
            await app.ms.database.sequelize.model('staticSite').create({...site.toJSON(), id: undefined,
                userId: user.id + 100, name: `shared_${mode}`});
            // Legacy roots can be reachable only from MFS, without a direct pin.
            const {variants} = await import('../app/modules/imageOptimization/service.js');
            for (const cid of variants(old.storageId)) {
                try { await app.ms.storage.unPin(cid); } catch { /* no pin in this encoding */ }
            }
        }
        await app.ms.archive.requestArchive(user.id, replacement.storageId);
        await app.ms.archive.processQueue();
        const archive = await app.ms.archive.getArchive(replacement.storageId);
        const tar = await readArchive(Buffer.from((await app.ms.storage.getFileData(archive.archivedStorageId)).slice()));
        const files = [...tar.keys()];
        assert.ok(files.some(name => name.endsWith('.webp')));
        assert.equal(files.some(name => name.endsWith('.png')), false, 'new archive contains no source PNG');
        const mapping = [[String(source.id), String(output.content.id), source.manifestStorageId, output.content.manifestStorageId]];
        const consumer = {kind: 'microwave-girls', receiptId: randomUUID(), mappingsHash: digest(mapping)};
        await app.ms.group.updatePost(user.id, post.id, {contents: [{id: output.content.id, view: 'attachment'}],
            propertiesJson: JSON.stringify({membership: {sourceKey, pageUrl: `https://eraofwave.com/ipfs/${replacement.storageId}/#/`,
                title: 'Original', free: false, imageReplacement: {id: receipt.id, receiptId: consumer.receiptId, mappingsHash: consumer.mappingsHash}}})});
        await service.finalize(user.id, receipt.id, {postId: post.id, storageId: replacement.storageId, consumer});
        await service.processQueue();
        let finished = await service.status(user.id, receipt.id);
        for (let attempt = 0; ['retiring', 'gc_pending'].includes(finished.status) && attempt < 30; attempt++) {
            await new Promise(resolve => setTimeout(resolve, 250));
            await service.processQueue();
            finished = await service.status(user.id, receipt.id);
        }
        assert.ok(['complete', 'complete_with_retained'].includes(finished.status), JSON.stringify(finished));
        const revision = await service.models.Revision.findOne({where: {id: finished.result.revisionId}});
        await assert.rejects(() => service.finishRevision(revision.workPath, replacement.storageId), {code: 'image_replacement_render_conflict'});
        assert.equal((await service.status(user.id, receipt.id)).status, finished.status, 'late renderer cannot undo finalization');
        if (mode !== 'remove') {
            assert.ok(await app.ms.archive.getArchive(old.storageId), 'old archive retained');
            assert.ok(await app.ms.storage.node.block.stat(pageCid(`https://x/ipfs/${old.storageId}`), {offline: true}));
            assert.ok(await app.ms.storage.node.block.stat(pageCid(`https://x/ipfs/${oldArchive.archivedStorageId}`), {offline: true}));
            if (mode === 'keep') {
                assert.equal(finished.result.cleanup, undefined);
            } else {
                assert.equal(finished.status, 'complete_with_retained');
                const revision = await service.models.Revision.findOne({where: {staticSiteId: old.staticSiteId}});
                assert.ok(await app.ms.storage.node.files.stat(revision.workPath));
            }
            return;
        }
        assert.ok(finished.result.cleanup.gc.completedAt);
        assert.equal(await app.ms.archive.getArchive(old.storageId), null, 'old archive mapping retired');
        await assert.rejects(() => app.ms.database.restoreContent(source.id), {code: 'storage_id_retired'});
        assert.equal(finished.result.cleanup.candidates.find(c => c.role === 'archive').localStatus, 'absent', JSON.stringify(finished.result.cleanup));
        assert.equal(finished.result.cleanup.candidates.find(c => c.role === 'site').localStatus, 'absent');
        for (const cid of [source.storageId, source.mediumPreviewStorageId]) {
            assert.ok(finished.result.cleanup.candidates.some(item => sameCid(item.storageId, cid) && item.localStatus === 'absent'), 'old image/PNG preview removed');
        }
        await assert.rejects(() => app.ms.storage.node.block.stat(pageCid(`https://x/ipfs/${oldArchive.archivedStorageId}`), {offline: true}));
        assert.ok(await app.ms.storage.node.block.stat(pageCid(`https://x/ipfs/${archive.archivedStorageId}`), {offline: true}));
        assert.equal((await service.requestResave(user.id, source.id)).content.storageId, output.content.storageId,
            'idempotent source replay still works after source retirement');
        const reused = await service.requestResave(user.id, output.content.id);
        assert.deepEqual(Buffer.from((await app.ms.storage.getFileData(reused.content.storageId)).slice()),
            Buffer.from((await app.ms.storage.getFileData(output.content.storageId)).slice()));
        const thirdReceipt = await service.requestReplacement(user.id, {requestKey: randomUUID(), contentIds: [output.content.id],
            previousSiteStorageId: replacement.storageId, postId: post.id, deleteReplacedFiles: true});
        const third = await app.ms.staticSiteGenerator.generateContentListSite(user.id,
            {entityType: 'content-list', entityIds: [output.content.id]}, {archive: true, replacementId: thirdReceipt.id,
                site: {name: 'third_optimized_site', title: 'Original'}});
        // A restart after render must recover missing archive admission.
        await service.processQueue();
        await app.ms.archive.processQueue();
        const thirdConsumer = {kind: 'microwave-girls', receiptId: randomUUID(), mappingsHash: digest([
            [String(output.content.id), String(output.content.id), output.content.manifestStorageId, output.content.manifestStorageId]])};
        await app.ms.group.updatePost(user.id, post.id, {contents: [{id: output.content.id, view: 'attachment'}],
            propertiesJson: JSON.stringify({membership: {sourceKey, pageUrl: `https://eraofwave.com/ipfs/${third.storageId}/#/`,
                title: 'Original', free: false, imageReplacement: {id: thirdReceipt.id, receiptId: thirdConsumer.receiptId, mappingsHash: thirdConsumer.mappingsHash}}})});
        await service.finalize(user.id, thirdReceipt.id, {postId: post.id, storageId: third.storageId, consumer: thirdConsumer});
        let thirdResult;
        for (let attempt = 0; attempt < 60; attempt++) {
            await service.processQueue();
            thirdResult = await service.status(user.id, thirdReceipt.id);
            if (!['retiring', 'gc_pending'].includes(thirdResult.status)) {
                break;
            }
            await new Promise(resolve => setTimeout(resolve, 250));
        }
        assert.ok(['complete', 'complete_with_retained'].includes(thirdResult.status), JSON.stringify(thirdResult));
        assert.equal(await app.ms.archive.getArchive(replacement.storageId), null, 'repeated rebuild retires its previous archive');
        assert.equal(thirdResult.result.images[0].content.storageId, output.content.storageId, 'third generation reuses identical optimized bytes');
        assert.ok(await app.ms.storage.node.block.stat(output.content.storageId, {offline: true}));
    });

    }

    it('rejects concurrent render claims and aborts GC if the PostgreSQL fence is lost', async () => {
        let unlock, started;
        const held = new Promise<void>(resolve => { started = resolve; });
        const release = new Promise<void>(resolve => { unlock = resolve; });
        const claim = withStorageTaskLock(app, 'test-render-claim', async () => { started(); await release; });
        await held;
        await assert.rejects(() => withStorageTaskLock(app, 'test-render-claim', async () => null), /image_render_in_process/);
        unlock();
        await claim;
        const node = app.ms.storage.node;
        const original = node.repo.gc;
        let gcStarted;
        const running = new Promise<void>(resolve => { gcStarted = resolve; });
        node.repo.gc = async function* ({signal}) {
            gcStarted();
            await new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), {once: true}));
        };
        try {
            const result = withStorageFence(app, 'exclusive', assertHeld => collectRetiredBlocks(app.ms.imageOptimization, [], assertHeld));
            const rejected = assert.rejects(result, /storage_fence_lost|terminat/i);
            await running;
            const locks = await app.ms.database.sequelize.query(`SELECT pid FROM pg_locks WHERE locktype='advisory'
                AND classid=17419 AND objid=9301 AND mode='ExclusiveLock' AND granted`, {type: QueryTypes.SELECT});
            assert.equal(locks.length, 1);
            await app.ms.database.sequelize.query('SELECT pg_terminate_backend(:pid)', {replacements: {pid: locks[0].pid}});
            await rejected;
        } finally {
            node.repo.gc = original;
        }
    });

    it('rejects foreign IDs and changed replacement keys', async () => {
        const service = app.ms.imageOptimization;
        await assert.rejects(() => service.requestResave(user.id + 100000, 1));
        await assert.rejects(() => service.requestReplacement(user.id, {requestKey: randomUUID(), contentIds: [999999]}));
    });
});
