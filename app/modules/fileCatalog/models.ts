/*
 * Copyright ©️ 2018-2021 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2021 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */
import {Sequelize, DataTypes} from 'sequelize';

export default async function (sequelize, appModels) {
	const FileCatalogItem = sequelize.define('fileCatalogItem', {
		// http://docs.sequelizejs.com/manual/tutorial/models-definition.html#data-types
		name: {
			type: DataTypes.STRING(200)
		},
		description: {
			type: DataTypes.STRING
		},
		type: {
			type: DataTypes.STRING(200)
		},
		view: {
			type: DataTypes.STRING(200)
		},
		defaultFolderFor: {
			type: DataTypes.STRING(200)
		},
		manifestStorageId: {
			type: DataTypes.STRING(200)
		},
		nativeStorageId: {
			type: DataTypes.STRING(200)
		},
		size: {
			type: DataTypes.BIGINT
		},
		position: {
			type: DataTypes.INTEGER
		},
		contentId: {
			type: DataTypes.INTEGER
		},
		isDeleted: {
			type: DataTypes.BOOLEAN,
			defaultValue: false
		}
	} as any, {
		indexes: [
			// http://docs.sequelizejs.com/manual/tutorial/models-definition.html#indexes
			// { fields: ['chainAccountAddress'] },
			// { fields: ['tokensAddress'] },
			// { fields: ['parentItemId', 'userId', 'name'], unique: true, where: { isDeleted: false } },
			// { fields: ['userId', 'name'], unique: true, where: { parentItemId: null, isDeleted: false } }
		]
	} as any);

	FileCatalogItem.belongsTo(FileCatalogItem, {as: 'linkOf', foreignKey: 'linkOfId'});
	FileCatalogItem.hasMany(FileCatalogItem, {as: 'linkedItems', foreignKey: 'linkOfId'});

	FileCatalogItem.belongsTo(FileCatalogItem, {as: 'parentItem', foreignKey: 'parentItemId'});
	FileCatalogItem.hasMany(FileCatalogItem, {as: 'childrenItems', foreignKey: 'parentItemId'});

	FileCatalogItem.belongsTo(appModels.Content, {as: 'content', foreignKey: 'contentId'});
	appModels.Content.hasMany(FileCatalogItem, {as: 'fileCatalogItems', foreignKey: 'contentId'});

	FileCatalogItem.belongsTo(appModels.User, {as: 'user', foreignKey: 'userId'});
	appModels.User.hasMany(FileCatalogItem, {as: 'fileCatalogItems', foreignKey: 'userId'});

	FileCatalogItem.belongsTo(appModels.Group, {as: 'group', foreignKey: 'groupId'});
	appModels.Group.hasMany(FileCatalogItem, {as: 'fileCatalogItems', foreignKey: 'groupId'});

	await FileCatalogItem.sync({});

	const FileCatalogItemPermission = sequelize.define('fileCatalogItemPermission', {
		// http://docs.sequelizejs.com/manual/tutorial/models-definition.html#data-types
		name: {
			type: DataTypes.STRING(200)
		},
		title: {
			type: DataTypes.STRING
		},
		isActive: {
			type: DataTypes.BOOLEAN
		}
	} as any, {
		indexes: [
			// http://docs.sequelizejs.com/manual/tutorial/models-definition.html#indexes
			// { fields: ['chainAccountAddress'] },
			// { fields: ['tokensAddress'] },
			// { fields: ['tokensAddress', 'chainAccountAddress'] }
		]
	} as any);

	FileCatalogItemPermission.belongsTo(FileCatalogItem, {as: 'fileCatalogItem', foreignKey: 'itemId'});
	FileCatalogItem.hasMany(FileCatalogItemPermission, {as: 'permissions', foreignKey: 'itemId'});

	FileCatalogItemPermission.belongsTo(appModels.User, {as: 'user', foreignKey: 'userId'});
	appModels.User.hasMany(FileCatalogItemPermission, {as: 'fileCatalogPermissions', foreignKey: 'userId'});

	appModels.FileCatalogItem = FileCatalogItem;
	appModels.FileCatalogItemPermission = await FileCatalogItemPermission.sync({});

	return appModels;
}