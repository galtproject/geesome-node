import assert from 'node:assert';
import registerContentApi from '../app/modules/content/api.js';
import {CorePermissionName} from '../app/modules/database/interface.js';

function createContentApiHarness(contentModuleOverrides: any = {}, appOverrides: any = {}) {
	const routes = {};
	const permissionChecks = [];
	const module = {
		onGet: (path, handler) => {
			routes[`GET ${path}`] = handler;
		},
		onPost: (path, handler) => {
			routes[`POST ${path}`] = handler;
		},
		onAuthorizedGet: (path, handler) => {
			routes[`GET ${path}`] = handler;
		},
		onAuthorizedPost: (path, handler) => {
			routes[`POST ${path}`] = handler;
		},
		onHead: (path, handler) => {
			routes[`HEAD ${path}`] = handler;
		},
		onUnversionGet: (path, handler) => {
			routes[`GET ${path}`] = handler;
		},
		onUnversionHead: (path, handler) => {
			routes[`HEAD ${path}`] = handler;
		},
	};
	const app = {
		ms: {
			api: module,
		},
		checkUserCan: async (userId, permission) => {
			permissionChecks.push({userId, permission});
		},
		getUserByApiToken: async () => ({user: null, apiKey: null}),
		...appOverrides,
	};
	const contentModule = {
		getDeletedContentList: async () => null,
		getDeletedContentPurgeCandidates: async () => null,
		purgeDeletedContentTombstones: async () => null,
		restoreDeletedContent: async () => null,
		getPublicContentMetadata: async () => null,
		...contentModuleOverrides,
	};

	registerContentApi(app as any, contentModule as any);

	return {
		permissionChecks,
		async call(method, path, req: any = {}) {
			const route = routes[`${method} ${path}`];
			assert.ok(route, `${method} ${path} route should be registered`);

			let responseBody;
			await route({
				user: {id: 7},
				apiKey: {id: 11},
				params: {},
				query: {},
				body: {},
				...req,
			}, {
				send: (body) => {
					responseBody = body;
				},
			});
			return responseBody;
		},
	};
}

describe('content admin API', function () {
	it('passes optional bearer owner id to public content metadata route', async () => {
		let contentCall;
		let tokenCall;
		const {call} = createContentApiHarness({
			getPublicContentMetadata: async (...args) => {
				contentCall = args;
				return {id: 42};
			},
		}, {
			getUserByApiToken: async (token) => {
				tokenCall = token;
				return {user: {id: 7}, apiKey: {id: 11, userId: 7}};
			},
		});

		const response = await call('GET', 'content/:contentId', {
			params: {contentId: '42'},
			token: 'valid-token',
		});

		assert.equal(tokenCall, 'valid-token');
		assert.deepEqual(contentCall, ['42', 7]);
		assert.deepEqual(response, {id: 42});
	});

	it('ignores invalid optional bearer tokens on public content metadata route', async () => {
		let contentCall;
		const {call} = createContentApiHarness({
			getPublicContentMetadata: async (...args) => {
				contentCall = args;
				return {storageId: 'public-storage'};
			},
		}, {
			getUserByApiToken: async () => {
				throw new Error('bad_token');
			},
		});

		const response = await call('GET', 'content/:contentId', {
			params: {contentId: 'public-storage'},
			token: 'invalid-token',
		});

		assert.deepEqual(contentCall, ['public-storage', null]);
		assert.deepEqual(response, {storageId: 'public-storage'});
	});

	it('requires AdminRead before listing deleted content tombstones', async () => {
		let contentCall;
		const {call, permissionChecks} = createContentApiHarness({
			getDeletedContentList: async (...args) => {
				contentCall = args;
				return {list: [], total: 0};
			},
		});
		const query = {search: 'storage-id', limit: '10'};

		const response = await call('GET', 'admin/deleted-content', {query});

		assert.deepEqual(permissionChecks, [{userId: 7, permission: CorePermissionName.AdminRead}]);
		assert.deepEqual(contentCall, [7, 'storage-id', query]);
		assert.deepEqual(response, {list: [], total: 0});
	});

	it('requires AdminRead before listing deleted content purge candidates', async () => {
		let contentCall;
		const {call, permissionChecks} = createContentApiHarness({
			getDeletedContentPurgeCandidates: async (...args) => {
				contentCall = args;
				return {list: [], total: 0, retentionDays: 30};
			},
		});
		const query = {retentionDays: '7', limit: '5'};

		const response = await call('GET', 'admin/deleted-content/purge-candidates', {query});

		assert.deepEqual(permissionChecks, [{userId: 7, permission: CorePermissionName.AdminRead}]);
		assert.deepEqual(contentCall, [7, query]);
		assert.deepEqual(response, {list: [], total: 0, retentionDays: 30});
	});

	it('requires AdminAll before purging deleted content tombstones', async () => {
		let contentCall;
		const {call, permissionChecks} = createContentApiHarness({
			purgeDeletedContentTombstones: async (...args) => {
				contentCall = args;
				return {list: [], purged: 1, skipped: 0, retentionDays: 30};
			},
		});
		const body = {retentionDays: 7, limit: 5};

		const response = await call('POST', 'admin/deleted-content/purge', {body});

		assert.deepEqual(permissionChecks, [{userId: 7, permission: CorePermissionName.AdminAll}]);
		assert.deepEqual(contentCall, [7, body]);
		assert.deepEqual(response, {list: [], purged: 1, skipped: 0, retentionDays: 30});
	});

	it('requires AdminAll before restoring a deleted content tombstone', async () => {
		let contentCall;
		const {call, permissionChecks} = createContentApiHarness({
			restoreDeletedContent: async (...args) => {
				contentCall = args;
				return {id: 42, isDeleted: false};
			},
		});

		const response = await call('POST', 'admin/content/:contentId/restore', {
			params: {contentId: '42'},
		});

		assert.deepEqual(permissionChecks, [{userId: 7, permission: CorePermissionName.AdminAll}]);
		assert.deepEqual(contentCall, [7, '42']);
		assert.deepEqual(response, {id: 42, isDeleted: false});
	});
});
