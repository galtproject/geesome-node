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
				const userId = req.user.id;
				if (method === 'login') {
					return res.send(await this.wrapApiResult(this.login(userId, req.body)), 200);
				}
				if (method === 'get-account') {
					return res.send(await this.models.Account.findOne({where: {...req.body.userData, userId}}), 200);
				}
				if (method === 'account-list') {
					return res.send(await this.models.Account.findAll({where: {userId}}), 200);
				}
				if (method === 'get-user') {
					if (req.body.username === 'me') {
						return res.send(await this.wrapApiResult(this.getMeByUserId(userId, req.body.userData)), 200);
					} else {
						return res.send(await this.wrapApiResult(this.getUserInfoByUserId(userId, req.body.userData, req.body.username)), 200);
					}
				}
				if (method === 'update-account') {
					const user = await this.wrapApiResult(this.getMeByUserId(userId, req.body.userData));
					const username = user['username'];
					const fullName = res.user['firstName'] + ' ' + res.user['lastName'];
					await this.createOrUpdateAccount({...req.body.userData, userId, username, fullName});
					return res.send(await this.models.Account.findOne({where: {...req.body.userData, userId}}), 200);
				}
				if (method === 'channels') {
					return res.send(await this.wrapApiResult(this.getUserChannelsByUserId(userId, req.body.userData)), 200);
				}
			});
		});
	}
	async login(userId, loginData) {
		console.log('loginData', loginData);
		let { phoneNumber, apiId, apiHash, password, phoneCode, phoneCodeHash, isEncrypted, sessionKey, encryptedSessionKey } = loginData;
		apiId = parseInt(apiId);

		let acc = await this.models.Account.findOne({where: {userId, phoneNumber}});
		sessionKey = sessionKey || (acc && acc.sessionKey) || '';
		const stringSession = new StringSession(sessionKey);
		const client = new TelegramClient(stringSession, apiId, apiHash, {});

		if (isEncrypted) {
			sessionKey = encryptedSessionKey;
		}

		await client.connect();

		let response;
		if (phoneCodeHash) {
			try {
				response = await client.invoke(new Api.auth.SignIn({ phoneNumber, phoneCodeHash, phoneCode }) as any);
			} catch (e) {
				if (!includes(e.message, 'SESSION_PASSWORD_NEEDED') || !password) {
					throw e;
				}
				const passwordSrpResult = await client.invoke(new Api['account'].GetPassword({}) as any);
				const passwordSrpCheck = await computeCheck(passwordSrpResult, password);
				response = await client.invoke(new Api.auth.CheckPassword({ password: passwordSrpCheck }) as any);
			}
			try {
				if (!isEncrypted) {
					sessionKey = client.session.save();
				}
				const username = response.user ? response.user.username : null;
				const fullName = response.user ? response.user.firstName + ' ' + response.user.lastName: null;
				acc = await this.createOrUpdateAccount({userId, phoneNumber, apiId, apiHash, sessionKey, username, fullName, isEncrypted});
			} catch (e) {}
			return { client, result: { response, sessionKey: client.session.save(), account: acc } };
		} else {
			response = await client.sendCode({apiId, apiHash}, phoneNumber);
			try {
				if (!isEncrypted) {
					sessionKey = client.session.save();
				}
				acc = await this.createOrUpdateAccount({userId, phoneNumber, sessionKey, isEncrypted});
			} catch (e) {
				console.error('sendCode error', e);
			}
			return { client, result: { response, sessionKey: client.session.save(), account: acc } };
		}
	}
	async createOrUpdateAccount(accData) {
		let where = {userId: accData.userId};
		if (accData.phoneNumber) {
			where['phoneNumber'] = accData.phoneNumber;
		}
		console.log('where', where);
		const userAcc = await this.models.Account.findOne({where});
		return userAcc ? userAcc.update(accData).then(() => this.models.Account.findOne({where})) : this.models.Account.create(accData);
	}
	async getClient(userId, userData: any = {}) {
		let {sessionKey} = userData;
		delete userData['sessionKey'];
		const acc = await this.models.Account.findOne({where: {...userData, userId}});
		let {apiId, apiHash} = acc;
		if (!sessionKey) {
			sessionKey = acc.sessionKey;
		}
		apiId = parseInt(apiId);
		const client = new TelegramClient(new StringSession(sessionKey), apiId, apiHash, {});
		await client.connect();
		return client;
	}
	async getUserInfoByUserId(userId, userData, userName) {
		return this.getUserInfoByClient(await this.getClient(userId, userData), userName);
	}
	async getUserInfoByClient(client, userName) {
		return {
			client,
			result: await client.invoke(new Api['users'].GetFullUser({ id: userName }))
		}
	}
	async getChannelInfoByUserId(userId, userData, channelName) {
		return this.getChannelInfoByClient(await this.getClient(userId, userData), channelName);
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
		return this.getMessagesByClient(await this.getClient(userId, userData), channelName, messagesIds);
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
	async getMeByUserId(userId, userData) {
		const client = await this.getClient(userId, userData);
		return {
			result: await client.getMe(),
			client
		};
	}
	async getUserChannelsByUserId(userId, userData) {
		const client = await this.getClient(userId, userData);
		const channels = await client.invoke(new Api.messages.GetAllChats({ exceptIds: [] }) as any);
		return {
			result: channels.chats.filter(c => c.className === 'Channel' && !c.megagroup),
			client
		}
	}
	async wrapApiResult(promise) {
		const {result, client} = await promise;
		await client.disconnect();
		return result;
	}
}

module.exports = Telegram;