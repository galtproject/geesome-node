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
		autoActionExecutionClaimsSupported: includeExecutionClaimColumns,
		NextActionsPivot: await NextActionsPivot.sync({}),
		AutoActionLog: await AutoActionLog.sync({})
	};
};
