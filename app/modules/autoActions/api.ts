import {IGeesomeApp} from "../../interface.js";
import IGeesomeAutoActionsModule from "./interface.js";

export default (app: IGeesomeApp, autoActionsModule: IGeesomeAutoActionsModule) => {

    /**
     * @api {post} /v1/user/add-serial-auto-actions Add serial auto actions
     * @apiName UserAddSerialAutoActions
     * @apiGroup UserAutoAction
     *
     * @apiUse ApiKey
     *
     * @apiBody {Object[]} list Auto action chain items.
     * @apiSuccess {Object[]} list Created auto actions.
     */
    app.ms.api.onAuthorizedPost('user/add-serial-auto-actions', async (req, res) => {
        res.send(await autoActionsModule.addSerialAutoActions(req.user.id, req.body));
    });
    /**
     * @api {get} /v1/user/get-auto-actions List auto actions
     * @apiName UserAutoActions
     * @apiGroup UserAutoAction
     *
     * @apiUse ApiKey
     *
     * @apiInterface (../../interface.ts) {IListQueryInput} apiQuery
     * @apiInterface (./interface.ts) {IAutoActionListResponse} apiSuccess
     */
    app.ms.api.onAuthorizedGet('user/get-auto-actions', async (req, res) => {
        res.send(await autoActionsModule.getUserActions(req.user.id, req.query));
    });
    /**
     * @api {post} /v1/user/update-auto-action/:id Update auto action
     * @apiName UserUpdateAutoAction
     * @apiGroup UserAutoAction
     *
     * @apiUse ApiKey
     *
     * @apiParam {Number} id Auto action id.
     * @apiInterface (./interface.ts) {IAutoAction} apiBody
     * @apiInterface (./interface.ts) {IAutoAction} apiSuccess
     */
    app.ms.api.onAuthorizedPost('user/update-auto-action/:id', async (req, res) => {
        res.send(await autoActionsModule.updateAutoAction(req.user.id, req.params.id, req.body));
    });
}
