/*
 * Copyright ©️ 2018-2021 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2021 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

import {IGeesomeApp} from "../../interface";
import IGeesomeSocNetImport from "../socNetImport/interface";
import IGeesomeSocNetAccount from "../socNetAccount/interface";
import {TelegramImportClient} from "./importClient";

const {Api, TelegramClient} = require("telegram");
const {StringSession} = require("telegram/sessions");
const {computeCheck} = require("telegram/Password");
const includes = require('lodash/includes');
const pick = require('lodash/pick');
const commonHelper = require('geesome-libs/src/common');
const bigInt = require('big-integer');
const telegramHelpers = require('./helpers');

module.exports = async (app: IGeesomeApp) => {
	const module = getModule(app);

	require('./api')(app, module);

	return module;
}

function getModule(app: IGeesomeApp) {
	app.checkModules(['asyncOperation', 'group', 'content', 'socNetAccount', 'socNetImport']);

	const socNet = 'telegram';
	const socNetImport = app.ms['socNetImport'] as IGeesomeSocNetImport;
	const socNetAccount = app.ms['socNetAccount'] as IGeesomeSocNetAccount;

	class TelegramClientModule {
		async login(userId, loginData) {
			let {id: accountId, phoneNumber, apiId, apiKey, password, dcId, qrToken, phoneCode, phoneCodeHash, isEncrypted, sessionKey, encryptedSessionKey, stage, forceSMS, byQrCode} = loginData;
			console.log('apiKey', apiKey);
			apiId = parseInt(apiId);
			stage = parseInt(stage);
			let acc;
			if (accountId) {
				acc = await socNetAccount.getAccount(userId, socNet, {id: accountId});
			}
			if (!acc && phoneNumber) {
				acc = await socNetAccount.getAccount(userId, socNet, {phoneNumber});
			}

			sessionKey = isEncrypted ? sessionKey : (acc && acc.sessionKey || '');
			const stringSession = new StringSession(sessionKey);
			const client = new TelegramClient(stringSession, apiId, apiKey, {});

			if (isEncrypted) {
				sessionKey = encryptedSessionKey;
			}
			if (stage === 1) {
				sessionKey = '';
			}

			await client.connect();

			const handleAuthorized = async (response) => {
				const {user} = response;
				if (!isEncrypted) {
					sessionKey = client.session.save();
				}
				console.log('user', user);
				const username = user ? user.username : null;
				const fullName = user ? user['firstName'] + ' ' + user['lastName'] : null;
				try {
					acc = await socNetAccount.createOrUpdateAccount(userId, {
						id: acc ? acc.id : null,
						accountId: user.id.toString(),
						phoneNumber,
						apiId,
						apiKey,
						sessionKey,
						username,
						fullName,
						isEncrypted,
						socNet,
					});
				} catch (e) {
					console.warn('handleAuthorized createOrUpdateAccount', e);
				}
				// console.log('getUserChannelsByUserId', await this.getUserChannelsByUserId(acc.userId, {sessionKey: client.session.save(), id: acc.id}).then(r => r.result.length));
				return {client, result: {response, sessionKey: client.session.save(), account: acc}};
			}

			const handlePasswordAuth = async (response, promise) => {
				try {
					return await promise;
				} catch (error) {
					if (!includes(error.message, 'SESSION_PASSWORD_NEEDED')) {
						throw error;
					}
					console.error('handlePasswordAuth', error);
					if (!password) {
						if (response.token) {
							response = {
								...response,
								token: response.token.toString("base64url"),
							}
						}
						return {client, error: error.message, result: {response, sessionKey: client.session.save(), account: acc}};
					}
					const passwordSrpResult = await client.invoke(new Api['account'].GetPassword({}) as any);
					const passwordSrpCheck = await computeCheck(passwordSrpResult, password);
					const result = await client.invoke(new Api.auth.CheckPassword({password: passwordSrpCheck}) as any);
					return handleAuthorized(result);
				}
			};

			let response;
			if (phoneCodeHash) {
				return handlePasswordAuth(
					response,
					client.invoke(new Api.auth.SignIn({phoneNumber, phoneCodeHash, phoneCode}) as any)
						.then(response => handleAuthorized(response))
				);
			}

			if (byQrCode) {
				let response = await client.invoke(new Api.auth.ExportLoginToken({
					apiId: Number(apiId),
					apiHash: apiKey,
					exceptIds: [],
				}) as any);
				dcId = response.dcId;
				qrToken = response.token.toString("base64url");

				if (stage === 1) {
					if (!(response instanceof Api.auth.LoginToken)) {
						throw new Error("Unexpected");
					}
					// const { token, expires } = response;
					if (!isEncrypted) {
						sessionKey = client.session.save();
					}
					acc = await socNetAccount.createOrUpdateAccount(userId, {
						id: acc ? acc.id : null,
						apiId,
						apiKey,
						sessionKey,
						isEncrypted,
						socNet
					});
					const token = response.token.toString("base64url");
					response = {
						...response,
						token,
						url: `tg://login?token=${token}`
					}
					return {client, result: {response, sessionKey: client.session.save(), account: acc}};
				} else {
					if (
						response instanceof Api.auth.LoginTokenSuccess &&
						response.authorization instanceof Api.auth.Authorization
					) {
						return handleAuthorized(response.authorization);
					} else if (response instanceof Api.auth.LoginTokenMigrateTo) {
						await client._switchDC(dcId);
						return handlePasswordAuth(
							response,
							client.invoke(new Api.auth.ImportLoginToken({token: Buffer.from(qrToken, 'base64')}) as any)
								.then(res => handleAuthorized(res.authorization))
						);
					} else {
						console.log('response', response);
						throw new Error("QR_CODE_DIDNT_SCANNED");
					}
				}
			} else {
				response = await client.sendCode({apiId, apiHash: apiKey}, phoneNumber, forceSMS);
				try {
					if (!isEncrypted) {
						sessionKey = client.session.save();
					}
					const existAccount = await socNetAccount.getAccount(userId, socNet, {phoneNumber});
					acc = await this.createOrUpdateAccount(userId, {
						id: existAccount ? existAccount.id : null,
						phoneNumber,
						sessionKey,
						isEncrypted,
						socNet
					});
				} catch (e) {
					console.error('sendCode error', e);
				}
				return {client, result: {response, sessionKey: client.session.save(), account: acc}};
			}
		}

		createOrUpdateAccount(userId, accData) {
			return socNetAccount.createOrUpdateAccount(userId, accData);
		}

		async getClient(userId, accData: any = {}) {
			let {sessionKey} = accData;
			delete accData['sessionKey'];
			delete accData['apiKey'];
			const acc = await socNetAccount.getAccount(userId, socNet, accData);
			let {apiId, apiKey: apiHash} = acc;
			if (!sessionKey) {
				sessionKey = acc.sessionKey;
			}
			const client = new TelegramClient(new StringSession(sessionKey), parseInt(apiId, 10), apiHash, {});
			client['account'] = acc;
			await client.connect();
			return client;
		}

		async getUserInfoByUserId(userId, accData, userName) {
			return this.getUserInfoByClient(await this.getClient(userId, accData), userName);
		}

		async getUserInfoByClient(client, userName) {
			return {
				client,
				result: await client.invoke(new Api['users'].GetFullUser({id: userName}))
			}
		}

		async getChannelInfoByUserId(userId, accData, channelId) {
			return this.getChannelInfoByClient(await this.getClient(userId, accData), channelId);
		}

		async getChannelInfoByClient(client, channelId) {
			console.log('getChannelInfoByClient', channelId);
			const channel = await this.getChannelEntity(client, channelId);
			const [response, messagesCount] = await Promise.all([
				client.invoke(new Api.channels.GetFullChannel({channel})),
				this.getChannelLastMessageId(client, channel),
			]);
			const {chats, fullChat} = response;

			return {
				client,
				result: {
					...chats[0],
					photo: fullChat['chatPhoto'],
					about: fullChat['about'],
					chat: chats[1],
					messagesCount
				}
			}
		}

		async getChannelEntity(client, channelId) {
			return client.getInputEntity(
				new Api['PeerChannel']({channelId: parseInt(channelId), accessHash: bigInt.zero})
			);
		}

		async getChannelLastMessageId(client, channel) {
			const channelHistory = await client.invoke(
				new Api.messages.GetHistory({peer: channel, offsetId: 0, offsetDate: 2147483647, addOffset: 0, limit: 1, maxId: 0, minId: 0, hash: 0})
			);
			return channelHistory.messages[0].id;
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
				result: await client.invoke(new Api.channels.GetMessages({ channel, id: messagesIds }) as any)
					.then((data) => {
						const {chats, users, messages} = data;
						const authorById = {};
						chats.forEach(chat => authorById[chat.id.toString()] = chat);
						users.forEach(user => authorById[user.id.toString()] = user);
						return { authorById, list: messages.map(m => pick(m, telegramHelpers.importFields)) };
					})
			};
		}

		async getMessageLink(client, channelId, messageId) {
			console.log('getMessageLink', channelId, messageId);
			let channel = channelId;
			if (commonHelper.isNumber(channel)) {
				channel = await this.getChannelEntity(client, channelId);
			}
			messageId = parseInt(messageId);
			console.log('channelId', channelId, 'messageId', messageId);
			return client.invoke(new Api.channels.ExportMessageLink({
				channel,
				id: messageId,
				thread: true,
			})).then(r => r.link).catch(e => {
				console.error('getMessageLink Error', 'channelId', channelId, 'messageId', messageId, 'e', e.message);
				return null;
			});
		}

		async downloadMediaByUserId(userId, accData, media) {
			return this.downloadMediaByClient(await this.getClient(userId, accData), media)
		}

		async downloadMediaByClient(client, media) {
			const {file, fileSize, mimeType, thumbSize} = telegramHelpers.getMediaFileAndSize(media);
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
						new Api[media.document ? 'InputDocumentFileLocation' : 'InputPhotoFileLocation']({...pick(file, ['id', 'accessHash', 'fileReference']), thumbSize}),
						{dcId: file.dcId, fileSize}
					),
				}
			};
		}

		async getMeByUserId(userId, accData) {
			const client = await this.getClient(userId, accData);
			return this.getMeByClient(client);
		}

		async getMeByClient(client) {
			return {result: await client.getMe(), client};
		}

		async getUserChannelsByUserId(userId, accData) {
			const client = await this.getClient(userId, accData);
			const limit = 100;
			const offsetId = 0;
			const offsetPeer = new Api['InputPeerEmpty']();

			let resultCount = limit;
			let offsetDate = 0;
			let chats = [];

			while (resultCount >= limit) {
				const result = await client.invoke(new Api.messages.GetDialogs({ offsetId, offsetPeer, offsetDate, limit }) as any);
				resultCount = result.dialogs.length;
				console.log('result.chats', JSON.stringify((result.chats || []).map(c => c.title), null, ' '));
				if (result.chats && result.chats.length > 0) {
					chats = [...chats, ...result.chats];
				}
				if (result.messages.length > 0) {
					offsetDate = result.messages[result.messages.length - 1].date;
				} else {
					break;
				}
			}
			return {result: chats.filter(c => c.className === 'Channel' && !c.megagroup), client}
		}

		isAutoActionAllowed(userId, funcName, funcArgs) {
			return includes(['runChannelImportAndWaitForFinish'], funcName);
		}

		async runChannelImportAndWaitForFinish(userId, userApiKeyId, accData, channelId, advancedSettings: any = {}) {
			const {result: { asyncOperation }, client} = await this.runChannelImport(userId, userApiKeyId, accData, channelId, advancedSettings).then(r => r);
			return app.ms.asyncOperation.waitForImportAsyncOperation(asyncOperation).then(() => {
				return client.disconnect();
			});
		}

		async storeChannelToChannelDb(client, userId, channelId, updateData: any = {isCollateral: false}) {
			const [{result: channel}, {result: user}] = await Promise.all([
				this.getChannelInfoByClient(client, channelId),
				this.getMeByClient(client)
			]);
			return this.storeChannelObjToChannelDb(client, userId, channel, user.langCode, updateData);
		}

		async storeChannelObjToChannelDb(client, userId, channelObj, lang, updateData) {
			const {account} = client;
			const {result: avatarFile} = await this.downloadMediaByClient(client, channelObj);
			let avatarContent;
			if (avatarFile) {
				avatarContent = await app.ms.content.saveData(userId, avatarFile.content, '', {mimeType: avatarFile.mimeType, userId});
			}
			const dbChannel = await socNetImport.importChannelMetadata(userId, socNet, account.id, {
				...channelObj,
				lang
			}, {
				...updateData,
				avatarImageId: avatarContent ? avatarContent.id : null
			});
			return {client, dbChannel, channel: channelObj}
		}

		async storeToChannelDbByType(client, userId, type, storeId, isCollateral = false) {
			console.log('storeToChannelDbByType', userId, type, storeId);
			if (type === 'User') {
				return this.storeUserToChannelDb(client, userId, storeId, {isCollateral});
			} else {
				return this.storeChannelToChannelDb(client, userId, storeId, {isCollateral});
			}
		}

		async storeObjToChannelDbByType(client, userId, type, storeObj, isCollateral = false) {
			if (type === 'User') {
				return this.storeUserObjToChannelDb(client, userId, storeObj, {isCollateral});
			} else {
				return this.storeChannelObjToChannelDb(client, userId, storeObj, null, {isCollateral});
			}
		}

		async storeUserToChannelDb(client, userId, storeUserId, updateData) {
			const {result: {fullUser: userInfo, users: [user]}} = await this.getUserInfoByClient(client, storeUserId);
			return this.storeUserObjToChannelDb(client, userId, {...userInfo, ...user}, updateData);
		}

		async storeUserObjToChannelDb(client, userId, storeUserObj, updateData) {
			const {account} = client;
			const {result: avatarFile} = await this.downloadMediaByClient(client, storeUserObj);
			let avatarContent;
			if (avatarFile) {
				avatarContent = await app.ms.content.saveData(userId, avatarFile.content, '', {mimeType: avatarFile.mimeType, userId});
			}
			const dbChannel = await socNetImport.importChannelMetadata(userId, socNet, account.id, {
				id: storeUserObj.id.toString(),
				username: storeUserObj.username,
				title: storeUserObj['firstName'] + ' ' + storeUserObj['lastName'],
				about: storeUserObj.about,
				lang: storeUserObj['langCode']
			}, {
				...updateData,
				avatarImageId: avatarContent ? avatarContent.id : null
			});
			return {client, dbChannel, user: storeUserObj}
		}

		async runChannelImport(userId, userApiKeyId, accData, channelId, advancedSettings = {}) {
			console.log('runChannelImport');
			const apiKey = await app.getUserApyKeyById(userId, userApiKeyId);
			if (apiKey.userId !== userId) {
				throw new Error("not_permitted");
			}

			const client = await this.getClient(userId, accData)
			const {dbChannel, channel} = await this.storeChannelToChannelDb(client, userId, channelId, {
				name: advancedSettings['name']
			});

			let {startMessageId, lastMessageId} = await socNetImport.prepareChannelQuery(dbChannel, channel.messagesCount, advancedSettings);
			console.log('startMessageId', startMessageId);
			startMessageId = parseInt(startMessageId);
			if (advancedSettings['fromMessage']) {
				startMessageId--;
			}
			lastMessageId = parseInt(lastMessageId);
			let asyncOperation = await socNetImport.openImportAsyncOperation(userId, userApiKeyId, dbChannel);

			const totalCountToFetch = lastMessageId - startMessageId;
			let currentMessageId = startMessageId;
			(async () => {
				while (currentMessageId < lastMessageId) {
					console.log('currentMessageId', currentMessageId, 'lastMessageId', lastMessageId);
					let countToFetch = lastMessageId - currentMessageId;
					if (countToFetch > 50) {
						countToFetch = 50;
					}
					const startPost = currentMessageId + 1;
					const messagesIds = Array.from({length: countToFetch}, (_, i) => i + startPost);
					const {result: messages} = await this.getMessagesByClient(client, dbChannel.channelId, messagesIds);
					console.log('messages.authorById', JSON.stringify(messages.authorById), 'messages.list', JSON.stringify(messages.list));

					await this.importMessagesList(client, userId, dbChannel, messages, advancedSettings, async (m, dbChannel, post, type) => {
						if (type !== 'post' || !m) {
							return;
						}
						console.log('onMessageProcess', type, m.id.toString());
						currentMessageId = parseInt(m.id.toString());
						await app.ms.asyncOperation.handleOperationCancel(userId, asyncOperation.id);
						return app.ms.asyncOperation.updateAsyncOperation(userId, asyncOperation.id, (1 - (lastMessageId - currentMessageId) / totalCountToFetch) * 100);
					})
				}
			})().then(async () => {
				return app.ms.asyncOperation.closeImportAsyncOperation(userId, asyncOperation, null);
			}).catch((e) => {
				console.error('run-channel-import error', e);
				return app.ms.asyncOperation.closeImportAsyncOperation(userId, asyncOperation, e);
			});

			return {
				result: {asyncOperation},
				client
			}
		}

		async importMessagesList(client, userId, dbChannel, messages, advancedSettings, onRemotePostProcess?) {
			const tgImportClient = new TelegramImportClient(app, client, userId, dbChannel, messages, advancedSettings, onRemotePostProcess);
			return socNetImport.importChannelPosts(tgImportClient);
		}
	}

	return new TelegramClientModule();
}
