import {IGeesomeApp} from "../../interface.js";
import IGeesomeSocNetAccount from "./interface.js";

function sanitizeSocNetAccount(account) {
	if (!account) {
		return account;
	}
	const plainAccount = account.toJSON ? account.toJSON() : {...account};
	plainAccount.hasApiKey = !!plainAccount.apiKey;
	plainAccount.hasAccessToken = !!plainAccount.accessToken;
	plainAccount.hasSessionKey = !!plainAccount.sessionKey;
	delete plainAccount.apiKey;
	delete plainAccount.accessToken;
	delete plainAccount.sessionKey;
	return plainAccount;
}

function sanitizeSocNetAccounts(accounts) {
	return accounts.map(sanitizeSocNetAccount);
}

export default (app: IGeesomeApp, socNetAccount: IGeesomeSocNetAccount) => {
	const api = app.ms.api.prefix('soc-net-account/');

	api.onAuthorizedPost('get', async (req, res) => {
		return res.send(sanitizeSocNetAccount(await socNetAccount.getAccount(req.user.id, req.body.socNet, req.body.accountData)), 200);
	});
	api.onAuthorizedPost('list', async (req, res) => {
		return res.send(sanitizeSocNetAccounts(await socNetAccount.getAccountList(req.user.id, req.body.accountData)), 200);
	});
	api.onAuthorizedPost('update', async (req, res) => {
		return res.send(sanitizeSocNetAccount(await socNetAccount.createOrUpdateAccount(req.user.id, req.body.accountData)), 200);
	});
}
