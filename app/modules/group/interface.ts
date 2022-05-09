import {GroupType, IGroup, IListParams, IPost} from "../database/interface";
import {IUserListResponse} from "../../interface";

export default interface IGeesomeGroupModule {

	checkGroupId(groupId, createIfNotExist?): Promise<number>;

	getAllGroupList(adminId, searchString, listParams?: IListParams): Promise<IGroupListResponse>;

	getMemberInGroups(userId, types: GroupType[]): Promise<IGroupListResponse>;

	getAdminInGroups(userId, types: GroupType[]): Promise<IGroupListResponse>;

	getPersonalChatGroups(userId): Promise<IGroupListResponse>;

	addUserFriendById(userId, friendId): Promise<void>;

	removeUserFriendById(userId, friendId): Promise<void>;

	getUserFriends(userId, search?, listParams?: IListParams): Promise<IUserListResponse>;

	canCreatePostInGroup(userId, groupId);

	canEditGroup(userId, groupId);

	isAdminInGroup(userId, groupId): Promise<boolean>;

	isMemberInGroup(userId, groupId): Promise<boolean>;

	addMemberToGroup(userId, groupId, memberId, groupPermissions?: string[]): Promise<void>;

	setMembersOfGroup(userId, groupId, memberIds): Promise<void>;

	removeMemberFromGroup(userId, groupId, memberId): Promise<void>;

	setGroupPermissions(userId, groupId, memberId, groupPermissions?: string[]): Promise<void>;

	addAdminToGroup(userId, groupId, newAdminUserId): Promise<void>;

	removeAdminFromGroup(userId, groupId, removeAdminUserId): Promise<void>;

	setAdminsOfGroup(userId, groupId, adminIds): Promise<void>;

	getPost(userId, postId): Promise<IPost>;

	getPostListByIds(userId, groupId, postIds);

	createPost(userId, postData);

	createPostByRemoteStorageId(manifestStorageId, groupId, publishedAt?, isEncrypted?): Promise<IPost>;

	updatePost(userId, postId, postData);

	deletePosts(userId, postIds): Promise<any>;

	createGroup(userId, groupData): Promise<IGroup>;

	createGroupByRemoteStorageId(userId, manifestStorageId): Promise<IGroup>;

	updateGroup(userId, id, updateData): Promise<IGroup>;

	getLocalGroup(userId, groupId): Promise<IGroup>;

	getLocalOrRemoteGroup(userId, groupId): Promise<IGroup>;

	getGroupByParams(params): Promise<IGroup>;

	getPostByParams(params): Promise<IPost>;

	getPostContent(baseStorageUri: string, post: IPost): Promise<{type, mimeType, view, manifestId, text?, json?, url?, previewUrl?}[]>;

	getGroupPosts(groupId, filters?, listParams?: IListParams): Promise<IPostListResponse>;

	getGroupUnreadPostsData(userId, groupId): Promise<{count, readAt}>;

	addOrUpdateGroupRead(userId, groupReadData);

	//TODO: define interface
	getGroupPeers(groupId): Promise<any>;
}

export interface IGroupListResponse {
	list: IGroup[];
	total: number;
}

export interface IPostListResponse {
	list: IPost[];
	total: number;
}