import {IGeesomeApp} from "../../app/interface";

import { krasnodar } from '@fluencelabs/fluence-network-environment';
import { createClient, FluenceClient } from '@fluencelabs/fluence';
const dhtApi = require('./dht-api');
import {ICommunicator} from "../interface";
const ipfsHelper = require('geesome-libs/src/ipfsHelper');
const _ = require('lodash');
const fs = require('fs');

module.exports = async (app: IGeesomeApp) => {
    const relayNode = krasnodar[1];
    const client = await createClient(relayNode);
    // let neighbours = await dhtApi.getNeighbours(client, nodeId, 'topic')

    const storagePath = './accountsStorage.json';

    const AccountsStorage = {
        getStorage() {
            return JSON.parse(fs.existsSync(storagePath) ? fs.readFileSync(storagePath, {encoding: 'utf8'}) : '{}');
        },
        setStorage(storageData) {
            return fs.writeFileSync(storagePath, JSON.stringify(storageData), {encoding: 'utf8'});
        },
        setAccount(name, data) {
            const storageData = this.getStorage();
            if (storageData[name]) {
                return storageData[name];
            }
            if (data) {
                storageData[name] = data;
            } else {
                delete storageData[name];
            }
            return data;
        },
        getAccount(name) {
            const storageData = this.getStorage();
            return storageData[name] || _.find(storageData, (account, name) => account.publicBase58 == name);
        },
        async getAccountPeerId(name) {
            const account = this.getAccount(name);
            return ipfsHelper.createPeerIdFromPrivateBase64(account.privateBase64);
        },
        async getAccountPublicBase58(name) {
            const account = this.getAccount(name);
            return account.publicBase58;
        },
        async getAccountPublicKey(name) {
            const account = this.getAccount(name);
            return ipfsHelper.base64ToPublicKey(account.publicBase64);
        },
        async createAccount(name) {
            const peerId = await ipfsHelper.createPeerId();
            const privateBase64 = ipfsHelper.peerIdToPrivateBase64(peerId);
            const publicBase64 = ipfsHelper.peerIdToPublicBase64(peerId);
            const publicBase58 = ipfsHelper.peerIdToPublicBase58(peerId);
            return this.setAccount(name, { privateBase64, publicBase64, publicBase58 });
        },
        async getOrCreateAccount(name) {
            const account = this.getAccount(name);
            if (account) {
                return account;
            }
            const peerId = await ipfsHelper.createPeerId();
            const privateBase64 = ipfsHelper.peerIdToPrivateBase64(peerId);
            const publicBase64 = ipfsHelper.peerIdToPublicBase64(peerId);
            const publicBase58 = ipfsHelper.peerIdToPublicBase58(peerId);
            return this.setAccount(name, { privateBase64, publicBase64, publicBase58 });
        }
    };

    class FluenceCommunicator {
        async bindToStaticId(storageId, accountKey, options?): Promise<string> {
            if (!_.startsWith(accountKey, 'Qm')) {
                if (accountKey === 'self') {
                    accountKey = await AccountsStorage.getOrCreateAccount(accountKey).then(r => r.publicBase58);
                } else {
                    accountKey = AccountsStorage.getAccountPublicBase58(accountKey);
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
            return AccountsStorage.setAccount(name, null);
        }
        getAccountIdByName(name): Promise<string> {
            return AccountsStorage.getAccountPublicBase58(name);
        }
        createAccountIfNotExists(name): Promise<string> {
            return AccountsStorage.createAccount(name).then(acc => acc.publicBase58);
        }

        getAccountPeerId(key) {
            return AccountsStorage.getAccountPeerId(key);
        }

        getAccountPublicKey(key): Promise<Buffer> {
            return AccountsStorage.getAccountPublicKey(key);
        }

        getCurrentAccountId(): Promise<string> {
            return AccountsStorage.createAccount('self').then(acc => acc.publicBase58);
        }

        resolveStaticIdEntry(staticStorageId): Promise<{pubKey}> {
            return this.resolveStaticId(staticStorageId).then(r => ({pubKey: AccountsStorage.getAccountPublicKey(r)}))
        }

        keyLookup(ipnsId): Promise<any> {
            return AccountsStorage.getAccountPeerId(ipnsId).then(r => r.privKey);
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