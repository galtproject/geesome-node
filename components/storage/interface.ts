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

export interface IStorage {
    saveFileByPath(path): Promise<IResultFile>;
    saveFileByData(content): Promise<IResultFile>;
    saveFileByUrl(url): Promise<IResultFile>;
    getFileStream(filePath): any;

    getAccountIdByName(name): Promise<string>;
    getCurrentAccountId(): Promise<string>;
    createAccountIfNotExists(name): Promise<string>;
    removeAccountIfExists(name): Promise<void>;

    saveObject(objData: any): Promise<string>;
    getObject(storageId: string): Promise<any>;
    getObjectProp(storageId: string, propName: string): Promise<any>;

    bindToStaticId(storageId, accountKey): Promise<string>;
    resolveStaticId(staticStorageId): Promise<string>;
}

interface IResultFile {
    path;
    size;
    id;
    storageAccountId;
}
