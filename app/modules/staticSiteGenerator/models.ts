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

	const StaticSite = sequelize.define('staticSite', {
		// http://docs.sequelizejs.com/manual/tutorial/models-definition.html#data-types
		name: {
			type: DataTypes.STRING(100)
		},
		title: {
			type: DataTypes.TEXT
		},
		options: {
			type: DataTypes.TEXT
		},
		userId: {
			type: DataTypes.INTEGER
		},
		entityType: {
			type: DataTypes.STRING(100)
		},
		entityId: {
			type: DataTypes.STRING(100)
		},
		lastEntityManifestStorageId: {
			type: DataTypes.STRING(100)
		},
		storageId: {
			type: DataTypes.STRING(100)
		},
		staticId: {
			type: DataTypes.STRING(100)
		},
	} as any, {
		indexes: [
			// http://docs.sequelizejs.com/manual/tutorial/models-definition.html#indexes
			{ fields: ['name'], unique: true },
			{ fields: ['entityType', 'entityId'] },
		]
	} as any);

	return {
		StaticSite: await StaticSite.sync({})
	};
};
