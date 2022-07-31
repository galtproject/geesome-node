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
import {GroupType} from "../group/interface";
import IGeesomeSocNetImport from "../socNetImport/interface";
import IGeesomeSocNetAccount from "../socNetAccount/interface";

const {Api, TelegramClient} = require("telegram");
const {StringSession} = require("telegram/sessions");
const {computeCheck} = require("telegram/Password");
const includes = require('lodash/includes');
const pick = require('lodash/pick');
const some = require('lodash/some');
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
			let {phoneNumber, apiId, apiHash: apiKey, password, phoneCode, phoneCodeHash, isEncrypted, sessionKey, encryptedSessionKey, firstStage} = loginData;
			apiId = parseInt(apiId);

			let acc = await socNetAccount.getAccount(userId, {phoneNumber});
			sessionKey = isEncrypted ? sessionKey : (acc && acc.sessionKey || '');
			const stringSession = new StringSession(sessionKey);
			const client = new TelegramClient(stringSession, apiId, apiKey, {});

			if (isEncrypted) {
				sessionKey = encryptedSessionKey;
			}
			if (firstStage) {
				sessionKey = '';
			}

			await client.connect();

			let response;
			if (phoneCodeHash) {
				try {
					response = await client.invoke(new Api.auth.SignIn({phoneNumber, phoneCodeHash, phoneCode}) as any);
				} catch (e) {
					if (!includes(e.message, 'SESSION_PASSWORD_NEEDED') || !password) {
						throw e;
					}
					const passwordSrpResult = await client.invoke(new Api['account'].GetPassword({}) as any);
					const passwordSrpCheck = await computeCheck(passwordSrpResult, password);
					response = await client.invoke(new Api.auth.CheckPassword({password: passwordSrpCheck}) as any);
				}
				try {
					if (!isEncrypted) {
						sessionKey = client.session.save();
					}
					const username = response.user ? response.user.username : null;
					const fullName = response.user ? response.user.firstName + ' ' + response.user.lastName : null;
					const existAccount = await socNetAccount.getAccountByUsernameOrPhone(userId, socNet, username, phoneNumber);
					acc = await this.createOrUpdateAccount(userId, {
						id: existAccount ? existAccount.id : null,
						phoneNumber,
						apiId,
						apiKey,
						sessionKey,
						username,
						fullName,
						isEncrypted
					});
				} catch (e) {}
				return {client, result: {response, sessionKey: client.session.save(), account: acc}};
			} else {
				response = await client.sendCode({apiId, apiHash: apiKey}, phoneNumber);
				try {
					if (!isEncrypted) {
						sessionKey = client.session.save();
					}
					const existAccount = await socNetAccount.getAccount(userId, {phoneNumber});
					acc = await this.createOrUpdateAccount(userId, {
						id: existAccount ? existAccount.id : null,
						phoneNumber,
						sessionKey,
						isEncrypted
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
			const acc = await socNetAccount.getAccount(userId, accData);
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
			return {
				client,
				result: await client.invoke(new Api.channels.ExportMessageLink({
					channel,
					id: messageId,
					thread: true,
				}) as any)
			};
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
			const finishedOperation = await new Promise((resolve) => {
				finishCallbacks[asyncOperation.id] = resolve;
			});
			await client.disconnect();
			delete finishCallbacks[asyncOperation.id];
			return finishedOperation;
		}

		async runChannelImport(userId, userApiKeyId, accData, channelId, advancedSettings = {}) {
			const apiKey = await app.getUserApyKeyById(userId, userApiKeyId);
			if (apiKey.userId !== userId) {
				throw new Error("not_permitted");
			}
			const {client, result: channel} = await this.getChannelInfoByUserId(userId, accData, channelId);
			const {account} = client;

			let dbChannel = await socNetImport.getDbChannel(userId, {channelId: channel.id.toString()});
			let group;

			const [{result: avatarFile}, {result: user}] = await Promise.all([
				this.downloadMediaByClient(client, channel),
				this.getMeByClient(client)
			]);
			let avatarContent;
			if (avatarFile) {
				avatarContent = await app.ms.content.saveData(userId, avatarFile.content, '', {mimeType: avatarFile.mimeType, userId});
			}
			// console.log('channel', channel);
			group = dbChannel ? await app.ms.group.getLocalGroup(userId, dbChannel.groupId) : null;
			if (group && !group.isDeleted) {
				const updateData = {
					name: advancedSettings['name'] || channel.username,
					title: channel.title,
					description: channel.about,
					avatarImageId: avatarContent ? avatarContent.id : null,
				};
				if (some(Object.keys(updateData), (key) => updateData[key] !== group[key])) {
					await app.ms.group.updateGroup(userId, dbChannel.groupId, updateData);
				}
			} else {
				group = await app.ms.group.createGroup(userId, {
					name: advancedSettings['name'] || channel.username || channel.id.toString(),
					title: channel.title,
					description: channel.about,
					isPublic: true,
					type: GroupType.Channel,
					avatarImageId: avatarContent ? avatarContent.id : null,
					propertiesJson: JSON.stringify({
						lang: user.langCode || 'en',
						source: 'telegram',
						sourceId: channel.id.toString(),
						sourceUsername: channel.username,
					})
				});
				const channelData = {
					userId,
					groupId: group.id,
					channelId: channel.id.toString(),
					accountId: account.id,
					title: channel.title,
					lastMessageId: 0,
					postsCounts: 0,
				}
				if (dbChannel) {
					// update channel after group deletion
					dbChannel = await socNetImport.reinitializeDbChannel(dbChannel.id, channelData);
				} else {
					dbChannel = await socNetImport.createDbChannel(channelData);
				}
			}

			let startMessageId = dbChannel ? dbChannel.lastMessageId : 0;
			let lastMessageId = channel.messagesCount;
			if (advancedSettings['fromMessage']) {
				startMessageId = parseInt(advancedSettings['fromMessage']) - 1;
			}
			if (advancedSettings['toMessage']) {
				lastMessageId = parseInt(advancedSettings['toMessage']);
			}

			const force = advancedSettings['toMessage'] || advancedSettings['fromMessage'];

			if (!force) {
				const lastMessage = await socNetImport.getDbChannelLastMessage(dbChannel.id);
				if (lastMessage && lastMessage.id === lastMessageId) {
					throw new Error('already_done');
				}
			}

			let asyncOperation = await app.ms.asyncOperation.addAsyncOperation(userId, {
				userApiKeyId,
				name: 'run-telegram-channel-import',
				channel: 'id:' + dbChannel.id + ';op:' + await commonHelper.random()
			});

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
					const messages = await this.getMessagesByClient(client, dbChannel.channelId, messagesIds);

					await socNetImport.importChannelPosts({
						getRemotePostLink: (channelId, msgId) => this.getMessageLink(client, channelId, msgId),
						getRemotePostContents: (userId, dbChannel, m) => this.messageToContents(client, userId, dbChannel, m),
						getRemotePostProperties: (userId, dbChannel, m) => {
							//TODO: get forward from username and id
							return {};
						}
					}, userId, dbChannel, messages, force, advancedSettings, async (m, post) => {
						console.log('onMessageProcess', m.id.toString());
						currentMessageId = parseInt(m.id.toString());
						dbChannel.update({lastMessageId: currentMessageId});
						asyncOperation = await app.ms.asyncOperation.getAsyncOperation(userId, asyncOperation.id);
						if (asyncOperation.cancel) {
							await app.ms.asyncOperation.errorAsyncOperation(userId, asyncOperation.id, "canceled");
							throw new Error("import_canceled");
						}
						return app.ms.asyncOperation.updateAsyncOperation(userId, asyncOperation.id, (1 - (lastMessageId - currentMessageId) / totalCountToFetch) * 100);
					});
				}
			})().then(async () => {
				await app.ms.asyncOperation.finishAsyncOperation(userId, asyncOperation.id);
				if (finishCallbacks[asyncOperation.id]) {
					finishCallbacks[asyncOperation.id](await app.ms.asyncOperation.getAsyncOperation(userId, asyncOperation.id));
				}
			}).catch((e) => {
				console.error('run-telegram-channel-import error', e);
				return app.ms.asyncOperation.errorAsyncOperation(userId, asyncOperation.id, e.message);
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
