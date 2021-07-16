import {IGeesomeApp} from "../../app/interface";
const JsIpfsServiceNode = require("geesome-libs/src/JsIpfsServiceNodePass");

module.exports = async (app: IGeesomeApp) => {
    return new JsIpfsServiceNode(app.storage.node, app.config.storageConfig.jsNode.pass);
}