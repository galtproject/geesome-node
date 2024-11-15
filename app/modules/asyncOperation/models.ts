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

	const UserAsyncOperation = sequelize.define('userAsyncOperation', {
		// http://docs.sequelizejs.com/manual/tutorial/models-definition.html#data-types
		name: {
			type: DataTypes.STRING(200)
		},
		channel: {
			type: DataTypes.STRING(200)
		},
		module: {
			type: DataTypes.STRING(200)
		},
		output: {
			type: DataTypes.STRING(200)
		},
		size: {
			type: DataTypes.INTEGER
		},
		percent: {
			type: DataTypes.DOUBLE
		},
		finishedAt: {
			type: DataTypes.DATE
		},
		errorType: {
			type: DataTypes.STRING(200)
		},
		errorMessage: {
			type: DataTypes.TEXT
		},
		inProcess: {
			type: DataTypes.BOOLEAN
		},
		cancel: {
			type: DataTypes.BOOLEAN
		},
		userId: {
			type: DataTypes.INTEGER
		},
		userApiKeyId: {
			type: DataTypes.INTEGER
		},
		contentId: {
			type: DataTypes.INTEGER
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
			type: DataTypes.STRING(200)
		},
		inputHash: {
			type: DataTypes.STRING(200)
		},
		startedAt: {
			type: DataTypes.DATE
		},
		inputJson: {
			type: DataTypes.TEXT
		},
		isWaiting: {
			type: DataTypes.BOOLEAN
		},
		userId: {
			type: DataTypes.INTEGER
		},
		userApiKeyId: {
			type: DataTypes.INTEGER
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