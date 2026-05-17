import assert from "assert";
import registerCoreApi from "../app/modules/api/api.js";
import {CorePermissionName} from "../app/modules/database/interface.js";

function createCoreApiHarness(appOverrides: any = {}) {
	const routes = {};
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
		handleAuthResult: async () => null,
		setStorageHeaders: () => null,
	};
	const app = {
		ms: {
			database: {},
			communicator: {},
			storage: {},
		},
		isAdminCan: async () => false,
		...appOverrides,
	};

	registerCoreApi(app as any, module as any);

	return {
		async call(method, path, req: any = {}) {
			const route = routes[`${method} ${path}`];
			assert.ok(route, `${method} ${path} route should be registered`);

			let responseBody;
			let responseStatus;
			await route({
				user: {id: 1},
				body: {},
				params: {},
				query: {},
				...req,
			}, {
				send: (body, status) => {
					responseBody = body;
					responseStatus = status;
				},
			});

			return {body: responseBody, status: responseStatus};
		},
	};
}

describe("storage space admin API", function () {
	it("requires admin read permission before reading storage-space aggregates", async () => {
		let databaseCalled = false;
		const {call} = createCoreApiHarness({
			ms: {
				database: {
					getStorageSpaceOverview: async () => {
						databaseCalled = true;
						return {};
					},
				},
				communicator: {},
				storage: {},
			},
			isAdminCan: async () => false,
		});

		const response = await call("GET", "admin/storage-space/overview", {user: {id: 7}});

		assert.equal(response.body, 403);
		assert.equal(databaseCalled, false);
	});

	it("exposes storage-space aggregate helpers through admin read routes", async () => {
		const permissionChecks = [];
		const databaseCalls = [];
		const query = {limit: "5", offset: "10"};
		const responses = {
			overview: {logicalContentBytes: 100, physicalContentBytes: 60},
			typeBreakdown: [{mimeType: "image/png", logicalBytes: 40}],
			topContents: [{id: 1, size: 30}],
			topFileCatalogItems: [{id: 2, size: 20}],
			topGroups: [{id: 3, size: 10}],
		};
		const {call} = createCoreApiHarness({
			ms: {
				database: {
					getStorageSpaceOverview: async () => {
						databaseCalls.push(["overview"]);
						return responses.overview;
					},
					getStorageSpaceTypeBreakdown: async (listParams) => {
						databaseCalls.push(["typeBreakdown", listParams]);
						return responses.typeBreakdown;
					},
					getStorageSpaceTopContents: async (listParams) => {
						databaseCalls.push(["topContents", listParams]);
						return responses.topContents;
					},
					getStorageSpaceTopFileCatalogItems: async (listParams) => {
						databaseCalls.push(["topFileCatalogItems", listParams]);
						return responses.topFileCatalogItems;
					},
					getStorageSpaceTopGroups: async (listParams) => {
						databaseCalls.push(["topGroups", listParams]);
						return responses.topGroups;
					},
				},
				communicator: {},
				storage: {},
			},
			isAdminCan: async (...args) => {
				permissionChecks.push(args);
				return true;
			},
		});

		assert.deepEqual((await call("GET", "admin/storage-space/overview", {user: {id: 7}})).body, responses.overview);
		assert.deepEqual((await call("GET", "admin/storage-space/type-breakdown", {user: {id: 7}, query})).body, responses.typeBreakdown);
		assert.deepEqual((await call("GET", "admin/storage-space/top-contents", {user: {id: 7}, query})).body, responses.topContents);
		assert.deepEqual((await call("GET", "admin/storage-space/top-file-catalog-items", {user: {id: 7}, query})).body, responses.topFileCatalogItems);
		assert.deepEqual((await call("GET", "admin/storage-space/top-groups", {user: {id: 7}, query})).body, responses.topGroups);

		assert.deepEqual(permissionChecks, [
			[7, CorePermissionName.AdminRead],
			[7, CorePermissionName.AdminRead],
			[7, CorePermissionName.AdminRead],
			[7, CorePermissionName.AdminRead],
			[7, CorePermissionName.AdminRead],
		]);
		assert.deepEqual(databaseCalls, [
			["overview"],
			["typeBreakdown", query],
			["topContents", query],
			["topFileCatalogItems", query],
			["topGroups", query],
		]);
	});
});
