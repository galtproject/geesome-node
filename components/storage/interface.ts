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
  saveDirectory(path): Promise<IResultFile>;

  saveFileByPath(path): Promise<IResultFile>;

  saveFileByData(content): Promise<IResultFile>;

  saveFileByUrl(url): Promise<IResultFile>;

  getFileStream(filePath): Promise<any>;

  getFileData(filePath): Promise<any>;

  getAccountIdByName(name): Promise<string>;
  
  getAccountPeerId(key): Promise<any>;
  getAccountPublicKey(key): Promise<Buffer>;

  getCurrentAccountId(): Promise<string>;

  createAccountIfNotExists(name): Promise<string>;

  removeAccountIfExists(name): Promise<void>;

  saveObject(objData: any): Promise<string>;

  getObject(storageId: string): Promise<any>;

  getObjectProp(storageId: string, propName: string): Promise<any>;

  bindToStaticId(storageId, accountKey): Promise<string>;

  resolveStaticId(staticStorageId): Promise<string>;

  getBootNodeList(): Promise<string[]>;

  addBootNode(address): Promise<string[]>;

  removeBootNode(address): Promise<string[]>;

  nodeAddressList(): Promise<string[]>;

  publishEventByIpnsId(ipnsId, topic, data): Promise<void>;
  publishEvent(topic, data): Promise<void>;
  
  subscribeToIpnsUpdates(ipnsId, callback): Promise<void>;

  subscribeToEvent(topic, callback): Promise<void>;

  getIpnsPeers(ipnsId): Promise<string[]>;

  getPubSubLs(): Promise<string[]>;

  getPeers(topic): Promise<string[]>;
}

interface IResultFile {
  path;
  size;
  id;
  storageAccountId;
}
