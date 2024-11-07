import {IGeesomeApp} from "../../interface";
import IGeesomeForeignAccountsModule from "./interface";
import {CorePermissionName} from "../database/interface";

export default (app: IGeesomeApp, foreignAccountsModule: IGeesomeForeignAccountsModule) => {
	app.ms.api.onAuthorizedPost('user/set-account', async (req, res) => {
		res.send(await foreignAccountsModule.setUserAccounts(req.user.id, [req.body]));
	});

	app.ms.api.onAuthorizedGet('user/get-accounts', async (req, res) => {
		res.send(await foreignAccountsModule.getUserAccountsList(req.user.id));
	});

	app.ms.api.onAuthorizedPost('admin/get-user-account', async (req, res) => {
		if (!await app.isAdminCan(req.user.id, CorePermissionName.AdminRead)) {
			return res.send(403);
		}
		res.send(await foreignAccountsModule.getUserAccountByAddress(req.body.provider, req.body.address));
	});
}
