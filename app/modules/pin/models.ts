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
	let sequelize = new Sequelize('geesome-pin', 'geesome', 'geesome', require('./config').options);

	const PinAccount = sequelize.define('pinAccount', {
		// http://docs.sequelizejs.com/manual/tutorial/models-definition.html#data-types
		name: {
			type: Sequelize.STRING(100)
		},
		service: {
			type: Sequelize.STRING(100)
		},
		endpoint: {
			type: Sequelize.STRING(100)
		},
		userId: {
			type: Sequelize.INTEGER
		},
		groupId: {
			type: Sequelize.INTEGER
		},
		apiKey: {
			type: Sequelize.TEXT
		},
		isEncrypted: {
			type: Sequelize.BOOLEAN,
			defaultValue: false
		},
		secretApiKeyEncrypted: {
			type: Sequelize.TEXT
		},
		secretApiKey: {
			type: Sequelize.TEXT
		},
		options: {
			type: Sequelize.TEXT
		},
	} as any, {
		indexes: [
			// http://docs.sequelizejs.com/manual/tutorial/models-definition.html#indexes
			{ fields: ['name', 'userId', 'groupId'], unique: true },
			{ fields: ['service', 'userId'] },
			{ fields: ['service', 'groupId'] },
		]
	} as any);

	return {
		PinAccount: await PinAccount.sync({})
	};
};
