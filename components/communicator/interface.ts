/*
 * Copyright ©️ 2018-2020 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2020 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

export interface ICommunicator {
  node: any;

  getAccountIdByName(name): Promise<string>;

  getAccountPeerId(key): Promise<any>;

  getAccountPublicKey(key): Promise<Buffer>;

  getCurrentAccountId(): Promise<string>;

  createAccountIfNotExists(name): Promise<string>;

  removeAccountIfExists(name): Promise<void>;

  bindToStaticId(storageId, accountKey, options?): Promise<string>;

  resolveStaticId(staticStorageId): Promise<string>;

  resolveStaticItem(staticStorageId): Promise<{value: string, createdAt: number}>;

  resolveStaticIdEntry(staticStorageId): Promise<{pubKey}>;

  keyLookup(ipnsId): Promise<any>;

  getBootNodeList(): Promise<string[]>;

  addBootNode(address): Promise<string[]>;

  removeBootNode(address): Promise<string[]>;

  nodeAddressList(): Promise<string[]>;

  publishEventByStaticId(ipnsId, topic, data): Promise<void>;

  publishEvent(topic, data): Promise<void>;

  subscribeToStaticIdUpdates(ipnsId, callback): Promise<void>;

  subscribeToEvent(topic, callback): Promise<void>;

  getStaticIdPeers(ipnsId): Promise<string[]>;

  getPubSubLs(): Promise<string[]>;

  getPeers(topic): Promise<string[]>;
}

interface IResultFile {
  path;
  size;
  id;
  storageAccountId;
}
