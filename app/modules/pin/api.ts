import {IGeesomeApp} from "../../interface";
import IGeesomePinModule from "./interface";

export default (app: IGeesomeApp, pinModule: IGeesomePinModule) => {
    app.ms.api.onAuthorizedPost('user/pin/create-account', async (req, res) => {
        res.send(await pinModule.createAccount(req.user.id, req.body));
    });

    app.ms.api.onAuthorizedPost('user/pin/update-account/:id', async (req, res) => {
        res.send(await pinModule.updateAccount(req.user.id, req.params.id, req.body));
    });

    app.ms.api.onAuthorizedGet('user/pin/user-accounts', async (req, res) => {
        res.send({
            list: await pinModule.getUserAccountsList(req.user.id)
        });
    });

    app.ms.api.onAuthorizedGet('user/pin/group-accounts/:groupId', async (req, res) => {
        res.send({
            list: await pinModule.getGroupAccountsList(req.user.id, req.params.groupId)
        });
    });

    app.ms.api.onAuthorizedPost('user/pin/account/:accountName/pin-content/:storageId/by-user', async (req, res) => {
        res.send(await pinModule.pinByUserAccount(req.user.id, req.params.accountName, req.params.storageId, req.body));
    });

    app.ms.api.onAuthorizedPost('user/pin/account/:accountName/pin-content/:storageId/by-group/:groupId', async (req, res) => {
        res.send(await pinModule.pinByGroupAccount(req.user.id, req.params.groupId, req.params.accountName, req.params.storageId, req.body));
    });
}