import {IGeesomeApp} from "../../interface.js";
import IGeesomeTelegramClient from "./interface.js";

export default (app: IGeesomeApp, telegramClientModule: IGeesomeTelegramClient) => {
	const api = app.ms.api.prefix('soc-net/telegram/');

	api.onAuthorizedPost('login', async (req, res) => {
		return res.send(await wrapApiResult(telegramClientModule.login(req.user.id, req.body)), 200);
	});
	api.onAuthorizedPost('user-info', async (req, res) => {
		if (req.body.username === 'me') {
			return res.send(await wrapApiResult(telegramClientModule.getMeByUserId(req.user.id, req.body.accountData)), 200);
		} else {
			return res.send(await wrapApiResult(telegramClientModule.getUserInfoByUserId(req.user.id, req.body.accountData, req.body.username)), 200);
		}
	});
	api.onAuthorizedPost('update-account', async (req, res) => {
		const user = await wrapApiResult(telegramClientModule.getMeByUserId(req.user.id, req.body.accountData));
		const username = user['username'];
		const fullName = res.user['firstName'] + ' ' + res.user['lastName'];
		return res.send(await telegramClientModule.createOrUpdateAccount(req.user.id, {...req.body.accountData, userId: req.user.id, username, fullName}), 200);
	});
	api.onAuthorizedPost('channels', async (req, res) => {
		return res.send(await wrapApiResult(telegramClientModule.getUserChannelsByUserId(req.user.id, req.body.accountData)), 200);
	});
	api.onAuthorizedPost('channel-info', async (req, res) => {
		return res.send(await wrapApiResult(telegramClientModule.getChannelInfoByUserId(req.user.id, req.body.accountData, req.body.channelId)), 200);
	});
	api.onAuthorizedPost('run-channel-import', async (req, res) => {
		return res.send(await telegramClientModule.runChannelImport(req.user.id, req.apiKey.id, req.body.accountData, req.body.channelId, req.body.advancedSettings).then(r => r.result), 200);
	});

	async function wrapApiResult(promise) {
		const {result, client, error} = await promise.catch(error => ({error}));
		if (error) {
			if (result) {
				result.error = error;
			} else {
				throw error;
			}
		}
		if (client) {
			await client.disconnect();
		}
		return result;
	}
}