/*
 * Copyright ©️ 2018-2021 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2021 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */
import {Sequelize, DataTypes} from 'sequelize';

export default async function (sequelize: Sequelize) {

	const PinAccount = sequelize.define('pinAccount', {
		// http://docs.sequelizejs.com/manual/tutorial/models-definition.html#data-types
		name: {
			type: DataTypes.STRING(100)
		},
		service: {
			type: DataTypes.STRING(100)
		},
		endpoint: {
			type: DataTypes.STRING(100)
		},
		userId: {
			type: DataTypes.INTEGER
		},
		groupId: {
			type: DataTypes.INTEGER
		},
		apiKey: {
			type: DataTypes.TEXT
		},
		isEncrypted: {
			type: DataTypes.BOOLEAN,
			defaultValue: false
		},
		secretApiKeyEncrypted: {
			type: DataTypes.TEXT
		},
		secretApiKey: {
			type: DataTypes.TEXT
		},
		options: {
			type: DataTypes.TEXT
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
