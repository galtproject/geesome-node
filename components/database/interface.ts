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
    flushDatabase(): Promise<void>;

    addContent(content: IContent): Promise<IContent>;
    updateContent(id, updateData: any): Promise<void>;
    deleteContent(id): Promise<void>;
    getContentList(accountAddress, limit?, offset?): Promise<IContent[]>;
    getContent(id): Promise<IContent>;
    
    addPost(post: IPost): Promise<IPost>;
    updatePost(id, updateData: any): Promise<IPost>;

    setPostContents(postId, contentsIds): Promise<void>;
    
    getUsersCount(): Promise<number>;
    addUser(user: IUser): Promise<IUser>;
    getUserByName(name): Promise<IUser>;
    getUser(id): Promise<IUser>;

    getGroup(id): Promise<IGroup>;
    addGroup(group): Promise<IGroup>;
    addMemberToGroup(userId, groupId): Promise<void>;
    getMemberInGroups(userId): Promise<IGroup[]>;
    addAdminToGroup(userId, groupId): Promise<void>;
    getAdminInGroups(userId): Promise<IGroup[]>;

    isAdminInGroup(userId, groupId): Promise<boolean>;
    isMemberInGroup(userId, groupId): Promise<boolean>;

    getGroupPosts(groupId, sortDir, limit, offset): Promise<IPost[]>;
    getPost(postId): Promise<IPost>;

    getValue(key: string): Promise<string>;
    setValue(key: string, content: string): Promise<void>;
    clearValue(key: string): Promise<void>;
}

export interface IContent {
    id?: number;
    type: ContentType;
    name: string;
    description?: string;
    size?: string;
    isPublic?: boolean;
    userId: number;
    groupId?: number;
    storageId?: string;
    staticStorageId?: string;
    storageAccountId?: string;
}

export enum ContentType {
    Unknown = 'unknown',
    Text = 'text',
    TextHtml = 'text/html',
    TextMarkdown = 'text/md',
    ImagePng = 'image/png',
    ImageJpg = 'image/jpg'
}

export interface IPost {
    id?: number;
    status: PostStatus;
    publishedAt?;
    publishOn?;
    storageId?;
    staticStorageId?;
    storageAccountId?;
    groupId;
    userId;
    view?;
    type?;
    contents?: IContent[];
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
    title: string;
    passwordHash: string;
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
    storageId?: string;
    staticStorageId?: string;
    storageAccountId?: string;
}

export enum GroupType {
    Channel = 'channel',
    Chat = 'chat'
}

export enum GroupView {
    Tiles = 'tiles',
    Grid = 'grid',
    FullList = 'full-list',
    MiniList = 'mini-list',
    ListWithEditor = 'list-with-editor'
}
