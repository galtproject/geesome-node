/*
 * Copyright ©️ 2018-2021 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2021 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */
import {DataTypes, Sequelize} from 'sequelize';

export default async function (sequelize: Sequelize) {
	const Account = sequelize.define('account', {
		// http://docs.sequelizejs.com/manual/tutorial/models-definition.html#data-types
		name: {
			type: DataTypes.STRING(100)
		},
		userId: {
			type: DataTypes.INTEGER
		},
		groupId: {
			type: DataTypes.INTEGER
		},
		staticId: {
			type: DataTypes.STRING(100)
		},
		publicKey: {
			type: DataTypes.STRING(400)
		},
		isRemote: {
			type: DataTypes.BOOLEAN,
			defaultValue: true,
		},
		encryptedPrivateKey: {
			type: DataTypes.TEXT
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
