import {IGeesomeApp} from "../../interface.js";
import IGeesomePinModule from "./interface.js";

function sanitizePinAccount(account) {
    if (!account) {
        return account;
    }
    const plainAccount = account.toJSON ? account.toJSON() : {...account};
    delete plainAccount.secretApiKey;
    delete plainAccount.secretApiKeyEncrypted;
    return plainAccount;
}

function sanitizePinAccounts(accounts) {
    return accounts.map(account => sanitizePinAccount(account));
}

export default (app: IGeesomeApp, pinModule: IGeesomePinModule) => {
    /**
     * @apiDefine PinErrors
     *
     * @apiError (400) PinAccountNotFound The requested user or group pin account does not exist.
     * @apiError (400) UnknownService The pin account service is not supported.
     * @apiError (404) ContentNotFound The storage id does not belong to visible local content.
     * @apiError (403) NotPermitted Current user or API key cannot manage the requested group pin account.
     * @apiError (502) PinataPinFailed The remote Pinata pin request failed.
     * @apiErrorExample {json} Pin account missing
     *   {
     *     "error": "pin_account_not_found"
     *   }
     * @apiErrorExample {json} Remote Pinata failure
     *   {
     *     "error": "pinata_pin_failed"
     *   }
     */

    /**
     * @api {post} /v1/user/pin/create-account Create pin account
     * @apiName UserPinCreateAccount
     * @apiGroup UserPin
     * @apiDescription Creates a user-owned or group-owned account for an external pinning service. When `groupId` is provided, the current user must be able to edit that group. For Pinata, set `service` to `pinata`; `secretApiKey` can be encrypted at rest by setting `isEncrypted` to `true`. Secret fields are write-only and are not returned in API responses.
     *
     * @apiUse ApiKey
     * @apiUse AuthErrors
     * @apiUse ValidationErrors
     * @apiUse PinErrors
     *
     * @apiInterface (./interface.ts) {IPinAccount} apiBody
     * @apiInterface (./interface.ts) {IPinAccount} apiSuccess
     *
     * @apiExample {curl} Example usage
     *   curl -X POST http://localhost:2052/v1/user/pin/create-account \
     *     -H "Authorization: Bearer geesome-api-key" \
     *     -H "Content-Type: application/json" \
     *     -d '{"name":"pinata","service":"pinata","apiKey":"pinata-key","secretApiKey":"pinata-secret"}'
     *
     * @apiExample {curl} Create a group Pinata account with encrypted secret
     *   curl -X POST http://localhost:2052/v1/user/pin/create-account \
     *     -H "Authorization: Bearer geesome-api-key" \
     *     -H "Content-Type: application/json" \
     *     -d '{"name":"group-pinata","service":"pinata","groupId":42,"apiKey":"pinata-key","secretApiKey":"pinata-secret","isEncrypted":true}'
     */
    app.ms.api.onAuthorizedPost('user/pin/create-account', async (req, res) => {
        res.send(sanitizePinAccount(await pinModule.createAccount(req.user.id, req.body)));
    });

    /**
     * @api {post} /v1/user/pin/update-account/:id Update pin account
     * @apiName UserPinUpdateAccount
     * @apiGroup UserPin
     * @apiDescription Updates a user-owned pin account or a group-owned pin account editable by the current user. Secret updates follow the same `isEncrypted` handling as account creation. Secret fields are write-only and are not returned in API responses.
     *
     * @apiUse ApiKey
     * @apiUse AuthErrors
     * @apiUse ValidationErrors
     * @apiUse PinErrors
     *
     * @apiParam {Number} id Pin account id.
     * @apiInterface (./interface.ts) {IPinAccount} apiBody
     * @apiInterface (./interface.ts) {IPinAccount} apiSuccess
     *
     * @apiExample {curl} Rotate a Pinata secret
     *   curl -X POST http://localhost:2052/v1/user/pin/update-account/15 \
     *     -H "Authorization: Bearer geesome-api-key" \
     *     -H "Content-Type: application/json" \
     *     -d '{"secretApiKey":"new-pinata-secret","isEncrypted":true}'
     */
    app.ms.api.onAuthorizedPost('user/pin/update-account/:id', async (req, res) => {
        res.send(sanitizePinAccount(await pinModule.updateAccount(req.user.id, req.params.id, req.body)));
    });

    /**
     * @api {post} /v1/user/pin/delete-account/:id Delete pin account
     * @apiName UserPinDeleteAccount
     * @apiGroup UserPin
     * @apiDescription Deletes a user-owned pin account or a group-owned pin account editable by the current user. This only removes the local service credentials; it does not unpin already pinned remote content.
     *
     * @apiUse ApiKey
     * @apiUse AuthErrors
     * @apiUse PinErrors
     *
     * @apiParam {Number} id Pin account id.
     * @apiSuccess {Boolean} success Account was deleted.
     *
     * @apiExample {curl} Delete a Pinata account
     *   curl -X POST http://localhost:2052/v1/user/pin/delete-account/15 \
     *     -H "Authorization: Bearer geesome-api-key"
     */
    app.ms.api.onAuthorizedPost('user/pin/delete-account/:id', async (req, res) => {
        res.send(await pinModule.deleteAccount(req.user.id, req.params.id));
    });

    /**
     * @api {get} /v1/user/pin/user-accounts List user pin accounts
     * @apiName UserPinAccounts
     * @apiGroup UserPin
     * @apiDescription Lists pin accounts owned directly by the current user.
     *
     * @apiUse ApiKey
     * @apiUse AuthErrors
     *
     * @apiInterface (../../interface.ts) {IListQueryInput} apiQuery
     * @apiInterface (../../interface.ts) {IPinAccountListResponse} apiSuccess
     *
     * @apiExample {curl} List current user's pin accounts
     *   curl -X GET http://localhost:2052/v1/user/pin/user-accounts \
     *     -H "Authorization: Bearer geesome-api-key"
     */
    app.ms.api.onAuthorizedGet('user/pin/user-accounts', async (req, res) => {
        res.send({
            list: sanitizePinAccounts(await pinModule.getUserAccountsList(req.user.id, req.query))
        });
    });

    /**
     * @api {get} /v1/user/pin/group-accounts/:groupId List group pin accounts
     * @apiName UserPinGroupAccounts
     * @apiGroup UserPin
     * @apiDescription Lists pin accounts attached to a group the current user can edit.
     *
     * @apiUse ApiKey
     * @apiUse AuthErrors
     * @apiUse PinErrors
     *
     * @apiParam {String} groupId Group id.
     * @apiInterface (../../interface.ts) {IListQueryInput} apiQuery
     * @apiInterface (../../interface.ts) {IPinAccountListResponse} apiSuccess
     *
     * @apiExample {curl} List group pin accounts
     *   curl -X GET http://localhost:2052/v1/user/pin/group-accounts/42 \
     *     -H "Authorization: Bearer geesome-api-key"
     */
    app.ms.api.onAuthorizedGet('user/pin/group-accounts/:groupId', async (req, res) => {
        res.send({
            list: sanitizePinAccounts(await pinModule.getGroupAccountsList(req.user.id, req.params.groupId, req.query))
        });
    });

    /**
     * @api {post} /v1/user/pin/account/:accountName/pin-content/:storageId/by-user Pin content by user account
     * @apiName UserPinContentByUser
     * @apiGroup UserPin
     * @apiDescription Pins existing local content through a user-owned pin account. The JSON body is forwarded to Pinata as `pinataMetadata.keyvalues`, so use flat metadata fields that Pinata should store with the pin.
     *
     * @apiUse ApiKey
     * @apiUse AuthErrors
     * @apiUse StorageErrors
     * @apiUse PinErrors
     *
     * @apiParam {String} accountName Pin account name.
     * @apiParam {String} storageId Content storage id.
     * @apiBody {String|Number|Boolean} [metadataKey] Any flat metadata key forwarded to Pinata as `pinataMetadata.keyvalues`.
     * @apiInterface (../../interface.ts) {IPinOptionsInput} apiBody
     * @apiInterface (../../interface.ts) {IPinServiceResponse} apiSuccess
     *
     * @apiExample {curl} Pin content by user account
     *   curl -X POST http://localhost:2052/v1/user/pin/account/pinata/pin-content/bafy.../by-user \
     *     -H "Authorization: Bearer geesome-api-key" \
     *     -H "Content-Type: application/json" \
     *     -d '{"source":"manual","channel":"telegram-backup"}'
     */
    app.ms.api.onAuthorizedPost('user/pin/account/:accountName/pin-content/:storageId/by-user', async (req, res) => {
        res.send(await pinModule.pinByUserAccount(req.user.id, req.params.accountName, req.params.storageId, req.body));
    });

    /**
     * @api {post} /v1/user/pin/account/:accountName/pin-content/:storageId/by-group/:groupId Pin content by group account
     * @apiName UserPinContentByGroup
     * @apiGroup UserPin
     * @apiDescription Pins existing local content through a group-owned pin account. The current user must be able to edit the group. The JSON body is forwarded to Pinata as `pinataMetadata.keyvalues`.
     *
     * @apiUse ApiKey
     * @apiUse AuthErrors
     * @apiUse StorageErrors
     * @apiUse PinErrors
     *
     * @apiParam {String} accountName Pin account name.
     * @apiParam {String} storageId Content storage id.
     * @apiParam {String} groupId Group id.
     * @apiBody {String|Number|Boolean} [metadataKey] Any flat metadata key forwarded to Pinata as `pinataMetadata.keyvalues`.
     * @apiInterface (../../interface.ts) {IPinOptionsInput} apiBody
     * @apiInterface (../../interface.ts) {IPinServiceResponse} apiSuccess
     *
     * @apiExample {curl} Pin content by group account
     *   curl -X POST http://localhost:2052/v1/user/pin/account/group-pinata/pin-content/bafy.../by-group/42 \
     *     -H "Authorization: Bearer geesome-api-key" \
     *     -H "Content-Type: application/json" \
     *     -d '{"source":"auto-action","group":"docs"}'
     */
    app.ms.api.onAuthorizedPost('user/pin/account/:accountName/pin-content/:storageId/by-group/:groupId', async (req, res) => {
        res.send(await pinModule.pinByGroupAccount(req.user.id, req.params.groupId, req.params.accountName, req.params.storageId, req.body));
    });
}
