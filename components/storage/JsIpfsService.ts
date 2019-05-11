import {IStorage} from "./interface";

const CID = require('cids');
const _ = require('lodash');

export class JsIpfsService implements IStorage {
    node;

    constructor(node) {
        this.node = node;
    }

    private async wrapIpfsItem(ipfsItem) {
        return {
            id: ipfsItem.hash,
            path: ipfsItem.path,
            size: ipfsItem.size,
            storageAccountId: await this.getCurrentAccountId()
        }
    }

    async saveFileByUrl(url) {
        const result = await this.node.addFromURL(url);
        await this.node.pin.add(result[0].hash);
        return this.wrapIpfsItem(result[0]);
    }

    async saveFileByPath(path) {
        return this.saveFile({path});
    }

    async saveFileByData(content) {
        if (_.isString(content)) {
            content = Buffer.from(content, 'utf8');
        }
        return this.saveFile({content});
    }

    async saveFile(options) {
        const result = await this.node.add([options]);
        await this.node.pin.add(result[0].hash);
        return this.wrapIpfsItem(result[0]);
    }

    async getAccountIdByName(name) {
        const keys = await this.node.key.list();
        return (_.find(keys, {name}) || {}).id || null;
    }

    async getCurrentAccountId() {
        return this.getAccountIdByName('self');
    }

    async createAccountIfNotExists(name) {
        const accountId = await this.getAccountIdByName(name);
        if (accountId) {
            return accountId;
        }
        return this.node.key.gen(name, {
            type: 'rsa',
            size: 2048
        }).then(result => result.id);
    }

    async removeAccountIfExists(name) {
        const accountId = await this.getAccountIdByName(name);
        if (!accountId) {
            return;
        }
        return this.node.key.rm(name);
    }

    getFileStream(filePath) {
        return this.node.getReadableStream(filePath);
    }

    async saveObject(objectData) {
        const savedObj = await this.node.dag.put(objectData);
        await this.node.pin.add(savedObj);

        //passing multihash buffer to CID object to convert multihash to a readable format
        const cidsResult = new CID(1, 'dag-cbor', savedObj.multihash);
        return cidsResult.toBaseEncodedString();
    }

    async getObject(storageId) {
        return this.node.dag.get(storageId).then(response => response.value);
    }

    async getObjectProp(storageId, propName) {
        return this.node.dag.get(storageId + '/' + propName).then(response => response.value);
    }

    async bindToStaticId(storageId, accountName) {
        return this.node.name.publish(`${storageId}`, {
            key: accountName
        }).then(response => response.name);
    }

    async resolveStaticId(staticStorageId) {
        return this.node.name.resolve(staticStorageId).then(response => {
            return response.path.replace('/ipfs/', '')
        });
    }
}

export enum StorageType {
    IPLD = 'ipld',
    IPFS = 'ipfs'
}