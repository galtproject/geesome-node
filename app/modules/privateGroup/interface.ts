import type {IGroup, IPost} from '../group/interface.js';

export const privateGroupPostManifestHook = 'afterPrivatePostManifestUpdate';
export const publicPostManifestHook = 'afterPostManifestUpdate';

export interface IPrivateGroupPostManifestResult {
	groupId: number;
	postId: number;
	private: true;
}

export default interface IGeesomePrivateGroupModule {
	isEnabled(): boolean;
	isPrivateGroup(group: Partial<IGroup> | null | undefined): boolean;
	normalizeGroupData(groupData: Partial<IGroup>): Partial<IGroup>;
	getPostManifestHook(group: Partial<IGroup> | null | undefined): string;
	canMutateSharedPost(userId: number, post: Partial<IPost>): boolean;
	afterPrivatePostManifestUpdate(
		userId: number,
		postId: number
	): Promise<IPrivateGroupPostManifestResult>;
}
