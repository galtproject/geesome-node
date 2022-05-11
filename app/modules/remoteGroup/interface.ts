import {IGroup, IPost} from "../group/interface";

export default interface IGeesomeRemoteGroupModule {
	createPostByRemoteStorageId(userId, manifestStorageId, groupId, publishedAt?, isEncrypted?): Promise<IPost>;

	createGroupByRemoteStorageId(userId, manifestStorageId): Promise<IGroup>;

	getLocalOrRemoteGroup(userId, groupId): Promise<IGroup>;
}