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
	const ForeignAccount = sequelize.define('foreignAccount', {
		// http://docs.sequelizejs.com/manual/tutorial/models-definition.html#data-types
		title: {
			type: DataTypes.STRING
		},
		provider: {
			type: DataTypes.STRING(200)
		},
		userId: {
			type: DataTypes.INTEGER
		},
		type: {
			type: DataTypes.STRING(200)
		},
		address: {
			type: DataTypes.STRING(200)
		},
		description: {
			type: DataTypes.STRING
		},
		signature: {
			type: DataTypes.STRING
		}
	} as any, {
		indexes: [
			// http://docs.sequelizejs.com/manual/tutorial/models-definition.html#indexes
			{ fields: ['userId'] },
			{ fields: ['userId', 'provider'] },
			{ fields: ['provider', 'address'] }
		]
	} as any);

	await ForeignAccount.sync({});

	const AuthMessage = sequelize.define('authMessage', {
		// http://docs.sequelizejs.com/manual/tutorial/models-definition.html#data-types
		provider: {
			type: DataTypes.STRING(200)
		},
		address: {
			type: DataTypes.STRING(200)
		},
		message: {
			type: DataTypes.TEXT
		}
	} as any, {
		indexes: [
			// http://docs.sequelizejs.com/manual/tutorial/models-definition.html#indexes
			{ fields: ['foreignAccountId'] },
			{ fields: ['address', 'provider'] }
		]
	} as any);

	AuthMessage.belongsTo(ForeignAccount, {as: 'foreignAccount', foreignKey: 'foreignAccountId'});
	ForeignAccount.hasMany(AuthMessage, {as: 'authMessages', foreignKey: 'foreignAccountId'});

	return {
		ForeignAccount,
		AuthMessage: await AuthMessage.sync({})
	};
};
