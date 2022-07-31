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

const pIteration = require('p-iteration');
const pick = require('lodash/pick');
const commonHelper = require('geesome-libs/src/common');
const bigInt = require('big-integer');
const telegramHelpers = require('./helpers');
import { TwitterApi } from 'twitter-api-v2';
import IGeesomeSocNetImport from "../socNetImport/interface";

module.exports = async (app: IGeesomeApp) => {
	const models = await require("./models")();
	const module = getModule(app, models);

	require('./api')(app, module, models);

	return module;
}

function getModule(app: IGeesomeApp, models) {
	app.checkModules(['asyncOperation', 'group', 'content', 'socNetImport']);

	const socNetImport = app.ms['socNetImport'] as IGeesomeSocNetImport;

	class TelegramClientModule {
		async login(userId, loginData) {
			let {apiToken, encryptedApiToken, isEncrypted} = loginData;

			const client = new TwitterApi(apiToken);
			const roClient = client.readOnly;
			const [user] = await roClient.v2.me();

			const acc = await this.createOrUpdateAccount({
				userId,
				apiToken: isEncrypted ? encryptedApiToken : apiToken,
				username: user.username,
				fullName: user.name,
				isEncrypted
			});
			return {client, result: {response: user, account: acc}};
		}

		async createOrUpdateAccount(accData) {
			let where = {userId: accData.userId};
			const userAcc = await models.Account.findOne({where});
			return userAcc ? userAcc.update(accData).then(() => models.Account.findOne({where})) : models.Account.create(accData);
		}

		async getClient(userId, accData: any = {}) {
			let {apiToken} = accData;
			delete accData['apiToken'];
			return new TwitterApi(apiToken);
		}

		async getUserInfoByUserId(userId, accData, userName) {
			return this.getUserInfoByClient(await this.getClient(userId, accData), userName);
		}

		async getUserInfoByClient(client, userName) {
			return {
				client,
				result: await client.readOnly.v2.userByUsername(userName)
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

		async runChannelImport(userId, apiKey, accData, channelId, advancedSettings = {}) {
			const {client, result: channel} = await this.getChannelInfoByUserId(userId, accData, channelId);

			let dbChannel = await models.Channel.findOne({where: {userId, channelId: channel.id.toString()}});
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
				await app.ms.group.updateGroup(userId, dbChannel.groupId, {
					name: channel.username,
					title: channel.title,
					description: channel.about,
					avatarImageId: avatarContent ? avatarContent.id : null,
				});
			} else {
				group = await app.ms.group.createGroup(userId, {
					name: channel.username || channel.id.toString(),
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
				const lastMessage = await models.Message.findOne({
					where: {dbChannelId: dbChannel.id},
					order: [['msgId', 'DESC']]
				});
				if (lastMessage && lastMessage.id === lastMessageId) {
					throw new Error('already_done');
				}
			}

			let asyncOperation = await app.ms.asyncOperation.addAsyncOperation(userId, {
				userApiKeyId: apiKey.id,
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
					await this.importChannelPosts(client, userId, group.id, dbChannel, currentMessageId + 1, countToFetch, force, advancedSettings, async (m, post) => {
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
			})().then(() => {
				return app.ms.asyncOperation.finishAsyncOperation(userId, asyncOperation.id);
			}).catch((e) => {
				console.error('run-telegram-channel-import error', e);
				return app.ms.asyncOperation.errorAsyncOperation(userId, asyncOperation.id, e.message);
			});

			return {
				result: {asyncOperation},
				client
			}
		}

		async messageToContents(client, dbChannel, m, userId) {
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
				await this.storeContentMessage(contentMessageData, content);
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
					await this.storeContentMessage(contentMessageData, content);
				}

				if (m.media.webpage && m.media.webpage.url) {
					const content = await app.ms.content.saveData(userId, telegramHelpers.mediaWebpageToLinkStructure(m.media.webpage), '', {
						userId,
						mimeType: 'application/json',
						view: ContentView.Link
					});
					contents.push(content);
					await this.storeContentMessage(contentMessageData, content);
				}
			}

			return contents;
		}

		async flushDatabase() {
			await pIteration.forEachSeries(['Message', 'Channel', 'Account', 'ContentMessage'], (modelName) => {
				return models[modelName].destroy({where: {}});
			});
		}
	}

	return new TelegramClientModule();
}
