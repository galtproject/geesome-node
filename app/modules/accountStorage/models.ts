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
	let sequelize = new Sequelize('geesome-account-storage', 'geesome', 'geesome', require('./config').options);

	const Account = sequelize.define('account', {
		// http://docs.sequelizejs.com/manual/tutorial/models-definition.html#data-types
		name: {
			type: Sequelize.STRING(100)
		},
		userId: {
			type: Sequelize.INTEGER
		},
		groupId: {
			type: Sequelize.INTEGER
		},
		staticId: {
			type: Sequelize.STRING(50)
		},
		publicKey: {
			type: Sequelize.STRING(400)
		},
		isRemote: {
			type: Sequelize.BOOLEAN,
			defaultValue: true,
		},
		encryptedPrivateKey: {
			type: Sequelize.TEXT
		},
	} as any, {
		indexes: [
			// http://docs.sequelizejs.com/manual/tutorial/models-definition.html#indexes
			{ fields: ['name', 'isRemote'], unique: true, where: {isRemote: false} },
			{ fields: ['staticId'], unique: true },
		]
	} as any);

	return {
		Account: await Account.sync({})
	};
};
