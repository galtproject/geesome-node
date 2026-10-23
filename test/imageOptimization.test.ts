import assert from 'node:assert/strict';
import sharp from 'sharp';
import {watermarkDriver} from '../app/modules/content/imageWatermark.js';
import {QueryTypes} from 'sequelize';
import {withStorageFence, withStorageTaskLock, withStorageWorker} from '../app/storageLifecycle.js';
import {collectRetiredBlocks} from '../app/modules/storageSpace/siteRetirement.js';
import {randomUUID} from 'node:crypto';
import http from 'node:http';
import {digest, sameCid} from '../app/storageIdentity.js';
import {pageCid, readSiteData} from '../app/modules/staticSiteGenerator/siteData.js';
import {readArchive} from './helpers/archive.js';

describe('persisted image saving and local site retirement', function () {
    this.timeout(120000);
    let app: any, user: any, group: any, admin: any;
    before(async () => {
        const config = (await import('../app/config.js')).default;
        config.storageConfig.jsNode.pass = 'test test test test test test test test test test';
        app = await (await import('../app/index.js')).default({storageConfig: config.storageConfig, port: 7771});
        await app.flushDatabase();
        admin = (await app.setup({email: 'admin@admin.com', name: 'admin', password: 'admin'})).user;
        user = await app.registerUser({email: 'optimize@test.com', name: 'optimize', password: 'pass', permissions: ['user:all']});
        group = await app.ms.group.createGroup(user.id, {name: 'optimize_private', title: 'Private', isPublic: false});
    });
    after(async () => { await app?.stop(); });

    it('rebuild repairs already optimized unmarked images, preserves one watermark and renders marked mappings', async () => {
        const driver = watermarkDriver({name: 'imageWatermark', module: 'convert', params: {
            text: 'eraofwave.com', color: '#874ee6', background: 'black', font: 'monospace', spacing: 50, sizeRatio: 1 / 50}});
        const bytes = await sharp({create: {width: 1200, height: 1600, channels: 3, background: '#abc789'}}).png().toBuffer();
        const unmarked = await app.ms.content.saveData(user.id, bytes, 'legacy-unmarked.png', {optimize: true, waitForPin: true});
        const service = app.ms.staticSiteGenerator.replacements;
        const request = {requestKey: randomUUID(), contentIds: [unmarked.id], driver};
        const receipt = await service.requestReplacement(user.id, request);
        await assert.rejects(() => service.renderIds(user.id, receipt.id, [unmarked.id]), /image optimization not ready/);
        await assert.rejects(() => service.requestReplacement(user.id, {...request, driver: {...driver, params: {...driver.params, text: 'other.test'}}}),
            /image replacement idempotency conflict/);
        const accepted = await app.ms.content.requestResave(user.id, unmarked.id, null, driver);
        assert.equal(accepted.status, 'queued', 'unmarked optimization receipt cannot satisfy a marked rebuild');
        await app.ms.content.processResaveQueue();
        const queue = await app.ms.asyncOperation.getUserOperationQueue(user.id, accepted.id);
        assert.equal(queue.asyncOperation.errorMessage, null);
        const marked = JSON.parse(queue.asyncOperation.output).content;
        assert.notEqual(marked.id, unmarked.id);
        for (const cid of [marked.storageId, marked.mediumPreviewStorageId]) {
            const data = Buffer.from((await app.ms.storage.getFileData(cid)).slice());
            const metadata = await sharp(data).metadata();
            assert.equal(metadata.format, 'webp');
            assert.equal(metadata.height, Math.round(metadata.width * 1664 / 1200));
            if (cid === marked.storageId) {
                assert.ok(JSON.parse(marked.propertiesJson).imageWatermark?.identity);
            } else {
                const height = Math.floor(metadata.height * 64 / 1664);
                const pixels = await sharp(data).extract({left: 0, top: metadata.height - height, width: metadata.width, height})
                    .removeAlpha().raw().toBuffer();
                let dark = 0, purple = 0;
                for (let index = 0; index < pixels.length; index += 3) {
                    if (pixels[index] < 30 && pixels[index + 1] < 30 && pixels[index + 2] < 30) {
                        dark++;
                    }
                    if (pixels[index + 2] > pixels[index + 1] + 30 && pixels[index] > pixels[index + 1] + 20) {
                        purple++;
                    }
                }
                assert.ok(dark / (pixels.length / 3) > 0.8, 'preview retains the black strip');
                assert.ok(purple > 30, 'preview retains purple domain text');
            }
        }
        for (const id of [unmarked.id, marked.id]) {
            const repeat = await app.ms.content.requestResave(user.id, id, null, driver);
            assert.equal(repeat.status, 'completed');
            assert.equal(repeat.content.storageId, marked.storageId, 'later rebuilds preserve CID and avoid cumulative compression');
        }
        const site = await app.ms.staticSiteGenerator.generateContentListSite(user.id,
            {entityType: 'content-list', entityIds: [unmarked.id]}, {replacementId: receipt.id, archive: true,
                site: {name: `watermark_${randomUUID().replace(/-/g, '')}`, title: 'Marked'}});
        assert.deepEqual((await readSiteData(app.ms.storage, site.storageId)).contents.map(c => c.storageId), [marked.storageId]);
        const form = new FormData();
        form.append('file', new Blob([bytes], {type: 'image/png'}), 'generation-import.png');
        form.append('optimize', 'true');
        form.append('driver', JSON.stringify(driver));
        const token = await app.generateUserApiKey(user.id, {});
        const response = await fetch(`http://127.0.0.1:${process.env.PORT || 7771}/v1/user/save-file`,
            {method: 'POST', headers: {Authorization: `Bearer ${token}`}, body: form});
        assert.equal(response.status, 200, await response.clone().text());
        const upload = await response.json();
        assert.equal((await sharp(Buffer.from((await app.ms.storage.getFileData(upload.storageId)).slice())).metadata()).height, 1664,
            'Generation multipart import stores one strip with optimization enabled');
        assert.equal((await app.ms.content.requestResave(user.id, upload.id, null, driver)).status, 'completed');
    });

    it('resaves a legacy marked Upload without a driver or provenance without adding another strip', async () => {
        const driver = watermarkDriver({name: 'imageWatermark', module: 'convert', params: {text: 'eraofwave.com'}});
        const bytes = await sharp({create: {width: 1200, height: 1600, channels: 3, background: '#abcdef'}}).png().toBuffer();
        const source = await app.ms.content.saveData(user.id, bytes, 'legacy-marked.jpg', {driver, waitForPin: true});
        await app.ms.database.updateContent(source.id, {propertiesJson: '{}'});
        const accepted = await app.ms.content.requestResave(user.id, source.id, null, null, 'publication-jpeg95-v1');
        assert.equal(accepted.status, 'queued');
        await app.ms.content.processResaveQueue();
        const result = await app.ms.content.requestResave(user.id, source.id, null, null, 'publication-jpeg95-v1');
        assert.equal(result.status, 'completed');
        const image = Buffer.from((await app.ms.storage.getFileData(result.content.storageId)).slice());
        assert.equal((await sharp(image).metadata()).height, 1664);
        assert.equal(JSON.parse(result.content.propertiesJson).imageWatermark, undefined, 'no invented provenance');
        assert.equal((await app.ms.content.requestResave(user.id, result.content.id, null, null, 'publication-jpeg95-v1')).content.storageId,
            result.content.storageId, 'ordinary later rebuild reuses the rendition');
    });

    it('publishes JPEG quality 95 originals with WebP previews while preserving legacy receipts', async () => {
        const jpegPolicy = 'publication-jpeg95-v1';
        const driver = watermarkDriver({name: 'imageWatermark', module: 'convert', params: {
            text: 'eraofwave.com', color: '#874ee6', background: 'black', font: 'monospace', spacing: 50, sizeRatio: 1 / 50}});
        const bytes = await sharp({create: {width: 1200, height: 1600, channels: 3, background: '#789abc'}}).png().toBuffer();
        const source = await app.ms.content.saveData(user.id, bytes, 'source.png', {waitForPin: true});
        const legacy = await app.ms.content.requestResave(user.id, source.id, null, driver);
        await app.ms.content.processResaveQueue();
        const webp = (await app.ms.content.requestResave(user.id, source.id, null, driver)).content;
        assert.equal(webp.extension, 'webp');
        const accepted = await app.ms.content.requestResave(user.id, source.id, null, driver, jpegPolicy);
        assert.equal(accepted.status, 'queued', 'a cached WebP cannot satisfy JPEG');
        assert.notEqual(accepted.id, legacy.id);
        await app.ms.content.processResaveQueue();
        const jpeg = (await app.ms.content.requestResave(user.id, source.id, null, driver, jpegPolicy)).content;
        assert.equal(jpeg.extension, 'jpg');
        assert.equal(jpeg.mimeType, 'image/jpeg');
        assert.equal(jpeg.previewExtension, 'webp');
        assert.ok(jpeg.name.endsWith('.jpg'));
        const full = Buffer.from((await app.ms.storage.getFileData(jpeg.storageId)).slice());
        const metadata = await sharp(full).metadata();
        assert.equal(metadata.format, 'jpeg');
        assert.equal(metadata.chromaSubsampling, '4:4:4');
        assert.equal(metadata.height, 1664);
        assert.ok(JSON.parse(jpeg.propertiesJson).imageWatermark?.identity);
        assert.equal((await sharp(Buffer.from((await app.ms.storage.getFileData(jpeg.mediumPreviewStorageId)).slice())).metadata()).format, 'webp');
        for (const id of [source.id, jpeg.id]) {
            assert.equal((await app.ms.content.requestResave(user.id, id, null, driver, jpegPolicy)).content.storageId, jpeg.storageId);
        }
        assert.equal((await app.ms.content.requestResave(user.id, source.id, null, driver)).content.storageId, webp.storageId,
            'legacy receipt is still usable after JPEG conversion');
        const service = app.ms.staticSiteGenerator.replacements;
        const receipt = await service.requestReplacement(user.id, {requestKey: randomUUID(), contentIds: [source.id], driver, imagePolicy: jpegPolicy});
        const site = await app.ms.staticSiteGenerator.generateContentListSite(user.id,
            {entityType: 'content-list', entityIds: [source.id]}, {replacementId: receipt.id, archive: true,
                site: {name: `jpeg_${randomUUID().replace(/-/g, '')}`, title: 'JPEG'}});
        assert.deepEqual((await readSiteData(app.ms.storage, site.storageId)).contents.map(c => c.storageId), [jpeg.storageId]);
        await app.ms.archive.requestArchive(user.id, site.storageId);
        await app.ms.archive.processQueue();
        const archive = await app.ms.archive.getArchive(site.storageId);
        const archived = await readArchive(Buffer.from((await app.ms.storage.getFileData(archive.archivedStorageId)).slice()));
        assert.ok([...archived.keys()].some(name => name.endsWith('.jpg')), 'archive contains JPEG originals');
        assert.ok([...archived.keys()].some(name => name.endsWith('.webp')), 'archive contains WebP previews');
        const form = new FormData();
        form.append('file', new Blob([bytes], {type: 'image/png'}), 'generation.png');
        form.append('optimize', 'true');
        form.append('imagePolicy', jpegPolicy);
        form.append('driver', JSON.stringify(driver));
        const token = await app.generateUserApiKey(user.id, {});
        const response = await fetch(`http://127.0.0.1:${process.env.PORT || 7771}/v1/user/save-file`,
            {method: 'POST', headers: {Authorization: `Bearer ${token}`}, body: form});
        assert.equal(response.status, 200);
        const uploaded = await response.json();
        assert.equal(uploaded.extension, 'jpg');
        assert.equal(uploaded.mimeType, 'image/jpeg');
        assert.equal(uploaded.previewExtension, 'webp');
    });

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
            {entityType: 'content-list', entityIds: [source.id, source.id]}, {archive: true, site: {name: `old_optimized_site_${mode}`, title: 'Original'}});
        assert.deepEqual((await readSiteData(app.ms.storage, old.storageId)).contents.map(c => c.id), [source.id, source.id]);
        await app.ms.archive.requestArchive(user.id, old.storageId);
        await app.ms.archive.processQueue();
        const oldArchive = await app.ms.archive.getArchive(old.storageId);
        assert.ok(oldArchive);
        const sourceKey = randomUUID();
        const post = await app.ms.group.createPost(user.id, {groupId: group.id, status: 'published', name: `post-${sourceKey}`,
            contents: [{id: source.id, view: 'attachment'}], propertiesJson: JSON.stringify({membership: {sourceKey,
                pageUrl: `https://eraofwave.com/ipfs/${old.storageId}/#/`, title: 'Original', free: false}})});
        const service = app.ms.staticSiteGenerator.replacements;
        const receipt = await service.requestReplacement(user.id, {requestKey: randomUUID(), contentIds: [source.id],
            previousSiteStorageId: old.storageId, postId: post.id, deleteReplacedFiles: mode !== 'keep'});
        const admissions = await Promise.all(Array.from({length: 3}, () => app.ms.content.requestResave(user.id, source.id)));
        assert.equal(new Set(admissions.map(value => value.id)).size, 1, 'concurrent resaves share one queue receipt');
        const accepted = admissions[0];
        assert.equal(accepted.status, 'queued');
        await app.ms.content.processResaveQueue();
        const queue = await app.ms.asyncOperation.getUserOperationQueue(user.id, accepted.id);
        assert.equal(queue.asyncOperation.errorMessage, null);
        const output = JSON.parse(queue.asyncOperation.output);
        assert.equal(output.content.extension, 'webp');
        assert.equal(output.content.previewExtension, 'webp');
        assert.notEqual(output.content.id, source.id);
        assert.deepEqual(Buffer.from((await app.ms.storage.getFileData(source.storageId)).slice()), originalBytes);
        const beforeQueues = await app.ms.database.sequelize.model('userOperationQueue').count({where: {module: 'content-resave'}});
        for (let index = 0; index < 3; index++) {
            const reused = await app.ms.content.requestResave(user.id, output.content.id);
            assert.equal(reused.status, 'completed');
            assert.equal(reused.content.storageId, output.content.storageId);
        }
        assert.equal(await app.ms.database.sequelize.model('userOperationQueue').count({where: {module: 'content-resave'}}), beforeQueues);
        const replacement = await app.ms.staticSiteGenerator.generateContentListSite(user.id,
            {entityType: 'content-list', entityIds: [source.id]}, {archive: true, replacementId: receipt.id,
                site: {name: `new_optimized_site_${mode}`, title: 'Original'}});
        assert.deepEqual((await readSiteData(app.ms.storage, replacement.storageId)).contents.map(c => c.id), [output.content.id],
            'the rebuilt site contains each source image once');
        const replay = await app.ms.staticSiteGenerator.generateContentListSite(user.id,
            {entityType: 'content-list', entityIds: [source.id]}, {archive: true, replacementId: receipt.id,
                asyncOperationId: 999999, site: {name: `new_optimized_site_${mode}`, title: 'Original'}});
        assert.ok(sameCid(replay.storageId, replacement.storageId), 'lost render response reuses the frozen revision');
        if (mode === 'shared') {
            const site = await app.ms.database.sequelize.model('staticSite').findByPk(old.staticSiteId);
            await app.ms.database.sequelize.model('staticSite').create({...site.toJSON(), id: undefined,
                userId: user.id + 100, name: `shared_${mode}`});
            // Legacy roots can be reachable only from MFS, without a direct pin.
            const {variants} = await import('../app/storageIdentity.js');
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
                const site = await app.ms.database.sequelize.model('staticSite').findByPk(old.staticSiteId);
                assert.ok(await app.ms.storage.node.files.stat(`/${site.staticId}-site`));
            }
            return;
        }
        assert.ok(finished.result.cleanup.gc.completedAt);
        assert.equal(await app.ms.archive.getArchive(old.storageId), null, 'old archive mapping retired');
        await assert.rejects(() => app.ms.database.restoreContent(source.id), {code: 'content_retired'});
        await assert.rejects(() => app.ms.content.restoreDeletedContent(admin.id, source.id), {code: 'content_retired'});
        assert.equal(finished.result.cleanup.candidates.find(c => c.role === 'archive').localStatus, 'absent', JSON.stringify(finished.result.cleanup));
        assert.equal(finished.result.cleanup.candidates.find(c => c.role === 'site').localStatus, 'absent');
        for (const cid of [source.storageId, source.mediumPreviewStorageId]) {
            assert.ok(finished.result.cleanup.candidates.some(item => sameCid(item.storageId, cid) && item.localStatus === 'absent'), 'old image/PNG preview removed');
        }
        await assert.rejects(() => app.ms.storage.node.block.stat(pageCid(`https://x/ipfs/${oldArchive.archivedStorageId}`), {offline: true}));
        assert.ok(await app.ms.storage.node.block.stat(pageCid(`https://x/ipfs/${archive.archivedStorageId}`), {offline: true}));
        assert.equal((await app.ms.content.requestResave(user.id, source.id)).content.storageId, output.content.storageId,
            'idempotent source replay still works after source retirement');
        const reused = await app.ms.content.requestResave(user.id, output.content.id);
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
        const uploadedAgain = await app.ms.content.saveData(user.id, originalBytes, 'uploaded-again.png', {waitForPin: true});
        assert.notEqual(uploadedAgain.id, source.id, 'retired Content stays a tombstone');
        assert.ok(sameCid(uploadedAgain.storageId, source.storageId), 'same bytes can be uploaded again after cleanup');
        assert.deepEqual(Buffer.from((await app.ms.storage.getFileData(uploadedAgain.storageId)).slice()), originalBytes);
        await assert.rejects(() => app.ms.database.restoreContent(source.id), {code: 'content_retired'});
        await assert.rejects(() => app.ms.content.restoreDeletedContent(admin.id, source.id), {code: 'content_retired'});
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
            const file = await app.ms.storage.saveFileByData(Buffer.from(randomUUID()));
            const pending: any = {result: {cleanup: {candidates: [{storageId: file.id, unpinned: true}], retained: []}},
                update: async patch => Object.assign(pending, patch)};
            const result = withStorageFence(app, 'exclusive', assertHeld => collectRetiredBlocks(app.ms.staticSiteGenerator.replacements, [pending], assertHeld));
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

    it('queues ten concurrent multipart uploads behind shared writers instead of reporting maintenance', async () => {
        const origin = `http://127.0.0.1:${process.env.PORT || 7771}/v1`;
        const token = await app.generateUserApiKey(user.id, {});
        let unlock;
        const release = new Promise<void>(resolve => { unlock = resolve; });
        let held = 0, started;
        const ready = new Promise<void>(resolve => { started = resolve; });
        const writers = Array.from({length: 10}, () => withStorageFence(app, 'shared', async () => {
            if (++held === 10) {
                started();
            }
            await release;
        }));
        await ready;
        let settled = 0;
        const uploads = Array.from({length: 10}, async (_unused, index) => {
            const png = await sharp({create: {width: 40, height: 60, channels: 3,
                background: `#${randomUUID().replace(/-/g, '').slice(0, 6)}`}}).png().toBuffer();
            const form = new FormData();
            form.append('file', new Blob([png], {type: 'image/png'}), `parallel-${index}.png`);
            form.append('async', 'true');
            form.append('path', `/parallel-${randomUUID()}/${index}.png`);
            return fetch(`${origin}/user/save-file`, {method: 'POST', headers: {Authorization: `Bearer ${token}`},
                body: form, signal: AbortSignal.timeout(15000)}).finally(() => { settled++; });
        });
        try {
            await new Promise(resolve => setTimeout(resolve, 300));
            assert.equal(settled, 0, 'pool exhaustion waits rather than rejecting compatible writers');
        } finally {
            unlock();
            await Promise.all(writers);
        }
        const responses = await Promise.all(uploads);
        const receipts = await Promise.all(responses.map(async response => {
            assert.equal(response.status, 200, await response.clone().text());
            const receipt = await response.json();
            assert.ok(receipt.asyncOperationId);
            return receipt;
        }));
        assert.equal(new Set(receipts.map(receipt => receipt.asyncOperationId)).size, 10);
        for (const receipt of receipts) {
            let operation;
            for (let attempt = 0; attempt < 100; attempt++) {
                operation = await app.ms.asyncOperation.getUserAsyncOperation(receipt.asyncOperationId);
                if (!operation.inProcess) {
                    break;
                }
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            assert.equal(operation.errorMessage, null);
            assert.ok(operation.contentId, 'each accepted upload persisted content');
        }
    });

    it('releases ten aborted multipart requests and accepts ten subsequent uploads', async () => {
        const origin = `http://127.0.0.1:${process.env.PORT || 7771}/v1`;
        const token = await app.generateUserApiKey(user.id, {});
        let releaseWorker, workerStarted;
        const workerReady = new Promise<void>(resolve => { workerStarted = resolve; });
        const workerRelease = new Promise<void>(resolve => { releaseWorker = resolve; });
        const worker = withStorageWorker(app, async () => { workerStarted(); await workerRelease; });
        await workerReady;
        const partial = Array.from({length: 10}, () => {
            const request = http.request(`${origin}/user/save-file`, {method: 'POST', headers: {
                Authorization: `Bearer ${token}`, 'Content-Type': 'multipart/form-data; boundary=partial',
                'Content-Length': 100000,
            }});
            request.on('error', () => {});
            request.write('--partial\r\nContent-Disposition: form-data; name="file"; filename="partial.png"\r\nContent-Type: image/png\r\n\r\npartial');
            return request;
        });
        const sharedCount = async () => Number((await app.ms.database.sequelize.query(
            "SELECT count(*) AS count FROM pg_locks WHERE locktype='advisory' AND classid=17419 AND objid=9301 AND mode='ShareLock' AND granted",
            {type: QueryTypes.SELECT}))[0].count);
        try {
            for (let attempt = 0; attempt < 100 && await sharedCount() < 10; attempt++) {
                await new Promise(resolve => setTimeout(resolve, 20));
            }
            assert.equal(await sharedCount(), 10, 'ten uploads can hold the storage fence concurrently');
        } finally {
            for (const request of partial) {
                request.destroy();
            }
            releaseWorker();
            await worker;
        }
        for (let attempt = 0; attempt < 100 && await sharedCount() !== 0; attempt++) {
            await new Promise(resolve => setTimeout(resolve, 20));
        }
        assert.equal(await sharedCount(), 0, 'disconnects release the storage fence without waiting for a body terminator');
        const uploaded = await Promise.all(Array.from({length: 10}, async (_unused, index) => {
            const form = new FormData();
            form.append('file', new Blob([`recovered-${randomUUID()}`], {type: 'text/plain'}), `recovered-${index}.txt`);
            const response = await fetch(`${origin}/user/save-file`, {method: 'POST',
                headers: {Authorization: `Bearer ${token}`}, body: form, signal: AbortSignal.timeout(15000)});
            assert.equal(response.status, 200, await response.clone().text());
            const content = await response.json();
            assert.ok(content.id);
            return content.id;
        }));
        assert.equal(new Set(uploaded).size, 10, 'all complete uploads persist after aborted requests');
    });

    it('reports a bounded pool acquisition timeout separately from storage maintenance', async () => {
        const origin = `http://127.0.0.1:${process.env.PORT || 7771}/v1`;
        const token = await app.generateUserApiKey(user.id, {});
        let unlock, started, held = 0;
        const ready = new Promise<void>(resolve => { started = resolve; });
        const release = new Promise<void>(resolve => { unlock = resolve; });
        const writers = Array.from({length: 10}, () => withStorageFence(app, 'shared', async () => {
            if (++held === 10) {
                started();
            }
            await release;
        }));
        await ready;
        try {
            const response = await fetch(`${origin}/user/site-replacements`, {method: 'POST',
                headers: {Authorization: `Bearer ${token}`, 'Content-Type': 'application/json'},
                body: '{}', signal: AbortSignal.timeout(15000)});
            assert.equal(response.status, 503);
            assert.equal((await response.json()).code, 'storage_busy', 'capacity timeout does not claim GC is running');
        } finally {
            unlock();
            await Promise.all(writers);
        }
    });

    it('rejects concurrent HTTP producers promptly during cleanup and accepts the same request after release', async () => {
        const origin = `http://127.0.0.1:${process.env.PORT || 7771}/v1`;
        const token = await app.generateUserApiKey(user.id, {scopes: ['content:write', 'operations:read']});
        const headers = {Authorization: `Bearer ${token}`, 'Content-Type': 'application/json'};
        const png = await sharp({create: {width: 40, height: 60, channels: 3, background: '#789abc'}}).png().toBuffer();
        const content = await app.ms.content.saveData(user.id, png, 'storage-wait.png', {optimize: true, waitForPin: true});
        const body = JSON.stringify({requestKey: randomUUID(), contentIds: [content.id]});
        const Queue = app.ms.database.sequelize.model('userOperationQueue');
        const before = await Queue.count({where: {module: 'site-replacement'}});
        let unlock, started;
        const held = new Promise<void>(resolve => { started = resolve; });
        const release = new Promise<void>(resolve => { unlock = resolve; });
        const cleanup = withStorageFence(app, 'exclusive', async () => { started(); await release; });
        await held;
        try {
            const responses = await Promise.all(Array.from({length: 20}, () => fetch(`${origin}/user/site-replacements`,
                {method: 'POST', headers, body, signal: AbortSignal.timeout(5000)})));
            for (const response of responses) {
                assert.equal(response.status, 503);
                assert.equal((await response.json()).code, 'storage_maintenance_busy');
            }
            assert.equal(await Queue.count({where: {module: 'site-replacement'}}), before, 'rejected callbacks never ran');
            const caps = await fetch(`${origin}/user/image-optimization/capabilities`, {headers, signal: AbortSignal.timeout(5000)});
            assert.equal(caps.status, 200, 'GET polling remains available');
        } finally {
            unlock();
            await cleanup;
        }
        const response = await fetch(`${origin}/user/site-replacements`, {method: 'POST', headers, body});
        assert.equal(response.status, 202, await response.clone().text());
        const replay = await fetch(`${origin}/user/site-replacements`, {method: 'POST', headers, body});
        assert.equal((await replay.json()).id, (await response.json()).id);
        assert.equal(await Queue.count({where: {module: 'site-replacement'}}), before + 1);
    });

    it('preserves publisher HTTP routes and enforces owner/scoped-key boundaries', async () => {
        const origin = `http://127.0.0.1:${process.env.PORT || 7771}/v1`;
        const token = await app.generateUserApiKey(user.id, {scopes: ['content:write', 'operations:read']});
        const headers = {Authorization: `Bearer ${token}`, 'Content-Type': 'application/json'};
        const caps = await fetch(`${origin}/user/image-optimization/capabilities`, {headers});
        assert.equal(caps.status, 200);
        assert.deepEqual(await caps.json(), {contract: 1, policy: 'publication-jpeg95-v1', imagePolicies: ['publication-webp-v1', 'publication-jpeg95-v1'], resave: true, watermark: true, retirement: true});
        const png = await sharp({create: {width: 40, height: 60, channels: 3, background: '#123abc'}}).png().toBuffer();
        const content = await app.ms.content.saveData(user.id, png, 'http-contract.png', {optimize: true, waitForPin: true});
        const body = {requestKey: randomUUID(), contentIds: [content.id], deleteReplacedFiles: false};
        const create = await fetch(`${origin}/user/site-replacements`, {method: 'POST', headers, body: JSON.stringify(body)});
        assert.equal(create.status, 202, await create.clone().text());
        const receipt = await create.json();
        assert.equal(typeof receipt.id, 'number');
        const replay = await fetch(`${origin}/user/site-replacements`, {method: 'POST', headers, body: JSON.stringify(body)});
        assert.equal((await replay.json()).id, receipt.id);
        const status = await fetch(`${origin}/user/site-replacements/${receipt.id}`, {headers});
        assert.equal((await status.json()).status, 'preparing');
        const conflict = await fetch(`${origin}/user/site-replacements`, {method: 'POST', headers,
            body: JSON.stringify({...body, deleteReplacedFiles: true})});
        assert.equal(conflict.status, 403, 'retirement requires storage:retire even on replay');
        const changed = await fetch(`${origin}/user/site-replacements`, {method: 'POST', headers,
            body: JSON.stringify({...body, postId: 123})});
        assert.equal(changed.status, 409);
        const reused = await fetch(`${origin}/user/save-data`, {method: 'POST', headers,
            body: JSON.stringify({sourceContentId: content.id, optimize: true})});
        assert.equal(reused.status, 202, await reused.clone().text());
        assert.equal((await reused.json()).content.storageId, content.storageId);
        const other = await app.registerUser({name: `reader_${randomUUID().slice(0, 8)}`, password: 'pass', permissions: ['user:all']});
        const otherToken = await app.generateUserApiKey(other.id, {scopes: ['content:write']});
        const denied = await fetch(`${origin}/user/site-replacements/${receipt.id}`, {headers: {Authorization: `Bearer ${otherToken}`}});
        assert.equal(denied.status, 404);
    });

    it('uses existing operation persistence with CAS and protects recovery receipts from retention', async () => {
        const service = app.ms.staticSiteGenerator.replacements;
        const sequelize = app.ms.database.sequelize;
        for (const obsolete of ['imageRendition', 'imageReplacement', 'imageOptimizationReference', 'imageSiteRevision', 'retiredStorage']) {
            assert.equal(sequelize.models[obsolete], undefined, `${obsolete} is not registered`);
        }
        assert.ok(sequelize.models.staticSiteRevision);
        const key = randomUUID();
        const state = {requestKey: key, requestHash: 'test', status: 'preparing',
            input: {sources: [], contentIds: []}, result: null, error: null};
        const receipts = await Promise.all(Array.from({length: 3}, () => service.jobs.create(user.id, null, key, state)));
        assert.equal(new Set(receipts.map(row => row.id)).size, 1);
        const row = receipts[0];
        const stale = await service.replacement(user.id, row.id);
        const frozenInput = (await sequelize.model('userOperationQueue').findByPk(row.id)).inputJson;
        await row.update({result: {checkpoint: 1}});
        assert.equal(row.result.checkpoint, 1, 'checkpoint updates the live receipt snapshot');
        await row.update({result: {checkpoint: 2}});
        assert.equal(row.result.checkpoint, 2, 'successive checkpoints keep updating the same receipt');
        await assert.rejects(() => stale.update({result: {checkpoint: 0}}), {code: 'site_replacement_checkpoint_conflict'});
        await row.update({status: 'complete'});
        assert.equal(row.status, 'complete');
        const Queue = sequelize.model('userOperationQueue');
        const Operation = sequelize.model('userAsyncOperation');
        const queue = await Queue.findByPk(row.id);
        assert.equal(queue.inputJson, frozenInput, 'checkpoints never rewrite accepted input');
        assert.equal(JSON.parse(queue.inputJson).status, undefined);
        assert.equal(JSON.parse((await Operation.findByPk(queue.asyncOperationId)).output).input, undefined);
        const legacyKey = randomUUID();
        const legacyState = {requestKey: legacyKey, requestHash: 'legacy', input: {sources: []},
            status: 'preparing', result: null, error: null};
        const legacyOperation = await Operation.create({userId: user.id, module: 'site-replacement',
            inProcess: false, output: JSON.stringify(legacyState)});
        const legacyQueue = await Queue.create({userId: user.id, module: 'site-replacement', isWaiting: true,
            asyncOperationId: legacyOperation.id, inputHash: digest({userId: user.id, key: legacyKey}),
            inputJson: JSON.stringify(legacyState)});
        const legacy = await service.jobs.byKey(user.id, legacyKey);
        assert.equal(legacy.id, legacyQueue.id, 'earlier mirrored receipts remain readable');
        await legacy.update({status: 'complete', result: {checkpoint: 'legacy-recovered'}});
        assert.equal((await service.status(user.id, legacy.id)).result.checkpoint, 'legacy-recovered');
        await legacyQueue.reload();
        await legacyOperation.reload();
        assert.equal(legacyQueue.inputJson, JSON.stringify(legacyState), 'legacy input remains untouched');
        assert.equal(JSON.parse(legacyOperation.output).input, undefined, 'legacy checkpoint drops the duplicate input');
        const pending = await Operation.create({userId: user.id, module: 'content-resave', inProcess: false});
        const waiting = await Queue.create({userId: user.id, module: 'content-resave', isWaiting: true,
            inputJson: JSON.stringify({source: {}}), asyncOperationId: pending.id});
        const disposable = await Operation.create({userId: user.id, module: 'content-resave', inProcess: false});
        await sequelize.query(`UPDATE "userAsyncOperations" SET "updatedAt" = '2000-01-01' WHERE id IN (:ids)`,
            {replacements: {ids: [pending.id, disposable.id, queue.asyncOperationId]}});
        await app.ms.asyncOperation.cleanupFinishedAsyncOperations();
        assert.ok(await Operation.findByPk(queue.asyncOperationId), 'completed workflow replay receipt survives retention');
        assert.ok(await Operation.findByPk(pending.id), 'waiting resave survives retention after restart');
        assert.equal(await Operation.findByPk(disposable.id), null, 'ordinary finished operations still expire');
        assert.equal((await service.status(user.id, row.id)).result.checkpoint, 2);
        await waiting.destroy();
        await pending.destroy();
    });

    it('keeps ordinary writes working with more than 1000 queued resaves and gates only pending cleanup CIDs', async () => {
        const sequelize = app.ms.database.sequelize;
        const Queue = sequelize.model('userOperationQueue');
        const rows = await Queue.bulkCreate(Array.from({length: 2000}, () => ({userId: user.id,
            module: 'content-resave', isWaiting: true, inputJson: JSON.stringify({source: {}})})));
        const service = app.ms.staticSiteGenerator.replacements;
        let gate;
        try {
            const bytes = await sharp({create: {width: 40, height: 60, channels: 3, background: '#998877'}}).png().toBuffer();
            const saved = await app.ms.content.saveData(user.id, bytes, 'backlog.png', {optimize: true, waitForPin: true});
            assert.ok(saved.id);
            gate = await service.jobs.create(user.id, null, randomUUID(), {status: 'cleanup_failed', requestHash: 'gate',
                input: {sources: []}, result: {cleanup: {candidates: [{storageId: pageCid(`https://x/ipfs/${saved.storageId}`)}]}}});
            await assert.rejects(() => app.ms.database.updateContent(saved.id, {storageId: saved.storageId}), {code: 'storage_cleanup_in_progress'});
            await gate.update({status: 'complete'});
            await app.ms.database.updateContent(saved.id, {storageId: saved.storageId});
        } finally {
            if (gate) {
                await gate.update({status: 'complete'});
            }
            await Queue.destroy({where: {id: rows.map(row => row.id)}});
        }
    });

    it('cleans failed revision attempts and leaves ordinary generation outside durable revision history', async () => {
        const service = app.ms.staticSiteGenerator.replacements;
        const content = await app.ms.content.saveData(user.id, await sharp({create: {width: 20, height: 30,
            channels: 3, background: '#ccddee'}}).png().toBuffer(), 'revision.png', {optimize: true, waitForPin: true});
        const before = await service.models.Revision.count();
        const renderArgs = {entityType: 'content-list', entityIds: [content.id]};
        await app.ms.staticSiteGenerator.generateContentListSite(user.id, renderArgs, {site: {name: 'ordinary_revision_test', title: 'Ordinary revision'}});
        await app.ms.staticSiteGenerator.generateContentListSite(user.id, renderArgs, {site: {name: 'ordinary_revision_test', title: 'Ordinary revision'}});
        assert.equal(await service.models.Revision.count(), before);
        const receipt = await service.requestReplacement(user.id, {requestKey: randomUUID(), contentIds: [content.id]});
        let failedPath;
        await assert.rejects(() => service.withRender(user.id, receipt.id, {}, {}, async () => {
            failedPath = await service.beginRevision(user.id, 1, receipt.id);
            const file = await app.ms.storage.saveFileByData(Buffer.from('scratch'));
            await app.ms.storage.copyFileFromId(file.id, `${failedPath}/scratch`);
            throw Error('injected render failure');
        }), /injected render failure/);
        await assert.rejects(() => app.ms.storage.node.files.stat(failedPath));
        assert.equal(await service.models.Revision.count({where: {replacementId: receipt.id}}), 0);
        const crashed = await service.beginRevision(user.id, 1, receipt.id);
        const retry = await service.beginRevision(user.id, 1, receipt.id);
        assert.notEqual(crashed, retry);
        await assert.rejects(() => app.ms.storage.node.files.stat(crashed));
        await service.discardUnfinishedRevision(user.id, receipt.id);
    });

    it('rejects foreign IDs and changed replacement keys', async () => {
        const service = app.ms.staticSiteGenerator.replacements;
        await assert.rejects(() => app.ms.content.requestResave(user.id + 100000, 1));
        await assert.rejects(() => service.requestReplacement(user.id, {requestKey: randomUUID(), contentIds: [999999]}));
    });
    it('admits and processes concurrent resaves with a one-connection SQL pool', async () => {
        const sources = [];
        for (const color of ['#772244', '#449922']) {
            const png = await sharp({create: {width: 80, height: 120, channels: 3, background: color}}).png().toBuffer();
            sources.push(await app.ms.content.saveData(user.id, png, 'pool.png', {waitForPin: true}));
        }
        const storageConfig = app.config.storageConfig;
        await app.stop();
        app = await (await import('../app/index.js')).default({storageConfig, port: 7771,
            databaseConfig: {pool: {max: 1, min: 0, acquire: 3000}}});
        const admitted = await Promise.all([sources[0], sources[0], sources[1]].map(source => app.ms.content.requestResave(user.id, source.id)));
        assert.equal(admitted[0].id, admitted[1].id);
        for (let attempt = 0; attempt < 30; attempt++) {
            await app.ms.content.processResaveQueue();
            const queues = await Promise.all([admitted[0], admitted[2]].map(row => app.ms.asyncOperation.getUserOperationQueue(user.id, row.id)));
            if (queues.every(row => !row.isWaiting)) {
                assert.ok(queues.every(row => row.asyncOperation?.output && !row.asyncOperation.errorMessage));
                return;
            }
            await new Promise(resolve => setTimeout(resolve, 200));
        }
        assert.fail('small-pool resaves did not complete');
    });

});
