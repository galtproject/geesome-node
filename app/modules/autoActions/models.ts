/*
 * Copyright ©️ 2018-2021 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2021 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */
import {Sequelize, DataTypes, QueryTypes} from 'sequelize';

async function getAutoActionExecutionClaimSchemaState(sequelize: Sequelize) {
	const [rows] = await sequelize.query(`
		SELECT
			to_regclass('"autoActions"') IS NOT NULL AS "tableExists",
			EXISTS (
				SELECT 1
				FROM information_schema.columns
				WHERE table_schema = 'public'
					AND table_name = 'autoActions'
					AND column_name = 'executeClaimedAt'
			) AS "hasExecuteClaimedAt",
			EXISTS (
				SELECT 1
				FROM information_schema.columns
				WHERE table_schema = 'public'
					AND table_name = 'autoActions'
					AND column_name = 'executeClaimExpiresAt'
			) AS "hasExecuteClaimExpiresAt"
	`);
	const row = (rows as any[])[0] || {};
	const hasExecutionClaimColumns = row.hasExecuteClaimedAt === true && row.hasExecuteClaimExpiresAt === true;

	return {
		tableExists: row.tableExists === true,
		hasExecutionClaimColumns,
	};
}

function getAutoActionAttributes(includeExecutionClaimColumns: boolean) {
	const attributes = {
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
	} as any;

	if (includeExecutionClaimColumns) {
		attributes.executeClaimedAt = {
			type: DataTypes.DATE
		};
		attributes.executeClaimExpiresAt = {
			type: DataTypes.DATE
		};
	}

	return attributes;
}

function getAutoActionIndexes(includeExecutionClaimIndex: boolean) {
	const indexes = [
		// http://docs.sequelizejs.com/manual/tutorial/models-definition.html#indexes
		{ fields: ['isActive'] },
		{ name: 'auto_actions_active_execute_idx', fields: ['isActive', 'executeOn'] },
		{ name: 'auto_actions_user_created_idx', fields: ['userId', 'createdAt', 'id'] },
	];

	if (includeExecutionClaimIndex) {
		indexes.push({ name: 'auto_actions_active_execute_claim_idx', fields: ['isActive', 'executeOn', 'executeClaimExpiresAt', 'id'] });
	}

	return indexes;
}

async function claimDueAutoActionsForExecution(sequelize: Sequelize, {now, claimExpiresAt, limit}) {
	return sequelize.query<any>(`
		WITH due_actions AS (
			SELECT id
			FROM "autoActions"
			WHERE "isActive" = true
				AND "executeOn" <= :now
				AND ("executeClaimExpiresAt" IS NULL OR "executeClaimExpiresAt" <= :now)
			ORDER BY "executeOn" ASC, id ASC
			FOR UPDATE SKIP LOCKED
			LIMIT :limit
		)
		UPDATE "autoActions" AS "autoAction"
		SET
			"executeClaimedAt" = :now,
			"executeClaimExpiresAt" = :claimExpiresAt,
			"updatedAt" = :now
		FROM due_actions
		WHERE "autoAction".id = due_actions.id
		RETURNING "autoAction".*
	`, {
		replacements: {
			now,
			claimExpiresAt,
			limit,
		},
		type: QueryTypes.SELECT,
	});
}

export default async function (sequelize: Sequelize) {
	const schemaState = await getAutoActionExecutionClaimSchemaState(sequelize);
	const includeExecutionClaimColumns = !schemaState.tableExists || schemaState.hasExecutionClaimColumns;
	const includeExecutionClaimIndex = !schemaState.tableExists;

	const AutoAction = sequelize.define('autoAction', getAutoActionAttributes(includeExecutionClaimColumns), {
		indexes: getAutoActionIndexes(includeExecutionClaimIndex)
	} as any);
	(AutoAction as any).claimDueForExecution = (claimOptions) => claimDueAutoActionsForExecution(sequelize, claimOptions);

	await AutoAction.sync({});

	const AutoActionDedupeKey = sequelize.define('autoActionDedupeKey', {
		identityKey: {
			type: DataTypes.STRING(500),
			allowNull: false
		},
		userId: {
			type: DataTypes.INTEGER,
			allowNull: false
		},
		autoActionId: {
			type: DataTypes.INTEGER
		}
	} as any, {
		indexes: [
			{
				name: 'auto_action_dedupe_keys_user_identity_unique',
				fields: ['userId', 'identityKey'],
				unique: true
			},
			{name: 'auto_action_dedupe_keys_action_idx', fields: ['autoActionId']},
			{name: 'auto_action_dedupe_keys_updated_idx', fields: ['updatedAt', 'id']}
		]
	} as any);
	await AutoActionDedupeKey.sync({});
	(AutoAction as any).deactivateActiveByIdentityPrefix = (options) => {
		return deactivateActiveAutoActionsByIdentityPrefix(
			sequelize,
			AutoAction,
			AutoActionDedupeKey,
			includeExecutionClaimColumns,
			options
		);
	};

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
	const syncedNextActionsPivot = await NextActionsPivot.sync({});
	(AutoAction as any).findOrCreateActiveByIdentity = (options) => {
		return findOrCreateActiveAutoActionByIdentity(
			sequelize,
			AutoAction,
			AutoActionDedupeKey,
			syncedNextActionsPivot,
			options
		);
	};
	(AutoAction as any).cleanupStaleDedupeKeys = (options) => {
		return cleanupStaleAutoActionDedupeKeys(sequelize, AutoAction, AutoActionDedupeKey, options);
	};

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
			type: DataTypes.TEXT
		},
		response: {
			type: DataTypes.TEXT
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
		AutoActionDedupeKey,
		autoActionExecutionClaimsSupported: includeExecutionClaimColumns,
		NextActionsPivot: syncedNextActionsPivot,
		AutoActionLog: await AutoActionLog.sync({})
	};
};

async function findOrCreateActiveAutoActionByIdentity(
	sequelize: Sequelize,
	AutoAction,
	AutoActionDedupeKey,
	NextActionsPivot,
	options
) {
	return sequelize.transaction(async transaction => {
		await AutoActionDedupeKey.findOrCreate({
			where: {
				userId: options.userId,
				identityKey: options.identityKey
			},
			transaction
		});
		const dedupeKey = await AutoActionDedupeKey.findOne({
			where: {
				userId: options.userId,
				identityKey: options.identityKey
			},
			transaction,
			lock: transaction.LOCK.UPDATE
		});
		if (dedupeKey.autoActionId) {
			const activeAction = await AutoAction.findOne({
				where: {
					id: dedupeKey.autoActionId,
					userId: options.userId,
					isActive: true
				},
				transaction
			});
			if (activeAction) {
				return {action: activeAction, created: false};
			}
		}

		const action = await AutoAction.create({...options.autoAction, userId: options.userId}, {transaction});
		const nextActions = await createOrResolveUniqueAutoActionChildren(
			AutoAction,
			options.userId,
			options.nextActions,
			transaction
		);
		await attachUniqueAutoActionChildren(NextActionsPivot, action.id, nextActions, transaction);
		await dedupeKey.update({autoActionId: action.id}, {transaction});
		return {action, created: true};
	});
}

async function createOrResolveUniqueAutoActionChildren(AutoAction, userId, nextActions = [], transaction) {
	const resolvedActions = [];
	for (const nextAction of nextActions) {
		if (hasAutoActionId(nextAction)) {
			const existingAction = await AutoAction.findOne({
				where: {id: nextAction.id, userId},
				transaction
			});
			if (!existingAction) {
				throw new Error('next_action_not_found');
			}
			resolvedActions.push(existingAction);
			continue;
		}
		if (nextAction?.nextActions?.length) {
			throw new Error('nested_unique_next_actions_not_supported');
		}
		resolvedActions.push(await AutoAction.create({...nextAction, userId}, {transaction}));
	}
	return resolvedActions;
}

async function attachUniqueAutoActionChildren(NextActionsPivot, baseActionId, nextActions, transaction) {
	if (!nextActions.length) {
		return;
	}
	await NextActionsPivot.bulkCreate(nextActions.map((nextAction, position) => ({
		baseActionId,
		nextActionId: nextAction.id,
		position
	})), {transaction});
}

function hasAutoActionId(action) {
	return action?.id !== undefined && action?.id !== null;
}

async function cleanupStaleAutoActionDedupeKeys(sequelize, AutoAction, AutoActionDedupeKey, options) {
	const queryGenerator = sequelize.getQueryInterface().queryGenerator;
	const actionTable = queryGenerator.quoteTable(AutoAction.getTableName());
	const dedupeTable = queryGenerator.quoteTable(AutoActionDedupeKey.getTableName());
	const rows = await sequelize.query<any>(`
		WITH stale_keys AS (
			SELECT dedupe.id
			FROM ${dedupeTable} AS dedupe
			LEFT JOIN ${actionTable} AS action ON action.id = dedupe."autoActionId"
			WHERE dedupe."updatedAt" < :before
				AND (
					action.id IS NULL
					OR (action."isActive" = false AND action."updatedAt" < :before)
				)
			ORDER BY dedupe."updatedAt" ASC, dedupe.id ASC
			FOR UPDATE OF dedupe SKIP LOCKED
			LIMIT :limit
		)
		DELETE FROM ${dedupeTable} AS dedupe
		USING stale_keys
		WHERE dedupe.id = stale_keys.id
		RETURNING dedupe.id
	`, {
		replacements: {
			before: options.before,
			limit: options.limit
		},
		type: QueryTypes.SELECT
	});
	return rows.length;
}

async function deactivateActiveAutoActionsByIdentityPrefix(
	sequelize: Sequelize,
	AutoAction,
	AutoActionDedupeKey,
	includeExecutionClaimColumns: boolean,
	options
) {
	const queryGenerator = sequelize.getQueryInterface().queryGenerator;
	const actionTable = queryGenerator.quoteTable(AutoAction.getTableName());
	const dedupeTable = queryGenerator.quoteTable(AutoActionDedupeKey.getTableName());
	const claimReleaseSql = includeExecutionClaimColumns
		? ', "executeClaimedAt" = NULL, "executeClaimExpiresAt" = NULL'
		: '';
	const rows = await sequelize.query<any>(`
		UPDATE ${actionTable} AS action
		SET
			"isActive" = false,
			"updatedAt" = :now
			${claimReleaseSql}
		WHERE action."userId" = :userId
			AND action."isActive" = true
			AND EXISTS (
				SELECT 1
				FROM ${dedupeTable} AS dedupe
				WHERE dedupe."autoActionId" = action.id
					AND dedupe."userId" = :userId
					AND LEFT(dedupe."identityKey", CHAR_LENGTH(:identityPrefix)) = :identityPrefix
			)
		RETURNING action.id
	`, {
		replacements: {
			userId: options.userId,
			identityPrefix: options.identityPrefix,
			now: new Date()
		},
		type: QueryTypes.SELECT
	});
	return rows.length;
}
