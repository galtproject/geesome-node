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
	let sequelize = new Sequelize('geesome-static-site-generator', 'geesome', 'geesome', require('./config').options);

	const StaticSite = sequelize.define('staticSite', {
		// http://docs.sequelizejs.com/manual/tutorial/models-definition.html#data-types
		name: {
			type: Sequelize.STRING(100)
		},
		title: {
			type: Sequelize.TEXT
		},
		options: {
			type: Sequelize.TEXT
		},
		type: {
			type: Sequelize.STRING(100)
		},
		entityId: {
			type: Sequelize.INTEGER
		},
		storageId: {
			type: Sequelize.STRING(100)
		},
		staticId: {
			type: Sequelize.STRING(100)
		},
	} as any, {
		indexes: [
			// http://docs.sequelizejs.com/manual/tutorial/models-definition.html#indexes
			{ fields: ['name'], unique: true },
			{ fields: ['type', 'entityId'] },
		]
	} as any);

	return {
		StaticSite: await StaticSite.sync({})
	};
};
