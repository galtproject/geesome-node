import {IGeesomeApp} from "../../interface.js";
import IGeesomeAsyncOperationModule from "./interface.js";
import helpers from "../../helpers";
import {ApiProblemError} from '../api/problem.js';
import {getPublicApiContext} from '../api/publicUrls.js';
import {requireIntegrationScopes} from '../api/integrationScopes.js';

export default (app: IGeesomeApp, asyncOperationModule: IGeesomeAsyncOperationModule) => {

    /**
     * @api {get} /v1/operations/:id Get operation resource
     * @apiName OperationGet
     * @apiGroup Operations
     * @apiUse ApiKey
     * @apiParam {Number} id Operation identifier.
     * @apiSuccess {String="pending","running","succeeded","failed","cancelled"} status Stable operation state.
     * @apiSuccess {Object} [result] Completed operation result.
     * @apiSuccess {Object} [problem] Standard problem document for failed work.
     */
    app.ms.api.onAuthorizedGet('operations/:id', async (req, res) => {
        requireIntegrationScopes(req.apiKey, ['operations:read']);
        const operation = await asyncOperationModule.getAsyncOperation(req.user.id, req.params.id);
        if (!operation) {
            throw new ApiProblemError(404, 'operation_not_found', 'Operation not found');
        }
        res.send(serializeOperation(app, operation));
    });

    /**
     * @api {post} /v1/operations/:id/cancel Cancel operation
     * @apiName OperationCancel
     * @apiGroup Operations
     * @apiUse ApiKey
     * @apiParam {Number} id Operation identifier.
     */
    app.ms.api.onAuthorizedPost('operations/:id/cancel', async (req, res) => {
        requireIntegrationScopes(req.apiKey, ['operations:read']);
        await asyncOperationModule.cancelAsyncOperation(req.user.id, req.params.id);
        const operation = await asyncOperationModule.getAsyncOperation(req.user.id, req.params.id);
        res.send(serializeOperation(app, operation));
    });

    /**
     * @api {post} /v1/user/get-operation-queue/:operationId Get operation queue item
     * @apiName UserOperationQueue
     * @apiGroup UserOther
     *
     * @apiUse ApiKey
     * @apiUse AuthErrors
     * @apiUse AsyncErrors
     *
     * @apiParam {Number} operationId Operation queue id.
     * @apiInterface (./interface.ts) {IUserOperationQueue} apiSuccess
     */
    app.ms.api.onAuthorizedPost('user/get-operation-queue/:operationId', async (req, res) => {
        res.send(await asyncOperationModule.getUserOperationQueue(req.user.id, req.params.operationId));
    });

    /**
     * @api {post} /v1/user/get-operation-queue-list List waiting operation queue items
     * @apiName UserOperationQueueList
     * @apiGroup UserOther
     *
     * @apiUse ApiKey
     * @apiUse AuthErrors
     * @apiUse AsyncErrors
     *
     * @apiInterface (./interface.ts) {IUserOperationQueueListInput} apiBody
     */
    app.ms.api.onAuthorizedPost('user/get-operation-queue-list', async (req, res) => {
        res.send(await asyncOperationModule.getWaitingOperationQueueListByModule(req.user.id, req.body.module, helpers.prepareListParams(req.body)));
    });

    /**
     * @api {post} /v1/user/get-async-operation/:id Get async operation
     * @apiDescription Get async operation info: operation type, status, percent, and content when it will be ready.
     * @apiName UserAsyncOperation
     * @apiGroup UserOther
     *
     * @apiUse ApiKey
     * @apiUse AuthErrors
     * @apiUse AsyncErrors
     *
     * @apiParam {Number} id Async operation id.
     * @apiInterface (./interface.ts) {IUserAsyncOperation} apiSuccess
     */
    app.ms.api.onAuthorizedPost('user/get-async-operation/:id', async (req, res) => {
        res.send(await asyncOperationModule.getAsyncOperation(req.user.id, req.params.id));
    });

    /**
     * @api {post} /v1/user/find-async-operations Find async operations
     * @apiName UserAsyncOperationFind
     * @apiGroup UserOther
     *
     * @apiUse ApiKey
     * @apiUse AuthErrors
     * @apiUse AsyncErrors
     *
     * @apiInterface (./interface.ts) {IUserAsyncOperationSearchInput} apiBody
     * @apiExample {curl} Example usage
     *   curl -X POST http://localhost:2052/v1/user/find-async-operations \
     *     -H "Authorization: Bearer geesome-api-key" \
     *     -H "Content-Type: application/json" \
     *     -d '{"channelLike":"content","inProcess":true}'
     * @apiSuccess {Object[]} list Async operation items.
     */
    app.ms.api.onAuthorizedPost('user/find-async-operations', async (req, res) => {
        res.send(await asyncOperationModule.findAsyncOperations(req.user.id, req.body.name, req.body.channelLike, req.body.inProcess));
    });

    /**
     * @api {post} /v1/user/cancel-async-operation/:id Cancel async operation
     * @apiName UserAsyncOperationCancel
     * @apiGroup UserOther
     *
     * @apiUse ApiKey
     * @apiUse AuthErrors
     * @apiUse AsyncErrors
     *
     * @apiParam {Number} id Async operation id.
     */
    app.ms.api.onAuthorizedPost('user/cancel-async-operation/:id', async (req, res) => {
        res.send(await asyncOperationModule.cancelAsyncOperation(req.user.id, req.params.id));
    });
}

function serializeOperation(app: IGeesomeApp, operation: any) {
    const context = getPublicApiContext(app);
    const output = parseOperationOutput(operation.output);
    const status = getOperationStatus(operation);
    return {
        schemaVersion: 1,
        operationId: `op_${operation.id}`,
        status,
        percent: Number(operation.percent || 0),
        statusUrl: `${context.apiBaseUrl}/operations/${operation.id}`,
        requestId: operation.requestId || null,
        result: status === 'succeeded' ? output : null,
        problem: status === 'failed' ? output?.problem || {
            type: 'about:blank',
            title: 'Operation failed',
            status: 500,
            code: operation.errorType || 'operation_failed',
            detail: operation.errorMessage || 'The operation failed.',
            requestId: operation.requestId || null
        } : null
    };
}

function getOperationStatus(operation: any): string {
    if (operation.cancel) {
        return 'cancelled';
    }
    if (operation.inProcess) {
        return Number(operation.percent || 0) > 0 ? 'running' : 'pending';
    }
    if (operation.errorType || operation.errorMessage) {
        return 'failed';
    }
    return 'succeeded';
}

function parseOperationOutput(output: any) {
    if (!output) {
        return null;
    }
    if (typeof output !== 'string') {
        return output;
    }
    try {
        return JSON.parse(output);
    } catch (e) {
        return null;
    }
}
