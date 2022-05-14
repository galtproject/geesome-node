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
	let sequelize = new Sequelize('geesome-async-operations', 'geesome', 'geesome', require('./config').options);

	const UserAsyncOperation = sequelize.define('userAsyncOperation', {
		// http://docs.sequelizejs.com/manual/tutorial/models-definition.html#data-types
		name: {
			type: Sequelize.STRING(200)
		},
		channel: {
			type: Sequelize.STRING(200)
		},
		size: {
			type: Sequelize.INTEGER
		},
		percent: {
			type: Sequelize.DOUBLE
		},
		finishedAt: {
			type: Sequelize.DATE
		},
		errorType: {
			type: Sequelize.STRING(200)
		},
		errorMessage: {
			type: Sequelize.TEXT
		},
		inProcess: {
			type: Sequelize.BOOLEAN
		},
		cancel: {
			type: Sequelize.BOOLEAN
		},
		userId: {
			type: Sequelize.INTEGER
		},
		userApiKeyId: {
			type: Sequelize.INTEGER
		},
		contentId: {
			type: Sequelize.INTEGER
		},
	} as any, {
		indexes: [
			// http://docs.sequelizejs.com/manual/tutorial/models-definition.html#indexes
			// { fields: ['chainAccountAddress'] },
			// { fields: ['tokensAddress'] },
			// { fields: ['tokensAddress', 'chainAccountAddress'] }
		]
	} as any);

	await UserAsyncOperation.sync({});

	const UserOperationQueue = sequelize.define('userOperationQueue', {
		// http://docs.sequelizejs.com/manual/tutorial/models-definition.html#data-types
		module: {
			type: Sequelize.STRING(200)
		},
		inputHash: {
			type: Sequelize.STRING(200)
		},
		startedAt: {
			type: Sequelize.DATE
		},
		inputJson: {
			type: Sequelize.TEXT
		},
		isWaiting: {
			type: Sequelize.BOOLEAN
		},
		userId: {
			type: Sequelize.INTEGER
		},
		userApiKeyId: {
			type: Sequelize.INTEGER
		},
	} as any, {
		indexes: [
			// http://docs.sequelizejs.com/manual/tutorial/models-definition.html#indexes
			// { fields: ['chainAccountAddress'] },
			// { fields: ['tokensAddress'] },
			{ fields: ['module', 'isWaiting'] },
			{ fields: ['module', 'inputHash', 'isWaiting'] }
		]
	} as any);

	UserOperationQueue.belongsTo(UserAsyncOperation, {as: 'asyncOperation', foreignKey: 'asyncOperationId'});
	UserAsyncOperation.hasMany(UserOperationQueue, {as: 'operationsQueue', foreignKey: 'asyncOperationId'});

	return {
		UserAsyncOperation,
		UserOperationQueue: await UserOperationQueue.sync({})
	};
}