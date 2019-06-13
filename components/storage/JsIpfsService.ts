import {IStorage} from "./interface";

const ipfsHelper = require('../../libs/ipfsHelper');
const _ = require('lodash');
const fs = require('fs');

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

    async saveDirectory(path) {
        const result = await this.node.addFromFs(path, { recursive: true , ignore: []});
        const dirName = _.last(path.split('/'));
        const dirResult = _.find(result, {path: dirName})
        console.log('saveDirectory result', dirResult);
        await this.node.pin.add(dirResult.hash);
        return this.wrapIpfsItem(dirResult);
    }

    async saveFileByPath(path) {
        return this.saveFile({content: fs.createReadStream(path)});
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
        console.log('getFileStream', filePath);
        return new Promise((resolve, reject) => {
            this.node.getReadableStream(filePath).on('data', (file) => {
                // console.log('file', file);
                resolve(file.content);
            });
        });
    }

    getFileData(filePath) {
        return this.node.cat(filePath).then((result) => result);
    }

    async saveObject(objectData) {
        // objectData = _.isObject(objectData) ? JSON.stringify(objectData) : objectData;
        const savedObj = await this.node.dag.put(objectData);
        console.log('savedObj', savedObj);
        const ipldHash = ipfsHelper.cidToHash(savedObj);
        console.log('ipldHash', ipldHash);
        await this.node.pin.add(ipldHash);
        console.log('pin', ipldHash);
        return ipldHash;
    }

    async getObject(storageId) {
        console.log('getObject', storageId);
        if(ipfsHelper.isCid(storageId)) {
            storageId = ipfsHelper.cidToHash(storageId);
            console.log('cidToHash', storageId);
        }
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

    async getBootNodeList(): Promise<any[]> {
        return new Promise((resolve, reject) => {
            this.node.bootstrap.list((err, res) => err ? reject(err) : resolve(res.Peers))
        }) as any;
    }

    async addBootNode(address): Promise<any[]> {
        await new Promise((resolve, reject) => {
            this.node.swarm.connect(address, (err, res) => err ? reject(err) : resolve());
        }) as any;
        return new Promise((resolve, reject) => {
            this.node.bootstrap.add(address, (err, res) => err ? reject(err) : resolve(res.Peers));
        }) as any;
    }

    async removeBootNode(address): Promise<any[]> {
        await new Promise((resolve, reject) => {
            this.node.swarm.disconnect(address, (err, res) => err ? reject(err) : resolve());
        }) as any;
        return new Promise((resolve, reject) => {
            this.node.bootstrap.rm(address, (err, res) => err ? reject(err) : resolve(res.Peers))
        }) as any;
    }
    
    async nodeAddressList(): Promise<any[]> {
        return new Promise((resolve, reject) => {
            this.node.swarm.localAddrs((err, res) => {
                if(err) {
                    return reject(err);
                }
                let addresses = _.chain(JSON.parse(JSON.stringify(res)))
                    .filter(_.isString)
                    .filter(address => !_.includes(address, '127.0.0.1'))
                    .orderBy([address => {
                        if(_.includes(address, '192.168')) {
                            return -2;
                        }
                        if(_.includes(address, '/p2p-circuit/ipfs/')) {
                            return -1;
                        }
                        return 0;
                    }], ['desc'])
                    .value();
                resolve(addresses);
            })
        }) as any;
    }
}
