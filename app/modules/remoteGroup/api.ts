import {IGeesomeApp} from "../../interface";
import IGeesomeRemoteGroupModule from "./interface";

export default (app: IGeesomeApp, remoteGroupModule: IGeesomeRemoteGroupModule) => {

    app.ms.api.onAuthorizedGet('group/:groupId', async (req, res) => {
        res.send(await remoteGroupModule.getLocalOrRemoteGroup(req.user.id, req.params.groupId));
    });
}