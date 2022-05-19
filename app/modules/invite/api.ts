import {IGeesomeApp} from "../../interface";
import IGeesomeInviteModule from "./interface";

module.exports = (app: IGeesomeApp, inviteModule: IGeesomeInviteModule) => {

    app.ms.api.onPost('invite/join/:code', async (req, res) => {
        res.send(await inviteModule.registerUserByInviteCode(req.params.code, req.body));
    });

    app.ms.api.onAuthorizedPost('admin/add-invite', async (req, res) => {
        res.send(await inviteModule.createInvite(req.user.id, req.body));
    });

    app.ms.api.onAuthorizedGet('admin/invites', async (req, res) => {
        res.send(await inviteModule.getUserInvites(req.user.id, req.query, req.query));
    });

    app.ms.api.onAuthorizedPost('admin/update-invite/:id', async (req, res) => {
        res.send(await inviteModule.updateInvite(req.user.id, req.params.id, req.body));
    });
}