/*
 * Copyright ©️ 2018-2021 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2021 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

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

export function getModule(app: IGeesomeApp, models) {
	// app.checkModules([]);

	class SocNetAccountModule {
		async createOrUpdateAccount(userId, accData) {
			const where = getSocNetAccountLookupWhere(userId, accData);
			const userAcc = await models.Account.findOne({where});
			return userAcc ?
				userAcc.update(accData).then(() => models.Account.findOne({where})) :
				models.Account.create({ ...accData, userId });
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
