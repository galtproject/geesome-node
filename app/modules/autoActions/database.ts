/*
 * Copyright ©️ 2018-2021 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2021 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

const Sequelize: any = require('sequelize');

module.exports = async function () {
	let sequelize = new Sequelize('geesome-soc-net', 'geesome', 'geesome', require('./config').options);

	const AutoAction = sequelize.define('autoAction', {
		// http://docs.sequelizejs.com/manual/tutorial/models-definition.html#data-types
		userId: {
			type: Sequelize.INTEGER
		},
		moduleName: {
			type: Sequelize.STRING(200)
		},
		funcName: {
			type: Sequelize.STRING(200)
		},
		funcArgs: {
			type: Sequelize.STRING
		},
		isActive: {
			type: Sequelize.BOOLEAN
		},
		executePeriod: {
			type: Sequelize.INTEGER,
			defaultValue: 0
		},
		totalExecuteAttempts: {
			type: Sequelize.INTEGER,
			defaultValue: 0
		},
		currentExecuteAttempts: {
			type: Sequelize.INTEGER,
			defaultValue: 0
		},
		executeOn: {
			type: Sequelize.DATE
		},
	} as any, {
		indexes: [
			// http://docs.sequelizejs.com/manual/tutorial/models-definition.html#indexes
			{ fields: ['isActive'], unique: true },
		]
	} as any);

	await AutoAction.sync({});

	const NextActions = sequelize.define('nextActions',{
		baseActionId: {
			type: Sequelize.INTEGER,
			allowNull: false,
			primaryKey: true
		},
		nextActionId: {
			type: Sequelize.INTEGER,
			allowNull: false,
			primaryKey: true
		},
		position: {
			type: Sequelize.INTEGER,
			defaultValue: 0,
		}
	} as any);

	AutoAction.belongsToMany(AutoAction, {as: 'nextActions', through: NextActions, foreignKey: 'nextActionId'});

	const AutoActionLog = sequelize.define('autoActionLog', {
		// http://docs.sequelizejs.com/manual/tutorial/models-definition.html#data-types
		userId: {
			type: Sequelize.INTEGER
		},
		isFailed: {
			type: Sequelize.BOOLEAN,
			defaultValue: false
		},
		error: {
			type: Sequelize.STRING
		},
		response: {
			type: Sequelize.STRING
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
		NextActions: await NextActions.sync({}),
		AutoActionLog: await AutoActionLog.sync({})
	};
};
