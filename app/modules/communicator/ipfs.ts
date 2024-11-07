import {IGeesomeApp} from "../../interface";
import JsIpfsServiceNode from "geesome-libs/src/JsIpfsServiceNodePass";

export default async (app: IGeesomeApp) => {
    const JsIpfsServiceNodeClass: any = JsIpfsServiceNode(app.ms.storage.node, app.config.storageConfig.jsNode.pass);
    return new JsIpfsServiceNodeClass();
}