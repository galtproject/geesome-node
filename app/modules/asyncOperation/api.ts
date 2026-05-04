import {IGeesomeApp} from "../../interface.js";
import IGeesomeAsyncOperationModule from "./interface.js";
import helpers from "../../helpers";

export default (app: IGeesomeApp, asyncOperationModule: IGeesomeAsyncOperationModule) => {

    /**
     * @api {post} /v1/user/get-operation-queue/:operationId Get operation queue item
     * @apiName UserOperationQueue
     * @apiGroup UserOther
     *
     * @apiUse ApiKey
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
     *
     * @apiInterface (./interface.ts) {IUserAsyncOperationSearchInput} apiBody
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
     *
     * @apiParam {Number} id Async operation id.
     */
    app.ms.api.onAuthorizedPost('user/cancel-async-operation/:id', async (req, res) => {
        res.send(await asyncOperationModule.cancelAsyncOperation(req.user.id, req.params.id));
    });
}
