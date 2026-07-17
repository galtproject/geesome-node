import axios from "axios";
import pIteration from 'p-iteration';
import IGeesomePinModule, {IPinAccount, IPinAccountOptions} from "./interface.js";
import {IListParams, IListParamsOptions} from "../database/interface.js";
import {IGeesomeApp} from "../../interface.js";
import helpers from "../../helpers.js";
import {PostStatus} from "../group/interface.js";
import {Op} from "sequelize";
import debug from "debug";
import {
	getPinProviderOptionsFromEnvironment,
	IPinProviderRequestOptions,
	normalizePinProviderError,
	preparePinProviderRequest
} from "./providerRequest.js";
import {
	getBoundedPinResultJson,
	getPinStorageObjectAttemptId,
	getPinStorageObjectAttemptStatus,
	getPinStorageObjectErrorCode,
	getPinStorageObjectErrorMessage,
	PinStorageObjectStatus,
	protectedPinStorageObjectStatuses
} from './stateHelpers.js';

const log = debug('geesome:app:pin');

const pinAccountListParams: IListParamsOptions = {
	sortBy: 'name',
	allowedSortBy: ['name', 'service', 'createdAt', 'updatedAt', 'id'],
	maxLimit: 100
};
const defaultAutoPinPolicyCacheTtlMs = 30000;
const maxAutoPinPolicyCacheTtlMs = 5 * 60 * 1000;
const autoPinAccountBatchSize = 100;

type IAutoPinPolicyCacheEntry = {
	accounts: IPinAccount[];
	expiresAt: number;
};

type IPinModuleOptions = {
	autoPinPolicyCacheTtlMs?: number;
	now?: () => number;
	providerRequest?: IPinProviderRequestOptions;
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

export function getModule(app: IGeesomeApp, models, options: IPinModuleOptions = {}) {
	const autoPinAccountsByUser = new Map<number, IAutoPinPolicyCacheEntry>();
	const autoPinAccountsByGroup = new Map<number, IAutoPinPolicyCacheEntry>();
	const autoPinPolicyCacheTtlMs = getAutoPinPolicyCacheTtlMs(
		options.autoPinPolicyCacheTtlMs ?? process.env.PIN_AUTO_POLICY_CACHE_TTL_MS
	);
	const now = options.now || Date.now;
	const providerRequestOptions = {...getPinProviderOptionsFromEnvironment(), ...options.providerRequest};
	const activeProviderRequests = new Set<AbortController>();

	class PinModule implements IGeesomePinModule {
		async stop() {
			activeProviderRequests.forEach(controller => controller.abort());
			activeProviderRequests.clear();
		}

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
			const accountBeforeUpdate = getAutoPinAccountPolicy(account);
			await this.checkCanManageAccount(userId, account);
			assertPinAccountScopeUnchanged(account, updateData);
			validateAutoPinPolicy({...getPlainAccount(account), ...updateData});
			const updatedAccount = await models.PinAccount.update(
				await this.encryptPinAccountIfNecessary(preparePinAccountForStorage(updateData)),
				{where: {id}}
			)
				.then(() => models.PinAccount.findOne({where: {id}}))
				.then(acc => this.decryptPinAccountIfNecessary(acc));
			invalidateAutoPinAccountCaches(autoPinAccountsByUser, autoPinAccountsByGroup, account);
			invalidateAutoPinAccountCaches(autoPinAccountsByUser, autoPinAccountsByGroup, updatedAccount);
			if (shouldDeactivatePendingAutoPins(accountBeforeUpdate, updatedAccount)) {
				await this.deactivatePendingAutoPinActions(accountBeforeUpdate);
			}
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
			await this.deactivatePendingAutoPinActions(account);
			return {success: true};
		}

		async deactivatePendingAutoPinActions(account: IPinAccount): Promise<number> {
			const autoActions = app.ms['autoActions'];
			if (!account?.id || !account?.userId
				|| typeof autoActions?.deactivateUniqueAutoActionsByIdentityPrefix !== 'function') {
				return 0;
			}
			try {
				return await autoActions.deactivateUniqueAutoActionsByIdentityPrefix(
					account.userId,
					getAutoPinIdentityPrefix(account.id)
				);
			} catch (error) {
				helpers.logDebug(log, () => ['deactivatePendingAutoPinActions', {
					accountId: account.id,
					error: error?.message || String(error)
				}]);
				return 0;
			}
		}

		async checkCanManageAccount(userId: number, account: IPinAccount) {
			if (account.groupId) {
				if (await app.ms.group.canEditGroup(userId, account.groupId)) {
					return;
				}
				throw new Error("not_permitted");
			}
			if (Number(account.userId) === Number(userId)) {
				return;
			}
			throw new Error("not_permitted");
		}

		async getUserAccount(userId: number, name: string): Promise<IPinAccount> {
			return models.PinAccount.findOne({
				where: {userId, groupId: null, name}
			}).then(acc => this.decryptPinAccountIfNecessary(acc));
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
				where: {userId, groupId: null},
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
				if (isAutomaticPinOptions(options)) {
					return getAutomaticPinSkip('account_missing');
				}
				throw new Error("pin_account_not_found");
			}
			const automaticPreflight = await this.prepareAutomaticPinExecution(userId, account, storageId, options);
			if (automaticPreflight?.result) {
				return automaticPreflight.result;
			}
			return this.pinByAnyService(storageId, account, options, automaticPreflight?.content);
		}

		async pinByGroupAccount(userId: number, groupId: number, name: string, storageId: string, options: any = {}): Promise<any> {
			const account = isAutomaticPinOptions(options)
				? await models.PinAccount.findOne({where: {groupId, name}})
					.then(pinAccount => this.decryptPinAccountIfNecessary(pinAccount))
				: await this.getGroupAccount(userId, groupId, name);
			if (!account) {
				if (isAutomaticPinOptions(options)) {
					return getAutomaticPinSkip('account_missing');
				}
				throw new Error("pin_account_not_found");
			}
			const automaticPreflight = await this.prepareAutomaticPinExecution(userId, account, storageId, options);
			if (automaticPreflight?.result) {
				return automaticPreflight.result;
			}
			const content = options?.postId
				? automaticPreflight?.content || await this.resolveGroupPostPinTarget(groupId, options.postId, storageId)
				: automaticPreflight?.content || null;
			return this.pinByAnyService(storageId, account, options, content);
		}

		async pinByAccountId(userId: number, accountId: number, storageId: string, options: any = {}): Promise<any> {
			const account = await models.PinAccount.findOne({where: {id: accountId}})
				.then(pinAccount => this.decryptPinAccountIfNecessary(pinAccount));
			if (!account) {
				if (isAutomaticPinOptions(options)) {
					return getAutomaticPinSkip('account_missing');
				}
				throw new Error("pin_account_not_found");
			}
			const automaticPreflight = await this.prepareAutomaticPinExecution(userId, account, storageId, options);
			if (automaticPreflight?.result) {
				return automaticPreflight.result;
			}
			if (automaticPreflight) {
				return this.pinByAnyService(storageId, account, options, automaticPreflight.content);
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

		async prepareAutomaticPinExecution(userId, account: IPinAccount, storageId: string, options) {
			const automaticPinKind = getAutomaticPinKind(options);
			if (!automaticPinKind) {
				return null;
			}
			const policySkipReason = getAutomaticPinPolicySkipReason(userId, account, options);
			if (policySkipReason) {
				return {result: getAutomaticPinSkip(policySkipReason)};
			}
			if (automaticPinKind === 'user') {
				const content = await app.ms.content.getContentByStorageAndUserId(storageId, account.userId);
				return content
					? {content}
					: {result: getAutomaticPinSkip('content_missing')};
			}
			try {
				return {
					content: await this.resolveGroupPostPinTarget(account.groupId, options.postId, storageId)
				};
			} catch (error) {
				if (isObsoleteAutomaticPinTargetError(error)) {
					return {result: getAutomaticPinSkip(error.message)};
				}
				throw error;
			}
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
			const attempt = await this.beginPinStorageObjectAttempt(storageId, account, content);
			let result;
			const abortController = new AbortController();
			activeProviderRequests.add(abortController);
			let providerRequest;
			try {
				const hostNodes = await app.ms.storage.remoteNodeAddressList(['tcp']);
				providerRequest = await preparePinProviderRequest(
					account.endpoint,
					abortController.signal,
					providerRequestOptions
				);
				result = await axios.post(providerRequest.endpoint, {
					hostNodes,
					hashToPin: storageId,
					pinataMetadata: {
						name: content ? content.name : '',
						keyvalues: options || {}
					}
				},{
					...providerRequest.config,
					headers: { pinata_api_key: account.apiKey, pinata_secret_api_key: account.secretApiKey }
				});
			} catch (error) {
				const normalizedError = normalizePinProviderError(error, [account.apiKey, account.secretApiKey]);
				await this.finishPinStorageObjectAttempt(attempt, getPinStorageObjectAttemptStatus(normalizedError), {
					error: normalizedError
				});
				throw normalizedError;
			} finally {
				activeProviderRequests.delete(abortController);
				providerRequest?.dispose();
			}
			await this.finishPinStorageObjectAttempt(attempt, PinStorageObjectStatus.Accepted, {storageId, result});
			return result?.data ?? result;
		}

		async recordPinnedStorageObject(storageId: string, account: IPinAccount, content?, result?) {
			const attempt = await this.beginPinStorageObjectAttempt(storageId, account, content);
			return this.finishPinStorageObjectAttempt(attempt, PinStorageObjectStatus.Accepted, {storageId, result});
		}

		async beginPinStorageObjectAttempt(storageId: string, account: IPinAccount, content?) {
			if (!models.PinStorageObject) {
				return null;
			}
			if (!account?.id) {
				return null;
			}
			const attemptId = getPinStorageObjectAttemptId();
			const pinStorageObjectData = getPinStorageObjectAttemptData(storageId, account, content, attemptId);
			const [pinStorageObject, created] = await models.PinStorageObject.findOrCreate({
				where: {
					pinAccountId: account.id,
					storageId
				},
				defaults: pinStorageObjectData
			});
			if (!created) {
				await pinStorageObject.increment('attemptCount');
				await pinStorageObject.update(getPinStorageObjectAttemptUpdateData(pinStorageObjectData));
			}
			return {id: pinStorageObject.id, attemptId};
		}

		async finishPinStorageObjectAttempt(attempt, status: PinStorageObjectStatus, details: any = {}) {
			if (!attempt || !models.PinStorageObject) {
				return null;
			}
			await models.PinStorageObject.update(
				getPinStorageObjectCompletionData(status, details),
				{where: {id: attempt.id, attemptId: attempt.attemptId}}
			);
			return models.PinStorageObject.findOne({where: {id: attempt.id}});
		}

		async updatePinStorageObjectStatus(pinAccountId: number, storageId: string, status: PinStorageObjectStatus, details: any = {}) {
			if (!Object.values(PinStorageObjectStatus).includes(status)) {
				throw new Error('pin_storage_object_status_invalid');
			}
			const pinStorageObject = await models.PinStorageObject?.findOne({where: {pinAccountId, storageId}});
			if (!pinStorageObject) {
				throw new Error('pin_storage_object_not_found');
			}
			await pinStorageObject.update(getPinStorageObjectStatusData(status, details));
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
					storageId: {[Op.in]: storageIds},
					status: {[Op.in]: protectedPinStorageObjectStatuses}
				}
			});
			return new Set(rows.map(row => getPinStorageObjectKey(row.pinAccountId, row.storageId)));
		}

		async getUserAutoPinAccounts(userId) {
			const cachedAccounts = getCachedAutoPinAccounts(autoPinAccountsByUser, userId, now());
			if (cachedAccounts) {
				return cachedAccounts;
			}
			const autoPinAccounts = await getAutoPinAccountsInBatches(
				models.PinAccount,
				{userId, groupId: null},
				isUserAutoPinAccount
			);
			cacheAutoPinAccounts(autoPinAccountsByUser, userId, autoPinAccounts, now(), autoPinPolicyCacheTtlMs);
			return autoPinAccounts;
		}

		async getGroupAutoPinAccounts(groupId) {
			const cachedAccounts = getCachedAutoPinAccounts(autoPinAccountsByGroup, groupId, now());
			if (cachedAccounts) {
				return cachedAccounts;
			}
			const autoPinAccounts = await getAutoPinAccountsInBatches(
				models.PinAccount,
				{groupId},
				isGroupAutoPinAccount
			);
			cacheAutoPinAccounts(autoPinAccountsByGroup, groupId, autoPinAccounts, now(), autoPinPolicyCacheTtlMs);
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

function getPinStorageObjectAttemptData(storageId: string, account: IPinAccount, content, attemptId: string) {
	const now = new Date();
	return {
		storageId,
		service: account.service || null,
		status: PinStorageObjectStatus.Requested,
		pinAccountId: account.id,
		accountName: account.name || null,
		userId: account.userId || content?.userId || null,
		groupId: account.groupId || null,
		attemptId,
		attemptCount: 1,
		requestedAt: now,
		lastAttemptAt: now,
		checkedAt: now,
		lastErrorCode: null,
		lastErrorMessage: null,
		resultJson: null
	};
}

function getPinStorageObjectKey(accountId, storageId) {
	return `${accountId}:${storageId}`;
}

function getPinStorageObjectAttemptUpdateData(data) {
	const updateData = {...data};
	delete updateData.storageId;
	delete updateData.pinAccountId;
	delete updateData.attemptCount;
	return updateData;
}

function getPinStorageObjectCompletionData(status: PinStorageObjectStatus, details) {
	return getPinStorageObjectStatusData(status, details);
}

function getPinStorageObjectStatusData(status: PinStorageObjectStatus, details) {
	const now = new Date();
	const data: any = {
		status,
		checkedAt: now
	};
	if (Object.prototype.hasOwnProperty.call(details, 'result')) {
		data.resultJson = getBoundedPinResultJson(details.result?.data ?? details.result);
	}
	if (status === PinStorageObjectStatus.Accepted) {
		data.acceptedAt = now;
		data.nextCheckAt = now;
		data.remoteId = getRemotePinId(details.storageId, details.result);
		data.lastErrorCode = null;
		data.lastErrorMessage = null;
	}
	if (status === PinStorageObjectStatus.Confirmed) {
		data.confirmedAt = now;
		data.pinnedAt = now;
		data.nextCheckAt = details.nextCheckAt || null;
		data.lastErrorCode = null;
		data.lastErrorMessage = null;
	}
	if ([PinStorageObjectStatus.RetryableFailure, PinStorageObjectStatus.TerminalFailure].includes(status)) {
		data.failedAt = now;
		data.lastErrorCode = getPinStorageObjectErrorCode(details.error);
		data.lastErrorMessage = getPinStorageObjectErrorMessage(details.error);
		data.resultJson = getBoundedPinResultJson({
			status: details.error?.status || null,
			details: data.lastErrorMessage
		});
		data.nextCheckAt = status === PinStorageObjectStatus.RetryableFailure
			? details.nextCheckAt || now
			: null;
	}
	if (status === PinStorageObjectStatus.Missing) {
		data.nextCheckAt = null;
		data.lastErrorCode = null;
		data.lastErrorMessage = null;
	}
	return data;
}

function getRemotePinId(storageId: string | undefined, result) {
	const resultData = result?.data || {};
	return resultData.IpfsHash || resultData.ipfsHash || resultData.cid || storageId || null;
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

function assertPinAccountScopeUnchanged(account: IPinAccount, updateData: IPinAccount) {
	if (!Object.prototype.hasOwnProperty.call(updateData, 'groupId')) {
		return;
	}
	if (Number(account.groupId || 0) === Number(updateData.groupId || 0)) {
		return;
	}
	throw new Error('pin_account_scope_immutable');
}

async function getAutoPinAccountsInBatches(pinAccountModel, scopeWhere, isEligible) {
	const accounts = [];
	await collectNamedAutoPinAccounts(pinAccountModel, scopeWhere, isEligible, accounts);
	await collectUnnamedAutoPinAccounts(pinAccountModel, scopeWhere, isEligible, accounts);
	return accounts;
}

async function collectNamedAutoPinAccounts(pinAccountModel, scopeWhere, isEligible, accounts) {
	let cursor = null;
	while (true) {
		const where: any = {
			...scopeWhere,
			name: {[Op.ne]: null}
		};
		if (cursor) {
			where[Op.or] = [
				{name: {[Op.gt]: cursor.name}},
				{name: cursor.name, id: {[Op.gt]: cursor.id}}
			];
		}
		const batch = await pinAccountModel.findAll({
			where,
			order: getPinAccountListOrder('name', 'ASC'),
			limit: autoPinAccountBatchSize
		});
		appendEligibleAutoPinAccounts(accounts, batch, isEligible);
		if (batch.length < autoPinAccountBatchSize) {
			return;
		}
		cursor = getPinAccountCursor(batch[batch.length - 1]);
	}
}

async function collectUnnamedAutoPinAccounts(pinAccountModel, scopeWhere, isEligible, accounts) {
	let cursorId = 0;
	while (true) {
		const batch = await pinAccountModel.findAll({
			where: {
				...scopeWhere,
				name: null,
				id: {[Op.gt]: cursorId}
			},
			order: [['id', 'ASC']],
			limit: autoPinAccountBatchSize
		});
		appendEligibleAutoPinAccounts(accounts, batch, isEligible);
		if (batch.length < autoPinAccountBatchSize) {
			return;
		}
		cursorId = Number(batch[batch.length - 1].id);
	}
}

function appendEligibleAutoPinAccounts(accounts, batch, isEligible) {
	batch.filter(isEligible).forEach((account) => {
		accounts.push(getAutoPinAccountPolicy(account));
	});
}

function getPinAccountCursor(account) {
	return {
		name: account.name,
		id: Number(account.id)
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
	const identityKey = `${getAutoPinIdentityPrefix(account.id)}${storageId}`;
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

function shouldDeactivatePendingAutoPins(previousAccount: IPinAccount, updatedAccount: IPinAccount): boolean {
	const previous = getPlainAccount(previousAccount);
	const updated = getPlainAccount(updatedAccount);
	const previousAutoPin = getPinAccountOptions(previous).autoPin;
	if (previousAutoPin?.enabled !== true) {
		return false;
	}
	const updatedAutoPin = getPinAccountOptions(updated).autoPin;
	if (updatedAutoPin?.enabled !== true) {
		return true;
	}
	return Number(previous.userId) !== Number(updated.userId)
		|| Number(previous.groupId || 0) !== Number(updated.groupId || 0)
		|| previousAutoPin.scope !== updatedAutoPin.scope;
}

function getAutoPinIdentityPrefix(accountId): string {
	return `pin:pin:${accountId}:`;
}

function isAutomaticPinOptions(options): boolean {
	return getAutomaticPinKind(options) !== null;
}

function getAutomaticPinKind(options): 'user' | 'group' | null {
	if (options?.source === 'auto-pin') {
		return 'user';
	}
	if (options?.source === 'group-post-auto-pin') {
		return 'group';
	}
	return null;
}

function getAutomaticPinPolicySkipReason(userId, account: IPinAccount, options): string | null {
	const automaticPinKind = getAutomaticPinKind(options);
	const autoPin = getPinAccountOptions(account).autoPin;
	if (autoPin?.enabled !== true) {
		return 'policy_disabled';
	}
	if (automaticPinKind === 'user') {
		if (account.groupId || Number(account.userId) !== Number(userId) || autoPin.scope === 'group-post') {
			return 'account_scope_changed';
		}
		return null;
	}
	if (!account.groupId || autoPin.scope !== 'group-post') {
		return 'account_scope_changed';
	}
	if (!getGroupAutoPinTargetNames(autoPin.targets).includes(options?.target)) {
		return 'target_removed';
	}
	return null;
}

function getAutomaticPinSkip(reason: string) {
	return {
		skipped: true,
		reason: `auto_pin_${reason}`
	};
}

function isObsoleteAutomaticPinTargetError(error): boolean {
	return ['group_post_pin_not_permitted', 'content_not_found'].includes(error?.message);
}

function invalidateAutoPinAccountCaches(userCache, groupCache, account: IPinAccount) {
	if (account?.userId) {
		userCache.delete(account.userId);
	}
	if (account?.groupId) {
		groupCache.delete(account.groupId);
	}
}

function getAutoPinPolicyCacheTtlMs(value): number {
	const ttlMs = Number.parseInt(value, 10);
	if (!Number.isFinite(ttlMs) || ttlMs < 0) {
		return defaultAutoPinPolicyCacheTtlMs;
	}
	return Math.min(ttlMs, maxAutoPinPolicyCacheTtlMs);
}

function getCachedAutoPinAccounts(cache, key: number, now: number): IPinAccount[] | null {
	const entry = cache.get(key);
	if (!entry) {
		return null;
	}
	if (entry.expiresAt <= now) {
		cache.delete(key);
		return null;
	}
	return entry.accounts;
}

function cacheAutoPinAccounts(cache, key: number, accounts: IPinAccount[], now: number, ttlMs: number) {
	cache.set(key, {
		accounts,
		expiresAt: now + ttlMs
	});
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
