import type {IGroup, IPost} from '../group/interface.js';

export const privateGroupPostManifestHook = 'afterPrivatePostManifestUpdate';
export const publicPostManifestHook = 'afterPostManifestUpdate';

export interface IPrivateGroupPostManifestResult {
	groupId: number;
	postId: number;
	private: true;
	membershipVersion: string;
}

export interface IPrivateGroupMembershipDevice {
	userId: number;
	ownerId: string;
	deviceId: string;
	keyId: string;
	publicBundle: any;
}

export interface IPrivateGroupMembershipSnapshot {
	id: number;
	groupId: number;
	version: string;
	createdByUserId: number;
	membershipHash: string;
	memberCount: number;
	deviceCount: number;
	devices: IPrivateGroupMembershipDevice[];
	createdAt?: Date;
}

export interface IPrivateGroupPostMembership {
	id: number;
	postId: number;
	groupId: number;
	membershipSnapshotId: number;
	membershipVersion: string;
}

export default interface IGeesomePrivateGroupModule {
	isEnabled(): boolean;
	isPrivateGroup(group: Partial<IGroup> | null | undefined): boolean;
	normalizeGroupData(groupData: Partial<IGroup>): Partial<IGroup>;
	getPostManifestHook(group: Partial<IGroup> | null | undefined): string;
	canMutateSharedPost(userId: number, post: Partial<IPost>): boolean;
	createMembershipSnapshot(
		userId: number,
		groupId: number,
		expectedVersion: string | number
	): Promise<IPrivateGroupMembershipSnapshot>;
	getMembershipSnapshot(
		userId: number,
		groupId: number,
		version?: string | number
	): Promise<IPrivateGroupMembershipSnapshot | null>;
	bindPostMembership(
		userId: number,
		post: Partial<IPost>,
		membershipVersion: string | number,
		transaction: any
	): Promise<IPrivateGroupPostMembership>;
	getPostMembership(postId: number, transaction?: any): Promise<IPrivateGroupPostMembership | null>;
	afterPrivatePostManifestUpdate(
		userId: number,
		postId: number
	): Promise<IPrivateGroupPostManifestResult>;
	flushDatabase(): Promise<void>;
}
