import {CorePermissionName} from '../database/interface.js';
import {requireIntegrationScopes} from '../api/integrationScopes.js';
import {policy, contentIds, problem} from './publicationImagePolicy.js';
import {plain, sameCid} from '../../storageIdentity.js';
import {withStorageFence, withStorageWorker} from '../../storageLifecycle.js';

export const resaveModule = 'content-resave';
export function properties(content) {
    return JSON.parse(content?.propertiesJson || '{}');
}
// Freeze only identities needed by replay/cleanup, not arbitrary source metadata.
export function imageSourceSnapshot(content) {
    return Object.fromEntries(['id', 'userId', 'storageId', 'manifestStorageId', 'smallPreviewStorageId',
        'mediumPreviewStorageId', 'largePreviewStorageId'].map(key => [key, content[key]]));
}
export class ContentResave {
    constructor(public app) {}
    async authorize(userId, apiKeyId = null, destructive = false) {
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
    async owned(userId, id, includeDeleted = false, transaction = undefined) {
        const content = plain(await this.app.ms.database.getContent(id, {includeDeleted, transaction}));
        if (!content || Number(content.userId) !== Number(userId) || content.isRemote || (!includeDeleted && content.isDeleted)) {
            problem('image_optimization_content_unavailable', 403);
        }
        return content;
    }
    async recordOptimizedContent(userId, value) {
        const content = plain(value);
        const metadata = {...properties(content), publicationImage: {policy, resultContentId: content.id, resultStorageId: content.storageId}};
        await this.app.ms.database.updateContent(content.id, {propertiesJson: JSON.stringify(metadata)});
        content.propertiesJson = JSON.stringify(metadata);
    }
    async saved(userId, sourceContentId, source = null, transaction = undefined) {
        source = source || await this.owned(userId, sourceContentId, true, transaction);
        const saved = properties(source).publicationImage;
        if (saved?.policy !== policy || !saved.resultContentId) {
            return null;
        }
        if (saved.sourceStorageId && !sameCid(source.storageId, saved.sourceStorageId)) {
            problem('image_optimization_source_changed');
        }
        const content = await this.owned(userId, saved.resultContentId, false, transaction);
        if (!sameCid(content.storageId, saved.resultStorageId)) {
            problem('image_optimization_rendition_changed');
        }
        return content;
    }
    async requestResave(userId, sourceContentId, apiKeyId = null) {
        await this.authorize(userId, apiKeyId);
        contentIds([sourceContentId]);
        return withStorageFence(this.app, 'shared', async () => {
            const existing = await this.saved(userId, sourceContentId);
            if (existing) {
                return {status: 'completed', sourceContentId, content: existing};
            }
            const sequelize = this.app.ms.database.sequelize;
            return sequelize.transaction(async transaction => {
                const source = plain(await sequelize.model('content').findByPk(sourceContentId, {transaction, lock: transaction.LOCK.UPDATE}));
                if (!source || Number(source.userId) !== Number(userId) || source.isRemote) {
                    problem('image_optimization_content_unavailable', 403);
                }
                // A worker may have completed while this admission waited for the lock.
                const saved = await this.saved(userId, sourceContentId, source, transaction);
                if (saved) {
                    return {status: 'completed', sourceContentId, content: saved};
                }
                if (source.isDeleted) {
                    problem('image_optimization_content_unavailable', 403);
                }
                if (!['image/png', 'image/jpeg', 'image/webp', 'image/avif', 'image/tiff', 'image/heif'].includes(source.mimeType)) {
                    problem('image_optimization_format_unsupported', 415);
                }
                const queue = await this.app.ms.asyncOperation.addUniqueUserOperationQueue(userId, resaveModule, apiKeyId,
                    {userId, sourceContentId, source: imageSourceSnapshot(source), policy}, {transaction});
                return {status: 'queued', sourceContentId, id: queue.id, asyncOperationId: queue.asyncOperationId || null};
            });
        });
    }
    async execute(queue, operation, input) {
        await this.authorize(queue.userId, queue.userApiKeyId);
        let content = await this.saved(queue.userId, input.sourceContentId);
        if (!content) {
            const source = await this.owned(queue.userId, input.sourceContentId);
            if (!sameCid(source.storageId, input.source.storageId)) {
                problem('image_optimization_source_changed');
            }
            const previous = properties(source).publicationImage;
            if (previous?.policy && previous.policy !== policy) {
                problem('source_unavailable_for_policy_upgrade');
            }
            await this.app.ms.asyncOperation.handleOperationCancel(queue.userId, operation.id);
            content = plain(await this.app.ms.content.saveData(queue.userId,
                await this.app.ms.storage.getFileStream(source.storageId), source.name || `image-${source.id}.png`,
                {optimize: true, mimeType: source.mimeType, waitForPin: true, skipFileCatalog: true, requirePreview: true}));
            if (!content.mediumPreviewStorageId || content.previewExtension !== 'webp') {
                problem('image_optimization_preview_missing');
            }
            // Content owns provenance. The old row remains a diagnostic tombstone
            // after physical retirement, rather than a separate rendition table.
            await this.app.ms.database.updateContent(source.id, {propertiesJson: JSON.stringify({...properties(source),
                publicationImage: {policy, resultContentId: content.id, resultStorageId: content.storageId,
                    sourceStorageId: source.storageId, sourceManifestStorageId: source.manifestStorageId}})});
        }
        return {sourceContentId: input.sourceContentId, sourceManifestStorageId: input.source.manifestStorageId, content, policy};
    }
    async processQueue() {
        return withStorageWorker(this.app, () => this.app.ms.asyncOperation.processModuleOperationQueue(resaveModule, {
            limit: 10, resumeInterrupted: true,
            getAsyncOperationData: queue => ({name: 'resave-content', channel: `content-resave:${queue.id}`}),
            run: (queue, operation) => this.execute(queue, operation, JSON.parse(queue.inputJson)),
        }));
    }
}
