/*
 * Copyright ©️ 2018 Galt•Space Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka),
 * [Dima Starodubcev](https://github.com/xhipster),
 * [Valery Litvin](https://github.com/litvintech) by
 * [Basic Agreement](http://cyb.ai/QmSAWEG5u5aSsUyMNYuX2A2Eaz4kEuoYWUkVBRdmu9qmct:ipfs)).
 *
 * Copyright ©️ 2018 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) and
 * Galt•Space Society Construction and Terraforming Company by
 * [Basic Agreement](http://cyb.ai/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS:ipfs)).
 */

export interface IDatabase {
    getSessionStore(): any;
    flushDatabase(): Promise<void>;

    addApiKey(apiKey): Promise<IUserApiKey>;
    getApiKeyByHash(valueHash: string): Promise<IUserApiKey>;

    addContent(content: IContent): Promise<IContent>;
    updateContent(id, updateData: any): Promise<void>;
    deleteContent(id): Promise<void>;
    getContentList(accountAddress, limit?, offset?): Promise<IContent[]>;
    getContent(id): Promise<IContent>;
    getContentByStorageId(storageId): Promise<IContent>;
    
    addPost(post: IPost): Promise<IPost>;
    updatePost(id, updateData: any): Promise<IPost>;
    getPostSizeSum(id): Promise<number>;

    setPostContents(postId, contentsIds): Promise<void>;
    
    getUsersCount(): Promise<number>;
    addUser(user: IUser): Promise<IUser>;
    getUserByName(name): Promise<IUser>;
    getUserByNameOrEmail(nameOrEmail): Promise<IUser>;
    getUser(id): Promise<IUser>;

    getGroup(id): Promise<IGroup>;
    getGroupByManifestId(manifestId): Promise<IGroup>;
    addGroup(group): Promise<IGroup>;
    updateGroup(id, updateData): Promise<void>;
    addMemberToGroup(userId, groupId): Promise<void>;
    removeMemberFromGroup(userId, groupId): Promise<void>;
    getMemberInGroups(userId): Promise<IGroup[]>;
    addAdminToGroup(userId, groupId): Promise<void>;
    removeAdminFromGroup(userId, groupId): Promise<void>;
    getAdminInGroups(userId): Promise<IGroup[]>;
    
    getGroupSizeSum(id): Promise<number>;

    addCorePermission(userId, permissionName): Promise<void>;
    removeCorePermission(userId, permissionName): Promise<void>;
    isHaveCorePermission(userId, permissionName): Promise<boolean>;

    isAdminInGroup(userId, groupId): Promise<boolean>;
    isMemberInGroup(userId, groupId): Promise<boolean>;

    getGroupPosts(groupId, sortDir, limit, offset): Promise<IPost[]>;
    getPost(postId): Promise<IPost>;

    getFileCatalogItem(itemId): Promise<IFileCatalogItem>;
    getFileCatalogItemByDefaultFolderFor(userId, defaultFolderFor): Promise<IFileCatalogItem>;
    getFileCatalogItems(userId, parentItemId, type?, sortField?, sortDir?, limit?, offset?): Promise<IFileCatalogItem[]>;
    getFileCatalogItemsByContent(userId, contentId, type?, sortField?, sortDir?, limit?, offset?): Promise<IFileCatalogItem[]>;
    getFileCatalogItemsBreadcrumbs(itemId): Promise<IFileCatalogItem[]>;
    getFileCatalogItemsCount(userId, parentItemId, type?): Promise<number>;
    getContentsIdsByFileCatalogIds(catalogIds): Promise<number[]>;
    addFileCatalogItem(item: IFileCatalogItem): Promise<IFileCatalogItem>;
    updateFileCatalogItem(id, updateData): Promise<void>;
    getFileCatalogItemsSizeSum(parentItemId): Promise<number>;

    getAllUserList(searchString, sortField?, sortDir?, limit?, offset?): Promise<IUser[]>;
    getAllContentList(searchString, sortField?, sortDir?, limit?, offset?): Promise<IContent[]>;
    getAllGroupList(searchString, sortField?, sortDir?, limit?, offset?): Promise<IGroup[]>;
    
    addUserContentAction(userContentActionData): Promise<IUserContentAction>;
    getUserContentActionsSizeSum(userId, name, periodTimestamp?): Promise<number>;
    
    addUserLimit(limitData): Promise<IUserLimit>;
    updateUserLimit(limitId, limitData): Promise<void>;
    getUserLimit(userId, name): Promise<IUserLimit>;

    getValue(key: string): Promise<string>;
    setValue(key: string, content: string): Promise<void>;
    clearValue(key: string): Promise<void>;
}

export interface IUserApiKey {
    id?: number;
    title?: string;
    userId: number;
    valueHash: string;
    expiredOn?: Date;
}

export interface IContent {
    id?: number;
    storageType: ContentStorageType;
    mimeType: ContentMimeType;
    extension?: string;
    view?: ContentView;
    name?: string;
    description?: string;
    size?: number;
    server?: string;
    isPublic?: boolean;
    isPinned?: boolean;
    peersCount?: number;
    userId: number;
    groupId?: number;
    localId?: number;
    previewStorageId?: string;
    previewMimeType?: ContentMimeType;
    previewExtension?: string;
    storageId?: string;
    staticStorageId?: string;
    manifestStorageId?: string;
    manifestStaticStorageId?: string;
}

export enum ContentStorageType {
    IPFS = 'ipfs',
    IPLD = 'ipld'
}

export enum ContentMimeType {
    Unknown = 'unknown',
    Text = 'text',
    TextHtml = 'text/html',
    TextMarkdown = 'text/md',
    ImagePng = 'image/png',
    ImageJpg = 'image/jpg'
}

export enum ContentView {
    Slider = 'slider',
    List = 'list'
}

export interface IPost {
    id?: number;
    status: PostStatus;
    publishedAt?;
    publishOn?;
    groupId;
    userId;
    view?;
    type?;
    contents?: IContent[];
    size?;
    isPinned?: boolean;
    isFullyPinned?: boolean;
    peersCount?: number;
    fullyPeersCount?: number;
    localId?;
    storageId?;
    staticStorageId?;
    manifestStorageId?: string;
    manifestStaticStorageId?: string;
}

export enum PostStatus {
    Queue = 'queue',
    Published = 'published',
    Draft = 'draft',
    Deleted = 'deleted'
}

export interface IUser {
    id?: number;
    name: string;
    email: string;
    passwordHash: string;
    title?: string;
    storageAccountId?: string;
    avatarImageId?: number;
    avatarImage?: IContent;
}

export interface IGroup {
    id?: number;
    
    name: string;
    title: string;
    type: GroupType;
    view: GroupView;
    isPublic: boolean;
    
    description?: string;
    avatarImageId?: number;
    avatarImage?: IContent;
    coverImageId?: number;
    coverImage?: IContent;
    size?: number;
    isPinned?: boolean;
    isFullyPinned?: boolean;
    peersCount?: number;
    fullyPeersCount?: number;
    storageId?: string;
    staticStorageId?: string;
    manifestStorageId?: string;
    manifestStaticStorageId?: string;
    publishedPostsCount?: number;
}

export enum GroupType {
    Channel = 'channel',
    Chat = 'chat'
}

export enum GroupView {
    PinterestLike = 'pinterest-like',
    InstagramLike = 'instagram-like',
    TumblrLike = 'tumblr-like',
    TelegramLike = 'telegram-like'
}

export interface IFileCatalogItem {
    id?: number;
    name: string;
    type: IFileCatalogItemType;
    position: number;
    userId: number;
    defaultFolderFor?: string;
    linkOfId?: number;
    parentItemId?: number;
    contentId?: number;
    groupId?: number;
    size?: number;
}

export enum IFileCatalogItemType {
    Folder = 'folder',
    File = 'file'
}

export interface IUserContentAction {
    id?: number;
    name: UserContentActionName;
    size: number;
    userId: number;
    userApiKeyId?: number;
    contentId?: number;
}

export enum UserContentActionName {
    Upload = 'upload',
    Pin = 'pin'
}

export interface IUserLimit {
    id?: number;
    name: UserLimitName;
    value: number;
    userId: number;
    adminId: number;
    periodTimestamp: number;
    isActive: boolean;
}


export enum UserLimitName {
    SaveContentSize = 'save_content:size'
}

export enum CorePermissionName {
    AdminRead = 'admin:read',
    AdminAddUser = 'admin:add_user',
    AdminSetPermissions = 'admin:set_permissions',
    AdminSetUserLimit = 'admin:set_user_limit',
    AdminAddUserApiKey = 'admin:add_user_api_key',
    AdminAddBootNode = 'admin:add_boot_node',
    AdminRemoveBootNode = 'admin:remove_boot_node'
}
