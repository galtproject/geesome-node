import axios from "axios";
import pIteration from 'p-iteration';
import IGeesomePinModule, {IPinAccount, IPinAccountOptions} from "./interface.js";
import {IListParams, IListParamsOptions} from "../database/interface.js";
import {IGeesomeApp} from "../../interface.js";
import helpers from "../../helpers.js";

const pinAccountListParams: IListParamsOptions = {
	sortBy: 'name',
	allowedSortBy: ['name', 'service', 'createdAt', 'updatedAt', 'id'],
	maxLimit: 100
};

function getPinAccountListOrder(sortBy, sortDir) {
	const direction = sortDir.toUpperCase();
	const order = [[sortBy, direction]];
	if (sortBy !== 'id') {
		order.push(['id', direction]);
	}
	return order;
}

export default async (app: IGeesomeApp) => {
	app.checkModules(['database', 'group', 'content', 'storage']);

	const module = getModule(app, await (await import('./models.js')).default(app.ms.database.sequelize));
	(await import('./api.js')).default(app, module);
	return module;
}

export function getModule(app: IGeesomeApp, models) {
	const autoPinAccountsByUser = new Map<number, IPinAccount[]>();

	class PinModule implements IGeesomePinModule {
		async createAccount(userId: number, account: IPinAccount): Promise<IPinAccount> {
			if (account.groupId && !(await app.ms.group.canEditGroup(userId, account.groupId))) {
				throw new Error("not_permitted");
			}
			const createdAccount = await models.PinAccount.create({
				...await this.encryptPinAccountIfNecessary(preparePinAccountForStorage(account)),
				userId
			});
			autoPinAccountsByUser.delete(userId);
			return createdAccount;
		}

		async updateAccount(userId: number, id: number, updateData: IPinAccount): Promise<IPinAccount> {
			const account = await models.PinAccount.findOne({where: {id}});
			if (!account) {
				throw new Error("pin_account_not_found");
			}
			await this.checkCanManageAccount(userId, account);
			const updatedAccount = await models.PinAccount.update(
				await this.encryptPinAccountIfNecessary(preparePinAccountForStorage(updateData)),
				{where: {id}}
			)
				.then(() => models.PinAccount.findOne({where: {id}}))
				.then(acc => this.decryptPinAccountIfNecessary(acc));
			autoPinAccountsByUser.delete(account.userId);
			return updatedAccount;
		}

		async deleteAccount(userId: number, id: number): Promise<{success: boolean}> {
			const account = await models.PinAccount.findOne({where: {id}});
			if (!account) {
				throw new Error("pin_account_not_found");
			}
			await this.checkCanManageAccount(userId, account);
			await models.PinAccount.destroy({where: {id}});
			autoPinAccountsByUser.delete(account.userId);
			return {success: true};
		}

		async checkCanManageAccount(userId: number, account: IPinAccount) {
			if (account.userId === userId) {
				return;
			}
			if (account.groupId && await app.ms.group.canEditGroup(userId, account.groupId)) {
				return;
			}
			throw new Error("not_permitted");
		}

		async getUserAccount(userId: number, name: string): Promise<IPinAccount> {
			return models.PinAccount.findOne({where: {userId, name}}).then(acc => this.decryptPinAccountIfNecessary(acc));
		}

		prepareAccountListParams(listParams?: IListParams) {
			listParams = helpers.prepareListParams(listParams, pinAccountListParams);
			app.ms.database.setDefaultListParamsValues(listParams, pinAccountListParams);
			return listParams;
		}

		async getUserAccountsList(userId: number, listParams?: IListParams): Promise<IPinAccount[]> {
			listParams = this.prepareAccountListParams(listParams);
			const {limit, offset, sortBy, sortDir} = listParams;
			return models.PinAccount.findAll({
				where: {userId},
				order: getPinAccountListOrder(sortBy, sortDir),
				limit,
				offset
			});
		}

		async getGroupAccountsList(userId: number, groupId: number, listParams?: IListParams): Promise<IPinAccount[]> {
			if (!await app.ms.group.canEditGroup(userId, groupId)) {
				throw new Error("not_permitted");
			}
			listParams = this.prepareAccountListParams(listParams);
			const {limit, offset, sortBy, sortDir} = listParams;
			return models.PinAccount.findAll({
				where: {groupId},
				order: getPinAccountListOrder(sortBy, sortDir),
				limit,
				offset
			});
		}

		async getGroupAccount(userId: number, groupId: number, name: string): Promise<IPinAccount> {
			if (!await app.ms.group.canEditGroup(userId, groupId)) {
				throw new Error("not_permitted");
			}
			return models.PinAccount.findOne({where: {groupId, name}}).then(acc => this.decryptPinAccountIfNecessary(acc));
		}

		async pinByUserAccount(userId: number, name: string, storageId: string, options = {}): Promise<any> {
			const account = await this.getUserAccount(userId, name);
			if (!account) {
				throw new Error("pin_account_not_found");
			}
			return this.pinByAnyService(storageId, account, options)
		}

		async pinByGroupAccount(userId: number, groupId: number, name: string, storageId: string, options = {}): Promise<any> {
			const account = await this.getGroupAccount(userId, groupId, name);
			if (!account) {
				throw new Error("pin_account_not_found");
			}
			return this.pinByAnyService(storageId, account, options)
		}

		async pinByAnyService(storageId: string, account: IPinAccount, options?) {
			if (!account) {
				throw new Error("pin_account_not_found");
			}
			if (account.service === 'pinata') {
				return this.pinByPinata(storageId, account, options);
			} else {
				throw new Error("unknown_service");
			}
		}

		async pinByPinata(storageId: string, account: IPinAccount, options?) {
			const content = await app.ms.content.getContentByStorageAndUserId(storageId, account.userId);
			if (!content) {
				throw new Error("content_not_found");
			}
			const hostNodes = await app.ms.storage.remoteNodeAddressList(['tcp']);
			let result;
			try {
				result = await axios.post(account.endpoint || `https://api.pinata.cloud/pinning/pinByHash`, {
					hostNodes,
					hashToPin: storageId,
					pinataMetadata: {
						name: content ? content.name : '',
						keyvalues: options || {}
					}
				},{
					headers: { pinata_api_key: account.apiKey, pinata_secret_api_key: account.secretApiKey }
				});
			} catch (error) {
				const normalizedError = new Error("pinata_pin_failed") as Error & {status?: number, details?: any};
				normalizedError.status = error?.response?.status;
				normalizedError.details = error?.response?.data || error?.message;
				throw normalizedError;
			}
			if (content.id) {
				await app.ms.database.updateContent(content.id, {isPinned: true});
				await app.ms.database.markStorageObjectPinnedByContent(content);
				await this.recordPinnedStorageObject(storageId, account, content, result);
			}
			return result?.data ?? result;
		}

		async recordPinnedStorageObject(storageId: string, account: IPinAccount, content?, result?) {
			if (!models.PinStorageObject) {
				return null;
			}
			if (!account?.id) {
				return null;
			}
			const pinStorageObjectData = getPinStorageObjectData(storageId, account, content, result);
			const [pinStorageObject, created] = await models.PinStorageObject.findOrCreate({
				where: {
					pinAccountId: account.id,
					storageId
				},
				defaults: pinStorageObjectData
			});
			if (created) {
				return pinStorageObject;
			}
			await pinStorageObject.update(getPinStorageObjectUpdateData(pinStorageObject, pinStorageObjectData));
			return pinStorageObject;
		}

		async afterContentAdding(userId, content) {
			const autoActions = app.ms['autoActions'];
			if (!autoActions || typeof autoActions.addAutoAction !== 'function') {
				return [];
			}
			const autoPinAccounts = await this.getUserAutoPinAccounts(userId);
			return pIteration.mapSeries(autoPinAccounts, (account) => {
				return autoActions.addAutoAction(userId, getAutoPinAction(account, content));
			});
		}

		async getUserAutoPinAccounts(userId) {
			if (autoPinAccountsByUser.has(userId)) {
				return autoPinAccountsByUser.get(userId);
			}
			const accounts = await this.getUserAccountsList(userId, {limit: 100});
			const autoPinAccounts = accounts
				.filter(isUserAutoPinAccount)
				.map(getAutoPinAccountPolicy);
			autoPinAccountsByUser.set(userId, autoPinAccounts);
			return autoPinAccounts;
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
			autoPinAccountsByUser.clear();
			await pIteration.forEachSeries(['PinStorageObject', 'PinAccount'], (modelName) => {
				return models[modelName].destroy({where: {}});
			});
		}

		async isAutoActionAllowed(userId, funcName, funcArgs) {
			return ['pinByUserAccount', 'pinByGroupAccount'].includes(funcName);
		}
	}

	return new PinModule();
}

function getPinStorageObjectData(storageId: string, account: IPinAccount, content, result) {
	const now = new Date();
	return {
		storageId,
		service: account.service || null,
		status: 'pinned',
		pinAccountId: account.id,
		accountName: account.name || null,
		userId: account.userId || content?.userId || null,
		groupId: account.groupId || null,
		remoteId: getRemotePinId(storageId, result),
		pinnedAt: now,
		checkedAt: now,
		resultJson: stringifyPinResult(result),
	};
}

function getPinStorageObjectUpdateData(pinStorageObject, pinStorageObjectData) {
	const existingData = typeof pinStorageObject?.toJSON === 'function'
		? pinStorageObject.toJSON()
		: pinStorageObject;
	const updateData: Record<string, any> = {};
	getPinStorageObjectMetadataFields().forEach((field) => {
		if (existingData[field] === pinStorageObjectData[field]) {
			return;
		}
		updateData[field] = pinStorageObjectData[field];
	});
	return updateData;
}

function getPinStorageObjectMetadataFields() {
	return [
		'service',
		'status',
		'accountName',
		'userId',
		'groupId',
		'remoteId',
		'pinnedAt',
		'checkedAt',
		'resultJson'
	];
}

function getRemotePinId(storageId: string, result) {
	const resultData = result?.data || {};
	return resultData.IpfsHash || resultData.ipfsHash || resultData.cid || storageId;
}

function stringifyPinResult(result) {
	try {
		return JSON.stringify(result?.data || null);
	} catch (e) {
		return JSON.stringify({error: 'pin_result_unserializable'});
	}
}

function preparePinAccountForStorage(account: IPinAccount): IPinAccount {
	if (!account || typeof account.options !== 'object') {
		return account;
	}
	return {
		...account,
		options: JSON.stringify(account.options)
	};
}

function isUserAutoPinAccount(account: IPinAccount) {
	if (account.groupId) {
		return false;
	}
	return getPinAccountOptions(account).autoPin?.enabled === true;
}

function getAutoPinAction(account: IPinAccount, content) {
	const autoPinOptions = getPinAccountOptions(account).autoPin || {};
	const attempts = getAutoPinAttempts(autoPinOptions.attempts);
	return {
		moduleName: 'pin',
		funcName: 'pinByUserAccount',
		funcArgs: JSON.stringify([
			account.name,
			content.storageId,
			{...getAutoPinMetadata(autoPinOptions.metadata), source: 'auto-pin'}
		]),
		isActive: true,
		executePeriod: 0,
		totalExecuteAttempts: attempts,
		currentExecuteAttempts: attempts,
		executeOn: new Date()
	};
}

function getAutoPinAccountPolicy(account: IPinAccount): IPinAccount {
	return {
		name: account.name,
		options: getPinAccountOptions(account)
	};
}

function getPinAccountOptions(account: IPinAccount): IPinAccountOptions {
	if (!account?.options) {
		return {};
	}
	if (typeof account.options === 'object') {
		return account.options;
	}
	try {
		const options = JSON.parse(account.options);
		return options && typeof options === 'object' ? options : {};
	} catch (e) {
		return {};
	}
}

function getAutoPinAttempts(value) {
	const attempts = Number.parseInt(value, 10);
	if (!Number.isFinite(attempts)) {
		return 3;
	}
	return Math.min(Math.max(attempts, 1), 10);
}

function getAutoPinMetadata(metadata) {
	if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
		return {};
	}
	return Object.fromEntries(Object.entries(metadata).filter(([, value]) => {
		return ['string', 'number', 'boolean'].includes(typeof value);
	}));
}
