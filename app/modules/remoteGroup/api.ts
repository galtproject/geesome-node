import {IGeesomeApp} from "../../interface";
import IGeesomeRemoteGroupModule from "./interface";

module.exports = (app: IGeesomeApp, remoteGroupModule: IGeesomeRemoteGroupModule) => {

    app.ms.api.onGet('group/:groupId', async (req, res) => {
        res.send(await remoteGroupModule.getLocalOrRemoteGroup(req.user.id, req.params.groupId));
    });
}