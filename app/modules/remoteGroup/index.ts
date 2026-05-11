import commonHelper from "geesome-libs/src/common.js";
import ipfsHelper from "geesome-libs/src/ipfsHelper.js";
import base36 from "geesome-libs/src/base36.js";
import pIteration from 'p-iteration';
import {IGroup, IPost, PostStatus} from "../group/interface.js";
import IGeesomeRemoteGroupModule from "./interface.js";
import {IGeesomeApp} from "../../interface.js";

export default async (app: IGeesomeApp) => {
	const module = getModule(app);
	(await import('./api.js')).default(app, module);
	return module;
}

function getModule(app: IGeesomeApp) {
	app.checkModules(['entityJsonManifest', 'group']);

	function getPostManifestStorageId(postRef) {
		if (!postRef) {
			return null;
		}
		if (typeof postRef === 'string') {
			return postRef;
		}
		if (postRef['/']) {
			return postRef['/'];
		}
		return null;
	}

	function getGroupManifestPostRefs(postsTree, refs: Array<{localId: number; manifestStorageId: string}> = []) {
		for (const [key, value] of Object.entries(postsTree || {})) {
			if (key.endsWith('_')) {
				getGroupManifestPostRefs(value, refs);
				continue;
			}
			const localId = base36.decode(key);
			const manifestStorageId = getPostManifestStorageId(value);
			if (!Number.isFinite(localId) || localId <= 0 || !manifestStorageId) {
				continue;
			}
			refs.push({localId, manifestStorageId});
		}
		return refs.sort((a, b) => a.localId - b.localId);
	}

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

		async createPostByRemoteStorageId(userId, manifestStorageId, groupId, publishedAt = null, isEncrypted = false, options: any = {}) {
			const postObject: IPost = await app.ms.entityJsonManifest.manifestIdToDbObject(manifestStorageId, 'post', {
				isEncrypted,
				userId,
				groupId,
				publishedAt
			});
			if (options.localId !== undefined) {
				postObject.localId = options.localId;
			}
			return app.ms.group.createRemotePostByObject(userId, postObject, {
				skipGroupManifestUpdate: options.skipGroupManifestUpdate
			});
		}

		async isGroupManifestImportComplete(group, postRefs) {
			const maxLocalId = postRefs.reduce((maxId, postRef) => Math.max(maxId, postRef.localId), 0);
			const importedPostCount = await app.ms.group.getGroupPostsCount(group.id, {
				isDeleted: false,
				status: PostStatus.Published
			});
			return importedPostCount === postRefs.length
				&& Number(group.availablePostsCount) === postRefs.length
				&& Number(group.publishedPostsCount) >= maxLocalId;
		}

		async importGroupManifestPosts(userId, group, groupManifest) {
			const postRefs = getGroupManifestPostRefs(groupManifest.posts);
			if (!postRefs.length) {
				return 0;
			}
			if (await this.isGroupManifestImportComplete(group, postRefs)) {
				return 0;
			}
			await pIteration.forEachSeries(postRefs, async (postRef) => {
				await this.createPostByRemoteStorageId(userId, postRef.manifestStorageId, group.id, null, groupManifest.isEncrypted === true, {
					localId: postRef.localId,
					skipGroupManifestUpdate: true
				});
			});
			await app.ms.group.reconcileGroupCounters(group.id);
			return postRefs.length;
		}

		async createGroupByRemoteStorageId(userId, manifestStorageId) {
			let staticStorageId;
			if (ipfsHelper.isAccountCidHash(manifestStorageId)) {
				staticStorageId = manifestStorageId;
				manifestStorageId = await app.ms.staticId.resolveStaticId(staticStorageId);
			}

			const groupManifest = await app.ms.storage.getObject(manifestStorageId);
			const groupStaticStorageId = staticStorageId || groupManifest.staticId;
			let dbGroup = await app.ms.group.getGroupByManifestId(manifestStorageId, groupStaticStorageId);
			if (!dbGroup) {
				const groupObject: IGroup = await app.ms.entityJsonManifest.manifestIdToDbObject(staticStorageId || manifestStorageId, 'group');
				groupObject.isRemote = true;
				groupObject.size = 0;
				dbGroup = await app.ms.group.createGroupByObject(userId, groupObject);
			}
			await this.importGroupManifestPosts(userId, dbGroup, groupManifest);
			return app.ms.group.getGroup(dbGroup.id);
		}
	}
	return new RemoteGroupModule();
}
