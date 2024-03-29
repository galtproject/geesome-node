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
	let sequelize = new Sequelize('geesome-auto-actions', 'geesome', 'geesome', require('./config').options);

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
			type: Sequelize.TEXT
		},
		isEncrypted: {
			type: Sequelize.BOOLEAN,
			defaultValue: false
		},
		funcArgsEncrypted: {
			type: Sequelize.TEXT
		},
		isActive: {
			type: Sequelize.BOOLEAN,
			defaultValue: false
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
			{ fields: ['isActive'] },
		]
	} as any);

	await AutoAction.sync({});

	const NextActionsPivot = sequelize.define('nextActionsPivot',{
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

	const through = {model: NextActionsPivot, unique: false};

	AutoAction.belongsToMany(AutoAction, {as: 'nextActions', through, foreignKey: 'baseActionId', otherKey: 'nextActionId'});
	AutoAction.belongsToMany(AutoAction, {as: 'baseActions', through, foreignKey: 'nextActionId', otherKey: 'baseActionId'});

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
		NextActionsPivot: await NextActionsPivot.sync({}),
		AutoActionLog: await AutoActionLog.sync({})
	};
};
