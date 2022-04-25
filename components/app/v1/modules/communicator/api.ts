import {IGeesomeApp} from "../../../interface";
import IGeesomeCommunicatorModule from "./interface";

module.exports = (app: IGeesomeApp, communicatorModule: IGeesomeCommunicatorModule) => {
	if (!app.api) {
		return;
	}
	app.api.post('/v1/user/export-private-key', async (req, res) => {
		res.send({result: (await communicatorModule.keyLookup(req.user.manifestStaticStorageId)).marshal()});
	});
}
