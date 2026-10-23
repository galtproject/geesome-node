import {countStorageHolds, releaseStorageJobHolds, hasActiveSourceWork} from '../asyncOperation/storageHolds.js';
import {properties} from '../content/resave.js';
import {storageRpc, gcTimeoutMs} from '../storage/rpcDeadline.js';
import {Op} from 'sequelize';
import {imageFiles, plain, sameCid, variants} from '../../storageIdentity.js';
import {problem} from '../content/publicationInput.js';


function absent(error) {
    return /not found|not exist|no link named|no such file|not pinned|is not pinned/i.test(error?.message || String(error));
}

// Metadata-only references must also keep actual blocks reachable through GC.
async function metadataReferences(service, cid, excludePostId = null) {
    return service.app.ms.database.sequelize.model('post').count({where: {isDeleted: {[Op.ne]: true},
        ...(excludePostId ? {id: {[Op.ne]: excludePostId}} : {}),
        [Op.or]: variants(cid).map(value => ({propertiesJson: {[Op.like]: `%${value}%`}}))}});
}

async function sharedSiteRoot(service, row) {
    const previous = row.input.previous;
    const sequelize = service.app.ms.database.sequelize;
    for (const cid of variants(previous.storageId)) {
        const safety = await service.app.ms.database.getStorageObjectDeleteSafety(cid, {ignoreDeletedContentSources: true});
        const counts = await Promise.all([
            sequelize.model('staticSite').count({where: {id: previous.siteId, userId: row.userId,
                [Op.or]: [{storageId: cid}, {lastEntityManifestStorageId: cid}]}}),
            sequelize.model('staticIdBinding').count({where: {staticId: previous.staticId, dynamicId: cid}}),
            sequelize.model('contentArchive').count({where: {userId: row.userId, originalStorageId: cid,
                archivedStorageId: previous.archiveStorageId}}),
            Promise.resolve(row.result?.cleanup?.holdsReleased ? 0 : 1),
            service.models.Revision.count({where: {userId: row.userId, staticSiteId: previous.siteId,
                storageId: cid, workPath: {[Op.in]: previous.paths.map(path => path.path)}}}),
        ]);
        const allowedDerived = counts.reduce((sum, value) => sum + value, 0);
        if (safety.blockers.some(blocker => blocker.key !== 'derivedStorageRefs')
            || safety.storageRefs.derivedStorageRefs > allowedDerived) {
            return true;
        }
    }
    return Boolean(await metadataReferences(service, previous.storageId, row.result.finalization.postId));
}

export async function retireReplacement(service, row, assertHeld) {
    const {app, models} = service;
    await service.authorize(row.userId, row.apiKeyId, true);
    const node = app.ms.storage.node;
    if (!node?.repo?.gc || !node?.files?.stat || !node?.files?.rm || !node?.block?.stat) {
        problem('image_retirement_adapter_unsupported');
    }
    await service.assertCurrentPublication(row);
    if (hasActiveSourceWork(app, row.input.contentIds, row.input.previous?.storageId)) {
        return {deferred: true};
    }
    const result = structuredClone(row.result);
    result.cleanup = result.cleanup || {candidates: [], retained: [], detached: false, paths: []};
    const journal = result.cleanup;
    const save = async () => {
        await assertHeld();
        await row.update({result: structuredClone(result)});
    };
    const previous = row.input.previous;
    if (!journal.detached) {
        const keep = new Set(result.images.flatMap(image => imageFiles(image.content)));
        keep.add(result.finalization.storageId);
        keep.add(normalize(result.finalization.archiveStorageId));
        let oldSiteShared = false;
        if (previous) {
            oldSiteShared = await sharedSiteRoot(service, row);
            // Protect even legacy MFS-only roots before any detach/checkpoint.
            await app.ms.storage.addPin(previous.storageId);
            if (previous.archiveStorageId) {
                await app.ms.storage.addPin(previous.archiveStorageId);
            }
            for (const path of previous.paths) {
                const existing = journal.paths.find(item => item.path === path.path);
                if (existing?.removed) {
                    continue;
                }
                if (!/^\/(?:ssg-revisions\/[a-f0-9-]{36}|[A-Za-z0-9]+-site)$/.test(path.path)) {
                    problem('image_retirement_path_invalid');
                }
                try {
                    const stat = await storageRpc('mfs_stat', {}, options => node.files.stat(path.path, options));
                    const cid = String(stat.cid || stat.hash);
                    if (!sameCid(cid, path.cid) || sameCid(cid, result.finalization.storageId)) {
                        oldSiteShared = true;
                        journal.retained.push({storageId: previous.storageId, reason: 'mfs_root_changed', path: path.path});
                        continue;
                    }

                } catch (error) {
                    if (!absent(error)) {
                        throw error;
                    }
                }
            }
        }
        // Release only this workflow's holds in its persisted checkpoint.
        journal.holdsReleased = true;
        await save();
        releaseStorageJobHolds(app, row.id);
        for (let i = 0; i < row.input.sources.length; i++) {
            const source = row.input.sources[i];
            const target = result.images[i].content;
            if (source.id === target.id || sameCid(source.storageId, target.storageId)) {
                continue;
            }
            let references = 0;
            for (const cid of imageFiles(source)) {
                references += await countStorageHolds(app, cid, row.id);
            }
            if (references) {
                journal.retained.push({contentId: source.id, reason: 'other_preparation_reference'});
                continue;
            }
            const current = plain(await app.ms.database.getContent(source.id, {includeDeleted: true}));
            if (!current || !sameCid(current.storageId, source.storageId) || current.userId !== row.userId) {
                journal.retained.push({contentId: source.id, reason: 'source_changed'});
                continue;
            }
            // Do not remap independent publication attachments. Only this Post
            // was switched by the publisher before its finalization acknowledgment.
            const safety = await app.ms.database.getContentDeleteSafety(current, {allowedFileCatalogItems: 100000});
            if (!safety.safeToDestroyContent) {
                journal.retained.push({contentId: source.id, reason: 'shared_content', blockers: safety.contentBlockers});
                continue;
            }
            const catalog = app.ms.database.models.FileCatalogItem;
            if (await catalog.count({where: {contentId: source.id, userId: {[Op.ne]: row.userId}, isDeleted: {[Op.ne]: true}}})) {
                journal.retained.push({contentId: source.id, reason: 'other_owner_catalog'});
                continue;
            }
            await app.ms.fileCatalog['replaceOwnedContent'](row.userId, source.id, target);
            for (const cid of imageFiles(source)) {
                await app.ms.storage.addPin(cid);
            }
            await app.ms.database.updateContent(source.id, {propertiesJson: JSON.stringify({...properties(current),
                publicationRetirement: {operationQueueId: row.id, retiredAt: new Date().toISOString()}})});
            await app.ms.database.deleteContent(source.id);
            journal.candidates.push(...imageFiles(source).filter(cid => !keep.has(cid)).map(storageId => ({storageId, role: 'source'})));
        }
        if (previous && !oldSiteShared) {
            const sequelize = app.ms.database.sequelize;
            const bindings = sequelize.models.staticIdBinding;
            if (bindings) {
                const binding = await bindings.findOne({where: {staticId: previous.staticId, dynamicId: {[Op.in]: variants(previous.storageId)}}});
                if (binding) {
                    await app.ms.staticId.bindToStaticId(row.userId, result.finalization.storageId, previous.staticId);
                }
            }
            await sequelize.model('staticSite').update({storageId: null, lastEntityManifestStorageId: null}, {
                where: {id: previous.siteId, userId: row.userId, storageId: {[Op.in]: variants(previous.storageId)}}});
            await models.Revision.update({storageId: null, retiredAt: new Date()}, {where: {userId: row.userId,
                staticSiteId: previous.siteId, storageId: normalize(previous.storageId),
                workPath: {[Op.in]: previous.paths.map(path => path.path)}}});
            await app.ms.archive.retireArchive(row.userId, previous.storageId, previous.archiveStorageId);
            journal.candidates.push({storageId: normalize(previous.storageId), role: 'site'});
            if (previous.archiveStorageId) {
                journal.candidates.push({storageId: normalize(previous.archiveStorageId), role: 'archive'});
            }
        } else if (previous) {
            journal.retained.push({storageId: previous.storageId, reason: 'shared_or_changed_site'});
        }
        journal.candidates = [...new Map(journal.candidates.filter(item => !keep.has(item.storageId)).map(item => [item.storageId, item])).values()];
        journal.detached = true;
        await save();
    }
    for (const candidate of journal.candidates) {
        if (candidate.unpinned || candidate.retained) {
            continue;
        }
        const safeguards = await Promise.all(variants(candidate.storageId).map(cid => app.ms.database.getStorageObjectDeleteSafety(cid, {ignoreDeletedContentSources: true})));
        const blockers = safeguards.flatMap(safety => safety.blockers);
        if (await metadataReferences(service, candidate.storageId)) {
            blockers.push({scope: 'storage', key: 'postMetadata', count: 1});
        }
        if (blockers.length) {
            await app.ms.storage.addPin(candidate.storageId);
            candidate.retained = true;
            candidate.blockers = blockers;
        } else {
            if (candidate.role === 'site') {
                for (const path of previous.paths) {
                    if (journal.paths.some(item => item.path === path.path && item.removed)) {
                        continue;
                    }
                    try {
                        const stat = await storageRpc('mfs_stat', {}, options => node.files.stat(path.path, options));
                        if (!sameCid(String(stat.cid || stat.hash), candidate.storageId)) {
                            problem('image_retirement_mfs_root_changed');
                        }
                        await assertHeld();
                        await storageRpc('mfs_remove', {recursive: true}, options => node.files.rm(path.path, options));
                        journal.paths.push({path: path.path, removed: true});
                        await save();
                    } catch (error) {
                        if (!absent(error)) {
                            throw error;
                        }
                    }
                }
            }
            await assertHeld();
            for (const cid of variants(candidate.storageId)) {
                try {
                    await assertHeld();
                    await storageRpc('unpin', {recursive: true}, options => app.ms.storage.unPin(cid, options));
                } catch (error) {
                    if (!absent(error)) {
                        throw error;
                    }
                }
            }
            candidate.unpinned = true;
        }
        await save();
    }
    const status = journal.candidates.some(candidate => candidate.unpinned) ? 'gc_pending'
        : journal.retained.length || journal.candidates.some(candidate => candidate.retained) ? 'complete_with_retained' : 'complete';
    await assertHeld();
    await row.update({status, result: {...result, cleanupRetry: {failures: 0}}, error: null});
    return {deferred: false};
}

function normalize(cid) {
    // Keep all deletion comparisons in canonical v1 form.
    return variants(cid).find(value => value.startsWith('b')) || cid;
}

export async function collectRetiredBlocks(service, rows, assertHeld) {
    const node = service.app.ms.storage.node;
    await assertHeld();
    // A resumed GC receipt may follow writes made after a worker crash. Recheck
    // every unpinned root and materialize any new SQL retention as an IPFS pin.
    for (const row of rows) {
        const result = structuredClone(row.result);
        for (const candidate of result.cleanup.candidates.filter(item => item.unpinned)) {
            const safeguards = await Promise.all(variants(candidate.storageId).map(cid => service.app.ms.database.getStorageObjectDeleteSafety(cid, {ignoreDeletedContentSources: true})));
            if (safeguards.some(safety => safety.blockers.length) || await metadataReferences(service, candidate.storageId)) {
                await assertHeld();
                await service.app.ms.storage.addPin(candidate.storageId);
                candidate.retained = true;
                candidate.unpinned = false;
                candidate.blockers = safeguards.flatMap(safety => safety.blockers);
            }
        }
        await assertHeld();
        await row.update({result});
    }
    if (!rows.some(row => row.result.cleanup.candidates.some(candidate => candidate.unpinned))) {
        for (const row of rows) {
            const journal = row.result.cleanup;
            const retained = journal.retained.length || journal.candidates.some(candidate => candidate.retained);
            await assertHeld();
            await row.update({status: retained ? 'complete_with_retained' : 'complete', error: null});
        }
        return;
    }
    let collectedBlocks = 0;
    const {before, after} = await storageRpc('gc', {}, async options => {
        const before = await node.repo.stat(options);
        for await (const item of node.repo.gc(options)) {
            if (item.err) {
                throw new Error(String(item.err));
            }
            collectedBlocks++;
        }
        await assertHeld();
        return {before, after: await node.repo.stat(options)};
    }, gcTimeoutMs);
    for (const row of rows) {
        const result = structuredClone(row.result);
        for (const candidate of result.cleanup.candidates) {
            if (!candidate.unpinned) {
                continue;
            }
            try {
                await node.block.stat(candidate.storageId, {offline: true, signal: AbortSignal.timeout(5000)});
                candidate.localStatus = 'retained_by_other_pin_or_mfs';
            } catch (error) {
                if (!absent(error) && !/not.*locally|block.*missing/i.test(error.message)) {
                    throw error;
                }
                candidate.localStatus = 'absent';
            }
        }
        result.cleanup.gc = {completedAt: new Date().toISOString(), collectedBlocks,
            repoBytesBefore: String(before.repoSize), repoBytesAfter: String(after.repoSize),
            observedReclaimedBytes: String(BigInt(before.repoSize) > BigInt(after.repoSize) ? BigInt(before.repoSize) - BigInt(after.repoSize) : 0n)};
        const retained = result.cleanup.retained.length > 0 || result.cleanup.candidates.some(c => c.retained || c.localStatus === 'retained_by_other_pin_or_mfs');
        await assertHeld();
        await row.update({status: retained ? 'complete_with_retained' : 'complete', result, error: null});
    }
}
