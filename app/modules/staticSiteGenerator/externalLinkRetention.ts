import {randomUUID} from 'node:crypto';
import {withStorageFence, withStorageControlTaskLock} from '../../storageLifecycle.js';
import {storageRpc} from '../storage/rpcDeadline.js';
import {normalizeStorageId, sameCid} from '../../storageIdentity.js';
import {problem} from '../content/publicationInput.js';

const tasks = new WeakMap<object, Map<number, Promise<any>>>();

export function retainOriginalForExternalLinks(service, userId, id) {
    let pending = tasks.get(service.app);
    if (!pending) {
        pending = new Map();
        tasks.set(service.app, pending);
    }
    if (pending.has(id)) {
        return pending.get(id);
    }
    const run = withStorageControlTaskLock(service.app, `site-replacement:${id}`, () =>
        withStorageFence(service.app, 'shared', () => retain(service, userId, id)));
    pending.set(id, run);
    return run.finally(() => pending.delete(id));
}

async function retain(service, userId, id) {
    const row = await service.replacement(userId, id);
    const previous = row.input.previous;
    if (!previous?.storageId || !previous.siteId) {
        problem('image_replacement_retention_previous_required');
    }
    const existing = row.result?.externalLinksRetention;
    if (existing) {
        if (existing.reason !== 'external_links_pending' || !sameCid(existing.previousPageStorageId, previous.storageId)) {
            problem('image_replacement_retention_conflict');
        }
        return existing;
    }
    if (!['preparing', 'rendered'].includes(row.status) || row.result?.finalization) {
        problem('image_replacement_retention_conflict');
    }
    const app = service.app;
    const site = await app.ms.database.sequelize.model('staticSite').findOne({where: {id: previous.siteId, userId}});
    if (!site) {
        problem('image_replacement_retention_conflict');
    }
    const contents = await app.ms.database.getUserContentListByIds(userId, row.input.sources.map(source => source.id));
    const owned = new Map(contents.map(content => [Number(content.id), content]));
    for (const source of row.input.sources) {
        const current: any = owned.get(Number(source.id));
        if (!current || current.isRemote || !sameCid(current.storageId, source.storageId)
            || source.manifestStorageId && !sameCid(current.manifestStorageId, source.manifestStorageId)) {
            problem('image_replacement_retention_source_changed');
        }
    }
    const archive = await app.ms.archive.getArchive(previous.storageId);
    if (previous.archiveStorageId && (!archive || !sameCid(archive.archivedStorageId, previous.archiveStorageId))) {
        problem('image_replacement_retention_archive_changed');
    }
    const pageStorageId = normalizeStorageId(previous.storageId);
    const archiveStorageId = archive?.archivedStorageId ? normalizeStorageId(archive.archivedStorageId) : null;
    await app.ms.storage.getFileStat(pageStorageId);
    await app.ms.storage.addPin(pageStorageId);
    if (archiveStorageId) {
        await app.ms.storage.getFileStat(archiveStorageId);
        await app.ms.storage.addPin(archiveStorageId);
    }
    const workPath = `/ssg-retained/${row.id}`;
    await storageRpc('mfs_mkdir', {parents: true}, options => app.ms.storage.node.files.mkdir('/ssg-retained', options), 30000);
    try {
        await storageRpc('mfs_cp', {}, options => app.ms.storage.node.files.cp('/ipfs/' + pageStorageId, workPath, options), 30000);
    } catch (error) {
        if (!/already exists|file exists/i.test(error.message)) {
            throw error;
        }
    }
    const stat: any = await storageRpc('mfs_stat', {}, options => app.ms.storage.node.files.stat(workPath, options), 30000);
    if (!sameCid(String(stat.cid || stat.hash), pageStorageId)) {
        problem('image_replacement_retention_conflict');
    }
    let revision = await service.models.Revision.findOne({where: {workPath}});
    if (!revision) {
        revision = await service.models.Revision.create({id: randomUUID(), userId, staticSiteId: previous.siteId,
            replacementId: row.id, workPath, storageId: pageStorageId});
    }
    if (revision.userId !== userId || revision.replacementId !== row.id || revision.retiredAt
        || !sameCid(revision.storageId, pageStorageId)) {
        problem('image_replacement_retention_conflict');
    }
    const retention = {reason: 'external_links_pending', establishedAt: new Date().toISOString(),
        originalDeleteReplacedFiles: row.input.deleteReplacedFiles, previousPageStorageId: pageStorageId,
        previousArchiveStorageId: archiveStorageId, revisionId: revision.id, workPath,
        sources: row.input.sources.map(({id, storageId, manifestStorageId, smallPreviewStorageId, mediumPreviewStorageId, largePreviewStorageId}) =>
            ({contentId: id, storageId, manifestStorageId, smallPreviewStorageId, mediumPreviewStorageId, largePreviewStorageId})),
        recoveries: []};
    await row.update({result: {...row.result, externalLinksRetention: retention}});
    return retention;
}

export async function bindRetentionToRecovery(service, userId, id, queueId, expectedOperationId) {
    return withStorageControlTaskLock(service.app, `site-replacement:${id}`, async () => {
        const row = await service.replacement(userId, id);
        const retention = row.result?.externalLinksRetention;
        if (!retention) {
            problem('image_replacement_retention_conflict');
        }
        if (!retention.recoveries.some(item => item.queueId === queueId && item.expectedOperationId === expectedOperationId)) {
            await row.update({result: {...row.result, externalLinksRetention: {...retention,
                recoveries: [...retention.recoveries, {queueId, expectedOperationId}]}}});
        }
    });
}
