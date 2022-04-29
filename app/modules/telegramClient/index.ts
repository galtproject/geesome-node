/*
 * Copyright ©️ 2018-2021 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2021 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

import {ContentView, GroupType} from "../database/interface";
import {IGeesomeApp} from "../../interface";

const { Api, TelegramClient } = require("telegram");
const { StringSession } = require("telegram/sessions");
const { computeCheck } = require("telegram/Password");
const pIteration = require('p-iteration');
const includes = require('lodash/includes');
const pick = require('lodash/pick');
const uniq = require('lodash/uniq');
const uniqBy = require('lodash/uniqBy');
const commonHelper = require('geesome-libs/src/common');
const bigInt = require('big-integer');
const telegramHelpers = require('./helpers');
const Op = require("sequelize").Op;

module.exports = async (app: IGeesomeApp) => {
	const models = await require("./database")();
	const module = getModule(app, models);

	require('./api')(app, module, models);

	return module;
}

function getModule(app: IGeesomeApp, models) {
	app.checkModules(['asyncOperation', 'group']);
	
	class TelegramClientModule {
		async login(userId, loginData) {
			let { phoneNumber, apiId, apiHash, password, phoneCode, phoneCodeHash, isEncrypted, sessionKey, encryptedSessionKey, firstStage } = loginData;
			apiId = parseInt(apiId);

			let acc = await models.Account.findOne({where: {userId, phoneNumber}});
			sessionKey = isEncrypted ? sessionKey : (acc && acc.sessionKey || '');
			const stringSession = new StringSession(sessionKey);
			const client = new TelegramClient(stringSession, apiId, apiHash, {});

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
			const userAcc = await models.Account.findOne({where});
			return userAcc ? userAcc.update(accData).then(() => models.Account.findOne({where})) : models.Account.create(accData);
		}
		async getClient(userId, accData: any = {}) {
			let {sessionKey} = accData;
			delete accData['sessionKey'];
			const acc = await models.Account.findOne({where: {...accData, userId}});
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
				new Api['PeerChannel']({ channelId: parseInt(channelId), accessHash: bigInt.zero })
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
				result: await client.invoke(new Api.channels.GetMessages({ channel, id: messagesIds }) as any).then(({messages}) => {
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
				result: await client.invoke(new Api.channels.ExportMessageLink({ channel, id: messageId, thread: true, }) as any)
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
			const channels = await client.invoke(new Api.messages.GetAllChats({ exceptIds: [] }) as any);
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
				avatarContent = await app.saveData(avatarFile.content, '', { mimeType: avatarFile.mimeType, userId });
			}
			// console.log('channel', channel);
			group = dbChannel ? await app.ms.group.getGroup(dbChannel.groupId) : null;
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
					await models.Channel.update(channelData, {where: {id: dbChannel.id}});
					await models.Message.destroy({where: {dbChannelId: dbChannel.id}});
				} else {
					dbChannel = await this.createDbChannel(channelData);
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
				const lastMessage = await models.Message.findOne({where: {dbChannelId: dbChannel.id}, order: [['msgId', 'DESC']]});
				if (lastMessage && lastMessage.id === lastMessageId) {
					throw new Error('already_done');
				}
			}

			let asyncOperation = await app.ms.asyncOperation.addAsyncOperation(userId, {
				userApiKeyId: await app.getApyKeyId(apiKey),
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
						dbChannel.update({ lastMessageId: currentMessageId });
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

		async createDbChannel(channelData) {
			return models.Channel.create(channelData);
		}

		async findExistsChannelMessage(msgId, dbChannelId, userId) {
			return models.Message.findOne({where: {msgId, dbChannelId, userId}});
		}

		async getDbPostIdByTelegramMsgId(dbChannelId, msgId) {
			if (!msgId) {
				return;
			}
			msgId = parseInt(msgId);
			return models.Message.findOne({where: {msgId, dbChannelId}}).then(m => m ? m.postId : null);
		}

		async importChannelPosts(client, userId, groupId, dbChannel, startPost = 1, postsCount = 50, force = false, advancedSettings = {}, onMessageProcess = null) {
			const messagesIds = Array.from({length: postsCount}, (_, i) => i + startPost);
			console.log('messagesIds', messagesIds);
			const dbChannelId = dbChannel.id;

			const mergeSeconds = parseInt(advancedSettings['mergeSeconds']);

			const importState = {
				mergeSeconds,
				userId,
				groupId,
			}

			let groupedId = null;
			let groupedReplyTo = null;
			let groupedDate = null;
			let groupedContent = [];
			let groupedMessageIds = [];
			const {result: messages} = await this.getMessagesByClient(client, dbChannel.channelId, messagesIds);
			let messageLinkTpl;
			await pIteration.forEachSeries(messages, async (m, i) => {
				console.log('m', m);
				if (!m.date) {
					await onMessageProcess(m, null);
					return;
				}
				const msgId = m.id.toString();
				if (!messageLinkTpl) {
					messageLinkTpl = await this.getMessageLink(client, dbChannel.channelId, msgId)
						.then(r => r.result.link.split('/').slice(0, -1).join('/') + '/{msgId}');
				}
				const existsChannelMessage = await this.findExistsChannelMessage(msgId, dbChannelId, userId);
				if (existsChannelMessage && !force) {
					await onMessageProcess(m, null);
					return;
				}

				const sourceLink = messageLinkTpl.replace('{msgId}', msgId);
				const contents = await this.messageToContents(client, m, userId);
				const properties = { sourceLink };

				if (groupedReplyTo) {
					properties['replyToMsgId'] = groupedReplyTo;
				} else if (m.replyTo) {
					properties['replyToMsgId'] = m.replyTo.replyToMsgId.toString();
				}
				if (groupedMessageIds.length) {
					properties['groupedMsgIds'] = groupedMessageIds;
				}

				const timestamp = parseInt(groupedDate || m.date);

				const postData = {
					groupId,
					userId,
					status: 'published',
					propertiesJson: JSON.stringify(properties),
					source: 'telegram',
					sourceChannelId: dbChannel.channelId,
					sourcePostId: groupedMessageIds.length ? groupedMessageIds[0] : msgId,
					sourceDate: new Date(timestamp * 1000),
					replyToId: await this.getDbPostIdByTelegramMsgId(dbChannelId, properties['replyToMsgId']),
					contents: [],
				}
				console.log('postData', postData);

				const msgData = {dbChannelId, userId, groupedId, timestamp};
				let post;
				console.log('m.groupedId', m.groupedId && m.groupedId.toString());
				if (
					(groupedId && !m.groupedId) || // group ended
					(groupedId && m.groupedId && m.groupedId.toString() !== groupedId) || // new group
					i === messages.length - 1 // messages end
				) {
					postData.contents = groupedContent;
					post = await this.publishPost(importState, existsChannelMessage, postData, groupedMessageIds, {
						...msgData,
						replyToMsgId: groupedReplyTo
					});

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
						groupedReplyTo = m.replyTo.replyToMsgId.toString();
					}
				} else {
					postData.contents = contents;
					post = await this.publishPost(importState, existsChannelMessage, postData, [msgId], {
						...msgData,
						replyToMsgId: properties['replyToMsgId']
					});
				}
				if (onMessageProcess) {
					await onMessageProcess(m, post);
				}
			});
		}

		storeMessage(existsChannelMessage, _messageData) {
			if (existsChannelMessage) {
				return models.Message.update(_messageData, {where: {id: existsChannelMessage.id}});
			} else {
				return models.Message.create(_messageData);
			}
		}

		async publishPost(_importState, _existsChannelMessage, _postData, _msgIds, _msgData) {
			const {userId, mergeSeconds} = _importState;
			let existsPostId = _existsChannelMessage && _existsChannelMessage.postId;

			if (!_postData.contents.length) {
				await pIteration.forEach(_msgIds,
					(_msgId) => this.storeMessage(_existsChannelMessage, {..._msgData, msgId: _msgId})
				);
				return;
			}

			if (_msgData.groupedId) {
				const messagesByGroupedId = await models.Message.findAll({where: {groupedId: _msgData.groupedId}});
				if (messagesByGroupedId.length) {
					const postIds = uniq(messagesByGroupedId.map(m => m.postId)).filter(postId => existsPostId !== postId);
					if (postIds.length || !existsPostId) {
						existsPostId = await this.mergePostsToOne(_importState, existsPostId, postIds, _postData);
						// content updated by merging
						delete _postData.contents;
					}
				}
			}

			const messagesByTimestamp = await models.Message.findAll({where: {timestamp: {
						[Op.lte]: _msgData.timestamp + mergeSeconds,
						[Op.gte]: _msgData.timestamp - mergeSeconds,
					}}});

			// console.log('existsPostId', existsPostId, 'messagesByTimestamp.map(m => m.postId)', messagesByTimestamp.map(m => m.postId));
			if (messagesByTimestamp.length) {
				const postIds = uniq(messagesByTimestamp.map(m => m.postId)).filter(postId => existsPostId !== postId);
				if (postIds.length || !existsPostId) {
					existsPostId = await this.mergePostsToOne(_importState, existsPostId, postIds, _postData);
					// content updated by merging
					delete _postData.contents;
				}
			}

			_postData.publishedAt = new Date(_msgData.timestamp * 1000);
			_postData.isDeleted = false;
			if (existsPostId) {
				await app.ms.group.updatePost(userId, existsPostId, _postData);
			} else {
				existsPostId = await app.ms.group.createPost(userId, _postData).then(p => p.id);
			}

			await pIteration.forEach(_msgIds,
				(_msgId) => this.storeMessage(_existsChannelMessage, {..._msgData, msgId: _msgId, postId: existsPostId})
			);

			return app.ms.database.getPost(existsPostId);
		}

		async mergePostsToOne(_importState, _existsPostId, _postIds, _postData) {
			const {userId, groupId} = _importState;
			const posts = await app.ms.group.getPostListByIds(userId, groupId, _postIds).then(posts => posts.filter(p => !p.isDeleted));
			// console.log('posts.length', posts.length);
			if (!posts.length) {
				return _existsPostId;
			}

			let postsContents = [];
			posts.forEach(({contents}) => postsContents = postsContents.concat(contents));

			let resultPost = _existsPostId ? await app.ms.group.getPost(userId, _existsPostId) : null;
			if (!resultPost) {
				resultPost = posts[0];
			}
			let {contents} = resultPost;
			contents = uniqBy(
				contents.concat(postsContents).concat(_postData.contents || []),
				c => c.manifestStorageId
			);
			await app.ms.group.updatePost(userId, resultPost.id, {contents});
			// console.log('deletePosts', posts.map(p => p.id).filter(id => id !== resultPost.id));
			await app.ms.group.deletePosts(userId, posts.map(p => p.id).filter(id => id !== resultPost.id))
			return resultPost.id;
		}

		mediaWebpageToPreviewHtml(webpage) {
			return `<div class="link-preview"><div class="link-title">${webpage.title}</div><div class="link-description">${webpage.description}</div></div>`;
		}

		async messageToContents(client, m, userId) {
			let contents = [];

			if (m.media) {
				if (m.media.poll) {
					//TODO: handle and save polls (325)
					return contents;
				}
				console.log('m.media', m.media);
				const {result: file} = await this.downloadMediaByClient(client, m.media);
				if (file && file.content) {
					const content = await app.saveData(file.content, '', { mimeType: file.mimeType, userId, view: ContentView.Media });
					contents.push(content);
				}

				if (m.media.webpage && m.media.webpage.url) {
					const content = await app.saveData(m.media.webpage.url, '', {
						mimeType: 'text/plain',
						userId,
						view: ContentView.Link,
						previews: [{previewSize: 'medium', mimeType: 'text/html', content: this.mediaWebpageToPreviewHtml(m.media.webpage)}]
					});
					contents.push(content);
				}
			}

			if (m.message) {
				console.log('m.message', m.message, 'm.entities', m.entities);
				let text = m.message;
				if (m.entities) {
					text = telegramHelpers.messageWithEntitiesToHtml(text, m.entities);
				}
				console.log('text', text);
				const textContent = await app.saveData(text, '', { mimeType: 'text/html', userId, view: ContentView.Contents });
				contents.push(textContent);
			}

			return contents;
		}
		async flushDatabase() {
			await pIteration.forEachSeries(['Message', 'Channel', 'Account'], (modelName) => {
				return models[modelName].destroy({where: {}});
			});
		}
	}

	return new TelegramClientModule();
}
