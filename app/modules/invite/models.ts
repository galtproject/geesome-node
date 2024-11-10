/*
 * Copyright ©️ 2018-2021 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2021 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */
import {Sequelize, DataTypes} from 'sequelize';

export default async function (sequelize: Sequelize, appModels) {
	const Invite = sequelize.define('invite', {
		// http://docs.sequelizejs.com/manual/tutorial/models-definition.html#data-types
		title: {
			type: DataTypes.STRING(200)
		},
		code: {
			type: DataTypes.STRING(200),
			unique: true
		},
		limits: {
			type: DataTypes.TEXT
		},
		permissions: {
			type: DataTypes.TEXT
		},
		groupsToJoin: {
			type: DataTypes.TEXT
		},
		maxCount: {
			type: DataTypes.INTEGER
		},
		captcha: {
			type: DataTypes.STRING(200)
		},
		isActive: {
			type: DataTypes.BOOLEAN
		},
		createdById: {
			type: DataTypes.INTEGER
		},
		joinedByInviteId: {
			type: DataTypes.INTEGER
		}
	} as any, {
		indexes: [
			// http://docs.sequelizejs.com/manual/tutorial/models-definition.html#indexes
			{ fields: ['code'] }
		]
	} as any);

	appModels.JoinedByPivot = sequelize.define('joinedByPivot',{
		userId: {
			type: DataTypes.INTEGER,
			allowNull: false,
			primaryKey: true,
			unique: true
		},
		joinedByInviteId: {
			type: DataTypes.INTEGER,
			allowNull: false
		},
		joinedByUserId: {
			type: DataTypes.INTEGER,
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