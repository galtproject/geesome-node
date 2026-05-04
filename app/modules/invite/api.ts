import {IGeesomeApp} from "../../interface.js";
import IGeesomeInviteModule from "./interface.js";

export default (app: IGeesomeApp, inviteModule: IGeesomeInviteModule) => {

    /**
     * @api {post} /v1/invite/join/:code Join by invite
     * @apiName InviteJoin
     * @apiGroup Invite
     *
     * @apiParam {String} code Invite code.
     * @apiInterface (../../interface.ts) {IUserInput} apiBody
     * @apiInterface (../database/interface.ts) {IUser} apiSuccess
     */
    app.ms.api.onPost('invite/join/:code', async (req, res) => {
        res.send(await inviteModule.registerUserByInviteCode(req.params.code, req.body));
    });

    /**
     * @api {post} /v1/admin/add-invite Create invite
     * @apiName AdminInviteAdd
     * @apiGroup AdminInvite
     *
     * @apiUse ApiKey
     *
     * @apiInterface (../database/interface.ts) {IInvite} apiBody
     * @apiInterface (../database/interface.ts) {IInvite} apiSuccess
     */
    app.ms.api.onAuthorizedPost('admin/add-invite', async (req, res) => {
        res.send(await inviteModule.createInvite(req.user.id, req.body));
    });

    /**
     * @api {get} /v1/admin/invites List invites
     * @apiName AdminInvites
     * @apiGroup AdminInvite
     *
     * @apiUse ApiKey
     *
     * @apiInterface (../../interface.ts) {IListQueryInput} apiQuery
     * @apiInterface (../../interface.ts) {IInvitesListResponse} apiSuccess
     */
    app.ms.api.onAuthorizedGet('admin/invites', async (req, res) => {
        res.send(await inviteModule.getUserInvites(req.user.id, req.query, req.query));
    });

    /**
     * @api {post} /v1/admin/update-invite/:id Update invite
     * @apiName AdminInviteUpdate
     * @apiGroup AdminInvite
     *
     * @apiUse ApiKey
     *
     * @apiParam {Number} id Invite id.
     * @apiInterface (../database/interface.ts) {IInvite} apiBody
     */
    app.ms.api.onAuthorizedPost('admin/update-invite/:id', async (req, res) => {
        res.send(await inviteModule.updateInvite(req.user.id, req.params.id, req.body));
    });
}
