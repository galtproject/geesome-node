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
	const Invite = sequelize.define('invite', {
		// http://docs.sequelizejs.com/manual/tutorial/models-definition.html#data-types
		title: {
			type: Sequelize.STRING(200)
		},
		code: {
			type: Sequelize.STRING(200),
			unique: true
		},
		limits: {
			type: Sequelize.TEXT
		},
		permissions: {
			type: Sequelize.TEXT
		},
		groupsToJoin: {
			type: Sequelize.TEXT
		},
		maxCount: {
			type: Sequelize.INTEGER
		},
		captcha: {
			type: Sequelize.STRING(200)
		},
		isActive: {
			type: Sequelize.BOOLEAN
		},
		createdById: {
			type: Sequelize.INTEGER
		},
		joinedByInviteId: {
			type: Sequelize.INTEGER
		}
	} as any, {
		indexes: [
			// http://docs.sequelizejs.com/manual/tutorial/models-definition.html#indexes
			{ fields: ['code'] }
		]
	} as any);

	appModels.JoinedByPivot = sequelize.define('joinedByPivot',{
		userId: {
			type: Sequelize.INTEGER,
			allowNull: false,
			primaryKey: true,
			unique: true
		},
		joinedByInviteId: {
			type: Sequelize.INTEGER,
			allowNull: false
		},
		joinedByUserId: {
			type: Sequelize.INTEGER,
			allowNull: false
		},
	} as any, {
		indexes: [
			{ fields: ['joinedByInviteId'] },
			{ fields: ['joinedByUserId'] },
		]
	} as any);

	await Invite.sync({});

	const through = {model: appModels.JoinedByPivot, unique: false};

	appModels.User.belongsToMany(appModels.User, {as: 'usersJoinedByUser', through, foreignKey: 'joinedByUserId', otherKey: 'userId'});
	Invite.belongsToMany(appModels.User, {as: 'usersJoinedByInvite', through, foreignKey: 'joinedByInviteId', otherKey: 'userId'});

	appModels.User.belongsToMany(appModels.User, {as: 'joinedByUser', through, foreignKey: 'userId', otherKey: 'joinedByUserId'});
	appModels.User.belongsToMany(Invite, {as: 'joinedByInvite', through, foreignKey: 'userId', otherKey: 'joinedByInviteId'});

	return {
		Invite,
		JoinedByPivot: await appModels.JoinedByPivot.sync({})
	};
}