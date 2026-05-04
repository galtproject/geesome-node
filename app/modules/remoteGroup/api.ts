import {IGeesomeApp} from "../../interface.js";
import IGeesomeRemoteGroupModule from "./interface.js";

export default (app: IGeesomeApp, remoteGroupModule: IGeesomeRemoteGroupModule) => {

    /**
     * @api {get} /v1/group/:groupId Get local or remote group
     * @apiName RemoteGroupGet
     * @apiGroup Group
     *
     * @apiUse ApiKey
     * @apiUse AuthErrors
     * @apiUse ValidationErrors
     *
     * @apiParam {String} groupId Group database id, storage id, or remote id.
     * @apiInterface (../group/interface.ts) {IGroupApiResponse} apiSuccess
     */
    app.ms.api.onAuthorizedGet('group/:groupId', async (req, res) => {
        res.send(await remoteGroupModule.getLocalOrRemoteGroup(req.user.id, req.params.groupId));
    });
}
