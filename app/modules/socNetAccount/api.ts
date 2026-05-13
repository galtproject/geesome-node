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

function getSocNetListFilter(body) {
	if (!body) {
		return null;
	}
	if (body.socNet) {
		return body.socNet;
	}
	if (typeof body.accountData === 'string') {
		return body.accountData;
	}
	return body.accountData?.socNet || null;
}

export default (app: IGeesomeApp, socNetAccount: IGeesomeSocNetAccount) => {
	const api = app.ms.api.prefix('soc-net-account/');

	api.onAuthorizedPost('get', async (req, res) => {
		return res.send(sanitizeSocNetAccount(await socNetAccount.getAccount(req.user.id, req.body.socNet, req.body.accountData)), 200);
	});

	/**
	 * @api {post} /v1/soc-net-account/list List social network accounts
	 * @apiName UserSocNetAccountList
	 * @apiGroup UserSocNetAccount
	 *
	 * @apiUse ApiKey
	 * @apiUse AuthErrors
	 *
	 * @apiInterface (./interface.ts) {ISocNetAccountListInput} apiBody
	 * @apiSuccess {Object[]} list Social network accounts.
	 */
	api.onAuthorizedPost('list', async (req, res) => {
		const accounts = await socNetAccount.getAccountList(req.user.id, getSocNetListFilter(req.body), req.body);
		return res.send(sanitizeSocNetAccounts(accounts), 200);
	});
	api.onAuthorizedPost('update', async (req, res) => {
		return res.send(sanitizeSocNetAccount(await socNetAccount.createOrUpdateAccount(req.user.id, req.body.accountData)), 200);
	});
}
