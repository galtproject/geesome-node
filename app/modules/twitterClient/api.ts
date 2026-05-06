import {IGeesomeApp} from "../../interface";
import IGeesomeTwitterClient from "./interface";

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

function sanitizeLoginResult(result) {
	if (!result) {
		return result;
	}
	const plainResult = {...result};
	delete plainResult.apiKey;
	delete plainResult.sessionKey;
	plainResult.account = sanitizeSocNetAccount(plainResult.account);
	return plainResult;
}

export default (app: IGeesomeApp, twitterClientModule: IGeesomeTwitterClient) => {
	const api = app.ms.api.prefix('soc-net/twitter/');

	api.onAuthorizedPost('login', async (req, res) => {
		return res.send(sanitizeLoginResult(await twitterClientModule.login(req.user.id, req.body)), 200);
	})
	api.onAuthorizedPost('user-info', async (req, res) => {
		if (req.body.username === 'me') {
			return res.send(await twitterClientModule.getMeByUserId(req.user.id, req.body.accountData), 200);
		} else {
			return res.send(await twitterClientModule.getUserInfoByUserId(req.user.id, req.body.accountData, req.body.username), 200);
		}
	});
	api.onAuthorizedPost('channels', async (req, res) => {
		return res.send(await twitterClientModule.getUserChannelsByUserId(req.user.id, req.body.accountData), 200);
	});
	api.onAuthorizedPost('channel-info', async (req, res) => {
		return res.send(await twitterClientModule.getChannelInfoByUserId(req.user.id, req.body.accountData, req.body.channelId), 200);
	});
	api.onAuthorizedPost('run-channel-import', async (req, res) => {
		return res.send(await twitterClientModule.runChannelImport(req.user.id, req.apiKey.id, req.body.accountData, req.body.channelId, req.body.advancedSettings).then(r => r.result), 200);
	});
}
