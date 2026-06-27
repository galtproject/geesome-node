import {IGeesomeApp} from "../../interface.js";
import IGeesomeInviteModule from "./interface.js";
import {CorePermissionName} from "../database/interface.js";
import {inviteApiErrorBody, normalizeInviteApiError} from "./errors.js";

export default (app: IGeesomeApp, inviteModule: IGeesomeInviteModule) => {

    /**
     * @api {get} /v1/invite/status/:code Check invite status
     * @apiDescription Public preflight for agent upload bootstrap. It verifies that the invite exists, is active, has remaining uses, and grants the requested permission. By default it requires `user:save_data`; `user:all` also satisfies that requirement.
     * @apiName InviteStatus
     * @apiGroup Invite
     *
     * @apiParam {String} code Invite code.
     * @apiQuery {String} [requiredPermission=user:save_data] Permission that the invite-created user must receive.
     * @apiSuccess {Boolean} ok Invite can be used.
     * @apiSuccess {String} code Invite code.
     * @apiSuccess {Boolean} publicJoinEnabled Public invite join endpoint is available.
     * @apiSuccess {Boolean} active Invite is active.
     * @apiSuccess {Number} remainingUses Number of registrations left.
     * @apiSuccess {String[]} permissions Invite-granted permissions.
     * @apiSuccess {String} requiredPermission Permission checked by this preflight.
     * @apiSuccess {String} joinPath Public join path for this invite.
     * @apiError (404) invite_not_found Invite code is unknown.
     * @apiError (410) invite_not_active Invite exists but is inactive.
     * @apiError (410) invite_exhausted Invite has no remaining uses.
     * @apiError (422) invite_missing_upload_permission Invite does not grant the requested permission.
     *
     * @apiExample {curl} Example usage
     *   curl http://localhost:2052/v1/invite/status/INVITE-CODE
     */
    app.ms.api.onGet('invite/status/:code', async (req, res) => {
        return withInviteErrorResponse(res, async () => {
            const requiredPermission = req.query.requiredPermission || CorePermissionName.UserSaveData;
            res.send(await inviteModule.getInviteStatus(req.params.code, {requiredPermission}));
        });
    });

    /**
     * @api {post} /v1/invite/join/:code Join by invite
     * @apiDescription Creates a user from an invite code and returns the upload credential material in a documented shape. Agents that need upload capability should call `/v1/invite/status/:code` first.
     * @apiName InviteJoin
     * @apiGroup Invite
     *
     * @apiParam {String} code Invite code.
     * @apiInterface (../../interface.ts) {IUserInput} apiBody
     * @apiSuccess {Object} user Created user.
     * @apiSuccess {String} apiKey API key for the created user.
     * @apiSuccess {String[]} permissions Permissions granted by the invite.
     * @apiSuccess {String} keyStoreMethod API key storage method.
     * @apiError (403) invite_join_not_permitted Invite join is blocked by node or hook configuration.
     * @apiError (404) invite_not_found Invite code is unknown.
     * @apiError (410) invite_not_active Invite exists but is inactive.
     * @apiError (410) invite_exhausted Invite has no remaining uses.
     *
     * @apiExample {curl} Example usage
     *   curl -X POST http://localhost:2052/v1/invite/join/INVITE-CODE \
     *     -H "Content-Type: application/json" \
     *     -d '{"username":"new-user","password":"secret","email":"user@example.com"}'
     */
    app.ms.api.onPost('invite/join/:code', async (req, res) => {
        return withInviteErrorResponse(res, async () => {
            res.send(await inviteModule.registerUserByInviteCode(req.params.code, req.body));
        });
    });

    /**
     * @api {post} /v1/admin/add-invite Create invite
     * @apiName AdminInviteAdd
     * @apiGroup AdminInvite
     *
     * @apiUse ApiKey
     * @apiUse AuthErrors
     * @apiUse AdminErrors
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
     * @apiUse AuthErrors
     * @apiUse AdminErrors
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
     * @apiUse AuthErrors
     * @apiUse AdminErrors
     *
     * @apiParam {Number} id Invite id.
     * @apiInterface (../database/interface.ts) {IInvite} apiBody
     */
    app.ms.api.onAuthorizedPost('admin/update-invite/:id', async (req, res) => {
        res.send(await inviteModule.updateInvite(req.user.id, req.params.id, req.body));
    });
}

async function withInviteErrorResponse(res, callback) {
    try {
        return await callback();
    } catch (error) {
        const inviteError = normalizeInviteApiError(error);
        if (!inviteError) {
            throw error;
        }
        return sendWithStatus(res, inviteApiErrorBody(inviteError), inviteError.statusCode);
    }
}

function sendWithStatus(res, body, statusCode) {
    if (res.stream && typeof res.stream.status === 'function') {
        return res.stream.status(statusCode).send(body);
    }
    return res.send(body, statusCode);
}
