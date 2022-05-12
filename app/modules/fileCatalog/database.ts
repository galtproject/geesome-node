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

module.exports = async function (sequelize, appModels) {
	const FileCatalogItem = sequelize.define('fileCatalogItem', {
		// http://docs.sequelizejs.com/manual/tutorial/models-definition.html#data-types
		name: {
			type: Sequelize.STRING(200)
		},
		description: {
			type: Sequelize.STRING
		},
		type: {
			type: Sequelize.STRING(200)
		},
		view: {
			type: Sequelize.STRING(200)
		},
		defaultFolderFor: {
			type: Sequelize.STRING(200)
		},
		manifestStorageId: {
			type: Sequelize.STRING(200)
		},
		nativeStorageId: {
			type: Sequelize.STRING(200)
		},
		size: {
			type: Sequelize.INTEGER
		},
		position: {
			type: Sequelize.INTEGER
		},
		contentId: {
			type: Sequelize.INTEGER
		},
		isDeleted: {
			type: Sequelize.BOOLEAN,
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
			type: Sequelize.STRING(200)
		},
		title: {
			type: Sequelize.STRING
		},
		isActive: {
			type: Sequelize.BOOLEAN
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