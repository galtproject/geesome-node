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
    
    getUsersCount(): Promise<number>;
    addUser(user: IUser): Promise<IUser>;
    getUserByName(name): Promise<IUser>;
    getUser(id): Promise<IUser>;

    getGroup(id): Promise<IGroup>;
    addGroup(group): Promise<IGroup>;

    getValue(key: string): Promise<string>;
    setValue(key: string, content: string): Promise<void>;
    clearValue(key: string): Promise<void>;
}

export interface IContent {
    id?: number;
    name: string;
    description?: string;
    ipfsHash?: string;
    isPublic?: boolean;
    userId: number;
    groupId: number;
}

export interface IUser {
    id?: number;
    name: string;
    title: string;
    passwordHash: string;
}

export interface IGroup {
    id?: number;
    name: string;
    title: string;
    isPublic: boolean;
}
