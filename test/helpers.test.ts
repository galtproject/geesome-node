import assert from 'assert';
import helpers from '../app/helpers.js';

describe('helpers', () => {
	it('detects present ids separately from nullish ownerless paths', () => {
		assert.strictEqual(helpers.hasId(1), true);
		assert.strictEqual(helpers.hasId('1'), true);
		assert.strictEqual(helpers.hasId(null), false);
		assert.strictEqual(helpers.hasId(undefined), false);
	});

	it('normalizes unique ids for shared relation helpers', () => {
		assert.deepEqual(
			helpers.normalizeUniqueIds([1, '1', 2, null, undefined, 'bad', Number.NaN, Number.POSITIVE_INFINITY, '3']),
			[1, 2, 3]
		);
		assert.deepEqual(helpers.normalizeUniqueIds('4'), [4]);
		assert.deepEqual(helpers.normalizeUniqueIds(null), []);
	});

	it('keeps debug log payload builders lazy and safe', async () => {
		const disabledCalls: any[] = [];
		const disabledLog: any = (...args) => disabledCalls.push(args);
		disabledLog.enabled = false;
		let disabledPayloadBuilt = false;

		helpers.logDebug(disabledLog, () => {
			disabledPayloadBuilt = true;
			return ['expensive', [1, 2, 3].map((id) => ({id}))];
		});

		assert.strictEqual(disabledPayloadBuilt, false);
		assert.deepEqual(disabledCalls, []);

		const enabledCalls: any[] = [];
		const enabledLog: any = (...args) => enabledCalls.push(args);
		enabledLog.enabled = true;
		helpers.logDebug(enabledLog, () => [
			'safeMap',
			helpers.mapForLog([{id: 1}, null, {get id() { throw new Error('bad getter'); }}], (item) => item.id)
		]);

		assert.equal(enabledCalls[0][0], 'safeMap');
		assert.equal(enabledCalls[0][1][0], 1);
		assert.equal(typeof enabledCalls[0][1][1].debugPayloadError, 'string');
		assert.equal(enabledCalls[0][1][2].debugPayloadError, 'bad getter');

		let disabledAsyncPayloadBuilt = false;
		await helpers.logDebugAsync(disabledLog, async () => {
			disabledAsyncPayloadBuilt = true;
			return ['async'];
		});

		assert.strictEqual(disabledAsyncPayloadBuilt, false);
		assert.deepEqual(disabledCalls, []);
		assert.deepEqual(helpers.mapForLog(null, (item) => item.id), []);
	});

	it('parses boolean-like configuration values', () => {
		assert.strictEqual(helpers.parseBoolean('1'), true);
		assert.strictEqual(helpers.parseBoolean('yes'), true);
		assert.strictEqual(helpers.parseBoolean('true'), true);
		assert.strictEqual(helpers.parseBoolean('0', true), false);
		assert.strictEqual(helpers.parseBoolean('no', true), false);
		assert.strictEqual(helpers.parseBoolean('false', true), false);
		assert.strictEqual(helpers.parseBoolean('maybe', true), true);
		assert.strictEqual(helpers.parseBoolean(undefined, false), false);
	});

	it('keeps access logging opt-in', () => {
		assert.strictEqual(helpers.isAccessLogEnabled({}), false);
		assert.strictEqual(helpers.isAccessLogEnabled({GEESOME_ACCESS_LOGS: '0'}), false);
		assert.strictEqual(helpers.isAccessLogEnabled({GEESOME_ACCESS_LOGS: 'false'}), false);
		assert.strictEqual(helpers.isAccessLogEnabled({GEESOME_ACCESS_LOGS: '1'}), true);
		assert.strictEqual(helpers.isAccessLogEnabled({GEESOME_ACCESS_LOGS: 'true'}), true);
	});

	it('suppresses known dependency info logs unless explicitly enabled', async () => {
		const originalInfo = console.info;
		const originalEnv = process.env.GEESOME_DEPENDENCY_INFO_LOGS;
		const calls: any[] = [];
		console.info = (...args) => calls.push(args);

		try {
			delete process.env.GEESOME_DEPENDENCY_INFO_LOGS;
			const result = await helpers.withSuppressedConsoleInfo(['skip me'], async () => {
				console.info('skip me');
				console.info('keep me');
				return 'done';
			});
			assert.strictEqual(result, 'done');
			assert.deepEqual(calls, [['keep me']]);

			process.env.GEESOME_DEPENDENCY_INFO_LOGS = '1';
			await helpers.withSuppressedConsoleInfo(['skip me'], async () => {
				console.info('skip me');
			});
			assert.deepEqual(calls, [['keep me'], ['skip me']]);
		} finally {
			console.info = originalInfo;
			if (originalEnv === undefined) {
				delete process.env.GEESOME_DEPENDENCY_INFO_LOGS;
			} else {
				process.env.GEESOME_DEPENDENCY_INFO_LOGS = originalEnv;
			}
		}
	});

	it('sanitizes list params before they reach Sequelize queries', () => {
		assert.deepEqual(helpers.prepareListParams({
			sortBy: 'createdAt;DROP',
			sortDir: 'sideways',
			limit: '-5' as any,
			offset: '-10' as any
		}), {
			sortBy: 'createdAt',
			sortDir: 'DESC'
		});

		assert.deepEqual(helpers.prepareListParams({
			sortBy: 'publishedAt',
			sortDir: 'asc',
			limit: '10001' as any,
			offset: '7' as any,
			includeTotal: 'false' as any
		}), {
			sortBy: 'publishedAt',
			sortDir: 'ASC',
			limit: 10000,
			offset: 7,
			includeTotal: false
		});

		assert.deepEqual(helpers.prepareListParams({
			includeTotal: 'maybe' as any
		}), {
			sortBy: 'createdAt',
			sortDir: 'DESC'
		});
	});

	it('skips list totals for cursor pages or explicit opt out', () => {
		assert.strictEqual(helpers.shouldIncludeListTotal({}, {}), true);
		assert.strictEqual(helpers.shouldIncludeListTotal({includeTotal: false}, {}), false);
		assert.strictEqual(helpers.shouldIncludeListTotal({includeTotal: true}, {hasCursor: true}), false);
	});

	it('applies endpoint list sort allowlists and caps', () => {
		const publicPostOptions = {
			sortBy: 'publishedAt',
			allowedSortBy: ['publishedAt', 'updatedAt', 'createdAt', 'id'],
			maxLimit: 100
		};

		assert.deepEqual(helpers.prepareListParams({
			sortBy: 'name',
			sortDir: 'asc',
			limit: '10000' as any,
			offset: '2' as any
		}, publicPostOptions), {
			sortBy: 'publishedAt',
			sortDir: 'ASC',
			limit: 100,
			offset: 2
		});

		const fileCatalogOptions = {
			sortBy: 'createdAt',
			allowedSortBy: ['createdAt', 'id', 'position', 'name'],
			maxLimit: 200
		};

		assert.deepEqual(helpers.prepareListParams({
			sortBy: 'position',
			sortDir: 'desc',
			limit: '500' as any
		}, fileCatalogOptions), {
			sortBy: 'position',
			sortDir: 'DESC',
			limit: 200
		});

		const categoryManagementOptions = {
			sortBy: 'createdAt',
			allowedSortBy: ['createdAt', 'updatedAt', 'id', 'name'],
			maxLimit: 100
		};

		assert.deepEqual(helpers.prepareListParams({
			sortBy: 'unsafeColumn',
			sortDir: 'asc',
			limit: '250' as any
		}, categoryManagementOptions), {
			sortBy: 'createdAt',
			sortDir: 'ASC',
			limit: 100
		});

		const userUtilityOptions = {
			sortBy: 'createdAt',
			allowedSortBy: ['createdAt', 'updatedAt', 'id'],
			maxLimit: 100
		};

		assert.deepEqual(helpers.prepareListParams({
			sortBy: 'updatedAt',
			sortDir: 'desc',
			limit: '1000' as any
		}, userUtilityOptions), {
			sortBy: 'updatedAt',
			sortDir: 'DESC',
			limit: 100
		});

		const inviteOptions = {
			sortBy: 'createdAt',
			allowedSortBy: ['createdAt', 'updatedAt', 'id', 'title', 'code', 'isActive'],
			maxLimit: 100
		};

		assert.deepEqual(helpers.prepareListParams({
			sortBy: 'permissions',
			sortDir: 'asc',
			limit: '500' as any
		}, inviteOptions), {
			sortBy: 'createdAt',
			sortDir: 'ASC',
			limit: 100
		});

		const apiKeyOptions = {
			sortBy: 'createdAt',
			allowedSortBy: ['createdAt', 'updatedAt', 'id', 'title', 'expiredOn', 'isDisabled'],
			maxLimit: 100
		};

		assert.deepEqual(helpers.prepareListParams({
			sortBy: 'permissions',
			sortDir: 'desc',
			limit: '500' as any
		}, apiKeyOptions), {
			sortBy: 'createdAt',
			sortDir: 'DESC',
			limit: 100
		});

		const adminDirectoryOptions = {
			sortBy: 'createdAt',
			allowedSortBy: ['createdAt', 'updatedAt', 'id', 'name', 'email', 'storageAccountId'],
			maxLimit: 100
		};

		assert.deepEqual(helpers.prepareListParams({
			sortBy: 'passwordHash',
			sortDir: 'asc',
			limit: '500' as any
		}, adminDirectoryOptions), {
			sortBy: 'createdAt',
			sortDir: 'ASC',
			limit: 100
		});

		const userGroupOptions = {
			sortBy: 'createdAt',
			allowedSortBy: ['createdAt', 'updatedAt', 'id', 'name', 'title', 'type'],
			maxLimit: 100
		};

		assert.deepEqual(helpers.prepareListParams({
			sortBy: 'isDeleted',
			sortDir: 'desc',
			limit: '500' as any
		}, userGroupOptions), {
			sortBy: 'createdAt',
			sortDir: 'DESC',
			limit: 100
		});

		const userFriendOptions = {
			sortBy: 'createdAt',
			allowedSortBy: ['createdAt', 'updatedAt', 'id', 'name', 'email', 'storageAccountId'],
			maxLimit: 100
		};

		assert.deepEqual(helpers.prepareListParams({
			sortBy: 'passwordHash',
			sortDir: 'desc',
			limit: '500' as any
		}, userFriendOptions), {
			sortBy: 'createdAt',
			sortDir: 'DESC',
			limit: 100
		});

		const autoActionOptions = {
			sortBy: 'createdAt',
			allowedSortBy: ['createdAt', 'updatedAt', 'id', 'moduleName', 'funcName', 'executeOn', 'isActive'],
			maxLimit: 100
		};

		assert.deepEqual(helpers.prepareListParams({
			sortBy: 'funcArgsEncrypted',
			sortDir: 'asc',
			limit: '500' as any
		}, autoActionOptions), {
			sortBy: 'createdAt',
			sortDir: 'ASC',
			limit: 100
		});
	});

	it('sanitizes allowlisted where params before they reach Sequelize queries', () => {
		const autoActionWhereOptions = {
			moduleName: 'string',
			funcName: 'string',
			isActive: 'boolean'
		} as const;

		assert.deepEqual(helpers.prepareWhereParams({
			moduleName: 'contentBot',
			funcName: ['unsafe'],
			isActive: 'false',
			unsafeWhereKey: 'ignored'
		}, autoActionWhereOptions), {
			moduleName: 'contentBot',
			isActive: false
		});

		assert.deepEqual(helpers.prepareWhereParams({
			moduleName: {unsafe: true},
			funcName: 'run',
			isActive: 'maybe'
		}, autoActionWhereOptions), {
			funcName: 'run'
		});
	});
});
