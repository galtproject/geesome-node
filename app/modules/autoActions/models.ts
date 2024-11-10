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

	const AutoAction = sequelize.define('autoAction', {
		// http://docs.sequelizejs.com/manual/tutorial/models-definition.html#data-types
		userId: {
			type: DataTypes.INTEGER
		},
		moduleName: {
			type: DataTypes.STRING(200)
		},
		funcName: {
			type: DataTypes.STRING(200)
		},
		funcArgs: {
			type: DataTypes.TEXT
		},
		isEncrypted: {
			type: DataTypes.BOOLEAN,
			defaultValue: false
		},
		funcArgsEncrypted: {
			type: DataTypes.TEXT
		},
		isActive: {
			type: DataTypes.BOOLEAN,
			defaultValue: false
		},
		executePeriod: {
			type: DataTypes.INTEGER,
			defaultValue: 0
		},
		totalExecuteAttempts: {
			type: DataTypes.INTEGER,
			defaultValue: 0
		},
		currentExecuteAttempts: {
			type: DataTypes.INTEGER,
			defaultValue: 0
		},
		executeOn: {
			type: DataTypes.DATE
		},
	} as any, {
		indexes: [
			// http://docs.sequelizejs.com/manual/tutorial/models-definition.html#indexes
			{ fields: ['isActive'] },
		]
	} as any);

	await AutoAction.sync({});

	const NextActionsPivot = sequelize.define('nextActionsPivot',{
		baseActionId: {
			type: DataTypes.INTEGER,
			allowNull: false,
			primaryKey: true
		},
		nextActionId: {
			type: DataTypes.INTEGER,
			allowNull: false,
			primaryKey: true
		},
		position: {
			type: DataTypes.INTEGER,
			defaultValue: 0,
		}
	} as any);

	const through = {model: NextActionsPivot, unique: false};

	AutoAction.belongsToMany(AutoAction, {as: 'nextActions', through, foreignKey: 'baseActionId', otherKey: 'nextActionId'});
	AutoAction.belongsToMany(AutoAction, {as: 'baseActions', through, foreignKey: 'nextActionId', otherKey: 'baseActionId'});

	const AutoActionLog = sequelize.define('autoActionLog', {
		// http://docs.sequelizejs.com/manual/tutorial/models-definition.html#data-types
		userId: {
			type: DataTypes.INTEGER
		},
		isFailed: {
			type: DataTypes.BOOLEAN,
			defaultValue: false
		},
		error: {
			type: DataTypes.STRING
		},
		response: {
			type: DataTypes.STRING
		},
	} as any, {
		indexes: [
			// http://docs.sequelizejs.com/manual/tutorial/models-definition.html#indexes
			{ fields: ['userId'] },
			{ fields: ['userId', 'isFailed'] },
		]
	} as any);

	AutoActionLog.belongsTo(AutoAction, {as: 'action', foreignKey: 'actionId'});
	AutoAction.hasMany(AutoActionLog, {as: 'logs', foreignKey: 'actionId'});

	AutoActionLog.belongsTo(AutoAction, {as: 'rootAction', foreignKey: 'rootActionId'});
	AutoAction.hasMany(AutoActionLog, {as: 'logsByRoot', foreignKey: 'rootActionId'});

	return {
		AutoAction,
		NextActionsPivot: await NextActionsPivot.sync({}),
		AutoActionLog: await AutoActionLog.sync({})
	};
};
