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

	const PinAccount = sequelize.define('pinAccount', {
		// http://docs.sequelizejs.com/manual/tutorial/models-definition.html#data-types
		name: {
			type: Sequelize.STRING(100)
		},
		service: {
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
		encryptedSecretApiKey: {
			type: Sequelize.TEXT
		},
	} as any, {
		indexes: [
			// http://docs.sequelizejs.com/manual/tutorial/models-definition.html#indexes
			{ fields: ['name', 'userId'], unique: true },
			{ fields: ['staticId'], unique: true },
			{ fields: ['userId', 'service'], unique: true, where: {isRemote: false} }
		]
	} as any);

	return {
		Account: await PinAccount.sync({})
	};
};