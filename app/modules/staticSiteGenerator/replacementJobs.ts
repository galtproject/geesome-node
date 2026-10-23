import {Op, cast, col, fn, where} from 'sequelize';
import {digest} from '../../storageIdentity.js';
import {checkpointOperation} from '../asyncOperation/checkpoint.js';
import {problem} from '../content/publicationInput.js';

// Accepted input is immutable on the queue; only operation.output is checkpointed.
export class SiteReplacementJobs {
    constructor(public app, public moduleName) {}
    get Queue() { return this.app.ms.database.sequelize.model('userOperationQueue'); }
    get Operation() { return this.app.ms.database.sequelize.model('userAsyncOperation'); }
    include = [{association: 'asyncOperation', required: true}];
    wrap(queue) {
        if (!queue) {
            return null;
        }
        const {requestKey, requestHash, input} = JSON.parse(queue.inputJson);
        const receipt = {requestKey, requestHash, input, ...JSON.parse(queue.asyncOperation.output),
            id: queue.id, userId: queue.userId, apiKeyId: queue.userApiKeyId,
            update: async patch => {
                const old = queue.asyncOperation.output;
                const {status, result, error} = {...JSON.parse(old), ...structuredClone(patch)};
                const output = JSON.stringify({status, result, error});
                const complete = ['complete', 'complete_with_retained'].includes(status);
                const changed = await checkpointOperation(this.app, queue, old, output, {
                    isWaiting: !complete, finishedAt: complete ? new Date() : null, errorMessage: error || null});
                if (!changed) {
                    problem('site_replacement_checkpoint_conflict');
                }
                queue.asyncOperation.output = output;
                Object.assign(receipt, {status, result, error});
                return receipt;
            }};
        return receipt;
    }
    async get(userId, id) {
        if (!/^\d+$/.test(String(id)) || !Number.isSafeInteger(Number(id))) {
            problem('image_replacement_not_found', 404);
        }
        return this.wrap(await this.Queue.findOne({where: {id: Number(id), userId, module: this.moduleName}, include: this.include}));
    }
    async byKey(userId, key) {
        return this.wrap(await this.Queue.findOne({where: {userId, module: this.moduleName,
            inputHash: digest({userId, key})}, include: this.include}));
    }
    async create(userId, apiKeyId, key, state) {
        const inputHash = digest({userId, key});
        return this.app.ms.database.sequelize.transaction(async transaction => {
            await this.app.ms.database.sequelize.query('SELECT pg_advisory_xact_lock(17421, hashtext(:key))',
                {replacements: {key: inputHash}, transaction});
            const previous = await this.Queue.findOne({where: {userId, module: this.moduleName, inputHash},
                include: this.include, transaction});
            if (previous) {
                return this.wrap(previous);
            }
            const {requestKey, requestHash, input, status, result, error} = state;
            const operation = await this.Operation.create({userId, userApiKeyId: apiKeyId,
                module: this.moduleName, name: this.moduleName, channel: inputHash, inProcess: false,
                output: JSON.stringify({status, result, error})}, {transaction});
            const queue = await this.Queue.create({userId, userApiKeyId: apiKeyId, module: this.moduleName,
                inputHash, inputJson: JSON.stringify({requestKey, requestHash, input}), isWaiting: true,
                asyncOperationId: operation.id}, {transaction});
            queue.asyncOperation = operation;
            return this.wrap(queue);
        });
    }
    async list(statuses, limit = 10) {
        const rows = await this.Queue.findAll({where: {module: this.moduleName, isWaiting: true,
            [Op.and]: where(fn('jsonb_extract_path_text', cast(col('asyncOperation.output'), 'jsonb'), 'status'), {[Op.in]: statuses})},
            include: this.include, order: [['updatedAt', 'ASC'], ['id', 'ASC']], limit});
        return rows.map(row => this.wrap(row));
    }
}
