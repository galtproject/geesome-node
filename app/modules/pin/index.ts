import {IGeesomeApp} from "../../interface";
import IGeesomePinModule, {IPinAccount} from "./interface";
import pIteration from 'p-iteration';
import axios from "axios";

export default async (app: IGeesomeApp) => {
	app.checkModules(['group', 'content', 'storage']);

	const module = getModule(app, await (await import('./models')).default(app.ms.database.sequelize));
	(await import('./api')).default(app, module);
	return module;
}

function getModule(app: IGeesomeApp, models) {
	class PinModule implements IGeesomePinModule {
		async createAccount(userId: number, account: IPinAccount): Promise<IPinAccount> {
			return models.PinAccount.create({
				...await this.encryptPinAccountIfNecessary(account),
				userId
			})
		}

		async updateAccount(userId: number, id: number, updateData: IPinAccount): Promise<IPinAccount> {
			const account = await models.PinAccount.findOne({where: {id}});
			if (account.userId !== userId && !(await app.ms.group.canEditGroup(userId, account.groupId))) {
				throw new Error("not_permitted");
			}
			return models.PinAccount.update(updateData, {where: {id}})
				.then(() => models.PinAccount.findOne({where: {id}}))
				.then(acc => this.decryptPinAccountIfNecessary(acc));
		}

		async getUserAccount(userId: number, name: string): Promise<IPinAccount> {
			return models.PinAccount.findOne({where: {userId, name}}).then(acc => this.decryptPinAccountIfNecessary(acc));
		}

		async getUserAccountsList(userId: number): Promise<IPinAccount[]> {
			return models.PinAccount.findAll({where: {userId}});
		}

		async getGroupAccountsList(userId: number, groupId: number): Promise<IPinAccount[]> {
			if (!await app.ms.group.canEditGroup(userId, groupId)) {
				throw new Error("not_permitted");
			}
			return models.PinAccount.findAll({where: {groupId}});
		}

		async getGroupAccount(userId: number, groupId: number, name: string): Promise<IPinAccount> {
			if (!await app.ms.group.canEditGroup(userId, groupId)) {
				throw new Error("not_permitted");
			}
			return models.PinAccount.findOne({where: {groupId, name}}).then(acc => this.decryptPinAccountIfNecessary(acc));
		}

		async pinByUserAccount(userId: number, name: string, storageId: string, options = {}): Promise<any> {
			const account = await this.getUserAccount(userId, name);
			return this.pinByAnyService(storageId, account)
		}

		async pinByGroupAccount(userId: number, groupId: number, name: string, storageId: string, options = {}): Promise<any> {
			const account = await this.getGroupAccount(userId, groupId, name);
			return this.pinByAnyService(storageId, account)
		}

		async pinByAnyService(storageId: string, account: IPinAccount, options?) {
			if (account.service === 'pinata') {
				return this.pinByPinata(storageId, account, options);
			} else {
				throw new Error("unknown_service");
			}
		}

		async pinByPinata(storageId: string, account: IPinAccount, options?) {
			const content = await app.ms.content.getContentByStorageAndUserId(storageId, account.userId);
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

		async encryptPinAccountIfNecessary(pinAccount: IPinAccount) {
			if (pinAccount.isEncrypted && pinAccount.secretApiKey) {
				pinAccount.secretApiKeyEncrypted = await app.encryptTextWithAppPass(pinAccount.secretApiKey);
				pinAccount.secretApiKey = "";
			}
			return pinAccount;
		}

		async decryptPinAccountIfNecessary(pinAccount) {
			if(!pinAccount) {
				return null;
			}
			if (pinAccount.isEncrypted && pinAccount.secretApiKeyEncrypted) {
				pinAccount.secretApiKey = await app.decryptTextWithAppPass(pinAccount.secretApiKeyEncrypted);
			}
			return pinAccount;
		}

		async flushDatabase() {
			await pIteration.forEachSeries(['PinAccount'], (modelName) => {
				return models[modelName].destroy({where: {}});
			});
		}

		async isAutoActionAllowed(userId, funcName, funcArgs) {
			return ['pinByUserAccount', 'pinByGroupAccount'].includes(funcName);
		}
	}

	return new PinModule();
}