/*
 * Copyright ©️ 2018-2021 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2021 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

import _ from 'lodash';
import debug from 'debug';
import {Op, Transaction} from "sequelize";
import pIteration from 'p-iteration';
import commonHelper from "geesome-libs/src/common.js";
import helpers from "../../helpers.js";
import IGeesomeSocNetImport, {IGeesomeSocNetImportClient} from "./interface.js";
import {IContent} from "../database/interface.js";
import {GroupType} from "../group/interface.js";
import {IGeesomeApp} from "../../interface.js";
const {pick, uniq, uniqBy, orderBy, find, some, isString, isUndefined, reverse, last} = _;
const log = debug('geesome:app:socNetImport');
const reverseLocalIdBatchLimit = 500;
const POST_SOURCE_IDENTITY_UNIQUE_INDEX = 'posts_group_source_post_unique';
const POST_SOURCE_IDENTITY_FIELDS = ['groupId', 'source', 'sourceChannelId', 'sourcePostId'];

export default async (app: IGeesomeApp) => {
	const models = await (await import("./models.js")).default(app.ms.database.sequelize);
	const module = getModule(app, models);
	await (await import('./api.js')).default(app, module);
	return module;
}

function getPostSourceIdentity(postData) {
	if (!postData) {
		return null;
	}
	const missingField = POST_SOURCE_IDENTITY_FIELDS.find((field) => {
		return isUndefined(postData[field]) || postData[field] === null;
	});
	if (missingField) {
		return null;
	}
	return pick(postData, POST_SOURCE_IDENTITY_FIELDS);
}

function getUniqueConstraintName(e) {
	if (!e) {
		return null;
	}
	if (e.parent && e.parent.constraint) {
		return e.parent.constraint;
	}
	if (e.original && e.original.constraint) {
		return e.original.constraint;
	}
	if (e.constraint) {
		return e.constraint;
	}
	return null;
}

function getUniqueErrorFieldNames(e) {
	if (!e || !e.fields) {
		return [];
	}
	if (Array.isArray(e.fields)) {
		return e.fields;
	}
	return Object.keys(e.fields);
}

function isPostSourceUniqueError(e, postData) {
	if (!e || e.name !== 'SequelizeUniqueConstraintError') {
		return false;
	}
	const constraintName = getUniqueConstraintName(e);
	if (constraintName === POST_SOURCE_IDENTITY_UNIQUE_INDEX) {
		return true;
	}
	const sourceIdentity = getPostSourceIdentity(postData);
	if (!sourceIdentity) {
		return false;
	}
	const errorFieldNames = getUniqueErrorFieldNames(e);
	if (!errorFieldNames.length) {
		return false;
	}
	return POST_SOURCE_IDENTITY_FIELDS.every(field => errorFieldNames.includes(field));
}

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
			msgId = msgId.toString();
			log('Message', {msgId, dbChannelId, userId});
			return models.Message.findOne({where: {msgId, dbChannelId, userId}});
		}

		async getDbPostIdByMsgId(dbChannelId, msgId) {
			log('getDbPostIdByMsgId msgId', msgId);
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

			helpers.logDebug(log, () => ['importChannelMetadata', channelMetadata, updateData, helpers.toLogValue(dbChannel)]);
			group = dbChannel ? await app.ms.group.getLocalGroup(userId, dbChannel.groupId) : null;
			helpers.logDebug(log, () => ['group', helpers.toLogValue(group)]);
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
			log('lastMessage', lastMessage);
			let startMessageId = lastMessage ? lastMessage.msgId || 0 : 0;
			log('startMessageId', startMessageId);
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
			helpers.logDebug(log, () => ['client.messages.list.length', client.messages?.list?.length]);
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
			helpers.logDebug(log, () => ['publishPostAndRelated m', _m]);
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
				helpers.logDebug(log, () => ['publishPostAndRelated relation', m?.id || null, 'type:', type, 'dbChannel:', helpers.toLogValue(dbChannel)]);
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
				postData.sourcePostId = m.id.toString();

				const post = await this.checkExistMessageAndPublishPost(_client, postData, m, dbChannel, _importState, type);
				if (type === 'reply') {
					replyTo = post;
				} else if (type === 'repost') {
					repostOf = post;
				}
				helpers.logDebug(log, () => ['message', type, m?.id || null, '=> post', post?.id || null]);
				return _client.onRemotePostProcess ? await _client.onRemotePostProcess(m, dbChannel, post, type) : null;
			});
		}

		async checkExistMessageAndPublishPost(client, postData, m, dbChannel, importState, type) {
			const {userId} = client;
			const {force} = importState;

			const existsChannelMessage = await this.findExistsChannelMessage(m.id, dbChannel.id, userId);
			helpers.logDebug(log, () => ['existsChannelMessage:', helpers.toLogValue(existsChannelMessage)]);
			if (existsChannelMessage && !force) {
				const post = await app.ms.group.getPost(userId, existsChannelMessage.postId);
				client.onRemotePostProcess ? await client.onRemotePostProcess(m, post, type) : null;
				return post;
			}
			postData.properties = {
				sourceLink: await client.getRemotePostLink(dbChannel, m.id),
				...postData.properties,
				...await client.getRemotePostProperties(dbChannel, m, type)
			};
			postData.contents = await client.getRemotePostContents(dbChannel, m, type);
			log('postData', postData);

			return this.publishPost(importState, existsChannelMessage, postData, {
				userId,
				msgId: postData.sourcePostId,
				dbChannelId: dbChannel.id,
				repostOfDbChannelId: importState.repostOfDbChannelId,
				groupedId: m.groupedId ? m.groupedId.toString() : null,
				timestamp: m.date,
				replyToMsgId: postData.properties.replyToMsgId,
				repostOfMsgId: postData.properties.repostOfMsgId,
				isNeedToReverse: importState.isNeedToReverse,
			});
		}

		async getPostBySourceIdentity(postData) {
			const sourceIdentity = getPostSourceIdentity(postData);
			if (!sourceIdentity) {
				return null;
			}
			return app.ms.database.models.Post.findOne({where: sourceIdentity});
		}

		async createPostOrUpdateSourceIdentity(userId, postData) {
			try {
				return await app.ms.group.createPost(userId, postData);
			} catch (e) {
				if (!isPostSourceUniqueError(e, postData)) {
					throw e;
				}
				const existsPost = await this.getPostBySourceIdentity(postData);
				if (!existsPost) {
					throw e;
				}
				const updatePostData = {...postData};
				delete updatePostData.userId;
				await app.ms.group.updatePost(userId, existsPost.id, updatePostData);
				return app.ms.group.getPostPure(existsPost.id);
			}
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
					const lastMsg: any = last(orderBy(messagesByTimestamp.concat(_msgData), ['timestamp'], ['desc']));
					orderBy(messagesByTimestamp.concat(_msgData), ['timestamp'], ['desc']).some((m: any, i) => {
						const sameReply = m.replyToMsgId == lastMsg.replyToMsgId || messagesToMerge.some(m => m.msgId === lastMsg.replyToMsgId);
						helpers.logDebug(log, () => [
							'sameReply',
							sameReply,
							'm.msgId',
							m?.msgId,
							'm.replyToMsgId',
							m?.replyToMsgId,
							'lastMsg.replyToMsgId',
							lastMsg?.replyToMsgId,
							'messagesToMerge.filter',
							helpers.mapForLog(messagesToMerge.filter(m => m.msgId === lastMsg.replyToMsgId), (m) => m?.msgId)
						]);
						const sameRepost = m.repostOfMsgId == lastMsg.repostOfMsgId || m.repostOfDbChannelId == lastMsg.repostOfDbChannelId;
						helpers.logDebug(log, () => [
							'sameRepost',
							sameRepost,
							'm.repostOfMsgId',
							m?.repostOfMsgId,
							'lastMsg.repostOfMsgId',
							lastMsg?.repostOfMsgId,
							'm.repostOfDbChannelId',
							lastMsg?.repostOfDbChannelId
						]);
						if (sameReply && sameRepost) {
							messagesToMerge.push(m);
						}
						return !(sameReply && sameRepost);
					});
					helpers.logDebug(log, () => [
						'_msgData.timestamp',
						_msgData.timestamp,
						'messagesByTimestamp',
						helpers.mapForLog(messagesByTimestamp, (m) => pick(m, ['msgId', 'timestamp'])),
						'messagesToMerge',
						helpers.mapForLog(reverse(messagesToMerge), (m) => m?.msgId),
						'_msgId',
						_msgData.msgId
					]);
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

			log('existsPostId', existsPostId);
			if (_postData.contents) {
				await this.setContentsByMessagesContents(_postData, _msgData.dbChannelId);
			}
			_postData.publishedAt = new Date(_msgData.timestamp * 1000);
			_postData.isDeleted = false;
			_postData.propertiesJson = JSON.stringify(_postData.properties);

			if (existsPostId) {
				await app.ms.group.updatePost(userId, existsPostId, _postData);
			} else {
				existsPostId = await this.createPostOrUpdateSourceIdentity(userId, _postData).then(p => p.id);
			}

			_msgData.postId = existsPostId;
			await this.storeMessage(_existsChannelMessage, _msgData);

			return app.ms.group.getPostPure(existsPostId);
		}

		async mergePostsToOne(_importState, _existsPostId, _messages, _postData) {
			const postIds = uniq(_messages.map(m => m.postId)).filter(id => id);
			log('postIds', postIds);
			const postsIdsWithoutExists = postIds.filter(postId => _existsPostId !== postId);
			log('postsIdsWithoutExists', postIds);
			// 1 case: there's created post and appears new one to merge(not created): _existsPostId is null, postsIdsWithoutExists.length > 0
			// 2 case: there's created post and appears new one to merge(created): _existsPostId not null, postsIdsWithoutExists.length > 0
			if (!postsIdsWithoutExists.length) {
				return _existsPostId;
			}
			log('mergePostsToOne', _existsPostId, postIds);
			if (_existsPostId && !postIds.includes(_existsPostId)) {
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
			helpers.logDebug(log, () => ['_postData.contents', helpers.mapForLog(_postData.contents, (c) => c?.id)]);

			const deletePostIds = posts.map(p => p.id).filter(id => id !== resultPost.id);
			log('deletePosts', deletePostIds);
			await app.ms.group.deletePosts(userId, deletePostIds);

			return resultPost.id;
		}

		async setContentsByMessagesContents(_postData, _dbChannelId) {
			let {contents} = _postData;
			contents = uniqBy(contents, (c: IContent) => c.manifestStorageId);
			const contentIds = contents.map(c => c.id);
			helpers.logDebug(log, () => ['where', {dbChannelId: _dbChannelId, dbContentId: {[Op.in]: contentIds}}]);
			await helpers.logDebugAsync(log, async () => [
				'ContentMessage',
				helpers.mapForLog(await models.ContentMessage.findAll({}), (cm) => helpers.toLogValue(cm))
			]);
			const messageContents = await models.ContentMessage.findAll({
				where: {dbChannelId: _dbChannelId, dbContentId: {[Op.in]: contentIds}}
			});
			helpers.logDebug(log, () => ['setContentsByMessagesContents contents.map(c => c.id)', contentIds]);
			helpers.logDebug(log, () => [
				'setContentsByMessagesContents messageContents.map(c => c.dbContentId)',
				helpers.mapForLog(messageContents, (c) => ({
					mId: c?.msgId,
					cId: c?.dbContentId
				}))
			]);
			_postData.contents = orderBy(contents, [(c) => {
				const mc = find(messageContents, {dbContentId: c.id});
				return mc.msgId * mc.updatedAt.getTime();
			}], ['asc']);
			_postData.properties.groupedMsgIds = uniq(orderBy(messageContents, [(mc) => mc.msgId * mc.updatedAt.getTime()], ['asc']).map(mc => mc.msgId));
			if (_postData.properties.groupedMsgIds.length <= 1) {
				delete _postData.properties.groupedMsgIds;
			}
			log('_postData.properties.groupedMsgIds', _postData.properties.groupedMsgIds);
		}

		storeMessage(existsChannelMessage, _messageData) {
			helpers.logDebug(log, () => ['storeMessage', _messageData]);
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
			log('storeContentMessage', contentMessageData, 'content.id', content ? content.id : null);
			return models.ContentMessage.create({...contentMessageData, dbContentId: content.id}).catch((e) => {
				console.error('models.ContentMessage.create error', e);
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

		async getFirstPostToReverse(groupId, startPostId) {
			const postRefs = await app.ms.group.getGroupPostRefs(groupId, {idGte: startPostId}, {
				sortBy: 'publishedAt',
				sortDir: 'DESC',
				limit: 1,
				offset: 0
			}, {
				attributes: ['id', 'localId', 'publishedAt']
			});
			return postRefs[0] || null;
		}

		async reversePostLocalIdBatch(postRefs, state) {
			return pIteration.forEachSeries(postRefs, async (postRef) => {
				state.minPostId = Math.min(state.minPostId, postRef.id);
				state.maxPostId = Math.max(state.maxPostId, postRef.id);
				await postRef.update({localId: state.startLocalId + state.reversedCount}, {transaction: state.transaction});
				state.reversedCount += 1;
			});
		}

		async movePostLocalIdBatchToTemporary(postRefs, state) {
			return pIteration.forEachSeries(postRefs, async (postRef) => {
				await postRef.update({localId: state.temporaryLocalId + state.movedCount}, {transaction: state.transaction});
				state.movedCount += 1;
			});
		}

		async reversePostsLocalIds(userId, dbChannelId) {
			log('dbChannelsToReverse', dbChannelId);
			const dbChannel = await this.getDbChannel(userId, {id: dbChannelId});
			const startReverseMessage = await this.getDbChannelStartReverseMessage(dbChannelId);
			helpers.logDebug(log, () => ['startReverseMessage', helpers.toLogValue(startReverseMessage)]);
			if (!startReverseMessage) {
				return;
			}
			const startPost = await this.getFirstPostToReverse(dbChannel.groupId, startReverseMessage.postId);
			if (!startPost) {
				return;
			}
			const reverseBatchOptions = {
				filters: {idGte: startReverseMessage.postId},
				batchLimit: reverseLocalIdBatchLimit,
				listParams: {
					sortBy: 'publishedAt',
					sortDir: 'ASC'
				},
				attributes: ['id', 'localId', 'publishedAt'],
				cursor: {
					cursorValueFilter: 'reverseCursorPublishedAt',
					cursorIdFilter: 'reverseCursorId',
					direction: 'after',
					orderDir: 'ASC'
				}
			};
			return app.ms.database.sequelize.transaction(async (transaction) => {
				const group = await app.ms.database.models.Group.findOne({
					where: {id: dbChannel.groupId},
					transaction,
					lock: Transaction.LOCK.UPDATE
				});
				if (!group) {
					throw new Error('group_not_found');
				}
				const maxLocalId = await app.ms.database.models.Post.max('localId', {
					where: {groupId: dbChannel.groupId},
					transaction
				}).then(m => m || 0);
				const reverseState = {
					startLocalId: startPost.localId,
					temporaryLocalId: maxLocalId + 1,
					movedCount: 0,
					reversedCount: 0,
					minPostId: startPost.id,
					maxPostId: startPost.id,
					transaction
				};
				await app.ms.group.forEachGroupPostRefBatch(
					dbChannel.groupId,
					{...reverseBatchOptions, transaction},
					({postRefs}) => this.movePostLocalIdBatchToTemporary(postRefs, reverseState)
				);
				if (!reverseState.movedCount) {
					return;
				}
				await app.ms.group.forEachGroupPostRefBatch(
					dbChannel.groupId,
					{...reverseBatchOptions, transaction},
					({postRefs}) => this.reversePostLocalIdBatch(postRefs, reverseState)
				);
				helpers.logDebug(log, () => ['postsToReverse.length', reverseState?.reversedCount]);
				if (reverseState.reversedCount < 2) {
					return;
				}
				helpers.logDebug(log, () => ['firstPostId', reverseState?.minPostId, 'lastPostId', reverseState?.maxPostId]);
				return models.Message.update({isNeedToReverse: false}, {
					where: {dbChannelId, isNeedToReverse: true, postId: {[Op.gte]: reverseState.minPostId, [Op.lte]: reverseState.maxPostId}},
					transaction
				});
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
