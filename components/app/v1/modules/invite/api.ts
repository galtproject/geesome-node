import {IGeesomeApp, IGeesomeInviteModule} from "../../../interface";
import {CorePermissionName} from "../../../../database/interface";

module.exports = (app: IGeesomeApp, inviteModule: IGeesomeInviteModule) => {

    app.api.post('/v1/invite/join/:code', async (req, res) => {
        res.send(await inviteModule.registerUserByInviteCode(req.params.code, req.body));
    });
    app.api.post('/v1/admin/add-invite', async (req, res) => {
        if (!await app.database.isHaveCorePermission(req.user.id, CorePermissionName.AdminAddUser)) {
            return res.send(403);
        }
        res.send(await inviteModule.createInvite(req.user.id, req.body));
    });
    app.api.get('/v1/admin/invites', async (req, res) => {
        res.send(await inviteModule.getUserInvites(req.user.id, req.query, req.query));
    });
    app.api.post('/v1/admin/update-invite/:id', async (req, res) => {
        if (!await app.database.isHaveCorePermission(req.user.id, CorePermissionName.AdminAddUser)) {
            return res.send(403);
        }
        res.send(await inviteModule.updateInvite(req.user.id, req.params.id, req.body));
    });
}