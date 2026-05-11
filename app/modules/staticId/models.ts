/*
 * Copyright ©️ 2018-2021 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2021 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */
import {Sequelize, DataTypes, QueryTypes} from 'sequelize';

async function compactStaleStaticIdHistory(sequelize: Sequelize, {staticId = null, keepPerStaticId, limit}) {
	const staticIdFilter = staticId ? 'AND history."staticId" = :staticId' : '';
	const deletedRows = await sequelize.query<{id: number}>(`
		WITH ranked_history AS (
			SELECT
				history.id,
				history."staticId",
				history."dynamicId",
				ROW_NUMBER() OVER (
					PARTITION BY history."staticId"
					ORDER BY history."boundAt" DESC NULLS LAST, history.id DESC
				) AS row_number
			FROM "staticIdHistories" history
			WHERE history."staticId" IS NOT NULL
				${staticIdFilter}
		),
		delete_candidates AS (
			SELECT ranked_history.id
			FROM ranked_history
			LEFT JOIN "staticIdBindings" binding
				ON binding."staticId" = ranked_history."staticId"
				AND binding."dynamicId" IS NOT DISTINCT FROM ranked_history."dynamicId"
			WHERE ranked_history.row_number > :keepPerStaticId
				AND binding.id IS NULL
			ORDER BY ranked_history."staticId", ranked_history.row_number DESC, ranked_history.id ASC
			LIMIT :limit
		)
		DELETE FROM "staticIdHistories" history
		USING delete_candidates
		WHERE history.id = delete_candidates.id
		RETURNING history.id
	`, {
		replacements: {
			staticId,
			keepPerStaticId,
			limit,
		},
		type: QueryTypes.SELECT
	});

	return {deletedHistory: deletedRows.length, staticId, keepPerStaticId, limit};
}

export default async function (sequelize: Sequelize) {

	const StaticIdHistory = sequelize.define('staticIdHistory', {
		// http://docs.sequelizejs.com/manual/tutorial/models-definition.html#data-types
		staticId: {
			type: DataTypes.STRING(200)
		},
		dynamicId: {
			type: DataTypes.STRING(200)
		},
		periodTimestamp: {
			type: DataTypes.INTEGER
		},
		isActive: {
			type: DataTypes.BOOLEAN
		},
		boundAt: {
			type: DataTypes.DATE
		}
	} as any, {
		indexes: [
			// http://docs.sequelizejs.com/manual/tutorial/models-definition.html#indexes
			// { fields: ['chainAccountAddress'] },
			// { fields: ['tokensAddress'] },
			{fields: ['staticId', 'dynamicId'], unique: true},
			{fields: ['staticId', 'boundAt']},
			{fields: ['staticId']},
			// Scalability review slice 9 (matched by 20260506000001-add-content-and-quota-indexes.cjs):
			{name: 'static_id_histories_dynamic_bound_idx', fields: ['dynamicId', 'boundAt']}
		]
	} as any);
	(StaticIdHistory as any).compactStaleHistory = (options) => compactStaleStaticIdHistory(sequelize, options);

	const StaticIdBinding = sequelize.define('staticIdBinding', {
		staticId: {
			type: DataTypes.STRING(200),
			allowNull: false
		},
		dynamicId: {
			type: DataTypes.STRING(200)
		},
		isActive: {
			type: DataTypes.BOOLEAN
		},
		boundAt: {
			type: DataTypes.DATE
		}
	} as any, {
		indexes: [
			{name: 'static_id_bindings_static_unique', fields: ['staticId'], unique: true},
			{name: 'static_id_bindings_dynamic_bound_idx', fields: ['dynamicId', 'boundAt']}
		]
	} as any);

	return {
		StaticIdHistory: await StaticIdHistory.sync({}),
		StaticIdBinding: await StaticIdBinding.sync({})
	};
};
