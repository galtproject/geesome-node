import {IStorage} from "./interface";

const ipfsHelper = require('../../libs/ipfsHelper');
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

    async getAccountNameById(id) {
        const keys = await this.node.key.list();
        return (_.find(keys, {id}) || {}).name || null;
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
        objectData = _.isObject(objectData) ? JSON.stringify(objectData) : objectData;
        console.log('put', objectData);
        const savedObj = await this.node.dag.put(objectData);
        console.log('pin', ipfsHelper.cidToHash(savedObj));
        await this.node.pin.add(ipfsHelper.cidToHash(savedObj));
        console.log('ipfsHelper.cidToHash', savedObj);
        return ipfsHelper.cidToHash(savedObj);
    }

    async getObject(storageId) {
        return this.node.dag.get(storageId).then(response => response.value);
    }

    async getObjectProp(storageId, propName) {
        return this.node.dag.get(storageId + '/' + propName).then(response => response.value);
    }

    async bindToStaticId(storageId, accountKey) {
        if(_.startsWith(accountKey, 'Qm')) {
            accountKey = await this.getAccountNameById(accountKey);
        }
        return this.node.name.publish(`${storageId}`, {
            key: accountKey,
            lifetime: '175200h'
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
