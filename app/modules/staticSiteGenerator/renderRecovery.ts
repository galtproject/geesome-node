import {problem} from '../content/publicationInput.js';
import {CorePermissionName} from '../database/interface.js';
import {requireIntegrationScopes} from '../api/integrationScopes.js';
import {digest, sameCid} from '../../storageIdentity.js';
import commonHelper from 'geesome-libs/src/common.js';
import {retainOriginalForExternalLinks, bindRetentionToRecovery} from './externalLinkRetention.js';
import {withStorageControlTaskLock} from '../../storageLifecycle.js';

const recoveryLimit = 3;

export class StaticSiteRenderRecovery {
    requests = new Map<number, Promise<any>>();
    constructor(public app, public models) {}

    async admit(userId, apiKeyId, renderArgs, options) {
        if (renderArgs.entityType !== 'content-list') {
            return this.app.ms.asyncOperation.addUserOperationQueue(userId, 'static-site-generator', apiKeyId, {renderArgs, options});
        }
        const sources = await this.sources(userId, renderArgs.entityIds);
        return this.app.ms.database.sequelize.transaction(async transaction => {
            const queue = await this.app.ms.asyncOperation.addUserOperationQueue(userId, 'static-site-generator', apiKeyId,
                {renderArgs, options}, {transaction});
            await this.models.RenderReceipt.create({queueId: queue.id, userId, inputHash: queue.inputHash,
                sources: JSON.stringify(sources)}, {transaction});
            return queue;
        });
    }

    async sources(userId, ids, transaction = undefined) {
        if (!Array.isArray(ids) || !ids.length || ids.length > 9999
            || ids.some(id => !Number.isSafeInteger(Number(id)) || Number(id) <= 0)) {
            problem('invalid_entity_ids', 400);
        }
        const rows = await this.app.ms.database.getUserContentListByIds(userId, [...new Set(ids.map(Number))], {transaction});
        const byId = new Map(rows.map(row => [Number(row.id), row]));
        return ids.map(id => {
            const row: any = byId.get(Number(id));
            if (!row) {
                problem('static_site_render_source_changed');
            }
            return {id: Number(id), storageId: row.storageId || null, manifestStorageId: row.manifestStorageId || null,
                smallPreviewStorageId: row.smallPreviewStorageId || null, mediumPreviewStorageId: row.mediumPreviewStorageId || null,
                largePreviewStorageId: row.largePreviewStorageId || null,
                metadataHash: digest({name: row.name, description: row.description, mimeType: row.mimeType,
                    extension: row.extension, previewExtension: row.previewExtension, size: row.size,
                    view: row.view, propertiesJson: row.propertiesJson})};
        });
    }

    async savedReceipt(queue, transaction = undefined) {
        if (commonHelper.hash(queue.inputJson) !== queue.inputHash) {
            problem('static_site_recovery_input_changed');
        }
        const receipt = await this.models.RenderReceipt.findOne({where: {queueId: queue.id, userId: queue.userId}, transaction});
        if (receipt && receipt.inputHash !== queue.inputHash) {
            problem('static_site_recovery_input_changed');
        }
        return receipt;
    }

    async checkSources(queue, receipt, transaction = undefined) {
        if (!receipt || receipt.result) {
            return;
        }
        const input = JSON.parse(queue.inputJson);
        if (JSON.stringify(await this.sources(queue.userId, input.renderArgs.entityIds, transaction)) !== receipt.sources) {
            problem('static_site_render_source_changed');
        }
    }

    async legacyResult(queue, operation, transaction = undefined) {
        if (!operation) {
            return null;
        }
        const {renderArgs, options} = JSON.parse(queue.inputJson);
        if (renderArgs?.entityType !== 'content-list') {
            return null;
        }
        const site = await this.app.ms.database.sequelize.model('staticSite').findOne({where: {
            userId: queue.userId, entityType: 'content-list',
            entityId: this.app.ms.staticSiteGenerator.entityIdsToKey(renderArgs.entityIds)}, transaction});
        if (!site?.storageId) {
            return null;
        }
        const savedOptions = JSON.parse(site.options || '{}');
        if (Number(savedOptions.asyncOperationId) !== operation.id
            || digest(frozenOptions(savedOptions)) !== digest(frozenOptions(options))) {
            return null;
        }
        return {storageId: site.storageId, staticSiteId: site.id};
    }

    async policy(queue, transaction = undefined) {
        const input = JSON.parse(queue.inputJson);
        let mode = 'unsupported';
        if (input.renderArgs?.entityType === 'content-list') {
            if (Number.isSafeInteger(input.options?.replacementId) && input.options.replacementId > 0) {
                mode = 'replacement';
            } else if (await this.savedReceipt(queue, transaction)) {
                mode = 'frozen-content-list';
            } else if (await this.legacyResult(queue, queue.asyncOperation, transaction)) {
                mode = 'legacy-result-only';
            }
        }
        return {contract: 1, supported: mode !== 'unsupported', mode, limit: recoveryLimit,
            retainOriginalForExternalLinks: mode === 'replacement'};
    }

    async prepare(queue, operation) {
        const receipt = await this.savedReceipt(queue);
        await this.checkSources(queue, receipt);
        if (receipt?.result) {
            return JSON.parse(receipt.result);
        }
        if (receipt) {
            await receipt.update({renderOperationId: operation.id});
        }
        return null;
    }

    async checkpoint(queue, operation, result) {
        const receipt = await this.savedReceipt(queue);
        if (receipt) {
            await this.checkSources(queue, receipt);
            if (receipt.result && !matchingResult(JSON.parse(receipt.result), result)) {
                problem('static_site_recovery_output_conflict');
            }
            if (receipt.result) {
                return;
            }
            await receipt.update({renderOperationId: operation.id, result: JSON.stringify(result)});
        }
    }

    async recover(userId, queueId, expectedOperationId, apiKeyId = null, options: any = {}) {
        if (![queueId, expectedOperationId].every(value => Number.isSafeInteger(value) && value > 0)) {
            problem('static_site_recovery_invalid', 400);
        }
        const key = apiKeyId ? await this.app.ms.database.getApiKey(apiKeyId) : null;
        if (apiKeyId && !key) {
            problem('not_permitted', 403);
        }
        await this.app.checkUserCan(userId, CorePermissionName.UserSaveData, key);
        if (key) {
            requireIntegrationScopes(key, ['content:write']);
        }
        if (options.retainOriginalForExternalLinks !== undefined && typeof options.retainOriginalForExternalLinks !== 'boolean') {
            problem('static_site_recovery_retention_flag_invalid', 400);
        }
        const queue = await this.app.ms.database.sequelize.model('userOperationQueue').findOne({
            attributes: ['id', 'inputJson'], where: {id: queueId, userId, module: 'static-site-generator'}});
        if (!queue) {
            problem('operation_queue_not_found', 404);
        }
        const replacementId = JSON.parse(queue.inputJson).options?.replacementId;
        const identity = Number.isSafeInteger(replacementId) && replacementId > 0
            ? `site-replacement:${replacementId}` : `site-render-queue:${queueId}`;
        const previous = this.requests.get(queueId) || Promise.resolve();
        const current = previous.catch(() => undefined).then(() =>
            withStorageControlTaskLock(this.app, identity, () =>
                this.recoverClaimed(userId, queueId, expectedOperationId, apiKeyId, options)));
        this.requests.set(queueId, current);
        return current.finally(() => {
            if (this.requests.get(queueId) === current) {
                this.requests.delete(queueId);
            }
        });
    }

    async recoverClaimed(userId, queueId, expectedOperationId, apiKeyId = null, options: any = {}) {
        await this.prepareRetention(userId, queueId, expectedOperationId, options.retainOriginalForExternalLinks === true);
        const sequelize = this.app.ms.database.sequelize;
        const Queue = sequelize.model('userOperationQueue');
        const Operation = sequelize.model('userAsyncOperation');
        return sequelize.transaction(async transaction => {
            const queue = await Queue.findOne({where: {id: queueId, userId, module: 'static-site-generator'},
                transaction, lock: transaction.LOCK.UPDATE});
            if (!queue) {
                problem('operation_queue_not_found', 404);
            }
            if (commonHelper.hash(queue.inputJson) !== queue.inputHash) {
                problem('static_site_recovery_input_changed');
            }
            const previous = await this.models.RenderRecovery.findOne({where: {queueId, interruptedOperationId: expectedOperationId}, transaction});
            if (previous) {
                const current = await this.models.RenderRecovery.findOne({where: {queueId, asyncOperationId: queue.asyncOperationId}, transaction});
                if (!current) {
                    problem('static_site_recovery_operation_changed');
                }
                return this.receipt(queue, previous, transaction);
            }
            if (queue.asyncOperationId !== expectedOperationId) {
                problem('static_site_recovery_operation_changed');
            }
            const operation = await Operation.findOne({where: {id: expectedOperationId, userId}, transaction,
                lock: transaction.LOCK.UPDATE});
            if (!operation || operation.module !== 'static-site-generator' || operation.inProcess
                || operation.errorType !== 'node-restart' || operation.cancel || operation.finishedAt && !operation.output) {
                problem('static_site_recovery_not_interrupted');
            }
            const input = JSON.parse(queue.inputJson);
            let saved;
            if (input.renderArgs?.entityType !== 'content-list') {
                problem('static_site_recovery_requires_frozen_input');
            }
            if (Number.isSafeInteger(input.options?.replacementId) && input.options.replacementId > 0) {
                const replacement = await this.app.ms.staticSiteGenerator.replacements.replacement(userId, input.options.replacementId, transaction);
                saved = replacement.result?.storageId ? replacement.result : null;
                if (!saved && replacement.result?.renderRevisionId) {
                    const revision = await this.models.Revision.findOne({where: {id: replacement.result.renderRevisionId,
                        userId, replacementId: replacement.id, retiredAt: null}, transaction});
                    saved = revision?.storageId ? {storageId: revision.storageId, staticSiteId: revision.staticSiteId} : null;
                }
            } else {
                let receipt = await this.savedReceipt(queue, transaction);
                if (!receipt) {
                    saved = await this.legacyResult(queue, operation, transaction);
                    if (!saved) {
                        problem('static_site_recovery_requires_frozen_input');
                    }
                    receipt = await this.models.RenderReceipt.create({queueId, userId, inputHash: queue.inputHash,
                        sources: '[]', renderOperationId: operation.id, result: JSON.stringify(saved)}, {transaction});
                }
                if (!receipt.result) {
                    const completed = await this.legacyResult(queue, operation, transaction);
                    if (completed) {
                        await receipt.update({renderOperationId: operation.id, result: JSON.stringify(completed)}, {transaction});
                    }
                }
                await this.checkSources(queue, receipt, transaction);
                saved = receipt.result ? JSON.parse(receipt.result) : null;
            }
            if (operation.output) {
                let output;
                try {
                    output = JSON.parse(operation.output);
                } catch {
                    problem('static_site_recovery_output_conflict');
                }
                if (!saved || !matchingResult(saved, output)) {
                    problem('static_site_recovery_output_conflict');
                }
            }
            const count = await this.models.RenderRecovery.count({where: {queueId}, transaction});
            if (count >= recoveryLimit) {
                problem('static_site_recovery_exhausted');
            }
            const attempt = await Operation.create({userId, userApiKeyId: queue.userApiKeyId,
                module: operation.module, name: operation.name, channel: 'static-site-recovery:' + queue.id + ':' + (count + 1),
                inProcess: true}, {transaction});
            const recovery = await this.models.RenderRecovery.create({queueId, userId,
                interruptedOperationId: operation.id, asyncOperationId: attempt.id,
                interruptedReceipt: JSON.stringify(operation.toJSON()), state: 'pending'}, {transaction});
            await queue.update({asyncOperationId: attempt.id, isWaiting: true}, {transaction});
            return this.receipt(queue, recovery, transaction);
        });
    }

    async prepareRetention(userId, queueId, expectedOperationId, retain) {
        const sequelize = this.app.ms.database.sequelize;
        const queue = await sequelize.model('userOperationQueue').findOne({where: {id: queueId, userId,
            module: 'static-site-generator'}, include: [{association: 'asyncOperation'}]});
        if (!queue) {
            problem('operation_queue_not_found', 404);
        }
        if (commonHelper.hash(queue.inputJson) !== queue.inputHash) {
            problem('static_site_recovery_input_changed');
        }
        const input = JSON.parse(queue.inputJson);
        const replacementId = input.options?.replacementId;
        if (!Number.isSafeInteger(replacementId) || replacementId <= 0) {
            if (retain) {
                problem('static_site_recovery_retention_requires_replacement');
            }
            return;
        }
        const service = this.app.ms.staticSiteGenerator.replacements;
        const replacement = await service.replacement(userId, replacementId);
        const bound = replacement.result?.externalLinksRetention?.recoveries?.some(item =>
            item.queueId === queueId && item.expectedOperationId === expectedOperationId) === true;
        const previous = await this.models.RenderRecovery.findOne({where: {queueId, interruptedOperationId: expectedOperationId}});
        if (previous || bound) {
            if (retain !== bound) {
                problem('static_site_recovery_retention_conflict');
            }
            return;
        }
        if (!retain) {
            return;
        }
        const operation = queue.asyncOperation;
        if (queue.asyncOperationId !== expectedOperationId || !operation || operation.inProcess
            || operation.errorType !== 'node-restart' || operation.cancel) {
            problem('static_site_recovery_not_interrupted');
        }
        if (await this.models.RenderRecovery.count({where: {queueId}}) >= recoveryLimit) {
            problem('static_site_recovery_exhausted');
        }
        await retainOriginalForExternalLinks(service, userId, replacementId);
        await bindRetentionToRecovery(service, userId, replacementId, queueId, expectedOperationId);
    }

    async receipt(queue, recovery, transaction) {
        const operation = await this.app.ms.database.sequelize.model('userAsyncOperation').findByPk(queue.asyncOperationId, {transaction});
        return {id: queue.id, isWaiting: queue.isWaiting, asyncOperationId: queue.asyncOperationId, asyncOperation: operation,
            renderRecoveryPolicy: await this.policy(queue, transaction), recovery: {
            id: recovery.id, interruptedOperationId: recovery.interruptedOperationId,
            asyncOperationId: recovery.asyncOperationId, state: recovery.state, limit: recoveryLimit}};
    }

    async pending(queue) {
        return this.models.RenderRecovery.findOne({where: {queueId: queue.id,
            asyncOperationId: queue.asyncOperationId, state: 'pending'}});
    }
}

function frozenOptions(options) {
    const {asyncOperationId, ...frozen} = options;
    return {...frozen, archiveApiBase: options.archive ? '/api/v1' : undefined};
}

function matchingResult(left, right) {
    return Boolean(left?.storageId && right?.storageId) && sameCid(left.storageId, right.storageId)
        && Number(left.staticSiteId) === Number(right.staticSiteId);
}
