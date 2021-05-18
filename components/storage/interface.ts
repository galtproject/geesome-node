/*
 * Copyright ©️ 2018-2020 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2020 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

import Promise from "sequelize/types/lib/promise";

export interface IStorage {
  node: any;

  saveDirectory(path): Promise<IResultFile>;

  saveFileByPath(path): Promise<IResultFile>;

  saveFileByData(content): Promise<IResultFile>;

  saveFileByUrl(url): Promise<IResultFile>;

  getFileStream(filePath, options?): Promise<any>;

  getFileStat(filePath): Promise<any>;

  getFileData(filePath): Promise<any>;

  getFileDataText(filePath): Promise<any>;

  unPin(hash, options?): Promise<any>;

  remove(hash, options?): Promise<any>;

  getAccountIdByName(name): Promise<string>;

  getAccountPeerId(key): Promise<any>;

  getAccountPublicKey(key): Promise<Buffer>;

  getCurrentAccountId(): Promise<string>;

  createAccountIfNotExists(name): Promise<string>;

  removeAccountIfExists(name): Promise<void>;

  saveObject(objData: any): Promise<string>;

  getObject(storageId: string): Promise<any>;

  getObjectProp(storageId: string, propName: string): Promise<any>;

  bindToStaticId(storageId, accountKey, options?): Promise<string>;

  resolveStaticId(staticStorageId): Promise<string>;

  resolveStaticIdEntry(staticStorageId): Promise<{pubKey}>;

  keyLookup(ipnsId): Promise<any>;

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

  makeDir(path): Promise<void>;

  copyFileFromId(storageId, path): Promise<void>;

  getDirectoryId(path): Promise<string>;
}

interface IResultFile {
  path;
  size;
  id;
  storageAccountId;
}
