import {
	IContent,
	ICorePermission,
	IListParams,
	IUser
} from "../database/interface";
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

	getPostPure(id): Promise<IPost>;

	getPostListByIds(userId, groupId, postIds);

	getGroupPostPath(postId);

	createPost(userId, postData);

	updatePost(userId, postId, postData);

	deletePosts(userId, postIds): Promise<any>;

	createGroup(userId, groupData): Promise<IGroup>;

	createGroupByObject(userId, groupObject): Promise<IGroup>;

	updateGroup(userId, id, updateData): Promise<IGroup>;

	getLocalGroup(userId, groupId): Promise<IGroup>;

	getPostLocalId(post: IPost): Promise<number>;

	updateGroupManifest(userId, groupId): Promise<any>;

	getGroupByParams(params): Promise<IGroup>;

	getPostByParams(params): Promise<IPost>;

	getPostContent(post: IPost): Promise<{type, mimeType, view, manifestId, text?, json?, storageId?, previewStorageId?}[]>;

	getPostContentWithUrl(baseStorageUri: string, post: IPost): Promise<{type, mimeType, view, manifestId, text?, json?, storageId?, previewStorageId?, url?, previewUrl?}[]>;

	getGroupPosts(groupId, filters?, listParams?: IListParams): Promise<IPostListResponse>;

	getGroupUnreadPostsData(userId, groupId): Promise<{count, readAt}>;

	addOrUpdateGroupRead(userId, groupReadData);

	//TODO: define interface
	getGroupPeers(groupId): Promise<any>;

	getGroup(id): Promise<IGroup>;

	getGroupByManifestId(manifestId, staticManifestId): Promise<IGroup>;

	getGroupWhereStaticOutdated(outdatedForHours): Promise<IGroup[]>;

	getRemoteGroups(): Promise<IGroup[]>;

	addGroup(group): Promise<IGroup>;

	setMembersToGroup(userIds, groupId): Promise<void>;

	setAdminsToGroup(userIds, groupId): Promise<void>;

	getCreatorInGroupsByType(userId, type: GroupType): Promise<IGroup[]>;

	getGroupSizeSum(id): Promise<number>;

	getGroupByParams(params: {name?, staticStorageId?, manifestStorageId?, manifestStaticStorageId?}): Promise<IGroup>;

	getPostByParams(params: {name?, staticStorageId?, manifestStorageId?, manifestStaticStorageId?}): Promise<IPost>;

	getGroupRead(userId, groupId): Promise<IGroupRead>;

	addGroupRead(groupReadData): Promise<IGroupRead>;

	removeGroupRead(userId, groupId): Promise<any>;

	updateGroupRead(id, updateData): Promise<any>;

	getAllPosts(filters?, listParams?: IListParams): Promise<IPost[]>;

	getAllPostsCount(filters?): Promise<number>;

	getAllGroupCount(searchString?): Promise<number>;

	getGroupPostsCount(groupId, filters?): Promise<number>;

	addGroupPermission(userId, groupId, permissionName): Promise<void>;

	removeGroupPermission(userId, groupId, permissionName): Promise<void>;

	removeAllGroupPermission(userId, groupId): Promise<void>;

	getGroupPermissions(userId, groupId): Promise<ICorePermission[]>;

	isHaveGroupPermission(userId, groupId, permissionName): Promise<boolean>;

	isAdminInGroup(userId, groupId): Promise<boolean>;

	isMemberInGroup(userId, groupId): Promise<boolean>;

	addPost(post: IPost): Promise<IPost>;

	getPostByManifestId(manifestStorageId): Promise<IPost>;

	getPostByGroupManifestIdAndLocalId(groupManifestStorageId, localId): Promise<IPost>;

	updatePosts(ids, updateData): Promise<IPost>;

	getPostsMetadata(ids): Promise<IPost[]>;

	getPostSizeSum(id): Promise<number>;

	setPostContents(postId, contentsIds): Promise<void>;

	getGroupsWhere(filters): any;

	getPostsWhere(filters): any;
}

export interface IGroupListResponse {
	list: IGroup[];
	total: number;
}

export interface IPostListResponse {
	list: IPost[];
	total: number;
}


export interface IGroup {
	id: number;

	name: string;
	title: string;
	homePage: string;
	type: GroupType;
	view: GroupView;
	theme: string;
	isPublic: boolean;
	isRemote: boolean;
	isOpen: boolean;
	isReplyForbidden: boolean;

	description?: string;
	creatorId: number;
	avatarImageId?: number;
	avatarImage?: IContent;
	coverImageId?: number;
	coverImage?: IContent;
	size?: number;
	isPinned?: boolean;
	isFullyPinned?: boolean;
	isEncrypted?: boolean;
	peersCount?: number;
	fullyPeersCount?: number;
	storageId?: string;
	staticStorageId?: string;
	manifestStorageId?: string;
	manifestStaticStorageId?: string;
	publishedPostsCount?: number;
	availablePostsCount?: number;

	encryptedManifestStorageId?: string;

	membershipOfCategoryId?: number;

	storageUpdatedAt: Date;
	staticStorageUpdatedAt: Date;

	propertiesJson?: string;

	addMembers?(users: IUser[]);
	removeMembers?(users: IUser[]);
	setMembers?(users: IUser[]);
	getMembers?(options): IUser[];
	countMembers?(options?): number;

	addAdministrators?(users: IUser[]);
	removeAdministrators?(users: IUser[]);
	setAdministrators?(users: IUser[]);
	getAdministrators?(options): IUser[];
	countAdministrators?(options?): number;
}

export enum GroupType {
	Channel = 'channel',
	Chat = 'chat',
	PersonalChat = 'personal_chat'
}

export enum GroupView {
	PinterestLike = 'pinterest-like',
	InstagramLike = 'instagram-like',
	TumblrLike = 'tumblr-like',
	TelegramLike = 'telegram-like'
}

export interface IGroupRead {
	id?: number;
	readFrom?;
	readAt?;
	userId: number;
	groupId: number;
	cachedPostsCount: number;
}

export interface IPost {
	id?: number;
	status: PostStatus;
	publishedAt?;
	publishOn?;
	groupId;
	group?: IGroup;
	userId;
	view?;
	type?;
	contents?: IContent[];
	size?;
	isDeleted?: boolean;
	isPinned?: boolean;
	isRemote?: boolean;
	isEncrypted?: boolean;
	isFullyPinned?: boolean;
	isReplyForbidden?: boolean;
	peersCount?: number;
	fullyPeersCount?: number;
	propertiesJson?: string;
	localId?;
	storageId?;
	staticStorageId?;
	manifestStorageId?: string;
	manifestStaticStorageId?: string;

	authorStaticStorageId?: string;
	authorStorageId?: string;

	groupStaticStorageId?: string;
	groupStorageId?: string;

	replyToId?: number;
	repostOfId?: string;

	replyTo?: IPost;
	repostOf?: IPost;

	source?: string;
	sourceChannelId?: string;
	sourcePostId?: string;
	sourceDate?;

	encryptedManifestStorageId?: string;

	createdAt;
	updatedAt;
}

export enum PostStatus {
	Queue = 'queue',
	Published = 'published',
	Draft = 'draft',
	Deleted = 'deleted'
}

export interface IGroupInput {
	name: string;
	title: string;
	type: GroupType;
	view: GroupView;
	theme: string;
	isPublic: boolean;
	description?: string;
	avatarImageId?: number;
	coverImageId?: number;
}