/*
 * Copyright ©️ 2018-2021 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2021 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

import {IGeesomeApp} from "../../interface";
const pIteration = require('p-iteration');
const Op = require("sequelize").Op;

module.exports = async (app: IGeesomeApp) => {
	const models = await require("./models")();
	const module = getModule(app, models);

	require('./api')(app, module, models);

	return module;
}

function getModule(app: IGeesomeApp, models) {
	// app.checkModules([]);

	class SocNetAccountModule {
		async createOrUpdateAccount(userId, accData) {
			let where = {userId};
			if (accData.id) {
				where['id'] = accData.id;
			}
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
		async getAccountList(userId, socNet = null) {
			let where = {userId};
			if (socNet) {
				where['socNet'] = socNet;
			}
			return models.Account.findAll({ where });
		}
		async flushDatabase() {
			await pIteration.forEachSeries(['Account'], (modelName) => {
				return models[modelName].destroy({where: {}});
			});
		}
	}

	return new SocNetAccountModule();
}
