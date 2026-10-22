import {randomUUID} from 'node:crypto';
import {Op} from 'sequelize';
import {contentIds, problem, requestKey} from '../content/publicationImagePolicy.js';
import {withStorageFence, withStorageTaskLock} from '../../storageLifecycle.js';
import {digest, normalizeStorageId, variants, sameCid} from '../../storageIdentity.js';
import {pageCid, readSiteData} from './siteData.js';
import {DurableJobs} from '../asyncOperation/durableJobs.js';

export class SiteReplacements {
    jobs;
    constructor(public app, public models) {
        this.jobs = new DurableJobs(app, 'site-replacement');
    }
    authorize(userId, apiKeyId = null, destructive = false) {
        return this.app.ms.content.publicationImages.authorize(userId, apiKeyId, destructive);
    }
    owned(userId, id) { return this.app.ms.content.publicationImages.owned(userId, id); }
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
        const accepted = await this.jobs.byKey(userId, key);
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
            const replacement = await this.jobs.create(userId, apiKeyId, key, {requestKey: key,
                requestHash: hash, status: 'preparing', input: {...request, sources, previous}, result: null, error: null});
            if (replacement.requestHash !== hash) {
                problem('image_replacement_idempotency_conflict');
            }
            return this.status(userId, replacement.id);
        });
    }

    async replacement(userId, id) {
        const replacement = await this.jobs.get(userId, id);
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
            const content = await this.app.ms.content.publicationImages.saved(userId, source.id);
            if (!content) {
                problem('image_optimization_not_ready');
            }
            outputs.push({sourceContentId: source.id, sourceManifestStorageId: source.manifestStorageId,
                sourceStorageId: source.storageId, sourcePreviewStorageId: source.mediumPreviewStorageId,
                sourceSmallPreviewStorageId: source.smallPreviewStorageId, content});
        }
        await replacement.update({result: {...replacement.result, images: outputs}});
        return outputs.map(image => image.content.id);
    }

    async beginRevision(userId, staticSiteId, replacementId = null) {
        const id = randomUUID();
        const workPath = `/ssg-revisions/${id}`;
        await this.models.Revision.create({id, userId, staticSiteId, replacementId, workPath});
        if (replacementId) {
            const row = await this.replacement(userId, replacementId);
            if (row.status !== 'preparing') {
                problem('image_replacement_render_conflict');
            }
            await row.update({result: {...row.result, renderRevisionId: id}});
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
            if (replacement.status !== 'preparing' || replacement.result.renderRevisionId !== revision.id) {
                problem('image_replacement_render_conflict');
            }
            await replacement.update({status: 'rendered', result: {...replacement.result,
                storageId: normalizeStorageId(storageId), staticSiteId: revision.staticSiteId, revisionId: revision.id}});
        }
    }
}
