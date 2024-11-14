import {IGeesomeApp} from "../../interface.js";
import IGeesomeAsyncOperationModule from "./interface.js";
import helpers from "../../helpers";

export default (app: IGeesomeApp, asyncOperationModule: IGeesomeAsyncOperationModule) => {

    app.ms.api.onAuthorizedPost('user/get-operation-queue/:operationId', async (req, res) => {
        res.send(await asyncOperationModule.getUserOperationQueue(req.user.id, req.params.operationId));
    });

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
     * @apiInterface (../../database/interface.ts) {IUserAsyncOperation} apiSuccess
     */
    app.ms.api.onAuthorizedPost('user/get-async-operation/:id', async (req, res) => {
        res.send(await asyncOperationModule.getAsyncOperation(req.user.id, req.params.id));
    });

    app.ms.api.onAuthorizedPost('user/find-async-operations', async (req, res) => {
        res.send(await asyncOperationModule.findAsyncOperations(req.user.id, req.body.name, req.body.channelLike, req.body.inProcess));
    });

    app.ms.api.onAuthorizedPost('user/cancel-async-operation/:id', async (req, res) => {
        res.send(await asyncOperationModule.cancelAsyncOperation(req.user.id, req.params.id));
    });
}