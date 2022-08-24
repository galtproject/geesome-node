/*
 * Copyright ©️ 2018-2021 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2021 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */
export {};

const Sequelize: any = require('sequelize');

module.exports = async function () {
	let sequelize = new Sequelize('geesome-soc-net-account', 'geesome', 'geesome', require('./config').options);

	const Account = sequelize.define('socNetAccount', {
		// http://docs.sequelizejs.com/manual/tutorial/models-definition.html#data-types
		userId: {
			type: Sequelize.INTEGER
		},
		socNet: {
			type: Sequelize.STRING(50)
		},
		userAddress: {
			type: Sequelize.STRING(200)
		},
		phoneNumber: {
			type: Sequelize.STRING(200)
		},
		username: {
			type: Sequelize.STRING(200)
		},
		fullName: {
			type: Sequelize.STRING(200)
		},
		apiId: {
			type: Sequelize.STRING(200)
		},
		apiKey: {
			type: Sequelize.STRING(200)
		},
		sessionKey: {
			type: Sequelize.TEXT
		},
		isEncrypted: {
			type: Sequelize.BOOLEAN
		},
	} as any, {
		indexes: [
			// http://docs.sequelizejs.com/manual/tutorial/models-definition.html#indexes
			{ fields: ['userId', 'socNet', 'phoneNumber'] },
			{ fields: ['userId', 'socNet', 'username'] },
		]
	} as any);

	return {
		Account: await Account.sync({}),
	};
};
