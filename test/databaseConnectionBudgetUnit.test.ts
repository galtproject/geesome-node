import assert from 'assert';
import {validateDatabaseConnectionBudget} from '../app/modules/database/connectionBudget.js';

describe('database connection budget', () => {
	it('returns a cached deployment budget without warning when capacity is sufficient', async () => {
		let queryCount = 0;
		const warnings: string[] = [];
		const sequelize = getSequelize(20, async () => {
			queryCount += 1;
			return [{maxConnections: 100}];
		});

		const budget = await validateDatabaseConnectionBudget(sequelize, {}, warning => warnings.push(warning));

		assert.deepEqual(budget, {
			poolMax: 20,
			processCount: 1,
			auxiliaryConnections: 5,
			reserveConnections: 10,
			plannedConnections: 25,
			serverMaxConnections: 100,
			usableConnections: 90,
			isPossible: true
		});
		assert.equal(queryCount, 1);
		assert.deepEqual(warnings, []);
	});

	it('warns once with scalar deployment values when the budget is impossible', async () => {
		const warnings: string[] = [];
		const sequelize = getSequelize(20, async () => [{maxConnections: 100}]);

		const budget = await validateDatabaseConnectionBudget(sequelize, {
			DATABASE_PROCESS_COUNT: '5',
			DATABASE_AUXILIARY_CONNECTIONS: '5',
			DATABASE_CONNECTION_RESERVE: '10'
		}, warning => warnings.push(warning));

		assert.equal(budget?.isPossible, false);
		assert.deepEqual(warnings, [
			'database_connection_budget_exceeded planned=105 usable=90 pool_max=20 process_count=5 auxiliary=5 reserve=10 server_max=100'
		]);
	});

	it('does not query PostgreSQL when the startup check is disabled', async () => {
		let queryCount = 0;
		const sequelize = getSequelize(20, async () => {
			queryCount += 1;
			return [{maxConnections: 100}];
		});

		const budget = await validateDatabaseConnectionBudget(sequelize, {
			DATABASE_CONNECTION_BUDGET_CHECK: '0'
		});

		assert.equal(budget, null);
		assert.equal(queryCount, 0);
	});

	it('does not fail startup when the server setting cannot be read', async () => {
		const warnings: string[] = [];
		const sequelize = getSequelize(20, async () => {
			throw new Error('permission denied');
		});

		const budget = await validateDatabaseConnectionBudget(sequelize, {}, warning => warnings.push(warning));

		assert.equal(budget, null);
		assert.deepEqual(warnings, []);
	});

	it('normalizes invalid deployment inputs to conservative defaults', async () => {
		const sequelize = getSequelize('invalid', async () => [{maxConnections: '100'}]);

		const budget = await validateDatabaseConnectionBudget(sequelize, {
			DATABASE_PROCESS_COUNT: '0',
			DATABASE_AUXILIARY_CONNECTIONS: '-1',
			DATABASE_CONNECTION_RESERVE: 'invalid'
		});

		assert.equal(budget?.poolMax, 20);
		assert.equal(budget?.processCount, 1);
		assert.equal(budget?.auxiliaryConnections, 5);
		assert.equal(budget?.reserveConnections, 10);
	});
});

function getSequelize(poolMax, query) {
	return {
		options: {pool: {max: poolMax}},
		query
	};
}
