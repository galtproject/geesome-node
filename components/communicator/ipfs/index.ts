import {IGeesomeApp} from "../../app/interface";
const JsIpfsServiceNode = require("geesome-libs/src/JsIpfsServiceNode");

module.exports = async (app: IGeesomeApp) => {
    return new JsIpfsServiceNode(app.storage.node);
}