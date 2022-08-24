import {IGeesomeApp} from "../../interface";
import IGeesomeTelegramClient from "./interface";
const _ = require('lodash');

module.exports = (app: IGeesomeApp, telegramClientModule: IGeesomeTelegramClient, models) => {
	const api = app.ms.api.prefix('soc-net/telegram/');

	api.onAuthorizedPost('login', async (req, res) => {
		return res.send(await wrapApiResult(telegramClientModule.login(req.user.id, req.body)), 200);
	});
	api.onAuthorizedPost('db-account', async (req, res) => {
		return res.send(await models.Account.findOne({where: {...req.body.accountData, userId: req.user.id}}), 200);
	});
	api.onAuthorizedPost('db-account-list', async (req, res) => {
		return res.send(await models.Account.findAll({where: {userId: req.user.id}}), 200);
	});
	api.onAuthorizedPost('db-channel', async (req, res) => {
		return res.send(await models.Channel.findOne({where: {...req.body.channelData, userId: req.user.id}}), 200);
	});
	api.onAuthorizedPost('update-db-channel', async (req, res) => {
		const channel = await models.Channel.findOne({where: {..._.pick(req.body.channelData, ['id', 'groupId', 'channelId']), userId: req.user.id}});
		await channel.update(_.pick(req.body.updateData, ['autoImportPeriod', 'autoImportToken']));
		return res.send(await models.Channel.findOne({where: {id: channel.id}}), 200);
	});
	api.onAuthorizedPost('update-db-account', async (req, res) => {
		const account = await models.Account.findOne({where: {..._.pick(req.body.accountData, ['id', 'username', 'phoneNumber', 'apiId']), userId: req.user.id}});
		await account.update(_.pick(req.body.updateData, ['fullName', 'type', 'isEncrypted']));
		return res.send(await models.Account.findOne({where: {id: account.id}}), 200);
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
		await telegramClientModule.createOrUpdateAccount({...req.body.accountData, userId: req.user.id, username, fullName});
		return res.send(await models.Account.findOne({where: {...req.body.accountData, userId: req.user.id}}), 200);
	});
	api.onAuthorizedPost('channels', async (req, res) => {
		return res.send(await wrapApiResult(telegramClientModule.getUserChannelsByUserId(req.user.id, req.body.accountData)), 200);
	});
	api.onAuthorizedPost('channel-info', async (req, res) => {
		return res.send(await wrapApiResult(telegramClientModule.getChannelInfoByUserId(req.user.id, req.body.accountData, req.body.channelId)), 200);
	});
	api.onAuthorizedPost('run-channel-import', async (req, res) => {
		return res.send(await telegramClientModule.runChannelImport(req.user.id, req.apiKey, req.body.accountData, req.body.channelId, req.body.advancedSettings).then(r => r.result), 200);
	});

	async function wrapApiResult(promise) {
		const {result, client, error} = await promise.catch(error => ({error}));
		if (error) {
			throw error;
		}
		if (client) {
			await client.disconnect();
		}
		return result;
	}
}