/*
 * Copyright ©️ 2018-2020 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2020 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

export default interface IGeesomeStorageModule {
  node: any;

  isStreamAddSupport(): boolean;

  saveDirectory(path, options?): Promise<IResultFile>;

  saveFileByPath(path, options?): Promise<IResultFile>;

  saveFileByData(content, options?): Promise<IResultFile>;

  saveFileByUrl(url): Promise<IResultFile>;

  getFileStream(filePath, options?): Promise<any>;

  getFileStat(filePath): Promise<any>;

  getFileData(filePath): Promise<any>;

  getFileDataText(filePath): Promise<any>;

  unPin(hash, options?): Promise<any>;

  remove(hash, options?): Promise<any>;

  saveObject(objData: any, options?): Promise<string>;

  getObject(storageId: string, resolveProp?: boolean): Promise<any>;

  getObjectProp(storageId: string, propName: string, resolveProp?: boolean): Promise<any>;

  makeDir(path): Promise<void>;

  copyFileFromId(storageId, path): Promise<void>;

  fileLs(path): Promise<any>;

  getDirectoryId(path): Promise<string>;

  getBootNodeList(): Promise<string[]>;

  addBootNode(address): Promise<string[]>;

  removeBootNode(address): Promise<string[]>;

  nodeAddressList(): Promise<string[]>;

  remoteNodeAddressList(types: string[]): Promise<string[]>;

  stop(): Promise<any>;
}

interface IResultFile {
  path;
  size;
  id;
  storageAccountId;
}
