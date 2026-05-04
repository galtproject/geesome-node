import {IGeesomeApp} from "../../interface.js";
import IGeesomePinModule from "./interface.js";

export default (app: IGeesomeApp, pinModule: IGeesomePinModule) => {
    /**
     * @api {post} /v1/user/pin/create-account Create pin account
     * @apiName UserPinCreateAccount
     * @apiGroup UserPin
     *
     * @apiUse ApiKey
     * @apiUse AuthErrors
     * @apiUse ValidationErrors
     *
     * @apiInterface (./interface.ts) {IPinAccount} apiBody
     * @apiInterface (./interface.ts) {IPinAccount} apiSuccess
     *
     * @apiExample {curl} Example usage
     *   curl -X POST http://localhost:2052/v1/user/pin/create-account \
     *     -H "Authorization: Bearer geesome-api-key" \
     *     -H "Content-Type: application/json" \
     *     -d '{"name":"pinata","service":"pinata","apiKey":"pinata-key","secretApiKey":"pinata-secret"}'
     */
    app.ms.api.onAuthorizedPost('user/pin/create-account', async (req, res) => {
        res.send(await pinModule.createAccount(req.user.id, req.body));
    });

    /**
     * @api {post} /v1/user/pin/update-account/:id Update pin account
     * @apiName UserPinUpdateAccount
     * @apiGroup UserPin
     *
     * @apiUse ApiKey
     * @apiUse AuthErrors
     * @apiUse ValidationErrors
     *
     * @apiParam {Number} id Pin account id.
     * @apiInterface (./interface.ts) {IPinAccount} apiBody
     * @apiInterface (./interface.ts) {IPinAccount} apiSuccess
     */
    app.ms.api.onAuthorizedPost('user/pin/update-account/:id', async (req, res) => {
        res.send(await pinModule.updateAccount(req.user.id, req.params.id, req.body));
    });

    /**
     * @api {get} /v1/user/pin/user-accounts List user pin accounts
     * @apiName UserPinAccounts
     * @apiGroup UserPin
     *
     * @apiUse ApiKey
     * @apiUse AuthErrors
     *
     * @apiInterface (../../interface.ts) {IPinAccountListResponse} apiSuccess
     */
    app.ms.api.onAuthorizedGet('user/pin/user-accounts', async (req, res) => {
        res.send({
            list: await pinModule.getUserAccountsList(req.user.id)
        });
    });

    /**
     * @api {get} /v1/user/pin/group-accounts/:groupId List group pin accounts
     * @apiName UserPinGroupAccounts
     * @apiGroup UserPin
     *
     * @apiUse ApiKey
     * @apiUse AuthErrors
     *
     * @apiParam {String} groupId Group id.
     * @apiInterface (../../interface.ts) {IPinAccountListResponse} apiSuccess
     */
    app.ms.api.onAuthorizedGet('user/pin/group-accounts/:groupId', async (req, res) => {
        res.send({
            list: await pinModule.getGroupAccountsList(req.user.id, req.params.groupId)
        });
    });

    /**
     * @api {post} /v1/user/pin/account/:accountName/pin-content/:storageId/by-user Pin content by user account
     * @apiName UserPinContentByUser
     * @apiGroup UserPin
     *
     * @apiUse ApiKey
     * @apiUse AuthErrors
     * @apiUse StorageErrors
     *
     * @apiParam {String} accountName Pin account name.
     * @apiParam {String} storageId Content storage id.
     * @apiInterface (../../interface.ts) {IPinOptionsInput} apiBody
     */
    app.ms.api.onAuthorizedPost('user/pin/account/:accountName/pin-content/:storageId/by-user', async (req, res) => {
        res.send(await pinModule.pinByUserAccount(req.user.id, req.params.accountName, req.params.storageId, req.body));
    });

    /**
     * @api {post} /v1/user/pin/account/:accountName/pin-content/:storageId/by-group/:groupId Pin content by group account
     * @apiName UserPinContentByGroup
     * @apiGroup UserPin
     *
     * @apiUse ApiKey
     * @apiUse AuthErrors
     * @apiUse StorageErrors
     *
     * @apiParam {String} accountName Pin account name.
     * @apiParam {String} storageId Content storage id.
     * @apiParam {String} groupId Group id.
     * @apiInterface (../../interface.ts) {IPinOptionsInput} apiBody
     */
    app.ms.api.onAuthorizedPost('user/pin/account/:accountName/pin-content/:storageId/by-group/:groupId', async (req, res) => {
        res.send(await pinModule.pinByGroupAccount(req.user.id, req.params.groupId, req.params.accountName, req.params.storageId, req.body));
    });
}
