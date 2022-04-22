import {IGeesomeApp} from "../../../interface";
import IGeesomeTelegramClient from "./interface";

module.exports = (app: IGeesomeApp, telegramClientModule: IGeesomeTelegramClient, models) => {
	async function wrapApiResult(promise) {
		const {result, client} = await promise;
		await client.disconnect();
		return result;
	}
	['login', 'db-account', 'db-account-list', 'db-channel', 'user-info', 'update-account', 'channels', 'channel-info', 'run-channel-import'].forEach(method => {
		app.api.post('/v1/soc-net/telegram/' + method, async (req, res) => {
			if (!req.user || !req.user.id) {
				return res.send(401);
			}
			const userId = req.user.id;
			if (method === 'login') {
				return res.send(await wrapApiResult(telegramClientModule.login(userId, req.body)), 200);
			}
			if (method === 'db-account') {
				return res.send(await models.Account.findOne({where: {...req.body.accountData, userId}}), 200);
			}
			if (method === 'db-account-list') {
				return res.send(await models.Account.findAll({where: {userId}}), 200);
			}
			if (method === 'db-channel') {
				return res.send(await models.Channel.findOne({where: {...req.body.channelData, userId}}), 200);
			}
			if (method === 'user-info') {
				if (req.body.username === 'me') {
					return res.send(await wrapApiResult(telegramClientModule.getMeByUserId(userId, req.body.accountData)), 200);
				} else {
					return res.send(await wrapApiResult(telegramClientModule.getUserInfoByUserId(userId, req.body.accountData, req.body.username)), 200);
				}
			}
			if (method === 'update-account') {
				const user = await wrapApiResult(telegramClientModule.getMeByUserId(userId, req.body.accountData));
				const username = user['username'];
				const fullName = res.user['firstName'] + ' ' + res.user['lastName'];
				await telegramClientModule.createOrUpdateAccount({...req.body.accountData, userId, username, fullName});
				return res.send(await models.Account.findOne({where: {...req.body.accountData, userId}}), 200);
			}
			if (method === 'channels') {
				return res.send(await wrapApiResult(telegramClientModule.getUserChannelsByUserId(userId, req.body.accountData)), 200);
			}
			if (method === 'channel-info') {
				return res.send(await wrapApiResult(telegramClientModule.getChannelInfoByUserId(userId, req.body.accountData, req.body.channelId)), 200);
			}
			if (method === 'run-channel-import') {
				return res.send(await telegramClientModule.runChannelImport(userId, req.token, req.body.accountData, req.body.channelId).then(r => r.result), 200);
			}
		});
	});
}