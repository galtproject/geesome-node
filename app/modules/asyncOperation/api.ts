import {IGeesomeApp} from "../../interface";
import IGeesomeAsyncOperationModule from "./interface";

module.exports = (app: IGeesomeApp, asyncOperationModule: IGeesomeAsyncOperationModule) => {
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
        res.send(await asyncOperationModule.findAsyncOperations(req.user.id, req.body.name, req.body.channelLike));
    });

    app.ms.api.onAuthorizedPost('user/cancel-async-operation/:id', async (req, res) => {
        res.send(await asyncOperationModule.cancelAsyncOperation(req.user.id, req.params.id));
    });
}