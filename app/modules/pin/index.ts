import axios from "axios";
import pIteration from 'p-iteration';
import IGeesomePinModule, {IPinAccount, IPinAccountOptions} from "./interface.js";
import {IListParams, IListParamsOptions} from "../database/interface.js";
import {IGeesomeApp} from "../../interface.js";
import helpers from "../../helpers.js";
import {PostStatus} from "../group/interface.js";
import {Op} from "sequelize";

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
	const autoPinAccountsByGroup = new Map<number, IPinAccount[]>();

	class PinModule implements IGeesomePinModule {
		async createAccount(userId: number, account: IPinAccount): Promise<IPinAccount> {
			if (account.groupId && !(await app.ms.group.canEditGroup(userId, account.groupId))) {
				throw new Error("not_permitted");
			}
			validateAutoPinPolicy(account);
			const createdAccount = await models.PinAccount.create({
				...await this.encryptPinAccountIfNecessary(preparePinAccountForStorage(account)),
				userId
			});
			invalidateAutoPinAccountCaches(autoPinAccountsByUser, autoPinAccountsByGroup, createdAccount);
			return createdAccount;
		}

		async updateAccount(userId: number, id: number, updateData: IPinAccount): Promise<IPinAccount> {
			const account = await models.PinAccount.findOne({where: {id}});
			if (!account) {
				throw new Error("pin_account_not_found");
			}
			await this.checkCanManageAccount(userId, account);
			if (updateData.groupId && Number(updateData.groupId) !== Number(account.groupId)
				&& !(await app.ms.group.canEditGroup(userId, updateData.groupId))) {
				throw new Error("not_permitted");
			}
			validateAutoPinPolicy({...getPlainAccount(account), ...updateData});
			const updatedAccount = await models.PinAccount.update(
				await this.encryptPinAccountIfNecessary(preparePinAccountForStorage(updateData)),
				{where: {id}}
			)
				.then(() => models.PinAccount.findOne({where: {id}}))
				.then(acc => this.decryptPinAccountIfNecessary(acc));
			invalidateAutoPinAccountCaches(autoPinAccountsByUser, autoPinAccountsByGroup, account);
			invalidateAutoPinAccountCaches(autoPinAccountsByUser, autoPinAccountsByGroup, updatedAccount);
			return updatedAccount;
		}

		async deleteAccount(userId: number, id: number): Promise<{success: boolean}> {
			const account = await models.PinAccount.findOne({where: {id}});
			if (!account) {
				throw new Error("pin_account_not_found");
			}
			await this.checkCanManageAccount(userId, account);
			await models.PinAccount.destroy({where: {id}});
			invalidateAutoPinAccountCaches(autoPinAccountsByUser, autoPinAccountsByGroup, account);
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

		async pinByGroupAccount(userId: number, groupId: number, name: string, storageId: string, options: any = {}): Promise<any> {
			const account = await this.getGroupAccount(userId, groupId, name);
			if (!account) {
				throw new Error("pin_account_not_found");
			}
			const content = options?.postId
				? await this.resolveGroupPostPinTarget(groupId, options.postId, storageId)
				: null;
			return this.pinByAnyService(storageId, account, options, content)
		}

		async pinByAccountId(userId: number, accountId: number, storageId: string, options: any = {}): Promise<any> {
			const account = await models.PinAccount.findOne({where: {id: accountId}})
				.then(pinAccount => this.decryptPinAccountIfNecessary(pinAccount));
			if (!account) {
				throw new Error("pin_account_not_found");
			}
			let content = null;
			if (account.groupId) {
				if (!await app.ms.group.canEditGroup(userId, account.groupId)) {
					throw new Error("not_permitted");
				}
				content = options?.postId
					? await this.resolveGroupPostPinTarget(account.groupId, options.postId, storageId)
					: null;
			} else if (Number(account.userId) !== Number(userId)) {
				throw new Error("not_permitted");
			}
			return this.pinByAnyService(storageId, account, options, content);
		}

		async pinByAnyService(storageId: string, account: IPinAccount, options?, content?) {
			if (!account) {
				throw new Error("pin_account_not_found");
			}
			if (account.service === 'pinata') {
				return this.pinByPinata(storageId, account, options, content);
			} else {
				throw new Error("unknown_service");
			}
		}

		async pinByPinata(storageId: string, account: IPinAccount, options?, resolvedContent?) {
			const content = resolvedContent || await app.ms.content.getContentByStorageAndUserId(storageId, account.userId);
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
			const targetsByAccount = autoPinAccounts.map(account => ({
				account,
				targets: [{storageId: content.storageId}]
			}));
			const pinnedStorageObjectKeys = await this.getPinnedStorageObjectKeys(targetsByAccount);
			return pIteration.mapSeries(autoPinAccounts, (account) => {
				if (pinnedStorageObjectKeys.has(getPinStorageObjectKey(account.id, content.storageId))) {
					return null;
				}
				return queueAutoPinAction(autoActions, account, content.storageId, getAutoPinAction(account, content));
			});
		}

		async afterPostManifestUpdate(_userId, postId) {
			const autoActions = app.ms['autoActions'];
			if (!autoActions || typeof autoActions.addAutoAction !== 'function') {
				return [];
			}
			const post = await app.ms.group.getPostPure(postId);
			if (!isEligibleGroupAutoPinPost(post)) {
				return [];
			}
			const accounts = await this.getGroupAutoPinAccounts(post.groupId);
			const targetsByAccount = accounts.map(account => ({
				account,
				targets: getGroupAutoPinTargets(account, post)
			}));
			const pinnedStorageObjectKeys = await this.getPinnedStorageObjectKeys(targetsByAccount);
			const actions = [];
			await pIteration.forEachSeries(targetsByAccount, async ({account, targets}) => {
				await pIteration.forEachSeries(targets, async (target) => {
					if (pinnedStorageObjectKeys.has(getPinStorageObjectKey(account.id, target.storageId))) {
						return;
					}
					actions.push(await queueAutoPinAction(
						autoActions,
						account,
						target.storageId,
						getGroupAutoPinAction(account, post, target)
					));
				});
			});
			return actions;
		}

		async resolveGroupPostPinTarget(groupId, postId, storageId) {
			const post = await app.ms.group.getPostPure(postId);
			if (!isEligibleGroupAutoPinPost(post) || Number(post.groupId) !== Number(groupId)) {
				throw new Error("group_post_pin_not_permitted");
			}
			if (post.manifestStorageId === storageId) {
				return {storageId, name: `post-${post.id}-manifest`};
			}
			const content = (post.contents || []).find(item => item.storageId === storageId);
			if (!content) {
				throw new Error("content_not_found");
			}
			return content;
		}

		async getPinnedStorageObjectKeys(targetsByAccount) {
			if (!models.PinStorageObject) {
				return new Set();
			}
			const accountIds = helpers.normalizeUniqueIds(targetsByAccount.map(item => item.account.id));
			const storageIds = Array.from(new Set(targetsByAccount.flatMap(item => {
				return item.targets.map(target => target.storageId).filter(storageId => !!storageId);
			})));
			if (!accountIds.length || !storageIds.length) {
				return new Set();
			}
			const rows = await models.PinStorageObject.findAll({
				attributes: ['pinAccountId', 'storageId'],
				where: {
					pinAccountId: {[Op.in]: accountIds},
					storageId: {[Op.in]: storageIds}
				}
			});
			return new Set(rows.map(row => getPinStorageObjectKey(row.pinAccountId, row.storageId)));
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

		async getGroupAutoPinAccounts(groupId) {
			if (autoPinAccountsByGroup.has(groupId)) {
				return autoPinAccountsByGroup.get(groupId);
			}
			const accounts = await models.PinAccount.findAll({
				where: {groupId},
				order: getPinAccountListOrder('name', 'ASC'),
				limit: 100
			});
			const autoPinAccounts = accounts
				.filter(isGroupAutoPinAccount)
				.map(getAutoPinAccountPolicy);
			autoPinAccountsByGroup.set(groupId, autoPinAccounts);
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
			autoPinAccountsByGroup.clear();
			await pIteration.forEachSeries(['PinStorageObject', 'PinAccount'], (modelName) => {
				return models[modelName].destroy({where: {}});
			});
		}

		async isAutoActionAllowed(userId, funcName, funcArgs) {
			return ['pinByUserAccount', 'pinByGroupAccount', 'pinByAccountId'].includes(funcName);
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

function getPinStorageObjectKey(accountId, storageId) {
	return `${accountId}:${storageId}`;
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

function isGroupAutoPinAccount(account: IPinAccount) {
	if (!account.groupId) {
		return false;
	}
	const autoPin = getPinAccountOptions(account).autoPin;
	return autoPin?.enabled === true
		&& autoPin.scope === 'group-post'
		&& getGroupAutoPinTargetNames(autoPin.targets).length > 0;
}

function getAutoPinAction(account: IPinAccount, content) {
	const autoPinOptions = getPinAccountOptions(account).autoPin || {};
	const attempts = getAutoPinAttempts(autoPinOptions.attempts);
	return {
		moduleName: 'pin',
		funcName: 'pinByAccountId',
		funcArgs: JSON.stringify([
			account.id,
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

function getGroupAutoPinAction(account: IPinAccount, post, target) {
	const autoPinOptions = getPinAccountOptions(account).autoPin || {};
	const attempts = getAutoPinAttempts(autoPinOptions.attempts);
	return {
		moduleName: 'pin',
		funcName: 'pinByAccountId',
		funcArgs: JSON.stringify([
			account.id,
			target.storageId,
			{
				...getAutoPinMetadata(autoPinOptions.metadata),
				source: 'group-post-auto-pin',
				postId: post.id,
				target: target.name
			}
		]),
		isActive: true,
		executePeriod: 0,
		totalExecuteAttempts: attempts,
		currentExecuteAttempts: attempts,
		executeOn: new Date()
	};
}

function queueAutoPinAction(autoActions, account: IPinAccount, storageId: string, action) {
	const identityKey = `pin:pin:${account.id}:${storageId}`;
	if (typeof autoActions.addUniqueAutoAction === 'function') {
		return autoActions.addUniqueAutoAction(account.userId, identityKey, action);
	}
	return autoActions.addAutoAction(account.userId, action);
}

function getAutoPinAccountPolicy(account: IPinAccount): IPinAccount {
	return {
		id: account.id,
		name: account.name,
		userId: account.userId,
		groupId: account.groupId,
		options: getPinAccountOptions(account)
	};
}

function getGroupAutoPinTargets(account: IPinAccount, post) {
	const targetNames = getGroupAutoPinTargetNames(getPinAccountOptions(account).autoPin?.targets);
	const targets = [];
	if (targetNames.includes('post-manifest') && post.manifestStorageId) {
		targets.push({name: 'post-manifest', storageId: post.manifestStorageId});
	}
	if (targetNames.includes('contents')) {
		(post.contents || []).forEach((content) => {
			if (content.storageId) {
				targets.push({name: 'contents', storageId: content.storageId});
			}
		});
	}
	return Array.from(new Map(targets.map(target => [target.storageId, target])).values());
}

function getGroupAutoPinTargetNames(targets) {
	if (!Array.isArray(targets)) {
		return [];
	}
	return Array.from(new Set(targets.filter(target => {
		return ['post-manifest', 'contents'].includes(target);
	})));
}

function isEligibleGroupAutoPinPost(post) {
	return !!post
		&& post.status === PostStatus.Published
		&& post.isDeleted !== true
		&& post.isRemote !== true
		&& post.group?.isPublic === true
		&& post.group?.isRemote !== true
		&& post.group?.isEncrypted !== true;
}

function validateAutoPinPolicy(account: IPinAccount) {
	const autoPin = getPinAccountOptions(account).autoPin;
	if (!autoPin?.enabled) {
		return;
	}
	if (account.groupId) {
		if (autoPin.scope !== 'group-post' || !getGroupAutoPinTargetNames(autoPin.targets).length) {
			throw new Error('group_auto_pin_policy_invalid');
		}
		return;
	}
	if (autoPin.scope === 'group-post') {
		throw new Error('user_auto_pin_policy_invalid');
	}
}

function invalidateAutoPinAccountCaches(userCache, groupCache, account: IPinAccount) {
	if (account?.userId) {
		userCache.delete(account.userId);
	}
	if (account?.groupId) {
		groupCache.delete(account.groupId);
	}
}

function getPlainAccount(account) {
	return typeof account?.toJSON === 'function' ? account.toJSON() : account;
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
