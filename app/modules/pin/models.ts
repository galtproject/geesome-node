/*
 * Copyright ©️ 2018-2021 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2021 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */
import {Sequelize, DataTypes, Op} from 'sequelize';

export default async function (sequelize: Sequelize) {

	const PinAccount = sequelize.define('pinAccount', {
		// http://docs.sequelizejs.com/manual/tutorial/models-definition.html#data-types
		name: {
			type: DataTypes.STRING(100)
		},
		service: {
			type: DataTypes.STRING(100)
		},
		endpoint: {
			type: DataTypes.STRING(100)
		},
		userId: {
			type: DataTypes.INTEGER
		},
		groupId: {
			type: DataTypes.INTEGER
		},
		apiKey: {
			type: DataTypes.TEXT
		},
		isEncrypted: {
			type: DataTypes.BOOLEAN,
			defaultValue: false
		},
		secretApiKeyEncrypted: {
			type: DataTypes.TEXT
		},
		secretApiKey: {
			type: DataTypes.TEXT
		},
		options: {
			type: DataTypes.TEXT
		},
	} as any, {
		indexes: [
			// http://docs.sequelizejs.com/manual/tutorial/models-definition.html#indexes
			{ fields: ['service', 'userId'] },
			{ fields: ['service', 'groupId'] },
			{
				name: 'pin_accounts_user_name_unique',
				fields: ['userId', 'name'],
				unique: true,
				where: {
					userId: {[Op.ne]: null},
					name: {[Op.ne]: null}
				}
			},
			{
				name: 'pin_accounts_group_name_unique',
				fields: ['groupId', 'name'],
				unique: true,
				where: {
					groupId: {[Op.ne]: null},
					name: {[Op.ne]: null}
				}
			},
		]
	} as any);

	const PinStorageObject = sequelize.define('pinStorageObject', {
		storageId: {
			type: DataTypes.STRING(200),
			allowNull: false
		},
		service: {
			type: DataTypes.STRING(100)
		},
		status: {
			type: DataTypes.STRING(100),
			allowNull: false,
			defaultValue: 'pinned'
		},
		pinAccountId: {
			type: DataTypes.INTEGER
		},
		accountName: {
			type: DataTypes.STRING(100)
		},
		userId: {
			type: DataTypes.INTEGER
		},
		groupId: {
			type: DataTypes.INTEGER
		},
		remoteId: {
			type: DataTypes.STRING(200)
		},
		pinnedAt: {
			type: DataTypes.DATE
		},
		checkedAt: {
			type: DataTypes.DATE
		},
		resultJson: {
			type: DataTypes.TEXT
		},
	} as any, {
		indexes: [
			{
				name: 'pin_storage_objects_account_storage_unique',
				fields: ['pinAccountId', 'storageId'],
				unique: true,
				where: {
					pinAccountId: {[Op.ne]: null},
					storageId: {[Op.ne]: null}
				}
			},
			{ name: 'pin_storage_objects_storage_status_idx', fields: ['storageId', 'status'] },
			{ name: 'pin_storage_objects_user_storage_idx', fields: ['userId', 'storageId'] },
			{ name: 'pin_storage_objects_group_storage_idx', fields: ['groupId', 'storageId'] },
		]
	} as any);

	await PinAccount.sync({});
	await PinStorageObject.sync({});

	return {
		PinAccount,
		PinStorageObject
	};
};
