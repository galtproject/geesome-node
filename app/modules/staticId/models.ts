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
	let sequelize = new Sequelize('geesome-static-id', 'geesome', 'geesome', require('./config').options);

	const StaticIdHistory = sequelize.define('staticIdHistory', {
		// http://docs.sequelizejs.com/manual/tutorial/models-definition.html#data-types
		staticId: {
			type: Sequelize.STRING(200)
		},
		dynamicId: {
			type: Sequelize.STRING(200)
		},
		periodTimestamp: {
			type: Sequelize.INTEGER
		},
		isActive: {
			type: Sequelize.BOOLEAN
		},
		boundAt: {
			type: Sequelize.DATE
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
