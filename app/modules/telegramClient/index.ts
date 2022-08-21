/*
 * Copyright ©️ 2018-2021 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2021 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

import {ContentView} from "../database/interface";
import {IGeesomeApp} from "../../interface";
import IGeesomeSocNetImport from "../socNetImport/interface";
import IGeesomeSocNetAccount from "../socNetAccount/interface";

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

	let finishCallbacks = {

	};
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
				const username = user ? user.username : null;
				const fullName = user ? user['firstName'] + ' ' + user['lastName'] : null;
				try {
					acc = await socNetAccount.createOrUpdateAccount(userId, {
						id: acc ? acc.id : null,
						accountId: user.id,
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
				result: await client.invoke(new Api.channels.GetMessages({
					channel,
					id: messagesIds
				}) as any).then(({messages}) => {
					return messages
						.map(m => pick(m, ['id', 'replyTo', 'date', 'message', 'entities', 'media', 'action', 'groupedId']));
				})
			};
		}

		async getMessageLink(client, channelId, messageId) {
			let channel = channelId;
			if (commonHelper.isNumber(channel)) {
				channel = await this.getChannelEntity(client, channelId);
			}
			messageId = parseInt(messageId);
			return client.invoke(new Api.channels.ExportMessageLink({
				channel,
				id: messageId,
				thread: true,
			})).then(r => r.link);
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
			return this.getMeByClient(client);
		}

		async getMeByClient(client) {
			return {
				result: await client.getMe(),
				client
			};
		}

		async getUserChannelsByUserId(userId, accData) {
			const client = await this.getClient(userId, accData);
			const channels = await client.invoke(new Api.messages.GetAllChats({exceptIds: []}) as any);
			return {
				result: channels.chats.filter(c => c.className === 'Channel' && !c.megagroup),
				client
			}
		}

		isAutoActionAllowed(userId, funcName, funcArgs) {
			return includes(['runChannelImportAndWaitForFinish'], funcName);
		}

		async runChannelImportAndWaitForFinish(userId, userApiKeyId, accData, channelId, advancedSettings = {}) {
			const {result: { asyncOperation }, client} = await this.runChannelImport(userId, userApiKeyId, accData, channelId, advancedSettings).then(r => r);
			return app.ms.asyncOperation.waitForImportAsyncOperation(asyncOperation).then(() => {
				return client.disconnect();
			});
		}

		async runChannelImport(userId, userApiKeyId, accData, channelId, advancedSettings = {}) {
			const apiKey = await app.getUserApyKeyById(userId, userApiKeyId);
			if (apiKey.userId !== userId) {
				throw new Error("not_permitted");
			}
			const {client, result: channel} = await this.getChannelInfoByUserId(userId, accData, channelId);
			const {account} = client;

			const [{result: avatarFile}, {result: user}] = await Promise.all([
				this.downloadMediaByClient(client, channel),
				this.getMeByClient(client)
			]);
			let avatarContent;
			if (avatarFile) {
				avatarContent = await app.ms.content.saveData(userId, avatarFile.content, '', {mimeType: avatarFile.mimeType, userId});
			}
			const dbChannel = await socNetImport.importChannelMetadata(userId, socNet, account.id, {
				...channel,
				lang: user.langCode
			}, {
				avatarImageId: avatarContent ? avatarContent.id : null
			});

			let {startMessageId, lastMessageId} = await socNetImport.prepareChannelQuery(dbChannel, channel.messagesCount, advancedSettings);
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

					await socNetImport.importChannelPosts(userId, dbChannel, messages, advancedSettings, {
						getRemotePostLink: (channelId, msgId) => this.getMessageLink(client, channelId, msgId),
						getRemotePostReplyTo: (m) => m.replyTo ? m.replyTo.replyToMsgId.toString() : null,
						getRemotePostContents: (userId, dbChannel, m) => this.messageToContents(client, userId, dbChannel, m),
						getRemotePostProperties: (userId, dbChannel, m) => {
							//TODO: get forward from username and id
							return {};
						},
						async onRemotePostProcess(m, post) {
							console.log('onMessageProcess', m.id.toString());
							currentMessageId = parseInt(m.id.toString());
							dbChannel.update({lastMessageId: currentMessageId});
							await app.ms.asyncOperation.handleOperationCancel(userId, asyncOperation.id);
							return app.ms.asyncOperation.updateAsyncOperation(userId, asyncOperation.id, (1 - (lastMessageId - currentMessageId) / totalCountToFetch) * 100);
						}
					});
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

		async messageToContents(client, userId, dbChannel, m) {
			let contents = [];
			const contentMessageData = {userId, msgId: m.id, groupedId: m.groupedId, dbChannelId: dbChannel.id};

			if (m.message) {
				console.log('m.message', m.message, 'm.entities', m.entities);
				let text = telegramHelpers.messageWithEntitiesToHtml(m.message, m.entities || []);
				console.log('text', text);
				const content = await app.ms.content.saveData(userId, text, '', {
					userId,
					mimeType: 'text/html',
					view: ContentView.Contents
				});
				contents.push(content);
				await socNetImport.storeContentMessage(contentMessageData, content);
			}

			if (m.media) {
				if (m.media.poll) {
					//TODO: handle and save polls (325)
					return contents;
				}
				console.log('m.media', m.media);
				const {result: file} = await this.downloadMediaByClient(client, m.media);
				if (file && file.content) {
					const content = await app.ms.content.saveData(userId, file.content, '', {
						userId,
						mimeType: file.mimeType,
						view: ContentView.Media
					});
					contents.push(content);
					await socNetImport.storeContentMessage(contentMessageData, content);
				}

				if (m.media.webpage && m.media.webpage.url) {
					const content = await app.ms.content.saveData(userId, telegramHelpers.mediaWebpageToLinkStructure(m.media.webpage), '', {
						userId,
						mimeType: 'application/json',
						view: ContentView.Link
					});
					contents.push(content);
					await socNetImport.storeContentMessage(contentMessageData, content);
				}
			}

			return contents;
		}
	}

	return new TelegramClientModule();
}
