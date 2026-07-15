import assert from 'node:assert';
import {
	collectDatabaseConnectionDiagnostics,
	isDatabaseConnectionDiagnosticsEnabled,
	startDatabaseConnectionDiagnostics
} from '../app/modules/database/connectionDiagnostics.js';

describe('database connection diagnostics', () => {
	it('keeps broad debug configuration and the default runtime inert', () => {
		assert.equal(isDatabaseConnectionDiagnosticsEnabled({DEBUG: 'geesome*'}), false);
		assert.equal(isDatabaseConnectionDiagnosticsEnabled({}), false);
		assert.equal(isDatabaseConnectionDiagnosticsEnabled({
			DEBUG: 'geesome:database:connections'
		}), true);
		assert.equal(isDatabaseConnectionDiagnosticsEnabled({
			GEESOME_DATABASE_CONNECTION_DIAGNOSTICS: '1'
		}), true);
	});

	it('collects bounded aggregate activity and scalar pool gauges', async () => {
		let queryOptions;
		const sequelize = createSequelizeStub(async (_query, options) => {
			queryOptions = options;
			return [
				{applicationName: 'geesome-node', state: 'active', count: '3'},
				{applicationName: '', state: null, count: 2},
				{applicationName: 'ignored', state: 'idle', count: 1}
			];
		});
		const snapshot = await collectDatabaseConnectionDiagnostics(sequelize, {
			GEESOME_DATABASE_CONNECTION_DIAGNOSTICS_ACTIVITY_LIMIT: '2'
		});

		assert.deepEqual(snapshot.configuredPool, {
			max: 20,
			min: 0,
			acquireMs: 30000,
			idleMs: 30000
		});
		assert.deepEqual(snapshot.runtimePool, {
			size: 4,
			available: 2,
			borrowed: 1,
			waiting: 1
		});
		assert.deepEqual(snapshot.activity, [
			{applicationName: 'geesome-node', state: 'active', count: 3},
			{applicationName: 'unspecified', state: 'unknown', count: 2}
		]);
		assert.equal(queryOptions.replacements.limit, 2);
		assert.equal(typeof snapshot.time, 'string');
	});

	it('does not query while disabled', async () => {
		let queryCount = 0;
		const diagnostics = startDatabaseConnectionDiagnostics(createSequelizeStub(async () => {
			queryCount += 1;
			return [];
		}), {}, createLogStub());

		await new Promise(resolve => setImmediate(resolve));
		await diagnostics.stop();
		assert.equal(queryCount, 0);
	});

	it('drains an active sample before shutdown', async () => {
		let resolveQuery;
		const queryPromise = new Promise<any[]>(resolve => {
			resolveQuery = resolve;
		});
		const log = createLogStub();
		const diagnostics = startDatabaseConnectionDiagnostics(
			createSequelizeStub(() => queryPromise),
			{
				GEESOME_DATABASE_CONNECTION_DIAGNOSTICS: '1',
				GEESOME_DATABASE_CONNECTION_DIAGNOSTICS_INTERVAL_MS: '1000'
			},
			log
		);

		await new Promise(resolve => setImmediate(resolve));
		let stopped = false;
		const stopPromise = diagnostics.stop().then(() => {
			stopped = true;
		});
		await new Promise(resolve => setImmediate(resolve));
		assert.equal(stopped, false);

		resolveQuery([]);
		await stopPromise;
		assert.equal(log.calls.length, 1);
		assert.equal(log.calls[0][0], 'snapshot');
	});
});

function createSequelizeStub(query) {
	return {
		options: {
			pool: {max: 20, min: 0, acquire: 30000, idle: 30000}
		},
		connectionManager: {
			pool: {
				size: 4,
				available: 2,
				using: 1,
				waiting: 1
			}
		},
		query
	};
}

function createLogStub(): any {
	const log: any = (...args) => {
		log.calls.push(args);
	};
	log.enabled = false;
	log.calls = [];
	return log;
}
