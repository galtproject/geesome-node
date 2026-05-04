import {IGeesomeApp} from "../../interface.js";
import IGeesomeCommunicatorModule from "./interface.js";

export default (app: IGeesomeApp, communicatorModule: IGeesomeCommunicatorModule) => {
	if (!app.ms.api) {
		return;
	}
	/**
	 * @api {post} /v1/user/export-private-key Export communicator private key
	 * @apiName UserExportPrivateKey
	 * @apiGroup User
	 *
	 * @apiUse ApiKey
	 *
	 * @apiDescription Exports the node/user communicator key material. Treat this response as secret.
	 * @apiSuccess {String} result Marshalled private key.
	 */
	app.ms.api.onAuthorizedPost('user/export-private-key', async (req, res) => {
		res.send({result: (await communicatorModule.keyLookup(req.user.manifestStaticStorageId)).marshal()});
	});
}
