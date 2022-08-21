/*
 * Copyright ©️ 2018-2021 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2021 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

import {IGeesomeApp} from "../../interface";
import {GroupType} from "../group/interface";

const pIteration = require('p-iteration');
const includes = require('lodash/includes');
const pick = require('lodash/pick');
const uniq = require('lodash/uniq');
const uniqBy = require('lodash/uniqBy');
const orderBy = require('lodash/orderBy');
const find = require('lodash/find');
const some = require('lodash/some');
const isString = require('lodash/isString');
const Op = require("sequelize").Op;
const commonHelper = require('geesome-libs/src/common');

module.exports = async (app: IGeesomeApp) => {
	const models = await require("./models")();
	const module = getModule(app, models);
	require('./api')(app, module, models);
	return module;
}

function getModule(app: IGeesomeApp, models) {
	app.checkModules(['asyncOperation', 'group', 'content']);

	class SocNetImportModule {
		async getDbChannel(userId, where) {
			return models.Channel.findOne({where: {...where, userId}});
		}
		async createDbChannel(channelData) {
			return models.Channel.create(channelData);
		}

		async reinitializeDbChannel(id, channelData) {
			await models.Channel.update(channelData, {where: {id}});
			await models.Message.destroy({where: {dbChannelId: id}});
			return models.Channel.findOne({where: {id}});
		}

		async findExistsChannelMessage(msgId, dbChannelId, userId) {
			return models.Message.findOne({where: {msgId, dbChannelId, userId}});
		}

		async getDbPostIdByMsgId(dbChannelId, msgId) {
			if (!msgId) {
				return;
			}
			msgId = parseInt(msgId);
			return models.Message.findOne({where: {msgId, dbChannelId}}).then(m => m ? m.postId : null);
		}

		async importChannelMetadata(userId, socNet, accountId, channelMetadata, updateData) {
			const channelId = isString(channelMetadata.id) ? channelMetadata.id : channelMetadata.id.toString();
			let dbChannel = await this.getDbChannel(userId, {channelId});
			let group;

			// console.log('channel', channel);
			group = dbChannel ? await app.ms.group.getLocalGroup(userId, dbChannel.groupId) : null;
			if (group && !group.isDeleted) {
				const data = {
					name: updateData['name'] || channelMetadata.username,
					title: channelMetadata.title,
					description: channelMetadata.about,
					avatarImageId: updateData.avatarImageId,
				};
				if (some(Object.keys(data), (key) => data[key] !== group[key])) {
					await app.ms.group.updateGroup(userId, dbChannel.groupId, data);
				}
			} else {
				group = await app.ms.group.createGroup(userId, {
					name: updateData['name'] || channelMetadata.username || channelMetadata.id.toString(),
					title: channelMetadata.title,
					description: channelMetadata.about,
					isPublic: true,
					type: GroupType.Channel,
					avatarImageId: updateData.avatarImageId,
					propertiesJson: JSON.stringify({
						lang: channelMetadata.lang || 'en',
						source: socNet,
						sourceId: channelMetadata.id.toString(),
						sourceUsername: channelMetadata.username,
					})
				});
				const channelData = {
					userId,
					accountId,
					channelId,
					groupId: group.id,
					title: channelMetadata.title,
					lastMessageId: 0,
					postsCounts: 0,
					source: socNet
				}
				if (dbChannel) {
					// update channel after group deletion
					dbChannel = await this.reinitializeDbChannel(dbChannel.id, channelData);
				} else {
					dbChannel = await this.createDbChannel(channelData);
				}
			}
			return dbChannel;
		}

		async prepareChannelQuery(dbChannel, remotePostsCount, advancedSettings) {
			const lastMessage = await this.getDbChannelLastMessage(dbChannel.id);
			let startMessageId = dbChannel ? lastMessage.msgId : 0;
			let lastMessageId = remotePostsCount;
			if (advancedSettings['fromMessage']) {
				startMessageId = advancedSettings['fromMessage'];
			}
			if (advancedSettings['toMessage']) {
				lastMessageId = advancedSettings['toMessage'];
			}
			advancedSettings['force'] = advancedSettings['toMessage'] || advancedSettings['fromMessage'];
			if (!advancedSettings['force']) {
				if (lastMessage && lastMessage.msgId === lastMessageId) {
					throw new Error('already_done');
				}
			}
			return {startMessageId, lastMessageId}
		}

		async openImportAsyncOperation(userId, userApiKeyId, dbChannel) {
			return app.ms.asyncOperation.addAsyncOperation(userId, {
				userApiKeyId,
				name: 'run-soc-net-channel-import',
				channel: 'id:' + dbChannel.id + ';op:' + await commonHelper.random()
			});
		}

		async importChannelPosts(userId, dbChannel, messages, advancedSettings = {}, client: any = {}) {
			const {id: dbChannelId, groupId, source} = dbChannel;
			const mergeSeconds = parseInt(advancedSettings['mergeSeconds']);
			const force = !!advancedSettings['force'];
			const importState = { mergeSeconds, userId, groupId, dbChannelId };

			console.log('messages.length', messages.length);
			let messageLinkTpl;
			await pIteration.forEachSeries(messages, async (m, i) => {
				console.log('m', m);
				if (!m.date) {
					if (client.onRemotePostProcess) {
						await client.onRemotePostProcess(m, null);
					}
					return;
				}
				const msgId = m.id.toString();
				if (!messageLinkTpl) {
					messageLinkTpl = await client.getRemotePostLink(dbChannel.channelId, msgId)
						.then(r => r.split('/').slice(0, -1).join('/') + '/{msgId}');
				}
				const existsChannelMessage = await this.findExistsChannelMessage(msgId, dbChannelId, userId);
				if (existsChannelMessage && !force) {
					if (client.onRemotePostProcess) {
						await client.onRemotePostProcess(m, null);
					}
					return;
				}

				const contents = await client.getRemotePostContents(userId, dbChannel, m);
				const replyToMsgId = client.getRemotePostReplyTo(m);
				const postData = {
					groupId,
					userId,
					status: 'published',
					properties: {
						sourceLink: messageLinkTpl.replace('{msgId}', msgId),
						replyToMsgId,
						...await client.getRemotePostProperties(userId, dbChannel, m)
					},
					source,
					sourceChannelId: dbChannel.channelId,
					sourcePostId: msgId,
					sourceDate: new Date(m.date * 1000),
					replyToId: await this.getDbPostIdByMsgId(dbChannelId, replyToMsgId),
					contents,
				}
				console.log('postData', postData);

				let post = await this.publishPost(importState, existsChannelMessage, postData, {
					dbChannelId,
					userId,
					msgId,
					groupedId: m.groupedId,
					timestamp: m.date,
					replyToMsgId
				});
				if (client.onRemotePostProcess) {
					await client.onRemotePostProcess(m, post);
				}
			});
		}

		async publishPost(_importState, _existsChannelMessage, _postData, _msgData) {
			const {userId, mergeSeconds} = _importState;
			let existsPostId = _existsChannelMessage && _existsChannelMessage.postId;

			if (!_postData.contents.length) {
				await this.storeMessage(_existsChannelMessage, _msgData);
				return;
			}

			let postMessageIds = [_msgData.msgId];

			if (mergeSeconds) {
				const messagesByTimestamp = await models.Message.findAll({
					where: {
						dbChannelId: _msgData.dbChannelId, timestamp: {
							[Op.lte]: _msgData.timestamp + mergeSeconds,
							[Op.gte]: _msgData.timestamp - mergeSeconds,
						}
					}
				});
				console.log('_msgData.timestamp', _msgData.timestamp, 'messagesByTimestamp', messagesByTimestamp.map(m => m.msgId), '_msgId', _msgData.msgId);
				if (messagesByTimestamp.length) {
					postMessageIds = postMessageIds.concat(messagesByTimestamp.map(m => m.msgId));
					existsPostId = await this.mergePostsToOne(_importState, existsPostId, messagesByTimestamp, _postData);
				}
			} else if (_msgData.groupedId) {
				const messagesByGroupedId = await models.Message.findAll({
					where: {
						dbChannelId: _msgData.dbChannelId,
						groupedId: _msgData.groupedId
					}
				});
				if (messagesByGroupedId.length) {
					postMessageIds = postMessageIds.concat(messagesByGroupedId.map(m => m.msgId));
					existsPostId = await this.mergePostsToOne(_importState, existsPostId, messagesByGroupedId, _postData);
				}
			}

			console.log('existsPostId', existsPostId);

			if (_postData.contents) {
				_postData.contents = await this.sortContentsByMessagesContents(_postData.contents);
			}
			_postData.publishedAt = new Date(_msgData.timestamp * 1000);
			_postData.isDeleted = false;
			if (uniq(postMessageIds).length > 1) {
				_postData.properties['groupedMsgIds'] = uniq(postMessageIds);
			}
			_postData.propertiesJson = JSON.stringify(_postData.properties);

			if (existsPostId) {
				await app.ms.group.updatePost(userId, existsPostId, _postData);
			} else {
				existsPostId = await app.ms.group.createPost(userId, _postData).then(p => p.id);
			}

			_msgData.postId = existsPostId;
			await this.storeMessage(_existsChannelMessage, _msgData);

			return app.ms.group.getPostPure(existsPostId);
		}

		async mergePostsToOne(_importState, _existsPostId, _messages, _postData) {
			const postIds = uniq(_messages.map(m => m.postId));
			console.log('postIds', postIds);
			const postsIdsWithoutExists = postIds.filter(postId => _existsPostId !== postId);
			console.log('postsIdsWithoutExists', postIds);
			// 1 case: there's created post and appears new one to merge(not created): _existsPostId is null, postsIdsWithoutExists.length > 0
			// 2 case: there's created post and appears new one to merge(created): _existsPostId not null, postsIdsWithoutExists.length > 0
			if (!postsIdsWithoutExists.length) {
				return _existsPostId;
			}
			console.log('mergePostsToOne', _existsPostId, postIds);
			if (_existsPostId && !includes(postIds, _existsPostId)) {
				postIds.push(_existsPostId);
			}
			const {userId, groupId} = _importState;

			const posts = await app.ms.group
				.getPostListByIds(userId, groupId, postIds).then(posts => posts.filter(p => !p.isDeleted));
			if (!posts.length) {
				return _existsPostId;
			}
			const resultPost = posts[0];

			let postsContents = _postData.contents || [];
			console.log('postsContents', postsContents.map(c => c.id));
			posts.forEach(({contents}) => postsContents = postsContents.concat(contents));

			_postData.contents = await this.sortContentsByMessagesContents(postsContents);
			console.log('_postData.contents', _postData.contents.map(c => c.id));

			console.log('deletePosts', posts.map(p => p.id).filter(id => id !== resultPost.id));
			await app.ms.group.deletePosts(userId, posts.map(p => p.id).filter(id => id !== resultPost.id));

			return resultPost.id;
		}

		async sortContentsByMessagesContents(contents) {
			contents = uniqBy(contents, c => c.manifestStorageId);
			const messageContents = await models.ContentMessage.findAll({
				where: {dbContentId: {[Op.in]: contents.map(c => c.id)}}
			});
			console.log('sortContentsByMessagesContents contents.map(c => c.id)', contents.map(c => c.id));
			console.log('sortContentsByMessagesContents messageContents.map(c => c.dbContentId)', messageContents.map(c => ({
				mId: c.msgId,
				cId: c.dbContentId
			})));
			return orderBy(contents, [(c) => {
				const mc = find(messageContents, {dbContentId: c.id});
				return mc.msgId * mc.updatedAt.getTime();
			}], ['asc']);
		}

		storeMessage(existsChannelMessage, _messageData) {
			if (existsChannelMessage && existsChannelMessage.msgId === _messageData.msgId) {
				return models.Message.update(_messageData, {where: {id: existsChannelMessage.id}});
			} else {
				return models.Message.create(_messageData).catch(e => {
					if (e.name === 'SequelizeUniqueConstraintError') {
						return models.Message.update(_messageData, {where: pick(_messageData, ['dbChannelId', 'userId', 'msgId'])});
					} else {
						throw e;
					}
				});
			}
		}

		storeContentMessage(contentMessageData, content) {
			return models.ContentMessage.create({...contentMessageData, dbContentId: content.id}).catch(() => {/* already added */});
		}

		getDbChannelLastMessage(dbChannelId) {
			return models.Message.findOne({
				where: {dbChannelId},
				order: [['postId', 'DESC']]
			});
		}

		async flushDatabase() {
			await pIteration.forEachSeries(['Message', 'Channel', 'ContentMessage'], (modelName) => {
				return models[modelName].destroy({where: {}});
			});
		}
	}

	return new SocNetImportModule();
}
