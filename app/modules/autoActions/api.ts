import {IGeesomeApp} from "../../interface";
import IGeesomeAutoActionsModule from "./interface";

module.exports = (app: IGeesomeApp, autoActionsModule: IGeesomeAutoActionsModule) => {

    app.ms.api.onAuthorizedPost('user/add-serial-auto-actions', async (req, res) => {
        res.send(await autoActionsModule.addSerialAutoActions(req.user.id, req.body));
    });
    app.ms.api.onAuthorizedGet('user/get-auto-actions', async (req, res) => {
        res.send(await autoActionsModule.getUserActions(req.user.id, req.query));
    });
    app.ms.api.onAuthorizedPost('user/update-auto-action/:id', async (req, res) => {
        res.send(await autoActionsModule.updateAutoAction(req.user.id, req.params.id, req.body));
    });
}