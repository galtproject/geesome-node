import commonHelper from "geesome-libs/src/common.js";
import ipfsHelper from "geesome-libs/src/ipfsHelper.js";
import {IGroup, IPost} from "../group/interface.js";
import IGeesomeRemoteGroupModule from "./interface.js";
import {IGeesomeApp} from "../../interface.js";

export default async (app: IGeesomeApp) => {
	const module = getModule(app);
	(await import('./api.js')).default(app, module);
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
			if (!commonHelper.isNumber(groupId)) {
				return this.createGroupByRemoteStorageId(userId, groupId).then(g => g.id);
			}
			return null;
		}

		async createPostByRemoteStorageId(userId, manifestStorageId, groupId, publishedAt = null, isEncrypted = false) {
			const postObject: IPost = await app.ms.entityJsonManifest.manifestIdToDbObject(manifestStorageId, 'post', {
				isEncrypted,
				userId,
				groupId,
				publishedAt
			});
			return app.ms.group.createRemotePostByObject(userId, postObject);
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
