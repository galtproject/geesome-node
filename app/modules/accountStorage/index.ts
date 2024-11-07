import {Op} from "sequelize";
import pIteration from 'p-iteration';
import peerIdHelper from "geesome-libs/src/peerIdHelper";
import IGeesomeAccountStorageModule, {IStaticIdAccount} from "./interface";
import {IGeesomeApp} from "../../interface";

export default async (app: IGeesomeApp, options: any = {}) => {
	const module = getModule(app, await (await import('./models')).default(app.ms.database.sequelize), options.pass || app.config.storageConfig.jsNode.pass);
	// (await import('./api')).default(app, module);
	return module;
}

function getModule(app: IGeesomeApp, models, pass) {
	class DatabaseAccountStorage implements IGeesomeAccountStorageModule {
		async createAccount(name, userId, groupId?) {
			if (!name || !userId) {
				throw new Error("name_and_userId_cannot_be_null");
			}
			const peerId = await peerIdHelper.createPeerId();
			const privateBase64 = peerIdHelper.peerIdToPrivateBase64(peerId);
			const publicBase64 = peerIdHelper.peerIdToPublicBase64(peerId);
			const cid = peerIdHelper.peerIdToCid(peerId);
			const encryptedPrivateKey = await peerIdHelper.encryptPrivateBase64WithPass(privateBase64, pass);
			return models.Account.create({userId, groupId, staticId: cid, publicKey: publicBase64, name, encryptedPrivateKey, isRemote: !encryptedPrivateKey});
		}

		async getLocalAccountByName(name) {
			return models.Account.findOne({where: {name, isRemote: false}}) as IStaticIdAccount;
		}

		async updateLocalAccountGroupId(name, groupId) {
			return models.Account.update({groupId}, {where: {name, isRemote: false}});
		}

		async renameLocalAccount(name, newName) {
			return models.Account.update({name: newName}, {where: {name, isRemote: false}});
		}

		async getAccountPublicKey(name): Promise<any> {
			return this.getStaticIdPublicKeyByOr(name, name)
				.then(publicKey => peerIdHelper.base64ToPublicKey(publicKey));
		}

		async getUserIdOfLocalStaticIdAccount(staticId) {
			return models.Account.findOne({ where: { staticId, isRemote: false } })
				.then(acc => acc ? acc.userId : null);
		}

		async getLocalAccountStaticIdByNameAndUserId(name, userId) {
			if (!name || !userId) {
				return null;
			}
			return models.Account.findOne({ where: { name, userId, isRemote: false } })
				.then(acc => acc ? acc.staticId : null);
		}

		async getLocalAccountStaticIdByNameAndGroupId(name, groupId) {
			if (!name || !groupId) {
				return null;
			}
			return models.Account.findOne({ where: { name, groupId, isRemote: false } })
				.then(acc => acc ? acc.staticId : null);
		}

		async getAccountPeerId(name) {
			if (!name) {
				return null;
			}
			const encryptedPrivateKey = await this.getStaticIdEncryptedPrivateKey(name, name);
			if (!encryptedPrivateKey) {
				return null;
			}
			const privateKey = await peerIdHelper.decryptPrivateBase64WithPass(encryptedPrivateKey, pass);
			return peerIdHelper.createPeerIdFromPrivateBase64(privateKey);
		}

		async createAccountAndGetStaticId(name, userId, groupId?) {
			return this.createAccount(name, userId, groupId).then(acc => acc.staticId);
		}

		async getAccountStaticId(name) {
			return this.getStaticIdByName(name);
		}

		async getOrCreateAccountStaticId(name, userId, groupId?) {
			const staticId = await this.getAccountStaticId(name);
			return staticId || this.createAccountAndGetStaticId(name, userId, groupId);
		}

		async destroyStaticId(name) {
			return this.destroyStaticIdByOr(name, name);
		}

		async createRemoteAccount(staticId, publicKey, name?, groupId?) {
			return models.Account.create({staticId, publicKey, name, groupId, isRemote: true});
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
