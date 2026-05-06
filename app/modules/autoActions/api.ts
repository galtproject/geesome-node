import {IGeesomeApp} from "../../interface.js";
import IGeesomeAutoActionsModule from "./interface.js";

function sanitizeAutoAction(action) {
    if (!action) {
        return action;
    }
    const plainAction = action.toJSON ? action.toJSON() : {...action};
    delete plainAction.funcArgs;
    delete plainAction.funcArgsEncrypted;
    if (plainAction.nextActions) {
        plainAction.nextActions = plainAction.nextActions.map(sanitizeAutoAction);
    }
    if (plainAction.baseActions) {
        plainAction.baseActions = plainAction.baseActions.map(sanitizeAutoAction);
    }
    return plainAction;
}

function sanitizeAutoActions(actions) {
    return actions.map(sanitizeAutoAction);
}

export default (app: IGeesomeApp, autoActionsModule: IGeesomeAutoActionsModule) => {

    /**
     * @api {post} /v1/user/add-serial-auto-actions Add serial auto actions
     * @apiName UserAddSerialAutoActions
     * @apiGroup UserAutoAction
     *
     * @apiUse ApiKey
     * @apiUse AuthErrors
     * @apiUse ValidationErrors
     *
     * @apiBody {Object[]} list Auto action chain items.
     * @apiSuccess {Object[]} list Created auto actions.
     */
    app.ms.api.onAuthorizedPost('user/add-serial-auto-actions', async (req, res) => {
        res.send(sanitizeAutoActions(await autoActionsModule.addSerialAutoActions(req.user.id, req.body)));
    });
    /**
     * @api {get} /v1/user/get-auto-actions List auto actions
     * @apiName UserAutoActions
     * @apiGroup UserAutoAction
     *
     * @apiUse ApiKey
     * @apiUse AuthErrors
     *
     * @apiInterface (../../interface.ts) {IListQueryInput} apiQuery
     * @apiInterface (./interface.ts) {IAutoActionListResponse} apiSuccess
     */
    app.ms.api.onAuthorizedGet('user/get-auto-actions', async (req, res) => {
        const response = await autoActionsModule.getUserActions(req.user.id, req.query);
        res.send({
            ...response,
            list: sanitizeAutoActions(response.list)
        });
    });
    /**
     * @api {post} /v1/user/update-auto-action/:id Update auto action
     * @apiName UserUpdateAutoAction
     * @apiGroup UserAutoAction
     *
     * @apiUse ApiKey
     * @apiUse AuthErrors
     * @apiUse ValidationErrors
     *
     * @apiParam {Number} id Auto action id.
     * @apiInterface (./interface.ts) {IAutoAction} apiBody
     * @apiInterface (./interface.ts) {IAutoAction} apiSuccess
     */
    app.ms.api.onAuthorizedPost('user/update-auto-action/:id', async (req, res) => {
        res.send(sanitizeAutoAction(await autoActionsModule.updateAutoAction(req.user.id, req.params.id, req.body)));
    });
}
