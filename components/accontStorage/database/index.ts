import {IDatabase} from "../../database/interface";
const ipfsHelper = require('geesome-libs/src/ipfsHelper');

export default class DatabaseAccountStorage {
    database: IDatabase;
    pass: string;

    constructor(_database: IDatabase, _pass) {
        this.database = _database;
        this.pass = _pass;
    }
    async createAccount(name) {
        const peerId = await ipfsHelper.createPeerId();
        const privateBase64 = ipfsHelper.peerIdToPrivateBase64(peerId);
        const publicBase64 = ipfsHelper.peerIdToPublicBase64(peerId);
        const publicBase58 = ipfsHelper.peerIdToPublicBase58(peerId);
        const encryptedPrivateKey = await ipfsHelper.encryptPrivateBase64WithPass(privateBase64, this.pass);
        return this.database.setStaticIdKey(publicBase58, publicBase64, name, encryptedPrivateKey);
    }
    async getAccountStaticId(name) {
        return this.database.getStaticIdByName(name);
    }
    async getAccountPublicKey(name) {
        return this.database.getStaticIdPublicKey(name, name).then(publicKey => ipfsHelper.base64ToPublicKey(publicKey));
    }
    async getAccountPeerId(name) {
        const encryptedPrivateKey = await this.database.getStaticIdEncryptedPrivateKey(name, name);
        const privateKey = await ipfsHelper.decryptPrivateBase64WithPass(encryptedPrivateKey, this.pass);
        return ipfsHelper.createPeerIdFromPrivateBase64(privateKey);
    }
    async createAccountAndGetStaticId(name) {
        const staticId = await this.database.getStaticIdByName(name);
        return staticId || this.createAccount(name).then(acc => acc.staticId);
    }
    async getOrCreateAccountStaticId(name) {
        const staticId = await this.getAccountStaticId(name);
        return staticId || this.createAccountAndGetStaticId(name);
    }
    async destroyStaticId(name) {
        return this.database.destroyStaticId(name, name);
    }
}