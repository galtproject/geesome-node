import {IGeesomeApp} from "../../interface.js";
import IGeesomeSocNetImport from "./interface.js";

export default (app: IGeesomeApp, socNetImport: IGeesomeSocNetImport) => {
	const api = app.ms.api.prefix('soc-net-import/');

	api.onAuthorizedPost('get-channel', async (req, res) => {
		return res.send(await socNetImport.getDbChannel(req.user.id, req.body.channelData), 200);
	});
}