import {IGeesomeApp} from "../../app/interface";

import { krasnodar } from '@fluencelabs/fluence-network-environment';
import { createClient, FluenceClient } from '@fluencelabs/fluence';
const dhtApi = require('./dht-api');
import {ICommunicator} from "../interface";
const ipfsHelper = require('geesome-libs/src/ipfsHelper');
const _ = require('lodash');

module.exports = async (app: IGeesomeApp) => {
    const relayNode = krasnodar[1];
    const client = await createClient(relayNode);
    // let neighbours = await dhtApi.getNeighbours(client, nodeId, 'topic')

    async function createAccount(name) {
        const peerId = await ipfsHelper.createPeerId();
        const privateBase64 = ipfsHelper.peerIdToPrivateBase64(peerId);
        const publicBase64 = ipfsHelper.peerIdToPublicBase64(peerId);
        const publicBase58 = ipfsHelper.peerIdToPublicBase58(peerId);
        const encryptedPrivateKey = await ipfsHelper.encryptPrivateBase64WithPass(privateBase64, app.config.storageConfig.jsNode.pass);
        return app.database.setStaticIdKey(publicBase58, publicBase64, name, encryptedPrivateKey);
    }
    async function createAccountAndGetStaticId(name) {
        const staticId = await app.database.getStaticIdByName(name);
        return staticId || createAccount(name).then(acc => acc.staticId);
    }
    async function getAccountStaticId(name) {
        return app.database.getStaticIdByName(name);
    }
    async function getAccountPublicId(name) {
        return app.database.getStaticIdPublicKey(name, name).then(publicKey => ipfsHelper.base64ToPublicKey(publicKey));
    }
    async function getAccountPeerId(name) {
        const encryptedPrivateKey = await app.database.getStaticIdEncryptedPrivateKey(name, name);
        const privateKey = await ipfsHelper.decryptPrivateBase64WithPass(encryptedPrivateKey, app.config.storageConfig.jsNode.pass);
        return ipfsHelper.createPeerIdFromPrivateBase64(privateKey);
    }
    async function getOrCreateAccountStaticId(name) {
        const staticId = await getAccountStaticId(name);
        if (staticId) {
            return staticId;
        }
        return createAccountAndGetStaticId(name);
    }
    async function destroyStaticId(name) {
        return app.database.destroyStaticId(name, name);
    }

    class FluenceCommunicator {
        async bindToStaticId(storageId, accountKey, options?): Promise<string> {
            if (!_.startsWith(accountKey, 'Qm')) {
                if (accountKey === 'self') {
                    accountKey = await getOrCreateAccountStaticId(accountKey);
                } else {
                    accountKey = await getAccountStaticId(accountKey);
                }
            }

            await dhtApi.initTopicAndSubscribe(client, client.relayPeerId, accountKey, storageId, client.relayPeerId, null, () => {});
            return accountKey;
        }
        async resolveStaticId(staticStorageId): Promise<string> {
            return dhtApi.findSubscribers(client, client.relayPeerId, staticStorageId).then(results => {
                console.log("subscriber", results[0]);
                return results[0].value;
            }) as any;
        }
        removeAccountIfExists(name): Promise<void> {
            return destroyStaticId(name);
        }
        getAccountIdByName(name): Promise<string> {
            return getAccountStaticId(name);
        }
        createAccountIfNotExists(name): Promise<string> {
            return createAccountAndGetStaticId(name);
        }

        getAccountPeerId(key) {
            return getAccountPeerId(key);
        }

        getAccountPublicKey(key): Promise<Buffer> {
            return getAccountPublicId(key);
        }

        getCurrentAccountId(): Promise<string> {
            return createAccountAndGetStaticId('self');
        }

        resolveStaticIdEntry(staticStorageId): Promise<{pubKey}> {
            return this.resolveStaticId(staticStorageId).then(async r => ({pubKey: await getAccountPublicId(r)}))
        }

        keyLookup(ipnsId): Promise<any> {
            return getAccountPeerId(ipnsId).then(r => r.privKey);
        }

        getBootNodeList(): Promise<string[]> {
            // TODO: implement
            return [] as any;
        }

        addBootNode(address): Promise<string[]> {
            // TODO: implement
            return [] as any;
        }

        removeBootNode(address): Promise<string[]> {
            // TODO: implement
            return [] as any;
        }

        nodeAddressList(): Promise<string[]> {
            // TODO: implement
            return [] as any;
        }

        publishEventByStaticId(ipnsId, topic, data): Promise<void> {
            return null;
        }

        publishEvent(topic, data): Promise<void> {
            return null;
        }

        subscribeToStaticIdUpdates(ipnsId, callback): Promise<void> {
            return null;
        }

        subscribeToEvent(topic, callback): Promise<void> {
            return null;
        }

        getStaticIdPeers(ipnsId): Promise<string[]> {
            return null;
        }

        getPubSubLs(): Promise<string[]> {
            return null;
        }

        getPeers(topic): Promise<string[]> {
            return null;
        }
    }
    return new FluenceCommunicator();
}