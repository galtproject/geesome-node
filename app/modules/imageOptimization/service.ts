import {createHash, randomUUID} from 'node:crypto';
import {Op} from 'sequelize';
import ipfsHelper from 'geesome-libs/src/ipfsHelper.js';
import {CorePermissionName} from '../database/interface.js';
import {normalizeStorageId as normalizeUnixfsId} from '../archive/index.js';
import {requireIntegrationScopes} from '../api/integrationScopes.js';
import {contentIds, policy, problem, requestKey} from './policy.js';
import {withStorageFence, withStorageTaskLock} from '../../storageLifecycle.js';

export const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const plain = row => typeof row?.toJSON === 'function' ? row.toJSON() : row;
export function normalizeStorageId(value) {
    try {
        if (typeof value !== 'string' || value.length > 100 || !/^[A-Za-z0-9]+$/.test(value)) {
            throw new Error('invalid CID');
        }
        const cid = ipfsHelper.ipfsHashToCid(value);
        if (![0x70, 0x55, 0x71, 0x0129].includes(cid.code)) {
            throw new Error('unsupported codec');
        }
        return cid.toV1().toString();
    } catch {
        problem('invalid_storage_id', 400);
    }
}
export const sameCid = (a, b) => Boolean(a && b) && normalizeStorageId(a) === normalizeStorageId(b);
export const variants = cid => {
    const parsed = ipfsHelper.ipfsHashToCid(cid);
    return [...new Set([cid, parsed.toV1().toString(), ...(parsed.code === 0x70 ? [parsed.toV0().toString()] : [])])];
};
export const imageFiles = content => [...new Set(['storageId', 'manifestStorageId', 'smallPreviewStorageId',
    'mediumPreviewStorageId', 'largePreviewStorageId'].map(key => content?.[key]).filter(Boolean).map(normalizeStorageId))];
export const resaveModule = 'content-resave';

export function pageCid(value) {
    try {
        return normalizeUnixfsId(new URL(value).pathname.match(/^\/ipfs\/([A-Za-z0-9]+)(?:\/|$)/)?.[1]);
    } catch {
        problem('image_replacement_page_invalid');
    }
}

export async function readSiteData(storage, cid) {
    const input = await storage.getFileStream(`${cid}/clientData.js`);
    const timer = setTimeout(() => input.destroy(new Error('site_manifest_timeout')), 30000);
    const chunks = [];
    let size = 0;
    try {
        for await (const chunk of input) {
            size += chunk.length;
            if (size > 4 * 1024 * 1024) {
                problem('image_replacement_manifest_too_large');
            }
            chunks.push(Buffer.from(chunk));
        }
    } finally {
        clearTimeout(timer);
        input.destroy();
    }
    const text = Buffer.concat(chunks).toString().trim();
    if (!text.startsWith('export default ')) {
        problem('image_replacement_manifest_invalid');
    }
    return JSON.parse(text.slice('export default '.length).replace(/;\s*$/, ''));
}

export class ImageOptimizationService {
    constructor(public app, public models) {}

    async authorize(userId, apiKeyId?, destructive = false) {
        const key = apiKeyId ? await this.app.ms.database.getApiKey(apiKeyId) : null;
        if (apiKeyId && !key) {
            problem('not_permitted', 403);
        }
        await this.app.checkUserCan(userId, CorePermissionName.UserSaveData, key);
        if (destructive) {
            await this.app.checkUserCan(userId, CorePermissionName.UserFileCatalogManagement, key);
        }
        if (key) {
            requireIntegrationScopes(key, [destructive ? 'storage:retire' : 'content:write']);
        }
    }

    async owned(userId, id) {
        const content = plain(await this.app.ms.database.getContent(id));
        if (!content || Number(content.userId) !== Number(userId) || content.isRemote || content.isDeleted) {
            problem('image_optimization_content_unavailable', 403);
        }
        return content;
    }

    async hold(ownerId, scope, ids) {
        for (const storageId of [...new Set(ids.filter(Boolean).map(normalizeStorageId))]) {
            await this.models.Reference.findOrCreate({where: {scope, storageId}, defaults: {id: randomUUID(), ownerId}});
        }
    }

    async recordOptimizedContent(userId, value) {
        const content = plain(value);
        await this.models.Rendition.findOrCreate({where: {userId, sourceStorageId: normalizeStorageId(content.storageId), policy},
            defaults: {id: randomUUID(), sourceContentId: content.id, sourceManifestId: content.manifestStorageId,
                rootSourceStorageId: null, source: content, contentId: content.id, result: content}});
    }

    async assertWritableStorage(data) {
        const ids = ['storageId', 'manifestStorageId', 'smallPreviewStorageId', 'mediumPreviewStorageId', 'largePreviewStorageId']
            .map(key => data?.[key]).filter(Boolean).flatMap(value => {
                try {
                    return [normalizeStorageId(value)];
                } catch {
                    // Remote/non-IPFS storage identities are outside this local
                    // immutable-CID retirement policy.
                    return [];
                }
            });
        if (ids.length && await this.models.RetiredStorage.count({where: {storageId: {[Op.in]: ids}}})) {
            problem('storage_id_retired');
        }
    }

    // Reuse the existing Content save/convert pipeline and operation queue. There
    // is deliberately no image-optimization batch table or parallel batch API.
    async requestResave(userId, sourceContentId, apiKeyId = null) {
        await this.authorize(userId, apiKeyId);
        contentIds([sourceContentId]);
        return withStorageFence(this.app, 'shared', async () => {
            const existing = await this.models.Rendition.findOne({where: {userId, policy,
                [Op.or]: [{sourceContentId}, {contentId: sourceContentId}]}, order: [['createdAt', 'ASC']]});
            if (existing?.contentId) {
                return {status: 'completed', sourceContentId, content: await this.owned(userId, existing.contentId)};
            }
            const source = await this.owned(userId, sourceContentId);
            if (!['image/png', 'image/jpeg', 'image/webp', 'image/avif', 'image/tiff', 'image/heif'].includes(source.mimeType)) {
                problem('image_optimization_format_unsupported', 415);
            }
            const [rendition] = await this.models.Rendition.findOrCreate({where: {userId,
                sourceStorageId: normalizeStorageId(source.storageId), policy}, defaults: {id: randomUUID(),
                sourceContentId, sourceManifestId: source.manifestStorageId, rootSourceStorageId: normalizeStorageId(source.storageId), source}});
            await this.hold(userId, `rendition:${rendition.id}`, imageFiles(source));
            if (rendition.contentId) {
                return {status: 'completed', sourceContentId, content: await this.owned(userId, rendition.contentId)};
            }
            const queue = await this.app.ms.database.sequelize.transaction(async transaction => {
                await rendition.reload({transaction, lock: transaction.LOCK.UPDATE});
                if (rendition.queueId) {
                    const saved = await this.app.ms.asyncOperation.getUserOperationQueue(userId, rendition.queueId);
                    if (saved?.isWaiting) {
                        return saved;
                    }
                }
                const saved = await this.app.ms.asyncOperation.addUniqueUserOperationQueue(userId, resaveModule, apiKeyId,
                    {userId, renditionId: rendition.id, sourceContentId: rendition.sourceContentId, policy});
                await rendition.update({queueId: saved.id}, {transaction});
                return saved;
            });
            return {status: 'queued', sourceContentId, id: queue.id, asyncOperationId: queue.asyncOperationId || null};
        });
    }

    async executeResave(queue, operation, input) {
        await this.authorize(queue.userId, queue.userApiKeyId);
        const rendition = await this.models.Rendition.findOne({where: {id: input.renditionId, userId: queue.userId, policy}});
        if (!rendition) {
            problem('image_rendition_not_found', 404);
        }
        if (!rendition.contentId) {
            const source = await this.owned(queue.userId, rendition.sourceContentId);
            if (!sameCid(source.storageId, rendition.sourceStorageId)) {
                problem('image_optimization_source_changed');
            }
            const priorPolicy = await this.models.Rendition.findOne({where: {userId: queue.userId, contentId: source.id,
                policy: {[Op.ne]: policy}}});
            if (priorPolicy) {
                problem('source_unavailable_for_policy_upgrade');
            }
            await this.app.ms.asyncOperation.handleOperationCancel(queue.userId, operation.id);
            const inputStream = await this.app.ms.storage.getFileStream(source.storageId);
            const saved = plain(await this.app.ms.content.saveData(queue.userId, inputStream, source.name || `image-${source.id}.png`, {
                optimize: true, mimeType: source.mimeType, waitForPin: true, skipFileCatalog: true, requirePreview: true,
            }));
            await this.app.ms.asyncOperation.handleOperationCancel(queue.userId, operation.id);
            if (!saved.mediumPreviewStorageId || saved.previewExtension !== 'webp') {
                problem('image_optimization_preview_missing');
            }
            await rendition.update({contentId: saved.id, result: saved});
        }
        return {sourceContentId: input.sourceContentId, sourceManifestStorageId: rendition.sourceManifestId,
            content: await this.owned(queue.userId, rendition.contentId), policy};
    }

    async publication(userId, postId) {
        if (!Number.isSafeInteger(Number(postId)) || Number(postId) <= 0) {
            problem('image_replacement_post_invalid', 400);
        }
        const post = await this.app.ms.group.getPost(userId, Number(postId));
        if (!post || post.isDeleted || !await this.app.ms.group.isAdminInGroup(userId, post.groupId)) {
            problem('image_replacement_post_not_owned', 403);
        }
        return post;
    }

    membership(post) {
        return JSON.parse(post.propertiesJson || '{}').membership || {};
    }

    async requestReplacement(userId, input, apiKeyId = null) {
        const ids = contentIds(input.contentIds);
        const key = requestKey(input.requestKey);
        if (input.deleteReplacedFiles !== undefined && typeof input.deleteReplacedFiles !== 'boolean') {
            problem('image_replacement_cleanup_flag_invalid', 400);
        }
        const request = {contentIds: ids, previousSiteStorageId: input.previousSiteStorageId
            ? normalizeStorageId(input.previousSiteStorageId) : null,
            postId: input.postId ? Number(input.postId) : null, deleteReplacedFiles: input.deleteReplacedFiles === true};
        await this.authorize(userId, apiKeyId, request.deleteReplacedFiles);
        const hash = digest(request);
        const accepted = await this.models.Replacement.findOne({where: {userId, requestKey: key}});
        if (accepted) {
            if (accepted.requestHash !== hash) {
                problem('image_replacement_idempotency_conflict');
            }
            return this.status(userId, accepted.id);
        }
        return withStorageFence(this.app, 'shared', async () => {
            const sources = [];
            for (const id of ids) {
                sources.push(await this.owned(userId, id));
            }
            let previous = null;
            if (request.previousSiteStorageId) {
                const site = await this.app.ms.database.sequelize.model('staticSite').findOne({where: {
                    userId, storageId: {[Op.in]: variants(request.previousSiteStorageId)}}});
                if (!site) {
                    problem('image_replacement_site_not_owned', 403);
                }
                const page = await readSiteData(this.app.ms.storage, request.previousSiteStorageId);
                if (JSON.stringify(page.contents?.map(c => Number(c.id))) !== JSON.stringify(ids)
                    || page.contents.some((c, i) => !sameCid(c.storageId, sources[i].storageId))) {
                    problem('image_replacement_source_mismatch');
                }
                const post = await this.publication(userId, request.postId);
                const group = post.group || await this.app.ms.group.getGroup(post.groupId);
                if (request.deleteReplacedFiles && (group.isPublic || group.isEncrypted)) {
                    problem('image_retirement_requires_private_membership_group');
                }
                const metadata = this.membership(post);
                if (!sameCid(pageCid(metadata.pageUrl), request.previousSiteStorageId)) {
                    problem('image_replacement_publication_changed');
                }
                const archive = await this.app.ms.archive.getArchive(request.previousSiteStorageId);
                const paths = (await this.models.Revision.findAll({where: {userId, staticSiteId: site.id, storageId: request.previousSiteStorageId, retiredAt: null}}))
                    .map(row => ({path: row.workPath, cid: request.previousSiteStorageId}));
                if (!paths.length) {
                    paths.push({path: `/${site.staticId}-site`, cid: request.previousSiteStorageId});
                }
                previous = {siteId: site.id, staticId: site.staticId, storageId: request.previousSiteStorageId,
                    archiveStorageId: archive?.archivedStorageId || null, paths, sourceKey: metadata.sourceKey,
                    postId: post.id, groupId: post.groupId};
            }
            const [replacement] = await this.models.Replacement.findOrCreate({where: {userId, requestKey: key}, defaults: {
                id: randomUUID(), apiKeyId, requestHash: hash, status: 'preparing', input: {...request, sources, previous},
            }});
            if (replacement.requestHash !== hash) {
                problem('image_replacement_idempotency_conflict');
            }
            await this.hold(userId, `replacement:${replacement.id}`,
                [...sources.flatMap(imageFiles), previous?.storageId, previous?.archiveStorageId]);
            return this.status(userId, replacement.id);
        });
    }

    async replacement(userId, id) {
        if (typeof id !== 'string' || !/^[a-f0-9-]{36}$/i.test(id)) {
            problem('image_replacement_not_found', 404);
        }
        const replacement = await this.models.Replacement.findOne({where: {id, userId}});
        if (!replacement) {
            problem('image_replacement_not_found', 404);
        }
        return replacement;
    }

    async status(userId, id) {
        const replacement = await this.replacement(userId, id);
        return {id: replacement.id, status: replacement.status, result: replacement.result, error: replacement.error};
    }

    async withRender(userId, replacementId, renderArgs, options, run) {
        return withStorageTaskLock(this.app, `render:${replacementId}`, async () => {
            const row = await this.replacement(userId, replacementId);
            const {asyncOperationId, ...frozenOptions} = options;
            const renderHash = digest({renderArgs, options: frozenOptions});
            if (row.result?.renderHash && row.result.renderHash !== renderHash) {
                problem('image_replacement_render_conflict');
            }
            if (row.result?.storageId) {
                return {storageId: row.result.storageId, staticSiteId: row.result.staticSiteId};
            }
            if (row.status !== 'preparing') {
                problem('image_replacement_render_conflict');
            }
            await row.update({result: {...row.result, renderHash}});
            return run();
        });
    }

    async renderIds(userId, replacementId, requestedIds) {
        const replacement = await this.replacement(userId, replacementId);
        if (replacement.status !== 'preparing'
            || JSON.stringify(replacement.input.contentIds) !== JSON.stringify(requestedIds)) {
            problem('image_optimization_render_mismatch');
        }
        const outputs = [];
        for (const source of replacement.input.sources) {
            const row = await this.models.Rendition.findOne({where: {userId, policy,
                [Op.or]: [{sourceStorageId: normalizeStorageId(source.storageId)}, {contentId: source.id}]}});
            if (!row?.contentId) {
                problem('image_optimization_not_ready');
            }
            const content = await this.owned(userId, row.contentId);
            if (!sameCid(content.storageId, row.result.storageId)) {
                problem('image_optimization_rendition_changed');
            }
            outputs.push({sourceContentId: source.id, sourceManifestStorageId: source.manifestStorageId,
                sourceStorageId: source.storageId, sourcePreviewStorageId: source.mediumPreviewStorageId,
                sourceSmallPreviewStorageId: source.smallPreviewStorageId, content});
        }
        const [changed] = await this.models.Replacement.update({result: {...replacement.result, images: outputs}},
            {where: {id: replacement.id, status: 'preparing', updatedAt: replacement.updatedAt}});
        if (!changed) {
            problem('image_replacement_render_conflict');
        }
        return outputs.map(image => image.content.id);
    }

    async beginRevision(userId, staticSiteId, replacementId = null) {
        const id = randomUUID();
        const workPath = `/ssg-revisions/${id}`;
        await this.models.Revision.create({id, userId, staticSiteId, replacementId, workPath});
        if (replacementId) {
            const row = await this.replacement(userId, replacementId);
            const [changed] = await this.models.Replacement.update({result: {...row.result, renderRevisionId: id}},
                {where: {id: replacementId, status: 'preparing', updatedAt: row.updatedAt}});
            if (!changed) {
                problem('image_replacement_render_conflict');
            }
        }
        await this.app.ms.storage.makeDir(workPath);
        return workPath;
    }

    async finishRevision(workPath, storageId) {
        const revision = await this.models.Revision.findOne({where: {workPath}});
        if (!revision || revision.retiredAt) {
            problem('image_replacement_render_conflict');
        }
        if (revision.replacementId) {
            const row = await this.replacement(revision.userId, revision.replacementId);
            if (row.status !== 'preparing' || row.result?.renderRevisionId !== revision.id) {
                problem('image_replacement_render_conflict');
            }
        }
        await this.app.ms.storage.addPin(storageId);
        await this.models.Revision.update({storageId: normalizeStorageId(storageId)}, {where: {workPath, retiredAt: null}});
        if (revision.replacementId) {
            const replacement = await this.replacement(revision.userId, revision.replacementId);
            const [changed] = await this.models.Replacement.update({status: 'rendered', result: {...replacement.result,
                storageId: normalizeStorageId(storageId), staticSiteId: revision.staticSiteId, revisionId: revision.id}},
                {where: {id: replacement.id, status: 'preparing', result: {[Op.contains]: {renderRevisionId: revision.id}},
                    updatedAt: replacement.updatedAt}});
            if (!changed) {
                problem('image_replacement_render_conflict');
            }
        }
    }
}
