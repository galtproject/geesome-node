/*
 * Copyright ©️ 2018-2021 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2021 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

import {safeTelegramAccount} from '../telegramClient/loginFlow.js';
import {createStatisticsReader} from './statistics.js';
import {Op} from "sequelize";
import pIteration from 'p-iteration';
import {IGeesomeApp} from "../../interface.js";
import {IListParams, IListParamsOptions} from "../database/interface.js";
import helpers from "../../helpers.js";

const socNetAccountListParams: IListParamsOptions = {
	sortBy: 'socNet',
	allowedSortBy: ['socNet', 'username', 'phoneNumber', 'accountId', 'fullName', 'createdAt', 'updatedAt', 'id'],
	maxLimit: 100
};

function getSocNetAccountListOrder(sortBy, sortDir) {
	const direction = sortDir.toUpperCase();
	const order = [[sortBy, direction]];
	if (sortBy !== 'id') {
		order.push(['id', direction]);
	}
	return order;
}

export default async (app: IGeesomeApp) => {
	const models = await (await import("./models.js")).default(app.ms.database.sequelize);
	const module = getModule(app, models);

	await (await import('./api.js')).default(app, module);

	return module;
}

export function getModule(app: IGeesomeApp, models, options: any = {}) {
	const readStatistics = options.reader || createStatisticsReader(options.fetch);
	// app.checkModules([]);

	class SocNetAccountModule {
		async listTelegramStatisticsAccounts(userId) {
			const rows = await models.Account.findAll({where: {userId, socNet: 'telegram', serverCredentialsEncrypted: null}, order: [['id', 'DESC']], limit: 100});
			return rows.filter(row => row.sessionKey && row.accountId).map(safeTelegramAccount);
		}
		async assertTelegramStatisticsAccount(userId, accountId) {
			const row = await models.Account.findOne({where: {id: accountId, userId, socNet: 'telegram'}});
			if (!row || !safeTelegramAccount(row).ready || !row.accountId) {
				throw Object.assign(new Error('social_statistics_telegram_account_required'), {statisticsStatus: 'connection_required'});
			}
			return row;
		}
		async getStatistics(userId, input) {
			if (input.network === 'telegram' && input.kind === 'post' && input.readerAccountId) {
				await this.assertTelegramStatisticsAccount(userId, input.readerAccountId);
				return app.ms.telegramClient.getPostStatistics(userId, input.readerAccountId, input.target, input.remoteId);
			}
			if (input.network === 'deviantart') {
				const account = await app.ms.socNetPublishing.loadServerAccount(userId, input.accountId, input.network, input.accountIdentity);
				return readStatistics({...input, account});
			}
			const account = await models.Account.findOne({where: {id: input.accountId, userId, socNet: input.network, accountId: input.accountIdentity}});
			if (!account?.serverCredentialsEncrypted) {
				throw new Error('social_statistics_account_unavailable');
			}
			let decoded;
			try {
				decoded = JSON.parse(await app.decryptTextWithAppPass(account.serverCredentialsEncrypted));
			} catch {
				throw new Error('social_statistics_account_unavailable');
			}
			if (decoded.network !== input.network || decoded.accountIdentity !== input.accountIdentity || !decoded.credentials) {
				throw new Error('social_statistics_account_unavailable');
			}
			return readStatistics({network: input.network, kind: input.kind, account: {accountIdentity: account.accountId, credentials: decoded.credentials}, target: input.target, remoteId: input.remoteId});
		}

		async createOrUpdateAccount(userId, accData) {
			if (Object.hasOwn(accData, 'serverCredentialsEncrypted')) {
				throw new Error('server_publishing_account_dedicated_setup_required');
			}
			const where = getSocNetAccountLookupWhere(userId, accData);
			return models.Account.sequelize.transaction(async transaction => {
				const userAcc = await models.Account.findOne({where, transaction, lock: transaction.LOCK.UPDATE});
				if (userAcc?.serverCredentialsEncrypted) {
					throw new Error('server_publishing_account_dedicated_setup_required');
				}
				return userAcc ? userAcc.update(accData, {transaction}) : models.Account.create({...accData, userId}, {transaction});
			});
		}
		async getAccount(userId, socNet, accountData) {
			return models.Account.findOne({where: {...accountData, userId, socNet}});
		}
		async getAccountByUsernameOrPhone(userId, socNet, username, phoneNumber) {
			return models.Account.findOne({where: {userId, socNet, [Op.or]: [{username}, {phoneNumber}]}});
		}

		prepareAccountListParams(listParams?: IListParams) {
			listParams = helpers.prepareListParams(listParams, socNetAccountListParams);
			app.ms.database.setDefaultListParamsValues(listParams, socNetAccountListParams);
			return listParams;
		}

		async getAccountList(userId, socNet = null, listParams?: IListParams) {
			if (socNet && typeof socNet === 'object') {
				listParams = listParams || socNet;
				socNet = socNet.socNet;
			}
			listParams = this.prepareAccountListParams(listParams);
			const {limit, offset, sortBy, sortDir} = listParams;
			let where = {userId};
			if (socNet) {
				where['socNet'] = socNet;
			}
			return models.Account.findAll({
				where,
				order: getSocNetAccountListOrder(sortBy, sortDir),
				limit,
				offset
			});
		}
		async flushDatabase() {
			await pIteration.forEachSeries(['Account'], (modelName) => {
				return models[modelName].destroy({where: {}});
			});
		}
	}

	return new SocNetAccountModule();
}

function getSocNetAccountLookupWhere(userId, accData) {
	if (accData.id) {
		return {userId, id: accData.id};
	}
	if (accData.socNet && accData.accountId) {
		return {userId, socNet: accData.socNet, accountId: accData.accountId};
	}
	if (accData.socNet && accData.username) {
		return {userId, socNet: accData.socNet, username: accData.username};
	}
	if (accData.socNet && accData.phoneNumber) {
		return {userId, socNet: accData.socNet, phoneNumber: accData.phoneNumber};
	}
	return {userId, id: null};
}
