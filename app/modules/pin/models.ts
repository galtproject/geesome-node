/*
 * Copyright ©️ 2018-2021 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2021 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */
import {Sequelize, DataTypes, Op, QueryTypes} from 'sequelize';
import {PinStorageObjectStatus} from './stateHelpers.js';

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
			defaultValue: PinStorageObjectStatus.Requested
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
		attemptId: {
			type: DataTypes.STRING(100)
		},
		attemptCount: {
			type: DataTypes.INTEGER,
			allowNull: false,
			defaultValue: 0
		},
		requestedAt: {
			type: DataTypes.DATE
		},
		acceptedAt: {
			type: DataTypes.DATE
		},
		confirmedAt: {
			type: DataTypes.DATE
		},
		failedAt: {
			type: DataTypes.DATE
		},
		lastAttemptAt: {
			type: DataTypes.DATE
		},
		nextCheckAt: {
			type: DataTypes.DATE
		},
		lastErrorCode: {
			type: DataTypes.STRING(100)
		},
		lastErrorMessage: {
			type: DataTypes.TEXT
		},
		reconcileClaimId: {
			type: DataTypes.STRING(100)
		},
		reconcileClaimExpiresAt: {
			type: DataTypes.DATE
		},
		reconcileAttemptCount: {
			type: DataTypes.INTEGER,
			allowNull: false,
			defaultValue: 0
		},
		lastReconcileAt: {
			type: DataTypes.DATE
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
			{ name: 'pin_storage_objects_status_check_idx', fields: ['status', 'nextCheckAt', 'id'] },
			{ name: 'pin_storage_objects_reconcile_claim_idx', fields: ['pinAccountId', 'reconcileClaimExpiresAt', 'id'] },
			{ name: 'pin_storage_objects_account_updated_idx', fields: ['pinAccountId', 'updatedAt', 'id'] },
			{ name: 'pin_storage_objects_user_storage_idx', fields: ['userId', 'storageId'] },
			{ name: 'pin_storage_objects_group_storage_idx', fields: ['groupId', 'storageId'] },
		]
	} as any);

	await PinAccount.sync({});
	// This table is still unreleased and model-sync-owned. Add iterative dev
	// columns/indexes without dropping existing ledger data before release migrations exist.
	await PinStorageObject.sync({alter: {drop: false}});
	(PinStorageObject as any).claimForReconciliation = claimPinStorageObjectForReconciliation.bind(
		null,
		sequelize,
		PinStorageObject
	);

	return {
		PinAccount,
		PinStorageObject
	};
};

async function claimPinStorageObjectForReconciliation(
	sequelize: Sequelize,
	PinStorageObject,
	{
		pinAccountId,
		storageId,
		statuses,
		requestedStatus,
		unplannedDueStatuses,
		requestedBefore,
		now,
		claimId,
		claimExpiresAt,
		perAccountLimit
	}
) {
	return sequelize.transaction(async (transaction) => {
		await sequelize.query('SELECT pg_advisory_xact_lock(:namespace, :pinAccountId)', {
			replacements: {namespace: 1735289201, pinAccountId},
			transaction,
			type: QueryTypes.SELECT
		});
		const [activeClaimCount] = await sequelize.query<{count: string}>(`
			SELECT COUNT(*)::text AS count
			FROM "pinStorageObjects"
			WHERE "pinAccountId" = :pinAccountId
				AND "reconcileClaimExpiresAt" > :now
		`, {
			replacements: {pinAccountId, now},
			transaction,
			type: QueryTypes.SELECT
		});
		if (Number(activeClaimCount?.count || 0) >= perAccountLimit) {
			return null;
		}
		const [claimedRow] = await sequelize.query<any>(`
			UPDATE "pinStorageObjects" AS target
			SET
				"reconcileClaimId" = :claimId,
				"reconcileClaimExpiresAt" = :claimExpiresAt,
				"reconcileAttemptCount" = COALESCE("reconcileAttemptCount", 0) + 1,
				"lastReconcileAt" = :now,
				"updatedAt" = :now
			WHERE target.id = (
				SELECT candidate.id
				FROM "pinStorageObjects" AS candidate
				WHERE candidate."pinAccountId" = :pinAccountId
					AND candidate."storageId" = :storageId
					AND candidate.status IN (:statuses)
					AND (
						candidate."reconcileClaimExpiresAt" IS NULL
						OR candidate."reconcileClaimExpiresAt" <= :now
					)
					AND (
						candidate."nextCheckAt" <= :now
						OR (
							candidate."nextCheckAt" IS NULL
							AND (
								candidate.status IN (:unplannedDueStatuses)
								OR (
									candidate.status = :requestedStatus
									AND candidate."lastAttemptAt" <= :requestedBefore
								)
							)
						)
					)
				FOR UPDATE SKIP LOCKED
				LIMIT 1
			)
			RETURNING target.id, target."reconcileAttemptCount"
		`, {
			replacements: {
				pinAccountId,
				storageId,
				statuses,
				requestedStatus,
				unplannedDueStatuses,
				requestedBefore,
				now,
				claimId,
				claimExpiresAt
			},
			transaction,
			type: QueryTypes.SELECT
		});
		if (!claimedRow) {
			return null;
		}
		return {
			id: claimedRow.id,
			claimId,
			reconcileAttemptCount: Number(claimedRow.reconcileAttemptCount || 1)
		};
	});
}
