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

import {IStorage} from "../interface";
import {IGeesomeApp} from "../../app/interface";

const _ = require('lodash');
const IPFS = require('ipfs');

module.exports = async (app: IGeesomeApp) => {
    const node = new IPFS(app.config.storageConfig);

    // console.log('node', node);
    try {
        await new Promise((resolve, reject) => {
            node.on('ready', (err) => err ? reject(err) : resolve());
            node.on('error', (err) => reject(err))
        });
        
        console.log('🎁 IPFS node have started');
    } catch (e) {
        console.error('❌ IPFS not started', e);
    }
    
    return new JsIpfsService(node);
};

class JsIpfsService implements IStorage {
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
        return this.saveFile({ path });
    }

    async saveFileByContent(content) {
        if(_.isString(content)) {
            content = Buffer.from(content, 'utf8');
        }
        return this.saveFile({ content });
    }

    async saveFile(options) {
        const result = await this.node.add([options]);
        await this.node.pin.add(result[0].hash);
        return this.wrapIpfsItem(result[0]);
    }
    
    async getPeerId(name) {
        const keys = await this.node.key.list();
        return (_.find(keys, { name }) || {}).id;
    }
    
    async getCurrentAccountId() {
        return this.getPeerId('self');
    }

    getFileStream(filePath){
        return this.node.getReadableStream(filePath);
    }
}
