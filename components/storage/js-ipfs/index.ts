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

const IPFS = require('ipfs');

module.exports = async () => {
    const node = new IPFS();

    console.log('node', node);
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
    
    async saveFileByUrl(url) {
        // const request = require('request');
        // const readStream = request('https://dummydomain.com/some-very-large-file');
        // readStream.pipe(request.post('https://dummydomain.com/some-destination'));
    }

    async saveFileByPath(path) {
        return this.saveFile({ path });
    }

    async saveFileByContent(content) {
        return this.saveFile({ content });
    }

    async saveFile(options) {
        return this.node.add([options]);
    }
}
