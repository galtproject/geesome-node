/*
 * Copyright ©️ 2018-2021 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2021 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

module.exports = async function (sequelize) {
	const Sequelize = require('sequelize');

	const Account = sequelize.define('socNetClient_telegram_account', {
		// http://docs.sequelizejs.com/manual/tutorial/models-definition.html#data-types
		userId: {
			type: Sequelize.INTEGER
		},
		userAddress: {
			type: Sequelize.STRING(200)
		},
		phoneNumber: {
			type: Sequelize.STRING(200)
		},
		apiId: {
			type: Sequelize.STRING(200)
		},
		apiHash: {
			type: Sequelize.STRING(200)
		},
		sessionKey: {
			type: Sequelize.STRING(200)
		},
	} as any, {
		indexes: [
			// http://docs.sequelizejs.com/manual/tutorial/models-definition.html#indexes
			{ fields: ['userId'], unique: true },
			{ fields: ['phoneNumber'], unique: true },
		]
	} as any);

	return {
		Account: await Account.sync({}),
	};
};
