import {
	IContent, IContentData, IContentDataProjectionOptions,
	ICorePermission,
	IListParams,
	IUser
} from "../database/interface.js";
import {IUserListResponse} from "../../interface.js";
import type {RichTextDocument} from "../../richText.js";

export default interface IGeesomeGroupModule {
	stop(): Promise<void>;

	checkGroupId(groupId, createIfNotExist?): Promise<number>;

	getAllGroupList(adminId, searchString, listParams?: IListParams): Promise<IGroupListResponse>;

	getMemberInGroups(userId, types: GroupType[], listParams?: IListParams): Promise<IGroupListResponse>;

	getAdminInGroups(userId, types: GroupType[], listParams?: IListParams): Promise<IGroupListResponse>;

	getPersonalChatGroups(userId, listParams?: IListParams): Promise<IGroupListResponse>;

	addUserFriendById(userId, friendId): Promise<void>;

	removeUserFriendById(userId, friendId): Promise<void>;

	getUserFriends(userId, search?, listParams?: IListParams): Promise<IUserListResponse>;

	canCreatePostInGroup(userId, groupId);

	canEditPostInGroup(userId, groupId, postId): Promise<boolean>;

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

	createRemotePostByObject(userId, postData, options?);

	updateRemotePostByObject(userId, postId, postData, options?);

	updatePost(userId, postId, postData);

	updatePostPure(userId, postId, postData, options?: {
		oldPost?: IPost;
		expectedPropertiesJson?: string | null;
		createPropertiesConflictError?: (lockedPost: IPost) => Error;
		[key: string]: any;
	});

	applyPostManifestUpdate(userId, post: IPost, group?, options?): Promise<IPost>;

	deletePosts(userId, postIds, options?): Promise<any>;

	deletePostsPure(userId, postIds, options?): Promise<any>;

	createGroup(userId, groupData): Promise<IGroup>;

	createGroupByObject(userId, groupObject): Promise<IGroup>;

	updateGroup(userId, id, updateData): Promise<IGroup>;

	updateGroupPure(id, updateData): Promise<any>;

	getLocalGroup(userId, groupId): Promise<IGroup>;

	getPostLocalId(post: IPost): Promise<number>;

	updateGroupManifest(userId, groupId): Promise<any>;

	updatePostManifest(userId, postId): Promise<any>;

	queuePostManifestUpdate(userId, postId, options?): Promise<any>;

	queueGroupManifestUpdate(userId, groupId, options?): Promise<any>;

	startDerivedStateQueueProcessing(options?): void;

	startDerivedStateQueueWorker(): void;

	stopDerivedStateQueueWorker(): Promise<void>;

	processDerivedStateQueue(options?): Promise<any>;

	getGroupByParams(params): Promise<IGroup>;

	getPostByParams(params): Promise<IPost>;

	getPostContentData(post: IPost, baseStorageUri: string, options?: IContentDataProjectionOptions): Promise<IContentData[]>;

	prepareContentDataWithUrl(c: IContent, baseStorageUri: string, options?: IContentDataProjectionOptions): Promise<IContentData>;

	getPostContentDataWithUrl(post: IPost, baseStorageUri: string, options?: IContentDataProjectionOptions): Promise<IContentData[]>;

	getGroupPosts(groupId, filters?, listParams?: IListParams, options?: {emitInitialCursor?: boolean}): Promise<IPostListResponse>;

	getGroupPostRefs(groupId, filters?, listParams?: IListParams, options?): Promise<IPost[]>;

	getGroupPostRefsByLocalIds(groupId, localIds, options?): Promise<IPost[]>;

	forEachGroupPostRefBatch(groupId, options, onBatch): Promise<number>;

	getHydratedGroupPostBatch(groupId, filters?, listParams?: IListParams, options?): Promise<IHydratedGroupPostBatch>;

	forEachHydratedGroupPostBatch(groupId, options, onBatch): Promise<number>;

	getGroupManifestPostRefs(groupId, filters?, listParams?: IListParams): Promise<IPost[]>;

	getGroupUnreadPostsData(userId, groupId): Promise<{count, readAt, readPostId?}>;

	addOrUpdateGroupRead(userId, groupReadData);

	//TODO: define interface
	getGroupPeers(groupId): Promise<any>;

	getGroup(id): Promise<IGroup>;

	getGroupByManifestId(manifestId, staticManifestId): Promise<IGroup>;

	getGroupWhereStaticOutdated(outdatedForHours, options?): Promise<IGroup[]>;

	getRemoteGroups(): Promise<IGroup[]>;

	addGroup(group): Promise<IGroup>;

	setMembersToGroup(userIds, groupId): Promise<void>;

	setAdminsToGroup(userIds, groupId): Promise<void>;

	getCreatorInGroupsByType(userId, type: GroupType): Promise<IGroup[]>;

	getGroupSizeSum(id): Promise<number>;

	reconcilePostRelationCounters(postIds, options?): Promise<void>;

	reconcileGroupCounters(groupId): Promise<any>;

	getGroupByParams(params: {name?, staticStorageId?, manifestStorageId?, manifestStaticStorageId?}): Promise<IGroup>;

	getPostByParams(params: {name?, staticStorageId?, manifestStorageId?, manifestStaticStorageId?}): Promise<IPost>;

	getGroupRead(userId, groupId): Promise<IGroupRead>;

	addGroupRead(groupReadData): Promise<IGroupRead>;

	removeGroupRead(userId, groupId): Promise<any>;

	updateGroupRead(id, updateData): Promise<any>;

	getAllPosts(filters?, listParams?: IListParams): Promise<IPost[]>;

	getAllPostRefs(filters?, listParams?: IListParams, options?): Promise<IPost[]>;

	forEachAllPostRefBatch(options, onBatch): Promise<number>;

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

	addPostEvent(postEvent, options?): Promise<any>;

	addPostEvents(postEvents, options?): Promise<any>;

	getPostByManifestId(manifestStorageId): Promise<IPost>;

	getPostByGroupManifestIdAndLocalId(groupManifestStorageId, localId): Promise<IPost>;

	updatePosts(ids, updateData): Promise<IPost>;

	clearPostLocalIds(ids, options?): Promise<any>;

	getPostsMetadata(ids): Promise<IPost[]>;

	getHydratedPostListByIds(postIds, options?): Promise<IPost[]>;

	getPostSizeSum(id): Promise<number>;

	resolveContentForPost(userId: number, content: IContent): Promise<IResolvedPostContent>;

	getContentsForPost(userId: number, contents: IContent[]): Promise<IResolvedPostContent[] | null>;

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
	total: number | null;
	nextCursor?: {publishedAt: any; id: any} | null;
}

export interface IGroupPostRefBatch {
	postRefs: IPost[];
	refCount: number;
	nextCursor?: {publishedAt: any; id: any} | null;
}

export interface IHydratedGroupPostBatch extends IGroupPostRefBatch {
	groupPosts: IPost[];
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
	manifestPostsCursorUpdatedAt?: Date;
	manifestPostsCursorId?: number;

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

export enum PostContentAttachmentReason {
	Owner = 'owner',
	Public = 'public',
	ActorManifestImport = 'actor_manifest_import',
	ActorStorage = 'actor_storage'
}

export interface IResolvedPostContent {
	id: number;
	view?: any;
	size?: number;
	permissionReason: PostContentAttachmentReason;
}

export interface IGroupRead {
	id?: number;
	readFrom?;
	readAt?;
	readPostId?: number;
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
	entityId?: string;
	sourceDate?;

	encryptedManifestStorageId?: string;

	createdAt;
	updatedAt;
	update?(data: any);
}

export enum PostStatus {
	Queue = 'queue',
	Published = 'published',
	Draft = 'draft',
	Deleted = 'deleted'
}

export enum PostEventType {
	PostLifecycle = 'post_lifecycle',
	SourceImport = 'source_import'
}

export enum PostEventAction {
	Created = 'created',
	Updated = 'updated',
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

export interface IPostInput {
	groupId: number;
	contentIds?: number[];
	contentsIds?: number[];
	contents?: IContent[];
	contentRichText?: RichTextDocument;
	contentRichTextFileName?: string;
	view?: string;
	type?: string;
	size?: string;
	publishOn?: Date | string;
	isPinned?: boolean;
	isReplyForbidden?: boolean;
	replyToId?: number;
	repostOfId?: string;
	properties?: any;
}

export interface IPostUpdateInput {
	contentIds?: number[];
	contentsIds?: number[];
	contents?: IContent[];
	contentRichText?: RichTextDocument;
	contentRichTextFileName?: string;
	view?: string;
	type?: string;
	size?: string;
	publishOn?: Date | string;
	isPinned?: boolean;
	isReplyForbidden?: boolean;
	replyToId?: number;
	repostOfId?: string;
	properties?: any;
}

export interface IGroupUserInput {
	userId: number;
	permissions?: string[];
}

export interface IGroupUserListInput {
	userIds: number[];
}

export interface IGroupPermissionInput {
	userId: number;
	permissions: string[];
}

export interface IGroupReadInput {
	groupId: number;
	readFrom?: number;
	readAt?: Date | string;
	readPostId?: number;
}

export interface IUserFriendInput {
	friendId: number;
}

export interface IGroupUnreadResponse {
	count?: number;
	cachedPostsCount?: number;
	readFrom?: number;
	readAt?: Date | string;
	readPostId?: number;
}

export interface IGroupApiResponse {
	id: number;
	name: string;
	title: string;
	type: GroupType;
	view: GroupView;
	theme: string;
	isPublic: boolean;
	isRemote: boolean;
	isOpen: boolean;
	isReplyForbidden: boolean;
	description?: string;
	avatarImageId?: number;
	coverImageId?: number;
	storageId?: string;
	staticStorageId?: string;
	manifestStorageId?: string;
	manifestStaticStorageId?: string;
	createdAt: any;
	updatedAt: any;
}

export interface IPostApiResponse {
	id?: number;
	status: PostStatus;
	publishedAt?: any;
	publishOn?: any;
	groupId: number;
	userId: number;
	view?: string;
	type?: string;
	size?: string;
	isDeleted?: boolean;
	isPinned?: boolean;
	isRemote?: boolean;
	isEncrypted?: boolean;
	isFullyPinned?: boolean;
	isReplyForbidden?: boolean;
	peersCount?: number;
	fullyPeersCount?: number;
	localId?: string;
	storageId?: string;
	staticStorageId?: string;
	manifestStorageId?: string;
	manifestStaticStorageId?: string;
	replyToId?: number;
	repostOfId?: string;
	source?: string;
	sourceChannelId?: string;
	sourcePostId?: string;
	entityId?: string;
	sourceDate?: any;
	encryptedManifestStorageId?: string;
	createdAt: any;
	updatedAt: any;
}

export interface IGroupApiListResponse {
	list: IGroupApiResponse[];
	total: number;
}

export interface IPostApiListResponse {
	list: IPostApiResponse[];
	total: number;
}
