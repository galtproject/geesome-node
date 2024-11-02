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
import IGeesomeSocNetImport, {IGeesomeSocNetImportClient} from "./interface";

const pIteration = require('p-iteration');
const includes = require('lodash/includes');
const pick = require('lodash/pick');
const uniq = require('lodash/uniq');
const uniqBy = require('lodash/uniqBy');
const orderBy = require('lodash/orderBy');
const find = require('lodash/find');
const some = require('lodash/some');
const isString = require('lodash/isString');
const reverse = require('lodash/reverse');
const last = require('lodash/last');
const Op = require("sequelize").Op;

module.exports = async (app: IGeesomeApp) => {
	const commonHelper = (await import("geesome-libs/src/common.js")).default;
	const models = await require("./models")();
	const module = getModule(app, models);
	require('./api')(app, module, models);
	return module;
	function getModule(app: IGeesomeApp, models) {
		app.checkModules(['asyncOperation', 'group', 'content']);

		class SocNetImportModule implements IGeesomeSocNetImport {
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
				console.log('getDbPostIdByMsgId msgId', msgId);
				if (!msgId) {
					return;
				}
				msgId = parseInt(msgId);
				return models.Message.findOne({where: {msgId, dbChannelId}}).then(m => m ? m.postId : null);
			}

			getTimestampName(name) {
				return (name + '-' + Math.round(new Date().getTime() / 1000) + '-' + commonHelper.random().slice(0, 5));
			}

			async importChannelMetadata(userId, socNet, accountId, channelMetadata, updateData: any = {}) {
				const channelId = isString(channelMetadata.id) ? channelMetadata.id : channelMetadata.id.toString();
				let dbChannel = await this.getDbChannel(userId, {channelId});
				let group;

				console.log('importChannelMetadata', channelMetadata, updateData, JSON.stringify(dbChannel));
				group = dbChannel ? await app.ms.group.getLocalGroup(userId, dbChannel.groupId) : null;
				console.log('group', JSON.stringify(group));
				if (group && !group.isDeleted) {
					if (!group.isCollateral) {
						delete updateData['isCollateral'];
					}
					const data = {
						// TODO: make a separate request to update metadata
						// name: updateData['name'] || channelMetadata.username,
						title: channelMetadata.title,
						description: channelMetadata.about,
						avatarImageId: updateData.avatarImageId,
						isCollateral: updateData['isCollateral']
					};
					if (some(Object.keys(data), (key) => data[key] !== group[key])) {
						await app.ms.group.updateGroup(userId, dbChannel.groupId, data);
					}
				} else {
					let name = updateData['name'] || channelMetadata.username;
					if (updateData['isCollateral']) {
						name = this.getTimestampName(name || socNet + '-' + channelMetadata.id.toString())
					}
					name = name.replace(/[^a-zA-Z0-9\-_]/g, '');
					group = await app.ms.group.createGroup(userId, {
						name,
						title: channelMetadata.title,
						description: channelMetadata.about,
						isPublic: true,
						isCollateral: updateData['isCollateral'],
						type: GroupType.Channel,
						avatarImageId: updateData.avatarImageId,
						propertiesJson: JSON.stringify({
							lang: channelMetadata.lang || 'en',
							source: socNet,
							sourceId: channelMetadata.id.toString(),
							sourceUsername: channelMetadata.username || updateData['name'],
						})
					});
					const channelData = {
						userId,
						accountId,
						channelId,
						socNet,
						groupId: group.id,
						title: channelMetadata.title,
						postsCounts: 0,
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
				const fromTimestamp = lastMessage ? lastMessage.timestamp : null;
				console.log('lastMessage', lastMessage);
				let startMessageId = lastMessage ? lastMessage.msgId || 0 : 0;
				console.log('startMessageId', startMessageId);
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
				return {startMessageId, lastMessageId, fromTimestamp}
			}

			async openImportAsyncOperation(userId, userApiKeyId, dbChannel) {
				return app.ms.asyncOperation.addAsyncOperation(userId, {
					userApiKeyId,
					name: 'run-soc-net-channel-import',
					channel: 'id:' + dbChannel.id + ';op:' + await commonHelper.random()
				});
			}

			async importChannelPosts(client: IGeesomeSocNetImportClient) {
				const mergeSeconds = parseInt(client.advancedSettings['mergeSeconds']);
				const force = !!client.advancedSettings['force'];
				const isNeedToReverse = !!client.advancedSettings['isReversedList'];
				const importState = { mergeSeconds, force, isNeedToReverse };
				console.log('client.messages.list.length', client.messages.list.length);
				await pIteration.forEachSeries(client.messages.list, (m) => {
					return this.publishPostAndRelated(client, m, importState).catch(e => {
						console.error('publishPostAndRelated error', e);
						if (e.message.includes("import_canceled")) {
							throw e;
						}
						//TODO: remove line after debug
						throw e;
					});
				});
			}

			async publishPostAndRelated(_client: IGeesomeSocNetImportClient, _m, _importState: any = {}) {
				await new Promise((resolve) => setTimeout(resolve, 1000));

				const {userId, socNet} = _client;
				console.log('\n\npublishPostAndRelated m', JSON.stringify(_m));
				const dbChannels = {
					'repost': await _client.getRemotePostDbChannel(_m, 'repost'),
					'reply': await _client.getRemotePostDbChannel(_m, 'reply'),
					'post': await _client.getRemotePostDbChannel(_m, 'post')
				};
				const relMessages = {
					'repost': await _client.getRepostMessage(dbChannels['repost'], _m),
					'reply': await _client.getReplyMessage(dbChannels['reply'], _m)
				};
				let replyTo, repostOf;

				await pIteration.forEachSeries(['repost', 'reply', 'post'], async (type) => {
					const dbChannel = dbChannels[type];
					const m = type === 'post' ? _m : relMessages[type];
					console.log('\n\n', m ? m.id : null, 'type:', type, 'dbChannel:', JSON.stringify(dbChannel))
					if (!dbChannel || !m) {
						return _client.onRemotePostProcess ? await _client.onRemotePostProcess(m, dbChannel, null, type) : null;
					}
					_importState.dbChannelId = dbChannel.id;
					_importState.repostOfDbChannelId = dbChannels['repost'] ? dbChannels['repost'].id : null;
					let properties = {} as any;
					const postData = {
						userId,
						status: 'published',
						groupId: dbChannel.groupId,
						source: 'socNetImport:' + socNet,
						sourceChannelId: dbChannel.channelId,
						sourceDate: new Date(m.date * 1000),
					} as any;

					if (type === 'post') {
						relMessages['reply'] ? properties.replyToMsgId = relMessages['reply'].id : null;
						relMessages['repost'] ? properties.repostOfMsgId = relMessages['repost'].id : null;
						repostOf ? postData.repostOfId = repostOf.id : null;
						replyTo ? postData.replyToId = replyTo.id : null;
					} else if (type === 'repost') {
						relMessages['reply'] ? properties.replyToMsgId = relMessages['reply'].id : null;
						replyTo ? postData.replyToId = replyTo.id : null;
					}
					postData.properties = properties;
					postData.sourcePostId = m.id;

					const post = await this.checkExistMessageAndPublishPost(_client, postData, m, dbChannel, _importState, type);
					if (type === 'reply') {
						replyTo = post;
					} else if (type === 'repost') {
						repostOf = post;
					}
					console.log('❗️message', type, m.id, '=> post', post ? post.id : null);
					return _client.onRemotePostProcess ? await _client.onRemotePostProcess(m, dbChannel, post, type) : null;
				});
			}

			async checkExistMessageAndPublishPost(client, postData, m, dbChannel, importState, type) {
				const {userId} = client;
				const {force} = importState;

				const existsChannelMessage = await this.findExistsChannelMessage(m.id, dbChannel.id, userId);
				console.log('existsChannelMessage:', existsChannelMessage ? JSON.stringify(existsChannelMessage) : null)
				if (existsChannelMessage && !force) {
					const post = await app.ms.group.getPost(userId, existsChannelMessage.postId);
					// console.log('post:', JSON.stringify(post));
					client.onRemotePostProcess ? await client.onRemotePostProcess(m, post, type) : null;
					return post;
				}
				postData.properties = {
					sourceLink: await client.getRemotePostLink(dbChannel, m.id),
					...postData.properties,
					...await client.getRemotePostProperties(dbChannel, m, type)
				};
				postData.contents = await client.getRemotePostContents(dbChannel, m, type);
				console.log('postData', postData);

				return this.publishPost(importState, existsChannelMessage, postData, {
					userId,
					msgId: m.id,
					dbChannelId: dbChannel.id,
					repostOfDbChannelId: importState.repostOfDbChannelId,
					groupedId: m.groupedId ? m.groupedId.toString() : null,
					timestamp: m.date,
					replyToMsgId: postData.properties.replyToMsgId,
					repostOfMsgId: postData.properties.repostOfMsgId,
					isNeedToReverse: importState.isNeedToReverse,
				});
			}

			async publishPost(_importState, _existsChannelMessage, _postData, _msgData) {
				const {mergeSeconds} = _importState;
				const {userId} = _postData;
				let existsPostId = _existsChannelMessage && _existsChannelMessage.postId;

				if (!_postData.contents.length && !_postData.repostOfId) {
					await this.storeMessage(_existsChannelMessage, _msgData);
					return;
				}

				if (mergeSeconds) {
					const messagesByTimestamp = await models.Message.findAll({
						where: { dbChannelId: _msgData.dbChannelId, timestamp: { [Op.lte]: _msgData.timestamp + mergeSeconds, [Op.gte]: _msgData.timestamp - mergeSeconds } }
					});
					if (messagesByTimestamp.length) {
						const messagesToMerge = [];
						const lastMsg = last(orderBy(messagesByTimestamp.concat(_msgData), ['timestamp'], ['DESC']));
						orderBy(messagesByTimestamp.concat(_msgData), ['timestamp'], ['DESC']).some((m, i) => {
							const sameReply = m.replyToMsgId == lastMsg.replyToMsgId || messagesToMerge.some(m => m.msgId === lastMsg.replyToMsgId);
							console.log('sameReply', sameReply, 'm.msgId', m.msgId, 'm.replyToMsgId', m.replyToMsgId, 'lastMsg.replyToMsgId', lastMsg.replyToMsgId, 'messagesToMerge.filter', messagesToMerge.filter(m => m.msgId === lastMsg.replyToMsgId));
							const sameRepost = m.repostOfMsgId == lastMsg.repostOfMsgId || m.repostOfDbChannelId == lastMsg.repostOfDbChannelId;
							console.log('sameRepost', sameRepost, 'm.repostOfMsgId', m.repostOfMsgId, 'lastMsg.repostOfMsgId', lastMsg.repostOfMsgId, 'm.repostOfDbChannelId', lastMsg.repostOfDbChannelId);
							if (sameReply && sameRepost) {
								messagesToMerge.push(m);
							}
							return !(sameReply && sameRepost);
						});
						console.log('_msgData.timestamp', _msgData.timestamp, 'messagesByTimestamp', messagesByTimestamp.map(m => pick(m, ['msgId', 'timestamp'])), 'messagesToMerge', reverse(messagesToMerge).map(m => m.msgId), '_msgId', _msgData.msgId);
						existsPostId = await this.mergePostsToOne(_importState, existsPostId, reverse(messagesToMerge), _postData);
					}
				} else if (_msgData.groupedId) {
					const messagesByGroupedId = await models.Message.findAll({
						where: {
							dbChannelId: _msgData.dbChannelId,
							groupedId: _msgData.groupedId
						}
					});
					if (messagesByGroupedId.length) {
						existsPostId = await this.mergePostsToOne(_importState, existsPostId, messagesByGroupedId, _postData);
					}
				}

				console.log('existsPostId', existsPostId);
				if (_postData.contents) {
					await this.setContentsByMessagesContents(_postData, _msgData.dbChannelId);
				}
				_postData.publishedAt = new Date(_msgData.timestamp * 1000);
				_postData.isDeleted = false;
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
				const postIds = uniq(_messages.map(m => m.postId)).filter(id => id);
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
				const {userId, groupId} = _postData;
				const {dbChannelId} = _importState;

				const posts = await app.ms.group
					.getPostListByIds(userId, groupId, postIds)
					.then(posts => posts.filter(p => !p.isDeleted));
				if (!posts.length) {
					return _existsPostId;
				}
				const resultPost = posts[0];

				posts.forEach(({contents}) => _postData.contents = (_postData.contents || []).concat(contents));
				await this.setContentsByMessagesContents(_postData, dbChannelId);
				console.log('_postData.contents', _postData.contents.map(c => c.id));

				console.log('deletePosts', posts.map(p => p.id).filter(id => id !== resultPost.id));
				await app.ms.group.deletePosts(userId, posts.map(p => p.id).filter(id => id !== resultPost.id));

				return resultPost.id;
			}

			async setContentsByMessagesContents(_postData, _dbChannelId) {
				let {contents} = _postData;
				contents = uniqBy(contents, c => c.manifestStorageId);
				const messageContents = await models.ContentMessage.findAll({
					where: {dbChannelId: _dbChannelId, dbContentId: {[Op.in]: contents.map(c => c.id)}}
				});
				console.log('setContentsByMessagesContents contents.map(c => c.id)', contents.map(c => c.id));
				console.log('setContentsByMessagesContents messageContents.map(c => c.dbContentId)', messageContents.map(c => ({
					mId: c.msgId,
					cId: c.dbContentId
				})));
				_postData.contents = orderBy(contents, [(c) => {
					const mc = find(messageContents, {dbContentId: c.id});
					return mc.msgId * mc.updatedAt.getTime();
				}], ['asc']);
				_postData.properties.groupedMsgIds = uniq(orderBy(messageContents, [(mc) => mc.msgId * mc.updatedAt.getTime()], ['asc']).map(mc => mc.msgId));
				if (_postData.properties.groupedMsgIds.length <= 1) {
					delete _postData.properties.groupedMsgIds;
				}
				console.log('_postData.properties.groupedMsgIds', _postData.properties.groupedMsgIds);
			}

			storeMessage(existsChannelMessage, _messageData) {
				console.log('storeMessage', JSON.stringify(_messageData));
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
				console.log('storeContentMessage', contentMessageData, 'content.id', content ? content.id : null);
				return models.ContentMessage.create({...contentMessageData, dbContentId: content.id}).catch((e) => {
					console.error('models.ContentMessage.create', JSON.stringify(e.errors));
				});
			}

			getDbChannelLastMessage(dbChannelId) {
				return models.Message.findOne({
					where: {dbChannelId},
					order: [['postId', 'DESC']]
				});
			}

			async getDbChannelStartReverseMessage(dbChannelId) {
				return models.Message.findOne({
					where: {dbChannelId, isNeedToReverse: true},
					order: [['timestamp', 'DESC']]
				}) as any;
			}

			async reversePostsLocalIds(userId, dbChannelId) {
				console.log('dbChannelsToReverse', dbChannelId);
				const dbChannel = await this.getDbChannel(userId, {id: dbChannelId});
				const startReverseMessage = await this.getDbChannelStartReverseMessage(dbChannelId);
				console.log('startReverseMessage', startReverseMessage ? JSON.stringify(startReverseMessage) : null);
				if (!startReverseMessage) {
					return;
				}
				const {list: postsToReverse} = await app.ms.group.getGroupPosts(dbChannel.groupId, {idGte: startReverseMessage.postId});
				console.log('postsToReverse.length', postsToReverse.length);
				if (postsToReverse.length < 2) {
					return;
				}
				const startPost = postsToReverse[0];
				const lastPost = last(postsToReverse);
				await pIteration.forEach(reverse(postsToReverse), (p, i) => p.update({localId: startPost.localId + i}));
				console.log('startPost.id', startPost.id, 'last(postsToReverse).id', last(postsToReverse).id);
				return models.Message.update({isNeedToReverse: false}, {
					where: {dbChannelId, isNeedToReverse: true, postId: {[Op.gte]: startPost.id, [Op.lte]: lastPost.id}},
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
}

