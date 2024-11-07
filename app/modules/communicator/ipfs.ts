import {IGeesomeApp} from "../../interface.js";
import JsIpfsServiceNode from "geesome-libs/src/JsIpfsServiceNodePass.js";

export default async (app: IGeesomeApp) => {
    const JsIpfsServiceNodeClass: any = JsIpfsServiceNode(app.ms.storage.node, app.config.storageConfig.jsNode.pass);
    return new JsIpfsServiceNodeClass();
}