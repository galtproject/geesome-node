import {IGeesomeApp} from "../../interface";
import IGeesomeAccountStorageModule from "./interface";
const peerIdHelper = require('geesome-libs/src/peerIdHelper');
const Op = require("sequelize").Op;
const pIteration = require("p-iteration");

module.exports = async (app: IGeesomeApp, options: any = {}) => {
	const module = getModule(app, await require('./database')(), options.pass || app.config.storageConfig.jsNode.pass);
	// require('./api')(app, module);
	return module;
}

function getModule(app: IGeesomeApp, models, pass) {
	class DatabaseAccountStorage implements IGeesomeAccountStorageModule {
		async createAccount(name, userId) {
			const peerId = await peerIdHelper.createPeerId();
			const privateBase64 = peerIdHelper.peerIdToPrivateBase64(peerId);
			const publicBase64 = peerIdHelper.peerIdToPublicBase64(peerId);
			const publicBase58 = peerIdHelper.peerIdToPublicBase58(peerId);
			const encryptedPrivateKey = await peerIdHelper.encryptPrivateBase64WithPass(privateBase64, pass);
			return this.setStaticIdKey(userId, publicBase58, publicBase64, name, encryptedPrivateKey);
		}

		async getAccountPublicKey(name) {
			return this.getStaticIdPublicKeyByOr(name, name).then(publicKey => peerIdHelper.base64ToPublicKey(publicKey));
		}

		async getUserIdOfLocalStaticIdAccount(staticId) {
			return models.Account.findOne({ where: { staticId, isRemote: false } })
				.then(acc => acc ? acc.userId : null);
		}

		async getLocalAccountStaticIdByNameAndUserId(name, userId) {
			return models.Account.findOne({ where: { name, userId, isRemote: false } })
				.then(acc => acc ? acc.staticId : null);
		}

		async getAccountPeerId(name) {
			const encryptedPrivateKey = await this.getStaticIdEncryptedPrivateKey(name, name);
			if (!encryptedPrivateKey) {
				return null;
			}
			const privateKey = await peerIdHelper.decryptPrivateBase64WithPass(encryptedPrivateKey, pass);
			return peerIdHelper.createPeerIdFromPrivateBase64(privateKey);
		}

		async createAccountAndGetStaticId(name, userId) {
			const staticId = await this.getStaticIdByName(name);
			return staticId || this.createAccount(name, userId).then(acc => acc.staticId);
		}

		async getAccountStaticId(name) {
			return this.getStaticIdByName(name);
		}

		async getOrCreateAccountStaticId(name, userId) {
			const staticId = await this.getAccountStaticId(name);
			return staticId || this.createAccountAndGetStaticId(name, userId);
		}

		async destroyStaticId(name) {
			return this.destroyStaticIdByOr(name, name);
		}

		async setStaticIdKey(userId, staticId, publicKey, name = null, encryptedPrivateKey = null) {
			return models.Account.create({userId, staticId, publicKey, name, encryptedPrivateKey, isRemote: !encryptedPrivateKey});
		}

		async getStaticIdByName(name) {
			return models.Account.findOne({where: { name }}).then(item => item ? item.staticId : null);
		}

		async getStaticIdPublicKeyByOr(staticId = null, name = null) {
			if (!staticId && !name) {
				return null;
			}
			const or = [];
			staticId && or.push({staticId});
			name && or.push({name});
			return models.Account.findOne({ where: {[Op.or]: or} }).then(item => item ? item.publicKey : null);
		}

		async getStaticIdEncryptedPrivateKey(staticId = null, name = null) {
			if (!staticId && !name) {
				return null;
			}
			const or = [];
			staticId && or.push({staticId});
			name && or.push({name});
			return models.Account.findOne({ where: {[Op.or]: or} }).then(item => item ? item.encryptedPrivateKey : null);
		}

		async destroyStaticIdByOr(staticId = null, name = null) {
			if (!staticId && !name) {
				return null;
			}
			const or = [];
			staticId && or.push({staticId});
			name && or.push({name});
			return models.Account.destroy({ where: {[Op.or]: or} });
		}

		async flushDatabase() {
			await pIteration.forEachSeries(['Account'], (modelName) => {
				return models[modelName].destroy({where: {}});
			});
		}
	}

	return new DatabaseAccountStorage();
}