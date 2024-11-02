import {IGeesomeApp} from "../../interface";


module.exports = async (app: IGeesomeApp) => {
    const JsIpfsServiceNode = (await import("geesome-libs/src/JsIpfsServiceNodePass.js")).default(app.ms.storage.node, app.config.storageConfig.jsNode.pass) as any;
    return new JsIpfsServiceNode();
}