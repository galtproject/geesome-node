import {IGeesomeApp} from "../../interface.js";
import IGeesomeCommunicatorModule from "./interface.js";

export default (app: IGeesomeApp, communicatorModule: IGeesomeCommunicatorModule) => {
	if (!app.ms.api) {
		return;
	}
	app.ms.api.onAuthorizedPost('user/export-private-key', async (req, res) => {
		res.send({result: (await communicatorModule.keyLookup(req.user.manifestStaticStorageId)).marshal()});
	});
}
