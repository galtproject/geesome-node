import {IGeesomeApp} from "../../interface";
import IGeesomeAutoActionsModule from "./interface";

module.exports = (app: IGeesomeApp, autoActionsModule: IGeesomeAutoActionsModule) => {

    // app.ms.api.onAuthorizedPost('user/get-async-operation/:id', async (req, res) => {
    //     res.send(await asyncOperationModule.getAsyncOperation(req.user.id, req.params.id));
    // });
    //
    // app.ms.api.onAuthorizedPost('user/find-async-operations', async (req, res) => {
    //     res.send(await asyncOperationModule.findAsyncOperations(req.user.id, req.body.name, req.body.channelLike));
    // });
    //
    // app.ms.api.onAuthorizedPost('user/cancel-async-operation/:id', async (req, res) => {
    //     res.send(await asyncOperationModule.cancelAsyncOperation(req.user.id, req.params.id));
    // });
}