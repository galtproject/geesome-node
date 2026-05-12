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

	function getPostRefsByLocalId(postRefs) {
		const postRefsByLocalId = new Map<number, any>();
		for (const postRef of postRefs || []) {
			const localId = Number(postRef.localId);
			if (!Number.isFinite(localId) || localId <= 0) {
				continue;
			}
			postRefsByLocalId.set(localId, postRef);
		}
		return postRefsByLocalId;
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

		async getActiveGroupPostRefsByLocalId(groupId) {
			const postRefs: IPost[] = [];
			await app.ms.group.forEachGroupPostRefBatch(groupId, {
				attributes: ['id', 'localId', 'manifestStorageId', 'publishedAt'],
				filters: {
					isDeleted: false,
					status: PostStatus.Published
				}
			}, async (batch) => {
				postRefs.push(...batch.postRefs);
			});
			return getPostRefsByLocalId(postRefs);
		}

		async isGroupManifestImportComplete(group, postRefs, localPostRefsByLocalId) {
			const maxLocalId = postRefs.reduce((maxId, postRef) => Math.max(maxId, postRef.localId), 0);
			if (localPostRefsByLocalId.size !== postRefs.length) {
				return false;
			}
			if (Number(group.availablePostsCount) !== postRefs.length) {
				return false;
			}
			if (Number(group.publishedPostsCount) < maxLocalId) {
				return false;
			}
			return postRefs.every((postRef) => {
				const localPostRef = localPostRefsByLocalId.get(postRef.localId);
				return localPostRef?.manifestStorageId === postRef.manifestStorageId;
			});
		}

		getGroupManifestImportChanges(postRefs, localPostRefsByLocalId) {
			const manifestPostRefsByLocalId = getPostRefsByLocalId(postRefs);
			const stalePostIds = [];
			const missingPostRefs = [];

			for (const localPostRef of localPostRefsByLocalId.values()) {
				const manifestPostRef = manifestPostRefsByLocalId.get(Number(localPostRef.localId));
				if (!manifestPostRef) {
					stalePostIds.push(localPostRef.id);
					continue;
				}
				if (manifestPostRef.manifestStorageId !== localPostRef.manifestStorageId) {
					stalePostIds.push(localPostRef.id);
				}
			}
			for (const postRef of postRefs) {
				const localPostRef = localPostRefsByLocalId.get(postRef.localId);
				if (localPostRef?.manifestStorageId === postRef.manifestStorageId) {
					continue;
				}
				missingPostRefs.push(postRef);
			}

			return {stalePostIds, missingPostRefs};
		}

		async clearMissingPostRefLocalIdBlockers(groupId, missingPostRefs) {
			const blockingPostRefs = await app.ms.group.getGroupPostRefsByLocalIds(
				groupId,
				missingPostRefs.map(postRef => postRef.localId)
			);
			const blockingPostIds = blockingPostRefs
				.filter(postRef => postRef.isDeleted || postRef.status !== PostStatus.Published)
				.map(postRef => postRef.id);
			await app.ms.group.clearPostLocalIds(blockingPostIds);
		}

		async importGroupManifestPosts(userId, group, groupManifest) {
			const postRefs = getGroupManifestPostRefs(groupManifest.posts);
			const localPostRefsByLocalId = await this.getActiveGroupPostRefsByLocalId(group.id);
			if (await this.isGroupManifestImportComplete(group, postRefs, localPostRefsByLocalId)) {
				return 0;
			}
			const {stalePostIds, missingPostRefs} = this.getGroupManifestImportChanges(postRefs, localPostRefsByLocalId);
			if (stalePostIds.length) {
				await app.ms.group.deletePostsPure(userId, stalePostIds, {
					clearLocalIds: true,
					skipGroupManifestUpdate: true
				});
			}
			if (missingPostRefs.length) {
				await this.clearMissingPostRefLocalIdBlockers(group.id, missingPostRefs);
			}
			await pIteration.forEachSeries(missingPostRefs, async (postRef) => {
				await this.createPostByRemoteStorageId(userId, postRef.manifestStorageId, group.id, null, groupManifest.isEncrypted === true, {
					localId: postRef.localId,
					skipGroupManifestUpdate: true
				});
			});
			await app.ms.group.reconcileGroupCounters(group.id);
			return stalePostIds.length + missingPostRefs.length;
		}

		async syncRemoteGroupManifestState(group, manifestStorageId, groupStaticStorageId) {
			const updateData: any = {};
			if (group.manifestStorageId !== manifestStorageId) {
				updateData.manifestStorageId = manifestStorageId;
			}
			if (groupStaticStorageId && group.manifestStaticStorageId !== groupStaticStorageId) {
				updateData.manifestStaticStorageId = groupStaticStorageId;
			}
			if (!Object.keys(updateData).length) {
				return group;
			}
			await app.ms.group.updateGroupPure(group.id, updateData);
			return app.ms.group.getGroup(group.id);
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
			} else if (dbGroup.isRemote) {
				dbGroup = await this.syncRemoteGroupManifestState(dbGroup, manifestStorageId, groupStaticStorageId);
			}
			await this.importGroupManifestPosts(userId, dbGroup, groupManifest);
			return app.ms.group.getGroup(dbGroup.id);
		}
	}
	return new RemoteGroupModule();
}
