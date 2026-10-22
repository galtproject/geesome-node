import {pageCid, readSiteData} from '../staticSiteGenerator/siteData.js';
import {countStorageHolds} from '../asyncOperation/storageHolds.js';
import {properties} from '../content/resave.js';
import {Op} from 'sequelize';
import {storageFenceSignal} from '../../storageLifecycle.js';
import {digest, imageFiles, plain, sameCid, variants} from '../../storageIdentity.js';
import {problem} from '../content/publicationImagePolicy.js';

export async function finalizeReplacement(service, userId, id, body, apiKeyId = null) {
    const row = await service.replacement(userId, id);
    await service.authorize(userId, apiKeyId, row.input.deleteReplacedFiles);
    const cid = pageCid(`https://local.invalid/ipfs/${body.storageId}/`);
    const receipt = {storageId: cid, postId: Number(body.postId), consumer: body.consumer};
    const hash = digest(receipt);
    if (row.result?.finalization) {
        if (row.result.finalization.hash !== hash) {
            problem('image_replacement_finalize_conflict');
        }
        return service.status(userId, id);
    }
    if (row.status !== 'rendered' || !sameCid(cid, row.result?.storageId)) {
        problem('image_replacement_render_not_ready');
    }
    const post = await service.publication(userId, receipt.postId);
    const metadata = service.membership(post);
    const ids = row.result.images.map(item => item.content.id);
    const attachments = [...post.contents].sort((a, b) => Number(a.postsContents?.position || 0) - Number(b.postsContents?.position || 0));
    if (!sameCid(pageCid(metadata.pageUrl), cid) || JSON.stringify(attachments.map(c => c.id)) !== JSON.stringify(ids)
        || (row.input.previous && (post.id !== row.input.previous.postId || metadata.sourceKey !== row.input.previous.sourceKey))) {
        problem('image_replacement_publication_changed');
    }
    const mapping = row.result.images.map(item => [String(item.sourceContentId), String(item.content.id),
        item.sourceManifestStorageId, item.content.manifestStorageId]);
    const consumer = receipt.consumer;
    if (!consumer || consumer.kind !== 'microwave-girls' || typeof consumer.receiptId !== 'string'
        || consumer.mappingsHash !== digest(mapping)
        || Number(metadata.imageReplacement?.id) !== row.id
        || metadata.imageReplacement?.receiptId !== consumer.receiptId
        || metadata.imageReplacement?.mappingsHash !== consumer.mappingsHash) {
        problem('image_replacement_consumer_not_ready');
    }
    const page = await readSiteData(service.app.ms.storage, cid);
    if (JSON.stringify(page.contents?.map(c => Number(c.id))) !== JSON.stringify(ids)
        || page.contents.some((c, i) => !sameCid(c.storageId, row.result.images[i].content.storageId))) {
        problem('image_replacement_render_mismatch');
    }
    const archive = await service.app.ms.archive.getArchive(cid);
    if (!archive) {
        problem('image_replacement_archive_not_ready');
    }
    await service.app.ms.storage.getFileStat(archive.archivedStorageId);
    await service.app.ms.storage.addPin(cid);
    await service.app.ms.storage.addPin(archive.archivedStorageId);
    const finalization = {...receipt, hash, archiveStorageId: archive.archivedStorageId,
        postHash: digest({metadata, contentIds: attachments.map(c => c.id)})};
    await row.update({status: row.input.deleteReplacedFiles ? 'retiring' : 'complete',
        result: {...row.result, finalization}});
    return service.status(userId, id);
}

async function currentPublication(service, row) {
    const final = row.result.finalization;
    const post = await service.publication(row.userId, final.postId);
    const metadata = service.membership(post);
    const ids = [...post.contents].sort((a, b) => Number(a.postsContents?.position || 0) - Number(b.postsContents?.position || 0)).map(c => c.id);
    if (!sameCid(pageCid(metadata.pageUrl), final.storageId) || digest({metadata, contentIds: ids}) !== final.postHash) {
        problem('image_replacement_publication_changed');
    }
    if (!await service.app.ms.archive.getArchive(final.storageId)) {
        problem('image_replacement_archive_not_ready');
    }
    return post;
}

function absent(error) {
    return /not found|not exist|no link named|no such file|not pinned|is not pinned/i.test(error?.message || String(error));
}

async function activeSourceWork(service, row) {
    const sequelize = service.app.ms.database.sequelize;
    const active = await sequelize.model('userAsyncOperation').count({where: {inProcess: true}});
    if (active) {
        return true;
    }
    const waiting = await sequelize.model('userOperationQueue').findAll({where: {isWaiting: true}, limit: 1001});
    if (waiting.length > 1000) {
        return true;
    }
    const sourceIds = new Set(row.input.contentIds);
    const oldCid = row.input.previous?.storageId;
    for (const queue of waiting) {
        let input;
        try {
            input = JSON.parse(queue.inputJson);
        } catch {
            return true;
        }
        if (input.renderArgs?.entityIds?.some(id => sourceIds.has(id))
            || (oldCid && input.originalStorageId && sameCid(input.originalStorageId, oldCid))) {
            return true;
        }
    }
    return false;
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
    await currentPublication(service, row);
    if (await activeSourceWork(service, row)) {
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
                    const stat = await node.files.stat(path.path);
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
            await app.ms.database.sequelize.transaction(async transaction => {
                const items = await catalog.findAll({where: {userId: row.userId, contentId: source.id},
                    transaction, lock: transaction.LOCK.UPDATE});
                await catalog.update({contentId: target.id, size: target.size},
                    {where: {userId: row.userId, contentId: source.id}, transaction});
                const parents = items.map(item => item.parentItemId).filter(Boolean);
                const visited = new Set();
                while (parents.length) {
                    const id = parents.shift();
                    if (visited.has(id)) {
                        continue;
                    }
                    visited.add(id);
                    if (visited.size > 256) {
                        problem('image_retirement_catalog_depth');
                    }
                    const folder = await catalog.findByPk(id, {transaction, lock: transaction.LOCK.UPDATE});
                    const size = await catalog.sum('size', {where: {parentItemId: id, isDeleted: false}, transaction});
                    await folder.update({size: size || 0}, {transaction});
                    if (folder.parentItemId) {
                        parents.push(folder.parentItemId);
                    }
                }
            });
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
                        const stat = await node.files.stat(path.path);
                        if (!sameCid(String(stat.cid || stat.hash), candidate.storageId)) {
                            problem('image_retirement_mfs_root_changed');
                        }
                        await assertHeld();
                        await node.files.rm(path.path, {recursive: true, signal: storageFenceSignal()});
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
                    await app.ms.storage.unPin(cid, {recursive: true, signal: storageFenceSignal()});
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
    await row.update({status, result, error: null});
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
    const before = await node.repo.stat();
    let collectedBlocks = 0;
    for await (const item of node.repo.gc({signal: AbortSignal.any([AbortSignal.timeout(10 * 60 * 1000), storageFenceSignal()].filter(Boolean))})) {
        if (item.err) {
            throw new Error(String(item.err));
        }
        collectedBlocks++;
    }
    await assertHeld();
    const after = await node.repo.stat();
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
