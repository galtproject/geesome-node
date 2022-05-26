import {IGeesomeApp, IUserInput} from "../../interface";
import {IGroup, IPost, PostStatus} from "../group/interface";
import IGeesomeRemoteGroupModule from "./interface";
const geesomeLibsCommonHelper = require('geesome-libs/src/common');
const ipfsHelper = require('geesome-libs/src/ipfsHelper');

module.exports = (app: IGeesomeApp) => {
	const module = getModule(app);
	require('./api')(app, module);
	return module;
}

function getModule(app: IGeesomeApp) {
	app.checkModules(['entityJsonManifest', 'group']);

	class RemoteGroupModule implements IGeesomeRemoteGroupModule {
		async getLocalOrRemoteGroup(userId, groupId) {
			if (!userId) {
				throw new Error("userId_required");
			}
			groupId = await this.checkGroupIdAndCreateIfNotExits(userId, groupId);
			return app.ms.group.getGroup(groupId);
		}

		async checkGroupIdAndCreateIfNotExits(userId, groupId) {
			const existsGroupId = await app.ms.group.checkGroupId(groupId);
			if (existsGroupId) {
				return existsGroupId;
			}
			if (!geesomeLibsCommonHelper.isNumber(groupId)) {
				return this.createGroupByRemoteStorageId(userId, groupId).then(g => g.id);
			}
			return null;
		}

		async createPostByRemoteStorageId(userId, manifestStorageId, groupId, publishedAt = null, isEncrypted = false) {
			const postObject: IPost = await app.ms.entityJsonManifest.manifestIdToDbObject(manifestStorageId, 'post', {
				isEncrypted,
				groupId,
				publishedAt
			});
			postObject.isRemote = true;
			postObject.status = PostStatus.Published;
			postObject.localId = await app.ms.group.getPostLocalId(postObject);

			const {contents} = postObject;
			delete postObject.contents;

			let post = await app.ms.group.addPost(postObject);

			if (!isEncrypted) {
				// console.log('postObject', postObject);
				await app.ms.group.setPostContents(post.id, contents.map(c => c.id));
			}

			await app.ms.group.updateGroupManifest(userId, post.groupId);

			return app.ms.group.getPostPure(post.id);
		}

		async createGroupByRemoteStorageId(userId, manifestStorageId) {
			let staticStorageId;
			if (ipfsHelper.isAccountCidHash(manifestStorageId)) {
				staticStorageId = manifestStorageId;
				manifestStorageId = await app.ms.staticId.resolveStaticId(staticStorageId);
			}

			let dbGroup = await app.ms.group.getGroupByManifestId(manifestStorageId, staticStorageId);
			if (dbGroup) {
				//TODO: update group if necessary
				return dbGroup;
			}
			const groupObject: IGroup = await app.ms.entityJsonManifest.manifestIdToDbObject(staticStorageId || manifestStorageId, 'group');
			groupObject.isRemote = true;
			return app.ms.group.createGroupByObject(userId, groupObject);
		}
	}
	return new RemoteGroupModule();
}