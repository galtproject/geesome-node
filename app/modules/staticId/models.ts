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

	const StaticIdHistory = sequelize.define('staticIdHistory', {
		// http://docs.sequelizejs.com/manual/tutorial/models-definition.html#data-types
		staticId: {
			type: DataTypes.STRING(200)
		},
		dynamicId: {
			type: DataTypes.STRING(200)
		},
		periodTimestamp: {
			type: DataTypes.INTEGER
		},
		isActive: {
			type: DataTypes.BOOLEAN
		},
		boundAt: {
			type: DataTypes.DATE
		}
	} as any, {
		indexes: [
			// http://docs.sequelizejs.com/manual/tutorial/models-definition.html#indexes
			// { fields: ['chainAccountAddress'] },
			// { fields: ['tokensAddress'] },
			{fields: ['staticId', 'dynamicId'], unique: true},
			{fields: ['staticId', 'boundAt']},
			{fields: ['staticId']}
		]
	} as any);

	return {
		StaticIdHistory: await StaticIdHistory.sync({})
	};
};
