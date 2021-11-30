/*
 * Copyright ©️ 2018-2021 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2021 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

import {GroupType} from "../../database/interface";

const { Api, TelegramClient } = require("telegram");
const { StringSession } = require("telegram/sessions");
const { computeCheck } = require("telegram/Password");
const pIteration = require('p-iteration');
const includes = require('lodash/includes');
const pick = require('lodash/pick');
const find = require('lodash/find');
const max = require('lodash/max');
const isNumber = require('lodash/isNumber');
const Sequelize: any = require("sequelize");
const commonHelper = require('geesome-libs/src/common');
const bigInt = require('big-integer');

class Telegram {
	models;
	app;

	async init(app) {
		this.app = app;

		let sequelize = new Sequelize('geesome-soc-net', 'geesome', 'geesome', {
			'dialect': 'sqlite',
			'storage': 'data/soc-net-database.sqlite'
		});
		this.models = await require("./database")(sequelize);

		['login', 'db-account', 'db-account-list', 'db-channel', 'get-user', 'update-account', 'channels', 'channel-info', 'run-channel-import'].forEach(method => {
			app.api.post('/v1/soc-net/telegram/' + method, async (req, res) => {
				if (!req.user || !req.user.id) {
					return res.send(401);
				}
				const userId = req.user.id;
				if (method === 'login') {
					return res.send(await this.wrapApiResult(this.login(userId, req.body)), 200);
				}
				if (method === 'db-account') {
					return res.send(await this.models.Account.findOne({where: {...req.body.accountData, userId}}), 200);
				}
				if (method === 'db-account-list') {
					return res.send(await this.models.Account.findAll({where: {userId}}), 200);
				}
				if (method === 'db-channel') {
					return res.send(await this.models.Channel.findOne({where: {...req.body.channelData, userId}}), 200);
				}
				if (method === 'user-info') {
					if (req.body.username === 'me') {
						return res.send(await this.wrapApiResult(this.getMeByUserId(userId, req.body.accountData)), 200);
					} else {
						return res.send(await this.wrapApiResult(this.getUserInfoByUserId(userId, req.body.accountData, req.body.username)), 200);
					}
				}
				if (method === 'update-account') {
					const user = await this.wrapApiResult(this.getMeByUserId(userId, req.body.accountData));
					const username = user['username'];
					const fullName = res.user['firstName'] + ' ' + res.user['lastName'];
					await this.createOrUpdateAccount({...req.body.accountData, userId, username, fullName});
					return res.send(await this.models.Account.findOne({where: {...req.body.accountData, userId}}), 200);
				}
				if (method === 'channels') {
					return res.send(await this.wrapApiResult(this.getUserChannelsByUserId(userId, req.body.accountData)), 200);
				}
				if (method === 'channel-info') {
					return res.send(await this.wrapApiResult(this.getChannelInfoByUserId(userId, req.body.accountData, req.body.channelId)), 200);
				}
				if (method === 'run-channel-import') {
					return res.send(await this.runChannelImport(userId, req.token, req.body.accountData, req.body.channelId).then(r => r.result), 200);
				}
			});
		});
	}
	async login(userId, loginData) {
		console.log('loginData', loginData);
		let { phoneNumber, apiId, apiHash, password, phoneCode, phoneCodeHash, isEncrypted, sessionKey, encryptedSessionKey } = loginData;
		apiId = parseInt(apiId);

		let acc = await this.models.Account.findOne({where: {userId, phoneNumber}});
		sessionKey = isEncrypted ? sessionKey : (acc && acc.sessionKey || '');
		console.log('1 sessionKey', sessionKey);
		const stringSession = new StringSession(sessionKey);
		const client = new TelegramClient(stringSession, apiId, apiHash, {});

		console.log('encryptedSessionKey', encryptedSessionKey);
		if (isEncrypted) {
			sessionKey = encryptedSessionKey;
		}
		console.log('2 sessionKey', sessionKey);

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
				console.log('3 sessionKey', sessionKey);
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
		console.log('where', where, 'accData', accData);
		const userAcc = await this.models.Account.findOne({where});
		return userAcc ? userAcc.update(accData).then(() => this.models.Account.findOne({where})) : this.models.Account.create(accData);
	}
	async getClient(userId, accData: any = {}) {
		let {sessionKey} = accData;
		delete accData['sessionKey'];
		const acc = await this.models.Account.findOne({where: {...accData, userId}});
		let {apiId, apiHash} = acc;
		if (!sessionKey) {
			sessionKey = acc.sessionKey;
		}
		apiId = parseInt(apiId);
		const client = new TelegramClient(new StringSession(sessionKey), apiId, apiHash, {});
		await client.connect();
		return client;
	}
	async getUserInfoByUserId(userId, accData, userName) {
		return this.getUserInfoByClient(await this.getClient(userId, accData), userName);
	}
	async getUserInfoByClient(client, userName) {
		return {
			client,
			result: await client.invoke(new Api['users'].GetFullUser({ id: userName }))
		}
	}
	async getChannelInfoByUserId(userId, accData, channelId) {
		return this.getChannelInfoByClient(await this.getClient(userId, accData), channelId);
	}
	async getChannelLastMessageId(client, channel) {
		const channelHistory = await client.invoke(
			new Api.messages.GetHistory({
				peer: channel,
				offsetId: 0,
				offsetDate: 2147483647,
				addOffset: 0,
				limit: 1,
				maxId: 0,
				minId: 0,
				hash: 0,
			})
		);
		return channelHistory.messages[0].id;
	}
	async getChannelEntity(client, channelId) {
		return client.getInputEntity(
			new Api['PeerChannel']({ channelId: parseInt(channelId), accessHash: bigInt.zero })
		);
	}
	async getChannelInfoByClient(client, channelId) {
		const channel = await this.getChannelEntity(client, channelId);
		const [response, messagesCount] = await Promise.all([
			client.invoke(new Api.channels.GetFullChannel({channel})).then(r => r.chats),
			this.getChannelLastMessageId(client, channel),
		]);

		return {
			client,
			result: {
				...response[0],
				chat: response[1],
				messagesCount
			}
		}
	}
	async getMessagesByUserId(userId, accData, channelName, messagesIds) {
		return this.getMessagesByClient(await this.getClient(userId, accData), channelName, messagesIds);
	}
	async getMessagesByClient(client, channelId, messagesIds) {
		let channel = channelId;
		if (commonHelper.isNumber(channel)) {
			channel = await this.getChannelEntity(client, channelId);
		}
		return {
			client,
			result: await client.invoke(new Api.channels.GetMessages({ channel, id: messagesIds }) as any).then(({messages}) => {
				return messages
					.map(m => pick(m, ['id', 'replyTo', 'date', 'message', 'media', 'action', 'groupedId']))
					.filter(m => m.date);
			})
		};
	}
	async downloadMediaByUserId(userId, accData, media) {
		return this.downloadMediaByClient(await this.getClient(userId, accData), media)
	}
	async downloadMediaByClient(client, media) {
		let file;
		let fileSize: number;
		let mimeType;
		let thumbSize = 'y';
		if (media.photo || (media.webpage && media.webpage.photo)) {
			file = media.photo || media.webpage.photo;
			const ySize = find(file.sizes, s => s.sizes && s.sizes.length) || {sizes: file.sizes};
			console.log('ySize', ySize);
			if (isNumber(ySize.sizes[0])) {
				fileSize = max(ySize.sizes);
			} else {
				const maxSize = max(ySize.sizes.filter(s => s.size), s => s.size);
				console.log('maxSize', maxSize);
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
		console.log('file', file, 'thumbSize', thumbSize, 'fileSize', fileSize);
		if (!file) {
			return {
				client,
				result: null
			}
		}
		return {
			client,
			result: {
				mimeType,
				fileSize,
				content: await client.downloadFile(
					new Api[media.document ? 'InputDocumentFileLocation' : 'InputPhotoFileLocation']({
						...pick(file, ['id', 'accessHash', 'fileReference']),
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
	async getMeByUserId(userId, accData) {
		const client = await this.getClient(userId, accData);
		return {
			result: await client.getMe(),
			client
		};
	}
	async getUserChannelsByUserId(userId, accData) {
		const client = await this.getClient(userId, accData);
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

	async runChannelImport(userId, apiKey, accData, channelId) {
		console.log('runChannelImport', userId, apiKey, accData, channelId);
		const {client, result: channel} = await this.getChannelInfoByUserId(userId, accData, channelId);
		console.log('runChannelImport 2', channel);

		let dbChannel = await this.models.Channel.findOne({where: {userId, channelId: channel.id}});
		let group;
		if (dbChannel) {
			group = await this.app.getGroup(dbChannel.groupId);
		} else {
			group = await this.app.createGroup(userId, {
				name: channel.username,
				title: channel.title,
				isPublic: true,
				type: GroupType.Channel
			});
			dbChannel = await this.models.Channel.create({
				userId,
				groupId: group.id,
				channelId: channel.id,
				title: channel.title,
				lastMessageId: 0,
				postsCounts: 0,
			});
		}

		const lastMessageId = channel.messagesCount;
		if (dbChannel.lastMessageId === lastMessageId) {
			throw new Error('already_done');
		}

		const asyncOperation = await this.app.database.addUserAsyncOperation({
			userId,
			userApiKeyId: await this.app.getApyKeyId(apiKey),
			name: 'run-telegram-channel-import',
			inProcess: true,
			channel: 'id:' + dbChannel.id + ';op:' + await commonHelper.random()
		});

		const startMessageId = dbChannel ? dbChannel.lastMessageId : 0;
		const totalCountToFetch = lastMessageId - startMessageId;
		let currentMessageId = startMessageId;
		(async () => {
			while (currentMessageId < lastMessageId) {
				let countToFetch = lastMessageId - currentMessageId;
				if (countToFetch > 50) {
					countToFetch = 50;
				}
				await this.importChannelPosts(client, userId, group.id, dbChannel, currentMessageId + 1, countToFetch, (m, post) => {
					currentMessageId = m.id;
					dbChannel.update({ lastMessageId: currentMessageId });
					return this.app.database.updateUserAsyncOperation(asyncOperation.id, {
						percent: (1 - (lastMessageId - currentMessageId) / totalCountToFetch) * 100
					});
				});
			}
		})().then(() => {
			return this.app.database.updateUserAsyncOperation(asyncOperation.id, {
				percent: 100,
				inProcess: false,
				finishedAt: new Date()
			});
		}).catch((e) => {
			console.error('run-telegram-channel-import error', e);
			return this.app.database.updateUserAsyncOperation(asyncOperation.id, {
				inProcess: false,
				errorMessage: e.message
			});
		});

		return {
			result: {asyncOperation},
			client
		}
	}

	async importChannelPosts(client, userId, groupId, dbChannel, startPost = 1, postsCount = 50, onMessageProcess = null) {
		const messagesIds = Array.from({length: postsCount}, (_, i) => i + startPost);
		const dbChannelId = dbChannel.id;

		let groupedId = null;
		let groupedReplyTo = null;
		let groupedDate = null;
		let groupedContent = [];
		let groupedMessageIds = [];
		const {result: messages} = await this.getMessagesByClient(client, dbChannel.channelId, messagesIds);
		await pIteration.forEachSeries(messages, async (m, i) => {
			const msgId = m.id;
			const existsChannelMessage = await this.models.Message.findOne({where: {msgId, dbChannelId, userId}});
			if (existsChannelMessage) {
				return onMessageProcess(m, null);
			}
			let contents = [];

			console.log('m', m);
			if (m.media) {
				if (m.media.poll) {
					//TODO: handle and save polls (325)
					return;
				}
				const {result: file} = await this.downloadMediaByClient(client, m.media);
				if (file && file.content) {
					const content = await this.app.saveData(file.content, '', { mimeType: file.mimeType, userId });
					contents.push(content);
				}

				if (m.media.webpage && m.media.webpage.url) {
					//TODO: add view type - link
					const content = await this.app.saveData(m.media.webpage.url, '', {mimeType: 'text/plain', userId });
					contents.push(content);
				}
			}

			if (m.message) {
				const content = await this.app.saveData(m.message, '', { mimeType: 'text/plain', userId });
				contents.push(content);
			}

			const properties = {
				source: 'telegram',
				date: groupedDate || m.date,
				originalUrl: '',
				msgId: groupedMessageIds.length ? groupedMessageIds[0] : msgId
			};
			if (groupedReplyTo) {
				properties['replyToMsgId'] = groupedReplyTo;
			} else if (m.replyTo) {
				properties['replyToMsgId'] = m.replyTo.replyToMsgId;
			}
			if (groupedMessageIds.length) {
				properties['groupedMsgIds'] = groupedMessageIds;
			}

			const postData = {
				groupId,
				status: 'published',
				propertiesJson: JSON.stringify(properties)
			}

			let post;
			console.log('m.groupedId', m.groupedId && m.groupedId.toString());
			if (
				(groupedId && !m.groupedId) || // group ended
				(groupedId && m.groupedId && m.groupedId.toString() !== groupedId) || // new group
				i === messages.length - 1 // messages end
			) {
				let postId = null;
				if (groupedContent.length) {
					post = await this.app.createPost(userId, {
						publishedAt: groupedDate * 1000,
						contents: groupedContent,
						...postData
					});
					postId = post.id;
				}

				await pIteration.forEach(groupedMessageIds,
					(msgId) => this.models.Message.create({msgId, dbChannelId, userId, groupedId, postId, replyToMsgId: groupedReplyTo})
				);

				groupedContent = [];
				groupedMessageIds = [];
				groupedId = null;
				groupedDate = null;
				groupedReplyTo = null;
			}

			if (m.groupedId) {
				groupedContent = groupedContent.concat(contents);
				groupedMessageIds.push(msgId);
				groupedId = m.groupedId.toString();
				groupedDate = m.date;
				if (m.replyTo) {
					groupedReplyTo = m.replyTo.replyToMsgId;
				}
			} else if (contents.length) {
				post = await this.app.createPost(userId, {
					publishedAt: m.date * 1000,
					contents,
					...postData
				});
				this.models.Message.create({msgId, dbChannelId, userId, groupedId, post: post.id, replyToMsgId: properties['replyToMsgId']});
			} else {
				this.models.Message.create({msgId, dbChannelId, userId, groupedId, replyToMsgId: properties['replyToMsgId']});
			}
			if (onMessageProcess) {
				onMessageProcess(m, post);
			}
		});
	}
}

module.exports = Telegram;