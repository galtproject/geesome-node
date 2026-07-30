import type {IGeesomeApp} from '../../interface.js';
import {GroupType, IGroup, IPost} from '../group/interface.js';
import IGeesomePrivateGroupModule, {
	privateGroupPostManifestHook,
	publicPostManifestHook
} from './interface.js';

export default async function (app: IGeesomeApp): Promise<IGeesomePrivateGroupModule> {
	return getModule(app);
}

export function getModule(app: IGeesomeApp): IGeesomePrivateGroupModule {
	return {
		isEnabled(): boolean {
			return app.config?.privateGroupConfig?.enabled === true;
		},

		isPrivateGroup(group: Partial<IGroup> | null | undefined): boolean {
			return group?.type === GroupType.PrivateGroup;
		},

		normalizeGroupData(groupData: Partial<IGroup>): Partial<IGroup> {
			if (!this.isPrivateGroup(groupData)) {
				return {...groupData};
			}
			if (!this.isEnabled()) {
				throw new Error('private_group_disabled');
			}
			return {
				...groupData,
				isPublic: false,
				isOpen: false,
				isEncrypted: true
			};
		},

		getPostManifestHook(group: Partial<IGroup> | null | undefined): string {
			if (this.isPrivateGroup(group)) {
				return privateGroupPostManifestHook;
			}
			return publicPostManifestHook;
		},

		canMutateSharedPost(userId: number, post: Partial<IPost>): boolean {
			return Number(post?.userId) === Number(userId);
		},

		async afterPrivatePostManifestUpdate(
			_userId: number,
			postId: number
		) {
			const post = await app.ms.group.getPostPure(postId);
			if (!post || !this.isPrivateGroup(post.group)) {
				throw new Error('private_group_post_required');
			}
			return {
				groupId: Number(post.groupId),
				postId: Number(post.id),
				private: true
			};
		}
	};
}
