import {IGeesomeApp} from "../../interface";
import {
	ContentView,
	CorePermissionName,
	GroupPermissionName, IContent,
	IListParams,
} from "../database/interface";
import IGeesomeGroupModule, {GroupType, GroupView, IGroup, IGroupRead, IPost, PostStatus} from "./interface";

let helpers = require('../../helpers');
const geesomeLibsCommonHelper = require('geesome-libs/src/common');
const _ = require('lodash');
const pIteration = require('p-iteration');
const ipfsHelper = require('geesome-libs/src/ipfsHelper');
const log = require('debug')('geesome:app:group');
const pgpHelper = require('geesome-libs/src/pgpHelper');
const peerIdHelper = require('geesome-libs/src/peerIdHelper');
const commonHelpers = require('geesome-libs/src/common');
const Op = require("sequelize").Op;

module.exports = async (app: IGeesomeApp) => {
	app.checkModules(['database', 'communicator', 'storage', 'staticId', 'content']);
	const {sequelize, models} = app.ms.database;
	const module = getModule(app, await require('./models')(sequelize, models));
	require('./api')(app, module);
	return module;
}

function getModule(app: IGeesomeApp, models) {
	const {communicator} = app.ms;

	class GroupModule implements IGeesomeGroupModule {
		async createGroup(userId, groupData) {
			console.log('groupData', groupData);
			await app.checkUserCan(userId, CorePermissionName.UserGroupManagement);

			if (!groupData['name'] || !helpers.validateUsername(groupData['name'])) {
				throw new Error("incorrect_name");
			}
			const existUserWithName = await this.getGroupByParams({name: groupData['name'], isCollateral: false});
			if (existUserWithName) {
				throw new Error("name_already_exists");
			}

			groupData.creatorId = userId;
			groupData.manifestStaticStorageId = await app.ms.staticId.createStaticAccountId(userId, groupData['name']);
			if (groupData.type !== GroupType.PersonalChat) {
				groupData.staticStorageId = groupData.manifestStaticStorageId;
			}

			const group = await this.addGroup(groupData);
			await app.ms.staticId.setStaticAccountGroupId(userId, groupData['name'], group.id);

			// await app.callHook('hookAfterGroupSaving', [userId, group.id, groupData])

			if (groupData.type !== GroupType.PersonalChat) {
				await this.addAdminToGroupPure(userId, group.id);
			}

			await this.updateGroupManifest(userId, group.id);

			return this.getGroup(group.id);
		}

		async createGroupByObject(userId, groupObject) {
			let dbAvatar = await app.ms.database.getContentByManifestId(groupObject.avatarImage.manifestStorageId);
			if (!dbAvatar) {
				dbAvatar = await app.ms.content.createContentByObject(userId, groupObject.avatarImage);
			}
			let dbCover = await app.ms.database.getContentByManifestId(groupObject.coverImage.manifestStorageId);
			if (!dbCover) {
				dbCover = await app.ms.content.createContentByObject(userId, groupObject.coverImage);
			}
			const groupFields = ['manifestStaticStorageId', 'manifestStorageId', 'name', 'title', 'view', 'type', 'theme', 'homePage', 'isPublic', 'isRemote', 'description', 'size'];
			const dbGroup = await this.addGroup(_.extend(_.pick(groupObject, groupFields), {
				avatarImageId: dbAvatar ? dbAvatar.id : null,
				coverImageId: dbCover ? dbCover.id : null
			}));

			if (dbGroup.isRemote) {
				app.events.emit(app.events.NewRemoteGroup, dbGroup);
			}
			return dbGroup;
		}

		async canEditGroup(userId, groupId) {
			if (!groupId) {
				return false;
			}
			groupId = await this.checkGroupId(groupId);
			return this.isAdminInGroupPure(userId, groupId);
		}


		async isMemberInGroup(userId, groupId) {
			if (!groupId) {
				return false;
			}
			groupId = await this.checkGroupId(groupId);
			return this.isMemberInGroupPure(userId, groupId);
		}

		async isAdminInGroup(userId, groupId) {
			if (!groupId) {
				return false;
			}
			groupId = await this.checkGroupId(groupId);
			return this.isAdminInGroupPure(userId, groupId);
		}

		async addMemberToGroup(userId, groupId, memberId, groupPermissions = []) {
			groupPermissions = groupPermissions || [];
			await app.checkUserCan(userId, CorePermissionName.UserGroupManagement);
			groupId = await this.checkGroupId(groupId);
			const group = await this.getLocalGroup(userId, groupId);
			if(!(await this.isAdminInGroup(userId, groupId))) {
				if(userId.toString() !== memberId.toString()) {
					throw new Error("not_permitted");
				}
				if(!group.isPublic || !group.isOpen) {
					throw new Error("not_permitted");
				}
			}

			await this.addMemberToGroupPure(memberId, groupId);

			await pIteration.forEach(groupPermissions, (permissionName) => {
				return this.addGroupPermission(memberId, groupId, permissionName);
			});
		}

		async setMembersOfGroup(userId, groupId, newMemberUserIds) {
			await app.checkUserCan(userId, CorePermissionName.UserGroupManagement);
			if (!(await this.canEditGroup(userId, groupId))) {
				throw new Error("not_permitted");
			}
			groupId = await this.checkGroupId(groupId);
			await this.setMembersToGroup(newMemberUserIds, groupId);
		}

		async removeMemberFromGroup(userId, groupId, memberId) {
			await app.checkUserCan(userId, CorePermissionName.UserGroupManagement);
			groupId = await this.checkGroupId(groupId);
			const group = await this.getLocalGroup(userId, groupId);
			if(!(await this.isAdminInGroup(userId, groupId))) {
				if(userId.toString() !== memberId.toString()) {
					throw new Error("not_permitted");
				}
				if(!group.isPublic || !group.isOpen) {
					throw new Error("not_permitted");
				}
			}
			await (await this.getGroup(groupId)).removeMembers([await app.ms.database.getUser(memberId)]);
			await this.removeAllGroupPermission(memberId, groupId);
		}

		async setGroupPermissions(userId, groupId, memberId, groupPermissions = []) {
			await app.checkUserCan(userId, CorePermissionName.UserGroupManagement);
			groupId = await this.checkGroupId(groupId);
			if(!(await this.isAdminInGroup(userId, groupId))) {
				throw new Error("not_permitted");
			}
			await this.removeAllGroupPermission(memberId, groupId);

			await pIteration.forEach(groupPermissions, (permissionName) => {
				return this.addGroupPermission(memberId, groupId, permissionName);
			});
		}

		async addAdminToGroup(userId, groupId, newAdminUserId) {
			await app.checkUserCan(userId, CorePermissionName.UserGroupManagement);
			if (!(await this.canEditGroup(userId, groupId))) {
				throw new Error("not_permitted");
			}
			groupId = await this.checkGroupId(groupId);
			await this.addAdminToGroupPure(newAdminUserId, groupId);
		}

		async removeAdminFromGroup(userId, groupId, removeAdminUserId) {
			await app.checkUserCan(userId, CorePermissionName.UserGroupManagement);
			if (!(await this.canEditGroup(userId, groupId))) {
				throw new Error("not_permitted");
			}
			groupId = await this.checkGroupId(groupId);
			await (await this.getGroup(groupId)).removeAdministrators([await app.ms.database.getUser(removeAdminUserId)]);
		}

		async setAdminsOfGroup(userId, groupId, newAdminUserIds) {
			await app.checkUserCan(userId, CorePermissionName.UserGroupManagement);
			if (!(await this.canEditGroup(userId, groupId))) {
				throw new Error("not_permitted");
			}
			groupId = await this.checkGroupId(groupId);
			await this.setAdminsToGroup(newAdminUserIds, groupId);
		}

		async updateGroup(userId, groupId, updateData) {
			await app.checkUserCan(userId, CorePermissionName.UserGroupManagement);
			groupId = await this.checkGroupId(groupId);

			const groupPermission = await this.isHaveGroupPermission(userId, groupId, GroupPermissionName.EditGeneralData);
			const canEditGroup = await this.canEditGroup(userId, groupId);
			if (!canEditGroup && !groupPermission) {
				throw new Error("not_permitted");
			}
			if (!canEditGroup && groupPermission) {
				delete updateData.name;
				delete updateData.propertiesJson;
			}
			if (updateData['name'] && !helpers.validateUsername(updateData['name'])) {
				throw new Error("incorrect_name");
			}
			const group = await this.getGroup(groupId);
			if (updateData['name'] && updateData['name'] !== group.name) {
				await app.ms.staticId.renameGroupStaticAccountId(userId, groupId, group.name, updateData['name']);
			}
			await this.updateGroupPure(groupId, updateData);

			await this.updateGroupManifest(userId, groupId);

			log('updateGroupManifest:finish');

			return this.getGroup(groupId);
		}

		async updateGroupManifest(userId, groupId) {
			log('updateGroupManifest');
			const [group, size, availablePostsCount] = await Promise.all([
				this.getGroup(groupId),
				this.getGroupSizeSum(groupId),
				this.getGroupPostsCount(groupId, { isDeleted: false })
			]);
			group.size = size;
			log('getGroup, getGroupSizeSum');

			const manifestStorageId = await app.generateAndSaveManifest('group', group);
			log('generateAndSaveManifest');
			let storageUpdatedAt = group.storageUpdatedAt;
			let staticStorageUpdatedAt = group.staticStorageUpdatedAt;

			const promises = [];
			if (manifestStorageId != group.manifestStorageId) {
				storageUpdatedAt = new Date();
				staticStorageUpdatedAt = new Date();

				promises.push(app.ms.staticId.bindToStaticId(group.creatorId, manifestStorageId, group.manifestStaticStorageId))
			}

			promises.push(this.updateGroupPure(groupId, {
				manifestStorageId,
				storageUpdatedAt,
				staticStorageUpdatedAt,
				size,
				availablePostsCount
			}));
			return Promise.all(promises);
		}

		async updatePostManifest(userId, postId) {
			log('updatePostManifest');
			const post = await this.getPostPure(postId);
			log('getPost');
			const manifestStorageId = await app.generateAndSaveManifest('post', post);
			log('generateAndSaveManifest');
			await post.update({ manifestStorageId });
			const directoryStorageId = await this.makePostDirectoryWithContents(postId);
			await post.update({ directoryStorageId });
			await post.group.update({
				directoryStorageId: await app.ms.storage.getDirectoryId(`/${post.group.staticStorageId}/`)
			});
			await this.updateGroupManifest(userId, post.groupId);
			return post;
		}

		async getGroupUnreadPostsData(userId, groupId) {
			const groupRead = await this.getGroupRead(userId, groupId);
			if (groupRead) {
				return {
					readAt: groupRead.readAt,
					count: await this.getGroupPostsCount(groupId, { publishedAtGt: groupRead.readAt, isDeleted: false })
				};
			}
			const group = await this.getGroup(groupId);
			if (!group) {
				return {
					readAt: null,
					count: 0
				};
			}
			return {
				readAt: null,
				//TODO: delete publishedPostsCount using after migration
				count: group.availablePostsCount || group.publishedPostsCount
			};
		}

		async addOrUpdateGroupRead(userId, groupReadData) {
			groupReadData.userId = userId;
			let groupRead = await this.getGroupRead(userId, groupReadData.groupId);
			if (groupRead) {
				return this.updateGroupRead(groupRead.id, groupReadData);
			} else {
				return this.addGroupRead(groupReadData);
			}
		}

		async getGroupPeers(groupId) {
			let ipnsId;
			if (ipfsHelper.isAccountCidHash(groupId)) {
				ipnsId = groupId;
			} else {
				const group = await this.getGroup(groupId);
				ipnsId = group.manifestStaticStorageId;
			}
			return app.ms.staticId.getStaticIdPeers(ipnsId);
		}


		async getLocalGroup(userId, groupId) {
			groupId = await this.checkGroupId(groupId);
			return this.getGroup(groupId);
		}

		async getGroupByManifestId(groupId, staticId) {
			if (!staticId) {
				const historyItem = await app.ms.staticId.getStaticIdItemByDynamicId(groupId);
				if (historyItem) {
					staticId = historyItem.staticId;
				}
			}
			const whereOr = [];
			if (groupId) {
				whereOr.push({manifestStorageId: groupId});
			}
			if (staticId) {
				whereOr.push({manifestStaticStorageId: staticId});
			}
			if (!whereOr.length) {
				return null;
			}
			return models.Group.findOne({
				where: {[Op.or]: whereOr, isDeleted: false},
				include: [ {association: 'avatarImage'}, {association: 'coverImage'} ]
			}) as IGroup;
		}

		async getGroupPosts(groupId, filters = {}, listParams?: IListParams) {
			groupId = await this.checkGroupId(groupId);
			listParams = this.prepareListParams(listParams);
			if (_.isUndefined(filters['isDeleted'])) {
				filters['isDeleted'] = false;
			}

			app.ms.database.setDefaultListParamsValues(listParams, {sortBy: 'publishedAt'});
			const {limit, offset, sortBy, sortDir} = listParams;
			return {
				list: await models.Post.findAll({
					where: this.getGroupPostsWhere(groupId, filters),
					include: [{association: 'contents'}, {association: 'repostOf', include: [{association: 'contents'}, {association: 'group'}]}],
					order: [[sortBy, sortDir.toUpperCase()]],
					limit,
					offset
				}),
				total: await this.getGroupPostsCount(groupId, filters)
			};
		}

		async checkGroupId(groupId) {
			if (groupId == 'null' || groupId == 'undefined') {
				return null;
			}
			if (!groupId || _.isUndefined(groupId)) {
				return null;
			}
			if (!geesomeLibsCommonHelper.isNumber(groupId)) {
				let group = await this.getGroupByManifestId(groupId, groupId);
				if (group) {
					return group.id;
				}
			}
			return groupId;
		}

		async canCreatePostInGroup(userId, groupId) {
			console.log('canCreatePostInGroup', userId, groupId);
			if (!groupId) {
				return false;
			}
			groupId = await this.checkGroupId(groupId);
			const group = await this.getLocalGroup(userId, groupId);
			console.log('isAdminInGroup', await this.isAdminInGroupPure(userId, groupId));
			let canCreate = (await this.isAdminInGroupPure(userId, groupId))
				|| (!group.isOpen && await this.isMemberInGroupPure(userId, groupId));
			if(canCreate) {
				return canCreate;
			}

			const responses = await app.callHook('group', 'canCreatePostInGroup', [userId, groupId]);
			return _.some(responses);
		}

		async canReplyToPost(userId, replyToPostId) {
			if (!replyToPostId) {
				return true;
			}
			const post = await this.getPostPure(replyToPostId);
			if (post.isReplyForbidden) {
				return false;
			}
			if (post.isReplyForbidden === false) {
				return true;
			}
			if (await this.isAdminInGroupPure(userId, post.groupId)) {
				return true;
			}
			console.log('post.group.isReplyForbidden', post.group.isReplyForbidden);
			return !post.group.isReplyForbidden;
		}

		async canEditPostInGroup(userId, groupId, postId) {
			if (!groupId || !postId) {
				return false;
			}
			groupId = await this.checkGroupId(groupId);
			const group = await this.getLocalGroup(userId, groupId);
			const post = await this.getPostPure(postId);
			let canEdit = (await this.isAdminInGroupPure(userId, groupId))
				|| (!group.isOpen && await this.isMemberInGroupPure(userId, groupId) && post.userId === userId);
			if(canEdit) {
				return canEdit;
			}
			const responses = await app.callHook('group', 'canCreatePostInGroup', [userId, groupId]);
			return _.some(responses) && post.userId === userId;
		}

		async getContentsForPost(contents) {
			if(!contents) {
				return null;
			}
			let contentsData = contents.filter(c => c.id);
			const manifestStorageContents = contents.filter(c => c.manifestStorageId);
			const contentsByStorageManifests = await pIteration.map(manifestStorageContents, async c => ({
				id: await app.ms.content.getContentByManifestId(c.manifestStorageId).then(c => c ? c.id : null),
				...c
			}));
			return _.uniqBy(contentsData.concat(contentsByStorageManifests.filter(c => c.id)), 'id');
		}

		async createPost(userId, postData) {
			postData = _.clone(postData);
			log('createPost', postData);
			const [, canCreate, canReply] = await Promise.all([
				app.checkUserCan(userId, CorePermissionName.UserGroupManagement),
				this.canCreatePostInGroup(userId, postData.groupId),
				this.canReplyToPost(userId, postData.replyToId)
			]);
			if(!canCreate || !canReply) {
				throw new Error("not_permitted");
			}
			log('checkUserCan, canCreatePostInGroup');
			postData.userId = userId;
			postData.groupId = await this.checkGroupId(postData.groupId);
			log('checkGroupId');

			if (postData.status === PostStatus.Published) {
				postData.localId = await this.getPostLocalId(postData);
				postData.publishedAt = postData.publishedAt || new Date();
			}
			log('localId');

			const contents = await this.getContentsForPost(postData.contents);
			delete postData.contents;

			const [user, group] = await Promise.all([
				app.ms.database.getUser(userId),
				this.getGroup(postData.groupId)
			]);
			log('getUser, getGroup');

			postData.authorStorageId = user.manifestStorageId;
			postData.authorStaticStorageId = user.manifestStaticStorageId;
			postData.groupStorageId = group.manifestStorageId;
			postData.groupStaticStorageId = group.manifestStaticStorageId;

			if(!postData.isRemote) {
				postData.isRemote = false;
			}
			let post = await this.addPost(postData);
			log('addPost');

			let replyPostUpdatePromise = (async() => {
				if (post.replyToId) {
					const repliesCount = await this.getAllPostsCount({
						replyToId: post.replyToId
					});
					await models.Post.update({repliesCount}, {where: {id: post.replyToId}});
				}
			})();
			log('replyPostUpdatePromise');

			if (contents) {
				await this.setPostContents(post.id, contents);
			}
			log('setPostContents');

			let size = await this.getPostSizeSum(post.id);
			log('getPostSizeSum');
			await models.Post.update({size}, {where: {id: post.id}});
			log('updatePost');

			post = await this.updatePostManifest(userId, post.id);
			log('updatePostManifest');

			if (group.isEncrypted && group.type === GroupType.PersonalChat) {
				// Encrypt post id
				const keyForEncrypt = await app.ms.accountStorage.getStaticIdPublicKeyByOr(group.staticStorageId);

				const userKey = await communicator.keyLookup(user.manifestStaticStorageId);
				const userPrivateKey = await pgpHelper.transformKey(userKey.marshal());
				const userPublicKey = await pgpHelper.transformKey(userKey.public.marshal(), true);
				const publicKeyForEncrypt = await pgpHelper.transformKey(peerIdHelper.base64ToPublicKey(keyForEncrypt), true);
				const encryptedText = await pgpHelper.encrypt([userPrivateKey], [publicKeyForEncrypt, userPublicKey], post.manifestStorageId);

				//TODO: enable on fluence update

				// communicator.publishEventByStaticId(user.manifestStaticStorageId, communicator.getAccountsGroupUpdatesTopic([user.manifestStaticStorageId, group.staticStorageId], group.name), {
				// 	type: 'new_post',
				// 	postId: encryptedText,
				// 	groupId: group.manifestStaticStorageId,
				// 	isEncrypted: true,
				// 	sentAt: (post.publishedAt || post.createdAt).toString()
				// });

				await models.Post.update({isEncrypted: true, encryptedManifestStorageId: encryptedText}, {where: {id: post.id}});
				await this.updateGroupManifest(userId, group.id);
			} else {
				// Send plain post id
				//TODO: enable on fluence update

				// communicator.publishEventByStaticId(user.manifestStaticStorageId, communicator.getUpdatesTopic(group.staticStorageId, 'update'), {
				// 	type: 'new_post',
				// 	postId: post.manifestStorageId,
				// 	groupId: group.manifestStaticStorageId,
				// 	isEncrypted: false,
				// 	sentAt: (post.publishedAt || post.createdAt).toString()
				// });
				log('publishEventByStaticId');
			}

			await replyPostUpdatePromise;
			log('await replyPostUpdatePromise');

			return post;
		}

		async getPost(userId, postId) {
			await app.checkUserCan(userId, CorePermissionName.UserGroupManagement);
			//TODO: add check for user can view post
			return this.getPostPure(postId);
		}

		async getPostListByIds(userId, groupId, postIds) {
			await app.checkUserCan(userId, CorePermissionName.UserGroupManagement);
			//TODO: add check for user can view post
			return this.getPostListByIdsPure(groupId, postIds);
		}

		async delete(userId, groupId, postIds) {
			await app.checkUserCan(userId, CorePermissionName.UserGroupManagement);
			//TODO: add check for user can view post
			return this.getPostListByIdsPure(groupId, postIds);
		}

		async getPostContent(post: IPost): Promise<{type, mimeType, extension, view, manifestId, text?, json?, storageId?, previewStorageId?}[]> {
			// console.log('post.repostOf', post.repostOf);
			return pIteration.map(_.orderBy(post.contents, [c => c.postsContents.position], ['asc']), async (c: IContent) => {
				const baseData = {
					storageId: c.storageId,
					previewStorageId: c.mediumPreviewStorageId,
					extension: c.extension,
					mimeType: c.mimeType,
					view: c.view || ContentView.Contents,
					manifestId: c.manifestStorageId,
				}
				if (c.mimeType.startsWith('text/')) {
					return {
						type: 'text',
						text: await app.ms.storage.getFileDataText(c.storageId),
						...baseData
					}
				} else if (_.includes(c.mimeType, 'image')) {
					return {
						type: 'image',
						...baseData
					};
				} else if (_.includes(c.mimeType, 'video')) {
					return {
						type: 'video',
						...baseData
					};
				} else if (_.includes(c.mimeType, 'json')) {
					return {
						type: 'json',
						json: JSON.parse(await app.ms.storage.getFileDataText(c.storageId)),
						...baseData
					};
				}
			}).then(contents => contents.filter(c => c));
		}

		async getPostContentWithUrl(baseStorageUri, post: IPost): Promise<{type, mimeType, view, manifestId, text?, json?, storageId?, previewStorageId?, url?, previewUrl?}[]> {
			return this.getPostContent(post).then(contents => contents.map(c => {
				if (c.storageId) {
					c['url'] = baseStorageUri + c.storageId;
				}
				if (c.previewStorageId) {
					c['previewUrl'] = baseStorageUri + c.previewStorageId;
				}
				return c;
			}));
		}

		async updatePost(userId, postId, postData) {
			const oldPost = await this.getPostPure(postId);

			const [, canEdit, canEditNewGroup] = await Promise.all([
				await app.checkUserCan(userId, CorePermissionName.UserGroupManagement),
				this.canEditPostInGroup(userId, oldPost.groupId, postId),
				postData.groupId ? this.canEditPostInGroup(userId, postData.groupId, postId) : true
			]);
			if (!canEdit || !canEditNewGroup) {
				throw new Error("not_permitted");
			}

			const contentsData = await this.getContentsForPost(postData.contents);
			delete postData.contents;

			if (postData.status === PostStatus.Published && !oldPost.localId) {
				postData.localId = await this.getPostLocalId(postData);
			}

			if(contentsData) {
				await this.setPostContents(postId, contentsData);
			}

			postData.size = await this.getPostSizeSum(postId);

			await models.Post.update(postData, {where: {id: postId}});
			return this.updatePostManifest(userId, postId);
		}

		async deletePosts(userId, postIds) {
			await app.checkUserCan(userId, CorePermissionName.UserGroupManagement);
			const posts = await this.getPostsMetadata(postIds);
			const cantEditSomeOfPosts = await pIteration.some(posts, async (post) => {
				return this.canEditPostInGroup(userId, post.groupId, post.id).then(r => !r);
			})
			if (cantEditSomeOfPosts) {
				throw new Error("not_permitted");
			}
			return this.updatePosts(postIds, {isDeleted: true})
		}

		async getPostLocalId(post: IPost) {
			if (!post.groupId) {
				return null;
			}
			const group = await this.getGroup(post.groupId);
			group.publishedPostsCount++;
			await this.updateGroupPure(group.id, {publishedPostsCount: group.publishedPostsCount});
			return group.publishedPostsCount;
		}

		async addUserFriendById(userId, friendId) {
			await app.checkUserCan(userId, CorePermissionName.UserFriendsManagement);

			friendId = await app.checkUserId(userId, friendId, true);

			const user = await app.ms.database.getUser(userId);
			const friend = await app.ms.database.getUser(friendId);

			const group = await this.createGroup(userId, {
				name: (user.name + "_" + friend.name).replace(/[\W_]+/g, "_") + '_default',
				type: GroupType.PersonalChat,
				theme: 'default',
				title: friend.title,
				storageId: friend.manifestStorageId,
				staticStorageId: friend.manifestStaticStorageId,
				avatarImageId: friend.avatarImageId,
				view: GroupView.TelegramLike,
				isPublic: false,
				isEncrypted: true,
				isRemote: false
			});

			await this.addMemberToGroupPure(userId, group.id);
			await this.addAdminToGroupPure(userId, group.id);

			app.events.emit(app.events.NewPersonalGroup, group);

			return app.ms.database.addUserFriend(userId, friendId);
		}

		async removeUserFriendById(userId, friendId) {
			await app.checkUserCan(userId, CorePermissionName.UserFriendsManagement);

			friendId = await app.checkUserId(userId, friendId, true);

			// TODO: remove personal chat group?

			return app.ms.database.removeUserFriend(userId, friendId);
		}

		async getUserFriends(userId, search?, listParams?: IListParams) {
			listParams = this.prepareListParams(listParams);
			await app.checkUserCan(userId, CorePermissionName.UserFriendsManagement);
			return {
				list: await app.ms.database.getUserFriends(userId, search, listParams),
				total: await app.ms.database.getUserFriendsCount(userId, search)
			};
		}

		async getMemberInGroups(userId, types) {
			await app.checkUserCan(userId, CorePermissionName.UserGroupManagement);
			// TODO: use query object instead of types
			return {
				list: await (await app.ms.database.getUser(userId) as any).getMemberInGroups({
					where: { type: {[Op.in]: types}, isDeleted: false },
					include: [ {association: 'avatarImage'}, {association: 'coverImage'} ]
				}),
				total: null
				//TODO: total, limit, offset
			};
		}

		async getAdminInGroups(userId, types) {
			await app.checkUserCan(userId, CorePermissionName.UserGroupManagement);
			// TODO: use query object instead of types
			return {
				list: await (await app.ms.database.getUser(userId) as any).getAdministratorInGroups({
					where: { type: {[Op.in]: types}, isDeleted: false },
					include: [ {association: 'avatarImage'}, {association: 'coverImage'} ]
				}),
				total: null
				//TODO: total, limit, offset
			};
		}

		async getPersonalChatGroups(userId) {
			await app.checkUserCan(userId, CorePermissionName.UserGroupManagement);
			// TODO: use query object
			return {
				list: await this.getCreatorInGroupsByType(userId, GroupType.PersonalChat),
				total: -1
				//TODO: total, limit, offset
			};
		}

		async getAllGroupList(adminId, searchString?, listParams?: IListParams) {
			listParams = this.prepareListParams(listParams);
			await app.checkUserCan(adminId, CorePermissionName.AdminRead);
			
			app.ms.database.setDefaultListParamsValues(listParams);
			const {sortBy, sortDir, limit, offset} = listParams;
			return {
				list: await models.Group.findAll({
					where: this.getAllGroupWhere(searchString),
					order: [[sortBy, sortDir.toUpperCase()]],
					limit,
					offset
				}),
				total: await this.getAllGroupCount(searchString)
			};
		}

		async getGroup(id) {
			return models.Group.findOne({
				where: {id},
				include: [ {association: 'avatarImage'}, {association: 'coverImage'} ]
			}) as IGroup;
		}

		async getGroupWhereStaticOutdated(outdatedForSeconds) {
			return models.Group.findAll({
				where: {
					staticStorageUpdatedAt: {
						[Op.lt]: commonHelpers.moveDate(-parseFloat(outdatedForSeconds), 'second')
					},
					isDeleted: false
				}
			});
		}

		async getRemoteGroups() {
			return models.Group.findAll({ where: { isRemote: true, isDeleted: false } });
		}
		
		async addGroup(group) {
			return models.Group.create(group);
		}

		async updateGroupPure(id, updateData) {
			return models.Group.update(updateData, {where: {id}});
		}

		async addMemberToGroupPure(userId, groupId) {
			return (await this.getGroup(groupId)).addMembers([await app.ms.database.getUser(userId)]);
		}

		async setMembersToGroup(userIds, groupId) {
			return (await this.getGroup(groupId)).setMembers(userIds);
		}

		async addAdminToGroupPure(userId, groupId) {
			return (await this.getGroup(groupId)).addAdministrators([await app.ms.database.getUser(userId)]);
		}

		async setAdminsToGroup(userIds, groupId) {
			return (await this.getGroup(groupId)).setAdministrators(userIds);
		}

		async isAdminInGroupPure(userId, groupId) {
			const result = await (await app.ms.database.getUser(userId) as any).getAdministratorInGroups({ where: {id: groupId} });
			return result.length > 0;
		}

		async isMemberInGroupPure(userId, groupId) {
			const result = await (await app.ms.database.getUser(userId) as any).getMemberInGroups({ where: {id: groupId} });
			return result.length > 0;
		}

		async getCreatorInGroupsByType(creatorId, type: GroupType) {
			return models.Group.findAll({ where: {creatorId, type, isDeleted: false} }) as IGroup[];
		}

		getPostsWhere(filters) {
			const where = {
				isDeleted: false
			};
			['id', 'status', 'replyToId', 'name', 'groupId', 'isDeleted'].forEach((name) => {
				if(filters[name] === 'null') {
					filters[name] = null;
				}
				if(filters[name + 'Ne'] === 'null') {
					filters[name + 'Ne'] = null;
				}
				if(!_.isUndefined(filters[name])) {
					where[name] = filters[name];
				}
				if(!_.isUndefined(filters[name + 'Ne'])) {
					where[name] = {[Op.ne]: filters[name + 'Ne']};
				}
			});
			['publishedAt', 'updatedAt', 'id'].forEach(field => {
				['Gt', 'Gte', 'Lt', 'Lte'].forEach((postfix) => {
					if (filters[field + postfix]) {
						if(!where[field]) {
							where[field] = {};
						}
						where[field][Op[postfix.toLowerCase()]] = filters[field + postfix];
					}
				});
			});
			console.log('getPostsWhere', where);
			return where;
		}

		getGroupPostsWhere(groupId, filters) {
			return {
				groupId,
				...this.getPostsWhere(filters)
			};
		}

		public getGroupPostPath(posId) {
			const rootDiv = 10000, subDiv = 100;
			return `${Math.floor(posId / rootDiv)}/${Math.floor((posId % rootDiv) / subDiv)}/${posId}`;
		}

		public getFullGroupPostPath(staticStorageGroupId, postId) {
			return `/${staticStorageGroupId}/${this.getGroupPostPath(postId)}/`;
		}

		public async makePostStorageDir(group: IGroup, post: IPost) {
			const path = this.getFullGroupPostPath(group.staticStorageId, post.localId);
			log('makePostStorageDir', path);
			await app.ms.storage.makeDir(path);
			return path;
		}

		public async makePostDirectoryWithContents(postId) {
			log('makePostDirectoryWithContents');
			const post = await this.getPostPure(postId);
			const postManifest = await app.ms.storage.getObject(post.manifestStorageId);
			postManifest.contentsById = {};
			const path = await this.makePostStorageDir(post.group, post);
			await pIteration.forEach(post.contents, async (c: IContent, index) => {
				const [contentManifest] = await Promise.all([
					app.ms.storage.getObject(c.manifestStorageId),
					app.ms.storage.copyFileFromId(c.storageId, path + index),
				]);
				postManifest.contentsById[c.manifestStorageId] = contentManifest;
			});
			const postManifestStorageId = await app.ms.storage.saveFileByData(JSON.stringify(postManifest)).then(c => c.id);
			await app.ms.storage.copyFileFromId(postManifestStorageId, path + 'manifest.json');
			return app.ms.storage.getDirectoryId(path);
		}

		async getGroupPostsCount(groupId, filters = {}) {
			return models.Post.count({ where: this.getGroupPostsWhere(groupId, filters) });
		}

		async getAllPosts(filters = {}, listParams: IListParams = {}) {
			app.ms.database.setDefaultListParamsValues(listParams, {sortBy: 'publishedAt'});

			const {limit, offset, sortBy, sortDir} = listParams;

			return models.Post.findAll({
				where: this.getPostsWhere(filters),
				include: [{association: 'contents'}],
				order: [[sortBy, sortDir.toUpperCase()]],
				limit,
				offset
			});
		}

		async getAllPostsCount(filters = {}) {
			return models.Post.count({ where: this.getPostsWhere(filters) });
		}

		async getGroupSizeSum(id) {
			return (await models.Post.sum('size', {where: {groupId: id}})) || 0;
		}

		async getGroupByParams(params) {
			params = _.pick(params, ['name', 'staticStorageId', 'manifestStorageId', 'manifestStaticStorageId', 'isCollateral']);

			params.isDeleted = false;
			return models.Group.findOne({
				where: params,
				include: [ {association: 'avatarImage'}, {association: 'coverImage'} ]
			}) as IGroup;
		}

		async getPostByParams(params) {
			params = _.pick(params, ['name', 'staticStorageId', 'manifestStorageId', 'manifestStaticStorageId']);
			return models.Post.findOne({
				where: params,
				include: [{association: 'contents'}, {association: 'group'}],
			}) as IPost;
		}

		getGroupsWhere(filters) {
			const where = {};
			['name'].forEach((name) => {
				if(!_.isUndefined(filters[name])) {
					where[name] = filters[name];
				}
			});
			console.log('getGroupsWhere', where);
			return where;
		}

		async getPostPure(id) {
			const post = await models.Post.findOne({
				where: {id},
				include: [{association: 'contents'}, {association: 'group'}],
			});

			post.contents = _.orderBy(post.contents, [(content) => {
				return content.postsContents.position;
			}], ['asc']);

			return post;
		}

		async getPostsMetadata(postIds) {
			return models.Post.findAll({ where: {id: {[Op.in]: postIds}}}) as IPost[];
		}

		async getPostListByIdsPure(groupId, postIds) {
			const posts = await models.Post.findAll({
				where: {groupId, id: {[Op.in]: postIds}},
				include: [{association: 'contents'}, {association: 'group'}],
			});

			posts.forEach(post => {
				post.contents = _.orderBy(post.contents, [(content) => {
					return content.postsContents.position;
				}], ['asc']);
			})

			return posts;
		}

		async getPostByManifestId(manifestStorageId) {
			const post = await models.Post.findOne({
				where: { manifestStorageId },
				include: [{association: 'contents'}]
			});

			post.contents = _.orderBy(post.contents, [(content) => {
				return content.postsContents.position;
			}], ['asc']);

			return post;
		}

		async getPostByGroupManifestIdAndLocalId(groupManifestStorageId, localId) {
			const group = await this.getGroupByManifestId(groupManifestStorageId, groupManifestStorageId);

			if(!group) {
				return null;
			}

			const post = await models.Post.findOne({
				where: { localId, groupId: group.id },
				include: [{association: 'contents'}]
			});

			post.contents = _.orderBy(post.contents, [(content) => {
				return content.postsContents.position;
			}], ['asc']);

			return post;
		}

		async addPost(post) {
			return models.Post.create(post);
		}

		async updatePosts(ids, updateData) {
			return models.Post.update(updateData, {where: {id: {[Op.in]: ids}}});
		}

		async setPostContents(postId, contents) {
			contents = await pIteration.map(contents, async (content, position) => {
				const contentObj: any = await app.ms.database.getContent(content.id);
				contentObj.postsContents = {position, view: content.view};
				return contentObj;
			});
			return (await this.getPostPure(postId)).setContents(contents);
		}

		async getPostSizeSum(id) {
			const post = await this.getPostPure(id);
			return _.sumBy(post.contents, 'size');
		}

		async addGroupPermission(userId, groupId, permissionName) {
			return models.GroupPermission.create({userId, groupId, name: permissionName});
		}

		async removeGroupPermission(userId, groupId, permissionName) {
			return models.GroupPermission.destroy({where: {userId, groupId, name: permissionName}})
		}

		async removeAllGroupPermission(userId, groupId) {
			return models.GroupPermission.destroy({where: {userId, groupId}})
		}

		async getGroupPermissions(userId, groupId) {
			return models.GroupPermission.findAll({where: {userId, groupId}})
		}

		async isHaveGroupPermission(userId, groupId, permissionName) {
			return models.GroupPermission.findOne({where: {userId, groupId, name: permissionName}}).then(r => !!r);
		}

		async getGroupRead(userId, groupId) {
			return models.GroupRead.findOne({where: {userId, groupId}}) as IGroupRead;
		}

		async addGroupRead(groupReadData) {
			return models.GroupRead.create(groupReadData);
		}

		async removeGroupRead(userId, groupId) {
			return models.GroupRead.destroy({where: {userId, groupId}})
		}

		async updateGroupRead(id, updateData) {
			return models.GroupRead.update(updateData, {where: {id}});
		}

		getAllGroupWhere(searchString?) {
			let where: any = {isDeleted: false};
			if (searchString) {
				where = {[Op.or]: [{name: searchString}, {title: searchString}]};
			}
			return where;
		}

		async getAllGroupCount(searchString?) {
			return models.Group.count({
				where: this.getAllGroupWhere(searchString)
			});
		}

		// async beforeContentAdding(userId, contentData, options) {
		//
		// }

		prepareListParams(listParams?: IListParams): IListParams {
			return _.pick(listParams, ['sortBy', 'sortDir', 'limit', 'offset']);
		}

		async flushDatabase() {
			await pIteration.forEachSeries([
				'AutoTag', 'Tag', 'PostsContents', 'Post', 'GroupPermission',
				'GroupAdministrators', 'GroupMembers', 'Group'
			], (modelName) => {
				return models[modelName].destroy({where: {}});
			});
		}
	}

	return new GroupModule();
}