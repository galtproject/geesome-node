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

	const Account = sequelize.define('socNetAccount', {
		// http://docs.sequelizejs.com/manual/tutorial/models-definition.html#data-types
		userId: {
			type: DataTypes.INTEGER
		},
		socNet: {
			type: DataTypes.STRING(50)
		},
		accountId: {
			type: DataTypes.STRING(200)
		},
		phoneNumber: {
			type: DataTypes.STRING(200)
		},
		username: {
			type: DataTypes.STRING(200)
		},
		fullName: {
			type: DataTypes.STRING(200)
		},
		apiId: {
			type: DataTypes.STRING(200)
		},
		apiKey: {
			type: DataTypes.STRING(200)
		},
		accessToken: {
			type: DataTypes.STRING(200)
		},
		sessionKey: {
			type: DataTypes.TEXT
		},
		isEncrypted: {
			type: DataTypes.BOOLEAN
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
