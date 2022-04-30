import {IGeesomeApp, IGeesomeGroupModule} from "../../interface";
import {
	ContentView,
	CorePermissionName,
	GroupPermissionName,
	GroupType,
	GroupView,
	IContent,
	IGroup,
	IListParams,
	IPost,
	PostStatus
} from "../database/interface";

let helpers = require('../../helpers');
const commonHelper = require('geesome-libs/src/common');
const _ = require('lodash');
const pIteration = require('p-iteration');
const ipfsHelper = require('geesome-libs/src/ipfsHelper');
const log = require('debug')('geesome:app:group');
const {getPersonalChatTopic, getGroupUpdatesTopic} = require('geesome-libs/src/name');
const pgpHelper = require('geesome-libs/src/pgpHelper');
const peerIdHelper = require('geesome-libs/src/peerIdHelper');

module.exports = (app: IGeesomeApp) => {
	const module = getModule(app);
	require('./api')(app, module);
	return module;
}

function getModule(app: IGeesomeApp) {
	app.checkModules(['database', 'communicator', 'storage', 'entityJsonManifest']);

	class GroupModule implements IGeesomeGroupModule {
		async createGroup(userId, groupData) {
			await app.checkUserCan(userId, CorePermissionName.UserGroupManagement);

			const existUserWithName = await app.ms.database.getGroupByParams({name: groupData['name']});
			if (existUserWithName) {
				throw new Error("name_already_exists");
			}
			if (!groupData['name'] || !helpers.validateUsername(groupData['name'])) {
				throw new Error("incorrect_name");
			}

			groupData.creatorId = userId;
			if (!groupData.isRemote) {
				groupData.isRemote = false;
			}

			groupData.manifestStaticStorageId = await app.createStorageAccount(groupData['name']);
			if (groupData.type !== GroupType.PersonalChat) {
				groupData.staticStorageId = groupData.manifestStaticStorageId;
			}

			const group = await app.ms.database.addGroup(groupData);

			if (groupData.type !== GroupType.PersonalChat) {
				await app.ms.database.addAdminToGroup(userId, group.id);
			}

			await this.updateGroupManifest(group.id);

			return app.ms.database.getGroup(group.id);
		}

		async createGroupByRemoteStorageId(manifestStorageId) {
			let staticStorageId;
			if (ipfsHelper.isIpfsHash(manifestStorageId)) {
				staticStorageId = manifestStorageId;
				manifestStorageId = await app.resolveStaticId(staticStorageId);
			}

			let dbGroup = await this.getGroupByManifestId(manifestStorageId, staticStorageId);
			if (dbGroup) {
				//TODO: update group if necessary
				return dbGroup;
			}
			const groupObject: IGroup = await app.ms.entityJsonManifest.manifestIdToDbObject(staticStorageId || manifestStorageId);
			groupObject.isRemote = true;
			return this.createGroupByObject(groupObject);
		}

		async createGroupByObject(groupObject) {
			let dbAvatar = await app.ms.database.getContentByManifestId(groupObject.avatarImage.manifestStorageId);
			if (!dbAvatar) {
				dbAvatar = await app.createContentByObject(groupObject.avatarImage);
			}
			let dbCover = await app.ms.database.getContentByManifestId(groupObject.coverImage.manifestStorageId);
			if (!dbCover) {
				dbCover = await app.createContentByObject(groupObject.coverImage);
			}
			const groupFields = ['manifestStaticStorageId', 'manifestStorageId', 'name', 'title', 'view', 'type', 'theme', 'homePage', 'isPublic', 'isRemote', 'description', 'size'];
			const dbGroup = await app.ms.database.addGroup(_.extend(_.pick(groupObject, groupFields), {
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
			return app.ms.database.isAdminInGroup(userId, groupId);
		}


		async isMemberInGroup(userId, groupId) {
			if (!groupId) {
				return false;
			}
			groupId = await this.checkGroupId(groupId);
			return app.ms.database.isMemberInGroup(userId, groupId);
		}

		async isAdminInGroup(userId, groupId) {
			if (!groupId) {
				return false;
			}
			groupId = await this.checkGroupId(groupId);
			return app.ms.database.isAdminInGroup(userId, groupId);
		}

		async addMemberToGroup(userId, groupId, memberId, groupPermissions = []) {
			groupPermissions = groupPermissions || [];
			await app.checkUserCan(userId, CorePermissionName.UserGroupManagement);
			groupId = await this.checkGroupId(groupId);
			const group = await this.getGroup(groupId);
			if(!(await this.isAdminInGroup(userId, groupId))) {
				if(userId.toString() !== memberId.toString()) {
					throw new Error("not_permitted");
				}
				if(!group.isPublic || !group.isOpen) {
					throw new Error("not_permitted");
				}
			}

			await app.ms.database.addMemberToGroup(memberId, groupId);

			await pIteration.forEach(groupPermissions, (permissionName) => {
				return app.ms.database.addGroupPermission(memberId, groupId, permissionName);
			});
		}

		async setMembersOfGroup(userId, groupId, newMemberUserIds) {
			await app.checkUserCan(userId, CorePermissionName.UserGroupManagement);
			if (!(await this.canEditGroup(userId, groupId))) {
				throw new Error("not_permitted");
			}
			groupId = await this.checkGroupId(groupId);
			await app.ms.database.setMembersToGroup(newMemberUserIds, groupId);
		}

		async removeMemberFromGroup(userId, groupId, memberId) {
			await app.checkUserCan(userId, CorePermissionName.UserGroupManagement);
			groupId = await this.checkGroupId(groupId);
			const group = await this.getGroup(groupId);
			if(!(await this.isAdminInGroup(userId, groupId))) {
				if(userId.toString() !== memberId.toString()) {
					throw new Error("not_permitted");
				}
				if(!group.isPublic || !group.isOpen) {
					throw new Error("not_permitted");
				}
			}
			await app.ms.database.removeMemberFromGroup(memberId, groupId);
			await app.ms.database.removeAllGroupPermission(memberId, groupId);
		}

		async setGroupPermissions(userId, groupId, memberId, groupPermissions = []) {
			await app.checkUserCan(userId, CorePermissionName.UserGroupManagement);
			groupId = await this.checkGroupId(groupId);
			if(!(await this.isAdminInGroup(userId, groupId))) {
				throw new Error("not_permitted");
			}
			await app.ms.database.removeAllGroupPermission(memberId, groupId);

			await pIteration.forEach(groupPermissions, (permissionName) => {
				return app.ms.database.addGroupPermission(memberId, groupId, permissionName);
			});
		}

		async addAdminToGroup(userId, groupId, newAdminUserId) {
			await app.checkUserCan(userId, CorePermissionName.UserGroupManagement);
			if (!(await this.canEditGroup(userId, groupId))) {
				throw new Error("not_permitted");
			}
			groupId = await this.checkGroupId(groupId);
			await app.ms.database.addAdminToGroup(newAdminUserId, groupId);
		}

		async removeAdminFromGroup(userId, groupId, removeAdminUserId) {
			await app.checkUserCan(userId, CorePermissionName.UserGroupManagement);
			if (!(await this.canEditGroup(userId, groupId))) {
				throw new Error("not_permitted");
			}
			groupId = await this.checkGroupId(groupId);
			await app.ms.database.removeAdminFromGroup(removeAdminUserId, groupId);
		}

		async setAdminsOfGroup(userId, groupId, newAdminUserIds) {
			await app.checkUserCan(userId, CorePermissionName.UserGroupManagement);
			if (!(await this.canEditGroup(userId, groupId))) {
				throw new Error("not_permitted");
			}
			groupId = await this.checkGroupId(groupId);
			await app.ms.database.setAdminsToGroup(newAdminUserIds, groupId);
		}

		async updateGroup(userId, groupId, updateData) {
			await app.checkUserCan(userId, CorePermissionName.UserGroupManagement);
			groupId = await this.checkGroupId(groupId);

			const groupPermission = await app.ms.database.isHaveGroupPermission(userId, groupId, GroupPermissionName.EditGeneralData);
			const canEditGroup = await this.canEditGroup(userId, groupId);
			if (!canEditGroup && !groupPermission) {
				throw new Error("not_permitted");
			}
			if(!canEditGroup && groupPermission) {
				delete updateData.name;
				delete updateData.propertiesJson;
			}
			if (updateData['name'] && !helpers.validateUsername(updateData['name'])) {
				throw new Error("incorrect_name");
			}
			await app.ms.database.updateGroup(groupId, updateData);

			await this.updateGroupManifest(groupId);

			return app.ms.database.getGroup(groupId);
		}

		async getGroupByParams(params) {
			return app.ms.database.getGroupByParams(_.pick(params, ['name', 'staticStorageId', 'manifestStorageId', 'manifestStaticStorageId']));
		}

		async updateGroupManifest(groupId) {
			log('updateGroupManifest');
			const [group, size, availablePostsCount] = await Promise.all([
				app.ms.database.getGroup(groupId),
				app.ms.database.getGroupSizeSum(groupId),
				app.ms.database.getGroupPostsCount(groupId, { isDeleted: false })
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

				promises.push(app.bindToStaticId(manifestStorageId, group.manifestStaticStorageId))
			}

			promises.push(app.ms.database.updateGroup(groupId, {
				manifestStorageId,
				storageUpdatedAt,
				staticStorageUpdatedAt,
				size,
				availablePostsCount
			}));
			return Promise.all(promises);
		}

		async updatePostManifest(postId) {
			log('updatePostManifest');
			const post = await app.ms.database.getPost(postId);
			log('getPost');
			const manifestStorageId = await app.generateAndSaveManifest('post', post);
			log('getPosgenerateAndSaveManifest');

			await app.ms.database.updatePost(postId, { manifestStorageId });
			log('updatePost');

			await this.updateGroupManifest(post.groupId);
			post.manifestStorageId = manifestStorageId;
			return post;
		}

		async getGroupUnreadPostsData(userId, groupId) {
			const groupRead = await app.ms.database.getGroupRead(userId, groupId);
			if (groupRead) {
				return {
					readAt: groupRead.readAt,
					count: await app.ms.database.getGroupPostsCount(groupId, { publishedAtGt: groupRead.readAt, isDeleted: false })
				};
			}
			const group = await app.ms.database.getGroup(groupId);
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
			let groupRead = await app.ms.database.getGroupRead(userId, groupReadData.groupId);
			if (groupRead) {
				return app.ms.database.updateGroupRead(groupRead.id, groupReadData);
			} else {
				return app.ms.database.addGroupRead(groupReadData);
			}
		}

		async getGroupPeers(groupId) {
			let ipnsId;
			if (ipfsHelper.isIpfsHash(groupId)) {
				ipnsId = groupId;
			} else {
				const group = await app.ms.database.getGroup(groupId);
				ipnsId = group.manifestStaticStorageId;
			}
			return app.getStaticIdPeers(ipnsId);
		}

		async createPostByRemoteStorageId(manifestStorageId, groupId, publishedAt = null, isEncrypted = false) {
			const postObject: IPost = await app.ms.entityJsonManifest.manifestIdToDbObject(manifestStorageId, 'post-manifest', {
				isEncrypted,
				groupId,
				publishedAt
			});
			postObject.isRemote = true;
			postObject.status = PostStatus.Published;
			postObject.localId = await this.getPostLocalId(postObject);

			const {contents} = postObject;
			delete postObject.contents;

			let post = await app.ms.database.addPost(postObject);

			if (!isEncrypted) {
				// console.log('postObject', postObject);
				await app.ms.database.setPostContents(post.id, contents.map(c => c.id));
			}

			await this.updateGroupManifest(post.groupId);

			return app.ms.database.getPost(post.id);
		}

		async getGroup(groupId) {
			groupId = await this.checkGroupId(groupId);
			return app.ms.database.getGroup(groupId);
		}

		async getGroupByManifestId(groupId, staticId) {
			if (!staticId) {
				const historyItem = await app.ms.database.getStaticIdItemByDynamicId(groupId);
				if (historyItem) {
					staticId = historyItem.staticId;
				}
			}
			return app.ms.database.getGroupByManifestId(groupId, staticId);
		}

		async getGroupPosts(groupId, filters = {}, listParams?: IListParams) {
			groupId = await this.checkGroupId(groupId);
			listParams = this.prepareListParams(listParams);
			if (_.isUndefined(filters['isDeleted'])) {
				filters['isDeleted'] = false;
			}
			return {
				list: await app.ms.database.getGroupPosts(groupId, filters, listParams),
				total: await app.ms.database.getGroupPostsCount(groupId, filters)
			};
		}


		async checkGroupId(groupId, createIfNotExist = true) {
			if (groupId == 'null' || groupId == 'undefined') {
				return null;
			}
			if (!groupId || _.isUndefined(groupId)) {
				return null;
			}
			if (!commonHelper.isNumber(groupId)) {
				let group = await this.getGroupByManifestId(groupId, groupId);
				if (!group && createIfNotExist) {
					group = await this.createGroupByRemoteStorageId(groupId);
					return group.id;
				} else if (group) {
					groupId = group.id;
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
			const group = await this.getGroup(groupId);
			console.log('isAdminInGroup', await app.ms.database.isAdminInGroup(userId, groupId));
			return (await app.ms.database.isAdminInGroup(userId, groupId))
				|| (!group.isOpen && await app.ms.database.isMemberInGroup(userId, groupId))
				|| (group.membershipOfCategoryId && await app.ms.database.isMemberInCategory(userId, group.membershipOfCategoryId));
		}

		async canReplyToPost(userId, replyToPostId) {
			if (!replyToPostId) {
				return true;
			}
			const post = await app.ms.database.getPost(replyToPostId);
			if(post.isReplyForbidden) {
				return false;
			}
			if(post.isReplyForbidden === false) {
				return true;
			}
			if(await app.ms.database.isAdminInGroup(userId, post.groupId)) {
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
			const group = await this.getGroup(groupId);
			const post = await app.ms.database.getPost(postId);
			return (await app.ms.database.isAdminInGroup(userId, groupId))
				|| (!group.isOpen && await app.ms.database.isMemberInGroup(userId, groupId) && post.userId === userId)
				|| (!group.isOpen && group.membershipOfCategoryId && await app.ms.database.isMemberInCategory(userId, group.membershipOfCategoryId) && post.userId === userId);
		}

		async getPostByParams(params) {
			return app.ms.database.getPostByParams(_.pick(params, ['name', 'staticStorageId', 'manifestStorageId', 'manifestStaticStorageId']));
		}

		async getContentsForPost(contents) {
			if(!contents) {
				return null;
			}
			let contentsData = contents.filter(c => c.id);
			const manifestStorageContents = contents.filter(c => c.manifestStorageId);
			const contentsByStorageManifests = await pIteration.map(manifestStorageContents, async c => ({
				id: await app.getContentByManifestId(c.manifestStorageId).then(c => c ? c.id : null),
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

			const contentsData = await this.getContentsForPost(postData.contents);
			delete postData.contents;

			const [user, group] = await Promise.all([
				app.ms.database.getUser(userId),
				app.ms.database.getGroup(postData.groupId)
			]);
			log('getUser, getGroup');

			postData.authorStorageId = user.manifestStorageId;
			postData.authorStaticStorageId = user.manifestStaticStorageId;
			postData.groupStorageId = group.manifestStorageId;
			postData.groupStaticStorageId = group.manifestStaticStorageId;

			if(!postData.isRemote) {
				postData.isRemote = false;
			}
			let post = await app.ms.database.addPost(postData);
			log('addPost');

			let replyPostUpdatePromise = (async() => {
				if(post.replyToId) {
					const repliesCount = await app.ms.database.getAllPostsCount({
						replyToId: post.replyToId
					});
					await app.ms.database.updatePost(post.replyToId, {repliesCount});
				}
			})();
			log('replyPostUpdatePromise');

			if(contentsData) {
				await app.ms.database.setPostContents(post.id, contentsData);
			}
			log('setPostContents');

			let size = await app.ms.database.getPostSizeSum(post.id);
			log('getPostSizeSum');
			await app.ms.database.updatePost(post.id, {size});
			log('updatePost');

			post = await this.updatePostManifest(post.id);
			log('updatePostManifest');

			if (group.isEncrypted && group.type === GroupType.PersonalChat) {
				// Encrypt post id
				const keyForEncrypt = await app.ms.database.getStaticIdPublicKey(group.staticStorageId);

				const userKey = await app.ms.communicator.keyLookup(user.manifestStaticStorageId);
				const userPrivateKey = await pgpHelper.transformKey(userKey.marshal());
				const userPublicKey = await pgpHelper.transformKey(userKey.public.marshal(), true);
				const publicKeyForEncrypt = await pgpHelper.transformKey(peerIdHelper.base64ToPublicKey(keyForEncrypt), true);
				const encryptedText = await pgpHelper.encrypt([userPrivateKey], [publicKeyForEncrypt, userPublicKey], post.manifestStorageId);

				await app.ms.communicator.publishEventByStaticId(user.manifestStaticStorageId, getPersonalChatTopic([user.manifestStaticStorageId, group.staticStorageId], group.theme), {
					type: 'new_post',
					postId: encryptedText,
					groupId: group.manifestStaticStorageId,
					isEncrypted: true,
					sentAt: (post.publishedAt || post.createdAt).toString()
				});

				await app.ms.database.updatePost(post.id, {isEncrypted: true, encryptedManifestStorageId: encryptedText});
				await this.updateGroupManifest(group.id);
			} else {
				// Send plain post id
				app.ms.communicator.publishEventByStaticId(user.manifestStaticStorageId, getGroupUpdatesTopic(group.staticStorageId), {
					type: 'new_post',
					postId: post.manifestStorageId,
					groupId: group.manifestStaticStorageId,
					isEncrypted: false,
					sentAt: (post.publishedAt || post.createdAt).toString()
				});
				log('publishEventByStaticId');
			}

			await replyPostUpdatePromise;
			log('replyPostUpdatePromise');

			return post;
		}

		async getPost(userId, postId) {
			await app.checkUserCan(userId, CorePermissionName.UserGroupManagement);
			//TODO: add check for user can view post
			return app.ms.database.getPost(postId);
		}

		async getPostListByIds(userId, groupId, postIds) {
			await app.checkUserCan(userId, CorePermissionName.UserGroupManagement);
			//TODO: add check for user can view post
			return app.ms.database.getPostListByIds(groupId, postIds);
		}

		async delete(userId, groupId, postIds) {
			await app.checkUserCan(userId, CorePermissionName.UserGroupManagement);
			//TODO: add check for user can view post
			return app.ms.database.getPostListByIds(groupId, postIds);
		}

		async getPostContent(baseStorageUri: string, post: IPost): Promise<{type, mimeType, view, manifestId, text?, url?, previewUrl?}[]> {
			return pIteration.map(post.contents, async c => {
				const baseData = {
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
						url: baseStorageUri + c.storageId,
						...baseData
					};
				} else if (_.includes(c.mimeType, 'video')) {
					return {
						type: 'video',
						previewUrl: baseStorageUri + c.mediumPreviewStorageId,
						url: baseStorageUri + c.storageId,
						...baseData
					};
				}
			}).then(contents => contents.filter(c => c));
		}

		async updatePost(userId, postId, postData) {
			const oldPost = await app.ms.database.getPost(postId);

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
				await app.ms.database.setPostContents(postId, contentsData);
			}

			postData.size = await app.ms.database.getPostSizeSum(postId);

			await app.ms.database.updatePost(postId, postData);
			return this.updatePostManifest(postId);
		}

		async deletePosts(userId, postIds) {
			await app.checkUserCan(userId, CorePermissionName.UserGroupManagement);
			const posts = await app.ms.database.getPostsMetadata(postIds);
			const cantEditSomeOfPosts = await pIteration.some(posts, async (post) => {
				return this.canEditPostInGroup(userId, post.groupId, post.id).then(r => !r);
			})
			if (cantEditSomeOfPosts) {
				throw new Error("not_permitted");
			}
			return app.ms.database.updatePosts(postIds, {isDeleted: true})
		}

		async getPostLocalId(post: IPost) {
			if (!post.groupId) {
				return null;
			}
			const group = await app.ms.database.getGroup(post.groupId);
			group.publishedPostsCount++;
			await app.ms.database.updateGroup(group.id, {publishedPostsCount: group.publishedPostsCount});
			return group.publishedPostsCount;
		}

		async addUserFriendById(userId, friendId) {
			await app.checkUserCan(userId, CorePermissionName.UserFriendsManagement);

			friendId = await app.checkUserId(friendId, true);

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

			await app.ms.database.addMemberToGroup(userId, group.id);
			await app.ms.database.addAdminToGroup(userId, group.id);

			app.events.emit(app.events.NewPersonalGroup, group);

			return app.ms.database.addUserFriend(userId, friendId);
		}

		async removeUserFriendById(userId, friendId) {
			await app.checkUserCan(userId, CorePermissionName.UserFriendsManagement);

			friendId = await app.checkUserId(friendId, true);

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
				list: await app.ms.database.getMemberInGroups(userId, types),
				total: null
				//TODO: total, limit, offset
			};
		}

		async getAdminInGroups(userId, types) {
			await app.checkUserCan(userId, CorePermissionName.UserGroupManagement);
			// TODO: use query object instead of types
			return {
				list: await app.ms.database.getAdminInGroups(userId, types),
				total: null
				//TODO: total, limit, offset
			};
		}

		async getPersonalChatGroups(userId) {
			await app.checkUserCan(userId, CorePermissionName.UserGroupManagement);
			// TODO: use query object
			return {
				list: await app.ms.database.getCreatorInGroupsByType(userId, GroupType.PersonalChat),
				total: null
				//TODO: total, limit, offset
			};
		}

		async getAllGroupList(adminId, searchString?, listParams?: IListParams) {
			listParams = this.prepareListParams(listParams);
			await app.checkUserCan(adminId, CorePermissionName.AdminRead);
			return {
				list: await app.ms.database.getAllGroupList(searchString, listParams),
				total: await app.ms.database.getAllGroupCount(searchString)
			};
		}

		prepareListParams(listParams?: IListParams): IListParams {
			return _.pick(listParams, ['sortBy', 'sortDir', 'limit', 'offset']);
		}
	}

	return new GroupModule();
}