import {Op, cast, col, fn, where} from 'sequelize';
import {digest} from '../../storageIdentity.js';
import {problem} from '../content/publicationImagePolicy.js';

// Long-lived workflow checkpoints use the existing queue/operation tables.
// Only their owning service changes the accepted input and versioned state.
export class DurableJobs {
    constructor(public app, public moduleName) {}
    get Queue() { return this.app.ms.database.sequelize.model('userOperationQueue'); }
    get Operation() { return this.app.ms.database.sequelize.model('userAsyncOperation'); }
    wrap(queue) {
        if (!queue) {
            return null;
        }
        const state = JSON.parse(queue.inputJson);
        const receipt = {...state, id: queue.id, userId: queue.userId, apiKeyId: queue.userApiKeyId,
            createdAt: queue.createdAt, updatedAt: queue.updatedAt,
            update: async patch => {
                const fresh = await this.change(queue, patch);
                // Keep this wrapper's update closure across every checkpoint.
                const {update, ...snapshot} = fresh;
                Object.assign(receipt, snapshot);
                return receipt;
            }};
        return receipt;
    }
    async change(queue, patch) {
        const old = queue.inputJson;
        const state = {...JSON.parse(old), ...structuredClone(patch)};
        const complete = ['complete', 'complete_with_retained'].includes(state.status);
        await this.app.ms.database.sequelize.transaction(async transaction => {
            const [changed] = await this.Queue.update({inputJson: JSON.stringify(state), isWaiting: !complete},
                {where: {id: queue.id, module: this.moduleName, inputJson: old}, transaction});
            if (!changed) {
                problem('site_replacement_checkpoint_conflict');
            }
            await this.Operation.update({output: JSON.stringify(state), inProcess: false,
                finishedAt: complete ? new Date() : null, errorMessage: state.error || null},
                {where: {id: queue.asyncOperationId}, transaction});
        });
        await queue.reload();
        return this.wrap(queue);
    }
    async get(userId, id) {
        if (!/^\d+$/.test(String(id)) || !Number.isSafeInteger(Number(id))) {
            problem('image_replacement_not_found', 404);
        }
        return this.wrap(await this.Queue.findOne({where: {id: Number(id), userId, module: this.moduleName}}));
    }
    async byKey(userId, key) {
        return this.wrap(await this.Queue.findOne({where: {userId, module: this.moduleName, inputHash: digest({userId, key})}}));
    }
    async create(userId, apiKeyId, key, state) {
        const inputHash = digest({userId, key});
        return this.app.ms.database.sequelize.transaction(async transaction => {
            // Short admission lock; no media/storage I/O runs in this transaction.
            await this.app.ms.database.sequelize.query('SELECT pg_advisory_xact_lock(17421, hashtext(:key))',
                {replacements: {key: inputHash}, transaction});
            const previous = await this.Queue.findOne({where: {userId, module: this.moduleName, inputHash}, transaction});
            if (previous) {
                return this.wrap(previous);
            }
            const operation = await this.Operation.create({userId, userApiKeyId: apiKeyId,
                module: this.moduleName, name: this.moduleName, channel: inputHash, inProcess: false,
                output: JSON.stringify(state)}, {transaction});
            return this.wrap(await this.Queue.create({userId, userApiKeyId: apiKeyId, module: this.moduleName,
                inputHash, inputJson: JSON.stringify(state), isWaiting: true, asyncOperationId: operation.id}, {transaction}));
        });
    }
    async list(statuses, limit = 10) {
        const rows = await this.Queue.findAll({where: {module: this.moduleName, isWaiting: true,
            [Op.and]: where(fn('jsonb_extract_path_text', cast(col('inputJson'), 'jsonb'), 'status'), {[Op.in]: statuses})},
            order: [['updatedAt', 'ASC'], ['id', 'ASC']], limit});
        return rows.map(row => this.wrap(row));
    }
}
