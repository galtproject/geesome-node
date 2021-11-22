/*
 * Copyright ©️ 2018-2021 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2021 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

const { Api, TelegramClient } = require("telegram");
const { StringSession } = require("telegram/sessions");
const { computeCheck } = require("telegram/Password");
const includes = require('lodash/includes');
const pick = require('lodash/pick');
const find = require('lodash/find');
const max = require('lodash/max');
const isNumber = require('lodash/isNumber');
const Sequelize = require("sequelize");

class Telegram {
	models;

	async init(appApi) {
		let sequelize = new Sequelize('geesome-soc-net', 'geesome', 'geesome', {
			'dialect': 'sqlite',
			'storage': 'data/soc-net-database.sqlite'
		});
		this.models = await require("./database")(sequelize);

		['login', 'account-list', 'get-account', 'get-user', 'update-account', 'channels'].forEach(method => {
			appApi.post('/v1/soc-net/telegram/' + method, async (req, res) => {
				if (!req.user || !req.user.id) {
					return res.send(401);
				}
				if (method === 'login') {
					return res.send(await this.login(req.user.id, req.body), 200);
				}
				if (method === 'get-account') {
					return res.send(await this.models.Account.findOne({where: {userId: req.user.id, id: req.body.userData.id}}), 200);
				}
				if (method === 'account-list') {
					return res.send(await this.models.Account.findAll({where: {userId: req.user.id}}), 200);
				}
				if (method === 'get-user') {
					if (req.body.username === 'me') {
						const client = await this.getClient(req.user.id, req.body.userData);
						return res.send(await client.getMe(), 200);
					} else {
						return this.getUserInfoByUserId(req.user.id, req.body.userData, req.body.username);
					}
				}
				if (method === 'update-account') {
					const client = await this.getClient(req.user.id, req.body.userData);
					const user = await client.getMe();
					const username = user['username'];
					const fullName = res.user['firstName'] + ' ' + res.user['lastName'];
					await this.createOrUpdateAccount({...req.body.userData, userId: req.user.id, username, fullName});
					return res.send(await this.models.Account.findOne({where: {...req.body.userData, userId: req.user.id}}), 200);
				}
				if (method === 'channels') {
					const client = await this.getClient(req.user.id, req.body.userData);
					const channels = await client.invoke(
						new Api.channels.GetAdminedPublicChannels({
							byLocation: false,
							checkLimit: false,
						}) as any
					);
					return res.send(channels.chats, 200);
				}
			});
		});
	}
	async login(userId, loginData) {
		console.log('loginData', loginData);
		let { phoneNumber, apiId, apiHash, password, phoneCode, phoneCodeHash } = loginData;
		apiId = parseInt(apiId);

		const acc = await this.models.Account.findOne({where: {userId, phoneNumber}});
		console.log('acc', JSON.stringify(acc));
		const stringSession = new StringSession(acc && acc.sessionKey ? acc.sessionKey : '');
		const client = new TelegramClient(stringSession, apiId, apiHash, {});

		await client.connect();

		if (phoneCodeHash) {
			let res;
			try {
				res = await client.invoke(new Api.auth.SignIn({ phoneNumber, phoneCodeHash, phoneCode }) as any);
			} catch (e) {
				if (!includes(e.message, 'SESSION_PASSWORD_NEEDED') || !password) {
					throw e;
				}
				const passwordSrpResult = await client.invoke(new Api['account'].GetPassword({}) as any);
				const passwordSrpCheck = await computeCheck(passwordSrpResult, password);
				res = await client.invoke(new Api.auth.CheckPassword({ password: passwordSrpCheck }) as any);
			}
			try {
				const sessionKey = client.session.save();
				const username = res.user ? res.user.username : null;
				const fullName = res.user ? res.user.firstName + ' ' + res.user.lastName: null;
				await this.createOrUpdateAccount({userId, phoneNumber, apiId, apiHash, sessionKey, username, fullName});
			} catch (e) {}
			return res;
		} else {
			const res = await client.sendCode({apiId, apiHash}, phoneNumber);
			try {
				const sessionKey = client.session.save();
				console.log('sendCode sessionKey', sessionKey);
				await this.createOrUpdateAccount({userId, phoneNumber, sessionKey});
			} catch (e) {
				console.error('sendCode error', e);
			}
			return res;
		}
	}
	async createOrUpdateAccount(accData) {
		let where = {userId: accData.userId};
		if (accData.phoneNumber) {
			where['phoneNumber'] = accData.phoneNumber;
		}
		console.log('where', where);
		const userAcc = await this.models.Account.findOne({where});
		return userAcc ? userAcc.update(accData) : this.models.Account.create(accData);
	}
	async getClient(userId, userData = {}) {
		let {sessionKey, apiId, apiHash} = await this.models.Account.findOne({where: {...userData, userId}});
		apiId = parseInt(apiId);
		const session = new StringSession(sessionKey); // You should put your string session here
		const client = new TelegramClient(session, apiId, apiHash, {});
		await client.connect(); // This assumes you have already authenticated with .start()
		return client;
	}
	async getUserInfoByUserId(userId, userData, userName) {
		const client = await this.getClient(userId, userData);
		return this.getUserInfoByClient(client, userName);
	}
	async getUserInfoByClient(client, userName) {
		return {
			client,
			result: await client.invoke(new Api['users'].GetFullUser({ id: userName }))
		}
	}
	async getChannelInfoByUserId(userId, userData, channelName) {
		const client = await this.getClient(userId, userData);
		return this.getChannelInfoByClient(client, channelName);
	}
	async getChannelInfoByClient(client, channelName) {
		return {
			client,
			result: await client.invoke(
				new Api.channels.GetFullChannel({
					channel: channelName,
				})
			)
		}
	}
	async getMessagesByUserId(userId, userData, channelName, messagesIds) {
		const client = await this.getClient(userId, userData);
		return this.getMessagesByClient(client, channelName, messagesIds);
	}
	async getMessagesByClient(client, channelName, messagesIds) {
		return {
			client,
			result: await client.invoke(new Api.channels.GetMessages({ channel: channelName, id: messagesIds }) as any).then(({messages}) => {
				return messages.map(m => {
					console.log('m', m);
					return pick(m, ['id', 'replyTo', 'date', 'message', 'media', 'action', 'groupedId']);
				}).filter(m => m.date);
			})
		};
	}
	async downloadMediaByUserId(userId, userData, media) {
		return this.downloadMediaByClient(await this.getClient(userId, userData), media)
	}
	async downloadMediaByClient(client, media) {
		let file;
		let fileSize: number;
		let mimeType;
		let thumbSize = 'y';
		if (media.photo || (media.webpage && media.webpage.photo)) {
			file = media.photo || media.webpage.photo;
			const ySize = find(file.sizes, s => s.sizes && s.sizes.length) || {sizes: file.sizes};
			if (isNumber(ySize.sizes[0])) {
				fileSize = max(ySize.sizes);
			} else {
				const maxSize = max(ySize.sizes, s => s.size);
				fileSize = maxSize.size
				thumbSize = maxSize.type;
			}
			mimeType = 'image/jpg';
		} else if (media.document) {
			file = media.document;
			fileSize = file.size;
			mimeType = file.mimeType;
		} else {
			// console.log('media', media);
		}
		console.log('media.webpage', media.webpage);
		return {
			client,
			result: {
				mimeType,
				fileSize,
				content: await client.downloadFile(
					new Api[media.document ? 'InputDocumentFileLocation' : 'InputPhotoFileLocation']({
						id: file.id,
						accessHash: file.accessHash,
						fileReference: file.fileReference,
						thumbSize
					}),
					{
						dcId: file.dcId,
						fileSize,
					}
				),
			}
		};
	}
}

module.exports = Telegram;