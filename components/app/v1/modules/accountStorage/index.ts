import {IGeesomeApp} from "../../../interface";
import IGeesomeAccountStorageModule from "./interface";
const peerIdHelper = require('geesome-libs/src/peerIdHelper');

module.exports = async (app: IGeesomeApp, options: any = {}) => {
	const module = getModule(app, options.pass || app.config.storageConfig.jsNode.pass);
	await module.getOrCreateAccountStaticId('self');
	// require('./api')(app, module);
	return module;
}

function getModule(app: IGeesomeApp, pass) {
	app.checkModules(['database']);

	class DatabaseAccountStorage implements IGeesomeAccountStorageModule {
		async createAccount(name) {
			const peerId = await peerIdHelper.createPeerId();
			const privateBase64 = peerIdHelper.peerIdToPrivateBase64(peerId);
			const publicBase64 = peerIdHelper.peerIdToPublicBase64(peerId);
			const publicBase58 = peerIdHelper.peerIdToPublicBase58(peerId);
			const encryptedPrivateKey = await peerIdHelper.encryptPrivateBase64WithPass(privateBase64, pass);
			return app.ms.database.setStaticIdKey(publicBase58, publicBase64, name, encryptedPrivateKey);
		}

		async getAccountStaticId(name) {
			return app.ms.database.getStaticIdByName(name);
		}

		async getAccountPublicKey(name) {
			return app.ms.database.getStaticIdPublicKey(name, name).then(publicKey => peerIdHelper.base64ToPublicKey(publicKey));
		}

		async getAccountPeerId(name) {
			const encryptedPrivateKey = await app.ms.database.getStaticIdEncryptedPrivateKey(name, name);
			const privateKey = await peerIdHelper.decryptPrivateBase64WithPass(encryptedPrivateKey, pass);
			return peerIdHelper.createPeerIdFromPrivateBase64(privateKey);
		}

		async createAccountAndGetStaticId(name) {
			const staticId = await app.ms.database.getStaticIdByName(name);
			return staticId || this.createAccount(name).then(acc => acc.staticId);
		}

		async getOrCreateAccountStaticId(name) {
			const staticId = await this.getAccountStaticId(name);
			return staticId || this.createAccountAndGetStaticId(name);
		}

		async destroyStaticId(name) {
			return app.ms.database.destroyStaticId(name, name);
		}
	}

	return new DatabaseAccountStorage();
}