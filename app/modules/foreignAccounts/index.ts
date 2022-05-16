import {IGeesomeApp} from "../../interface";
import IGeesomeForeignAccountsModule, {IForeignAccount} from "./interface";
const pIteration = require("p-iteration");
const axios = require('axios');
const _ = require('lodash');

module.exports = async (app: IGeesomeApp) => {
	app.checkModules([]);

	const module = getModule(app, await require('./models')());
	require('./api')(app, module);
	return module;
}

function getModule(app: IGeesomeApp, models) {
	class ForeignAccountsModule implements IGeesomeForeignAccountsModule {
		async createAccount(userId: number, account: IForeignAccount): Promise<IForeignAccount> {
			return models.ForeignAccount.create({
				...await this.encryptPinAccountIfNecessary(account),
				userId
			})
		}

		async updateAccount(userId: number, id: number, updateData: IForeignAccount): Promise<IForeignAccount> {
			const account = await models.ForeignAccount.findOne({where: {id}});
			if (account.userId !== userId && !(await app.ms.group.canEditGroup(userId, account.groupId))) {
				throw new Error("not_permitted");
			}
			return models.ForeignAccount.update(updateData, {where: {id}})
				.then(() => models.ForeignAccount.findOne({where: {id}}))
				.then(acc => this.decryptPinAccountIfNecessary(acc));
		}

		async getUserAccount(userId: number, name: string): Promise<IForeignAccount> {
			return models.ForeignAccount.findOne({where: {userId, name}}).then(acc => this.decryptPinAccountIfNecessary(acc));
		}

		async getUserAccountsList(userId: number): Promise<IForeignAccount[]> {
			return models.ForeignAccount.findAll({where: {userId}});
		}

		async getGroupAccountsList(userId: number, groupId: number): Promise<IForeignAccount[]> {
			if (!await app.ms.group.canEditGroup(userId, groupId)) {
				throw new Error("not_permitted");
			}
			return models.ForeignAccount.findAll({where: {groupId}});
		}

		async getGroupAccount(userId: number, groupId: number, name: string): Promise<IForeignAccount> {
			if (!await app.ms.group.canEditGroup(userId, groupId)) {
				throw new Error("not_permitted");
			}
			return models.ForeignAccount.findOne({where: {groupId, name}}).then(acc => this.decryptPinAccountIfNecessary(acc));
		}

		async pinByUserAccount(userId: number, name: string, storageId: string, options = {}): Promise<any> {
			const account = await this.getUserAccount(userId, name);
			return this.pinByAnyService(storageId, account)
		}

		async pinByGroupAccount(userId: number, groupId: number, name: string, storageId: string, options = {}): Promise<any> {
			const account = await this.getGroupAccount(userId, groupId, name);
			return this.pinByAnyService(storageId, account)
		}

		async pinByAnyService(storageId: string, account: IForeignAccount, options?) {
			if (account.service === 'pinata') {
				return this.pinByPinata(storageId, account, options);
			} else {
				throw new Error("unknown_service");
			}
		}

		async pinByPinata(storageId: string, account: IForeignAccount, options?) {
			const content = await app.ms.content.getContentByStorageId(storageId);
			const hostNodes = await app.ms.storage.remoteNodeAddressList(['tcp']);
			console.log('hostNodes', hostNodes);
			return axios
				.post(account.endpoint || `https://api.pinata.cloud/pinning/pinByHash`, {
					hostNodes,
					hashToPin: storageId,
					pinataMetadata: {
						name: content ? content.name : '',
						keyvalues: options || {}
					}
				},{
					headers: { pinata_api_key: account.apiKey, pinata_secret_api_key: account.secretApiKey }
				});
		}

		async encryptPinAccountIfNecessary(ForeignAccount: IForeignAccount) {
			if (ForeignAccount.isEncrypted && ForeignAccount.secretApiKey) {
				ForeignAccount.secretApiKeyEncrypted = await app.encryptTextWithAppPass(ForeignAccount.secretApiKey);
				ForeignAccount.secretApiKey = "";
			}
			return ForeignAccount;
		}

		async decryptPinAccountIfNecessary(ForeignAccount) {
			if(!ForeignAccount) {
				return null;
			}
			if (ForeignAccount.isEncrypted && ForeignAccount.secretApiKeyEncrypted) {
				ForeignAccount.secretApiKey = await app.decryptTextWithAppPass(ForeignAccount.secretApiKeyEncrypted);
			}
			return ForeignAccount;
		}

		async flushDatabase() {
			await pIteration.forEachSeries(['ForeignAccount'], (modelName) => {
				return models[modelName].destroy({where: {}});
			});
		}

		async isAutoActionAllowed(userId, funcName, funcArgs) {
			return _.includes(['pinByUserAccount', 'pinByGroupAccount'], funcName);
		}
	}

	return new ForeignAccountsModule();
}