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

import {IContent, IDatabase, IFileCatalogItem, IGroup, IPost, IUser, IUserLimit} from "../database/interface";
import {IStorage} from "../storage/interface";

export interface IGeesomeApp {
    config: any;
    database: IDatabase;
    storage: IStorage;
    authorization: any;

    frontendStorageId;

    getSecretKey(keyName): Promise<string>;
    registerUser(email, name, password): Promise<IUser>;
    loginUser(usernameOrEmail, password): Promise<IUser>;
    
    canCreatePostInGroup(userId, groupId);
    canEditGroup(userId, groupId);
    isAdminInGroup(userId, groupId): Promise<boolean>;
    isMemberInGroup(userId, groupId): Promise<boolean>;
    
    addMemberToGroup(userId, groupId): Promise<void>;
    removeMemberFromGroup(userId, groupId): Promise<void>;
    
    addAdminToGroup(userId, groupId): Promise<void>;
    removeAdminFromGroup(userId, groupId): Promise<void>;
    
    generateUserApiKey(userId, type?): Promise<string>;
    getUserByApiKey(apiKey): Promise<IUser>;
    
    setUserLimit(adminId, limitData: IUserLimit): Promise<IUserLimit>;

    createPost(userId, postData);
    updatePost(userId, postId, postData);
    saveData(fileStream, fileName, options);
    saveDataByUrl(url, options);
    getFileStream(filePath);

    getDataStructure(dataId);
    getDataStructure(dataId);
    
    getMemberInGroups(userId): Promise<IGroup[]>;
    getAdminInGroups(userId): Promise<IGroup[]>;

    createGroup(userId, groupData): Promise<IGroup>;
    updateGroup(userId, id, updateData): Promise<IGroup>;
    getGroup(groupId): Promise<IGroup>;
    getGroupPosts(groupId, sortDir, limit, offset): Promise<IPost[]>;
    
    getFileCatalogItems(userId, parentItemId, type?, sortField?, sortDir?, limit?, offset?): Promise<IFileCatalogItem[]>;
    getFileCatalogItemsBreadcrumbs(userId, itemId): Promise<IFileCatalogItem[]>;
    getFileCatalogItemsBreadcrumbs(userId, itemId): Promise<IFileCatalogItem[]>;
    getContentsIdsByFileCatalogIds(catalogIds): Promise<number[]>;
    createUserFolder(userId, parentItemId, folderName): Promise<IFileCatalogItem>;
    addContentToFolder(userId, contentId, folderId): Promise<any>;

    getAllUserList(adminId, searchString, sortField?, sortDir?, limit?, offset?): Promise<IUser[]>;
    getAllContentList(adminId, searchString, sortField?, sortDir?, limit?, offset?): Promise<IContent[]>;
    getAllGroupList(adminId, searchString, sortField?, sortDir?, limit?, offset?): Promise<IGroup[]>;
    getUserLimit(adminId, userId, limitName): Promise<IUserLimit>;

    getContent(contentId): Promise<IContent>;
}
