import assert from "assert";
import registerCoreApi from "../app/modules/api/api.js";
import registerStorageSpaceApi from "../app/modules/storageSpace/api.js";
import * as storageSpaceQueries from "../app/modules/storageSpace/queryHelpers.js";
import {inspectStorageSpaceAvailabilityNetworkSignal} from "../app/modules/storageSpace/storageInspectionHelpers.js";
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
			storageSpace: {},
			communicator: {},
			storage: {},
		},
		isAdminCan: async () => false,
		...appOverrides,
	};

	app.ms.api = module;
	registerCoreApi(app as any, module as any);
	registerStorageSpaceApi(app as any, app.ms.storageSpace as any);

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
				apiKey: {id: 11},
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
		let storageSpaceCalled = false;
		const {call} = createCoreApiHarness({
			ms: {
				storageSpace: {
					getStorageSpaceOverview: async () => {
						storageSpaceCalled = true;
						return {};
					},
					getStorageSpaceTypeBreakdown: async () => {
						storageSpaceCalled = true;
						return {};
					},
					getStorageSpaceTopContents: async () => {
						storageSpaceCalled = true;
						return {};
					},
					getStorageSpaceTopFileCatalogItems: async () => {
						storageSpaceCalled = true;
						return {};
					},
					getStorageSpaceFileCatalogFolders: async () => {
						storageSpaceCalled = true;
						return {};
					},
					getStorageSpaceTopGroups: async () => {
						storageSpaceCalled = true;
						return {};
					},
					getStorageSpaceGroupPosts: async () => {
						storageSpaceCalled = true;
						return {};
					},
					getStorageSpaceGeneratedOutputs: async () => {
						storageSpaceCalled = true;
						return {};
					},
					getStorageSpaceSharedStorageIds: async () => {
						storageSpaceCalled = true;
						return {};
					},
					getStorageSpacePinnedStorageObjects: async () => {
						storageSpaceCalled = true;
						return {};
					},
					getStorageSpacePreviewStorage: async () => {
						storageSpaceCalled = true;
						return {};
					},
					getStorageSpaceAvailabilitySignals: async () => {
						storageSpaceCalled = true;
						return {};
					},
					inspectStorageSpaceAvailabilityNetworkSignals: async () => {
						storageSpaceCalled = true;
						return {};
					},
					getStorageSpaceCleanupBlockers: async () => {
						storageSpaceCalled = true;
						return {};
					},
					getStorageObjectRemovalHistory: async () => {
						storageSpaceCalled = true;
						return {};
					},
					getStorageSpaceGeneratedOutputUnknownRefs: async () => {
						storageSpaceCalled = true;
						return {};
					},
					inspectStorageSpaceGeneratedOutputRefs: async () => {
						storageSpaceCalled = true;
						return {};
					},
					reconcileStorageSpaceGeneratedOutputRefs: async () => {
						storageSpaceCalled = true;
						return {};
					},
					inspectStorageSpaceGeneratedOutputChildRefs: async () => {
						storageSpaceCalled = true;
						return {};
					},
					reconcileStorageSpaceGeneratedOutputChildRefs: async () => {
						storageSpaceCalled = true;
						return {};
					},
					getLatestStorageSpaceSnapshot: async () => {
						storageSpaceCalled = true;
						return {};
					},
					refreshStorageSpaceSnapshot: async () => {
						storageSpaceCalled = true;
						return {};
					},
					queueStorageSpaceSnapshotRefresh: async () => {
						storageSpaceCalled = true;
						return {};
					},
				},
				database: {},
				communicator: {},
				storage: {},
			},
			isAdminCan: async () => false,
		});

		const routes = [
			["GET", "admin/storage-space/overview"],
			["GET", "admin/storage-space/type-breakdown"],
			["GET", "admin/storage-space/top-contents"],
			["GET", "admin/storage-space/top-file-catalog-items"],
			["GET", "admin/storage-space/file-catalog-folders"],
			["GET", "admin/storage-space/top-groups"],
			["GET", "admin/storage-space/group-posts"],
			["GET", "admin/storage-space/generated-outputs"],
			["GET", "admin/storage-space/shared-storage-ids"],
			["GET", "admin/storage-space/pinned-storage-objects"],
			["GET", "admin/storage-space/preview-storage"],
			["GET", "admin/storage-space/availability-signals"],
			["GET", "admin/storage-space/availability-network-inspection"],
			["GET", "admin/storage-space/cleanup-blockers"],
			["GET", "admin/storage-space/storage-removals"],
			["GET", "admin/storage-space/generated-output-inspection"],
			["POST", "admin/storage-space/generated-output-reconcile"],
			["GET", "admin/storage-space/generated-output-child-inspection"],
			["POST", "admin/storage-space/generated-output-child-reconcile"],
			["GET", "admin/storage-space/snapshot"],
			["POST", "admin/storage-space/snapshot/refresh"],
			["POST", "admin/storage-space/snapshot/refresh-async"],
		];

		for (const [method, path] of routes) {
			const response = await call(method, path, {user: {id: 7}});
			assert.equal(response.body, 403);
		}
		assert.equal(storageSpaceCalled, false);
	});

	it("exposes storage-space aggregate helpers through admin read routes", async () => {
		const permissionChecks = [];
		const storageSpaceCalls = [];
		const query = {limit: "5", offset: "10"};
		const responses = {
			overview: {logicalContentBytes: 100, physicalContentBytes: 60},
			typeBreakdown: [{mimeType: "image/png", logicalBytes: 40}],
			topContents: [{id: 1, size: 30}],
			topFileCatalogItems: [{id: 2, size: 20}],
			fileCatalogFolders: [{id: 8, logicalBytes: 15}],
			topGroups: [{id: 3, size: 10}],
			groupPosts: [{id: 9, logicalBytes: 9}],
			generatedOutputs: [{source: "staticSite.storageId", knownPhysicalBytes: 33}],
			sharedStorageIds: [{storageId: "bafy-shared", contentRowsCount: 2}],
			pinnedStorageObjects: [{storageId: "bafy-pinned", physicalBytes: 44}],
			previewStorage: [{previewField: "smallPreviewStorageId", physicalPreviewBytes: 12}],
			availabilitySignals: [{storageId: "bafy-signal", maxPeerCount: 7}],
			availabilityNetworkInspection: [{storageId: "bafy-signal", providersCount: 2, retrievalStatOk: true}],
			cleanupBlockers: [{id: 1, blockerCount: 2}],
			storageRemovals: [{queueId: 12, storageId: "bafy-remove", status: "blocked"}],
			generatedOutputInspection: [{source: "staticSite.storageId", storageId: "bafy-site", measuredBytes: 123}],
			generatedOutputReconcile: {inspected: 1, reconciled: 1, failed: 0, skipped: 0},
			generatedOutputChildInspection: [{source: "staticSite.storageId", storageId: "bafy-site", childrenCount: 1}],
			generatedOutputChildReconcile: {inspectedParents: 1, inspectedChildren: 1, reconciled: 1, skipped: 0},
			snapshot: {id: 4, listLimit: 20},
			refreshedSnapshot: {id: 5, listLimit: 5},
			queuedSnapshot: {id: 6, module: "storage-space-snapshot"},
		};
		const {call} = createCoreApiHarness({
			ms: {
				storageSpace: {
					getStorageSpaceOverview: async () => {
						storageSpaceCalls.push(["overview"]);
						return responses.overview;
					},
					getStorageSpaceTypeBreakdown: async (listParams) => {
						storageSpaceCalls.push(["typeBreakdown", listParams]);
						return responses.typeBreakdown;
					},
					getStorageSpaceTopContents: async (listParams) => {
						storageSpaceCalls.push(["topContents", listParams]);
						return responses.topContents;
					},
					getStorageSpaceTopFileCatalogItems: async (listParams) => {
						storageSpaceCalls.push(["topFileCatalogItems", listParams]);
						return responses.topFileCatalogItems;
					},
					getStorageSpaceFileCatalogFolders: async (listParams) => {
						storageSpaceCalls.push(["fileCatalogFolders", listParams]);
						return responses.fileCatalogFolders;
					},
					getStorageSpaceTopGroups: async (listParams) => {
						storageSpaceCalls.push(["topGroups", listParams]);
						return responses.topGroups;
					},
					getStorageSpaceGroupPosts: async (listParams) => {
						storageSpaceCalls.push(["groupPosts", listParams]);
						return responses.groupPosts;
					},
					getStorageSpaceGeneratedOutputs: async (listParams) => {
						storageSpaceCalls.push(["generatedOutputs", listParams]);
						return responses.generatedOutputs;
					},
					getStorageSpaceSharedStorageIds: async (listParams) => {
						storageSpaceCalls.push(["sharedStorageIds", listParams]);
						return responses.sharedStorageIds;
					},
					getStorageSpacePinnedStorageObjects: async (listParams) => {
						storageSpaceCalls.push(["pinnedStorageObjects", listParams]);
						return responses.pinnedStorageObjects;
					},
					getStorageSpacePreviewStorage: async (listParams) => {
						storageSpaceCalls.push(["previewStorage", listParams]);
						return responses.previewStorage;
					},
					getStorageSpaceAvailabilitySignals: async (listParams) => {
						storageSpaceCalls.push(["availabilitySignals", listParams]);
						return responses.availabilitySignals;
					},
					inspectStorageSpaceAvailabilityNetworkSignals: async (listParams) => {
						storageSpaceCalls.push(["availabilityNetworkInspection", listParams]);
						return responses.availabilityNetworkInspection;
					},
					getStorageSpaceCleanupBlockers: async (listParams) => {
						storageSpaceCalls.push(["cleanupBlockers", listParams]);
						return responses.cleanupBlockers;
					},
					getStorageObjectRemovalHistory: async (listParams) => {
						storageSpaceCalls.push(["storageRemovals", listParams]);
						return responses.storageRemovals;
					},
					getStorageSpaceGeneratedOutputUnknownRefs: async (listParams) => {
						storageSpaceCalls.push(["generatedOutputUnknownRefs", listParams]);
						return [];
					},
					inspectStorageSpaceGeneratedOutputRefs: async (listParams) => {
						storageSpaceCalls.push(["generatedOutputInspection", listParams]);
						return responses.generatedOutputInspection;
					},
					reconcileStorageSpaceGeneratedOutputRefs: async (listParams) => {
						storageSpaceCalls.push(["generatedOutputReconcile", listParams]);
						return responses.generatedOutputReconcile;
					},
					inspectStorageSpaceGeneratedOutputChildRefs: async (listParams) => {
						storageSpaceCalls.push(["generatedOutputChildInspection", listParams]);
						return responses.generatedOutputChildInspection;
					},
					reconcileStorageSpaceGeneratedOutputChildRefs: async (listParams) => {
						storageSpaceCalls.push(["generatedOutputChildReconcile", listParams]);
						return responses.generatedOutputChildReconcile;
					},
					getLatestStorageSpaceSnapshot: async () => {
						storageSpaceCalls.push(["snapshot"]);
						return responses.snapshot;
					},
					refreshStorageSpaceSnapshot: async (...args) => {
						storageSpaceCalls.push(["refreshSnapshot", ...args]);
						return responses.refreshedSnapshot;
					},
					queueStorageSpaceSnapshotRefresh: async (...args) => {
						storageSpaceCalls.push(["queueSnapshot", ...args]);
						return responses.queuedSnapshot;
					},
				},
				database: {},
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
		assert.deepEqual((await call("GET", "admin/storage-space/file-catalog-folders", {user: {id: 7}, query: {...query, parentItemId: "8"}})).body, responses.fileCatalogFolders);
		assert.deepEqual((await call("GET", "admin/storage-space/top-groups", {user: {id: 7}, query})).body, responses.topGroups);
		assert.deepEqual((await call("GET", "admin/storage-space/group-posts", {user: {id: 7}, query: {...query, groupId: "3"}})).body, responses.groupPosts);
		assert.deepEqual((await call("GET", "admin/storage-space/generated-outputs", {user: {id: 7}, query})).body, responses.generatedOutputs);
		assert.deepEqual((await call("GET", "admin/storage-space/shared-storage-ids", {user: {id: 7}, query})).body, responses.sharedStorageIds);
		assert.deepEqual((await call("GET", "admin/storage-space/pinned-storage-objects", {user: {id: 7}, query})).body, responses.pinnedStorageObjects);
		assert.deepEqual((await call("GET", "admin/storage-space/preview-storage", {user: {id: 7}, query})).body, responses.previewStorage);
		assert.deepEqual((await call("GET", "admin/storage-space/availability-signals", {user: {id: 7}, query})).body, responses.availabilitySignals);
		assert.deepEqual((await call("GET", "admin/storage-space/availability-network-inspection", {user: {id: 7}, query: {...query, providerLimit: "2"}})).body, responses.availabilityNetworkInspection);
		assert.deepEqual((await call("GET", "admin/storage-space/cleanup-blockers", {user: {id: 7}, query: {...query, contentId: "1"}})).body, responses.cleanupBlockers);
		assert.deepEqual((await call("GET", "admin/storage-space/storage-removals", {user: {id: 7}, query: {...query, delayMs: "60000"}})).body, responses.storageRemovals);
		assert.deepEqual((await call("GET", "admin/storage-space/generated-output-inspection", {user: {id: 7}, query})).body, responses.generatedOutputInspection);
		assert.deepEqual((await call("POST", "admin/storage-space/generated-output-reconcile", {user: {id: 7}, body: query})).body, responses.generatedOutputReconcile);
		assert.deepEqual((await call("GET", "admin/storage-space/generated-output-child-inspection", {user: {id: 7}, query: {...query, childLimit: "3"}})).body, responses.generatedOutputChildInspection);
		assert.deepEqual((await call("POST", "admin/storage-space/generated-output-child-reconcile", {user: {id: 7}, body: {...query, childLimit: "3"}})).body, responses.generatedOutputChildReconcile);
		assert.deepEqual((await call("GET", "admin/storage-space/snapshot", {user: {id: 7}})).body, responses.snapshot);
		assert.deepEqual((await call("POST", "admin/storage-space/snapshot/refresh", {user: {id: 7}, body: query})).body, responses.refreshedSnapshot);
		assert.deepEqual((await call("POST", "admin/storage-space/snapshot/refresh-async", {user: {id: 7}, apiKey: {id: 12}, body: query})).body, responses.queuedSnapshot);

		assert.deepEqual(permissionChecks, [
			[7, CorePermissionName.AdminRead],
			[7, CorePermissionName.AdminRead],
			[7, CorePermissionName.AdminRead],
			[7, CorePermissionName.AdminRead],
			[7, CorePermissionName.AdminRead],
			[7, CorePermissionName.AdminRead],
			[7, CorePermissionName.AdminRead],
			[7, CorePermissionName.AdminRead],
			[7, CorePermissionName.AdminRead],
			[7, CorePermissionName.AdminRead],
			[7, CorePermissionName.AdminRead],
			[7, CorePermissionName.AdminRead],
			[7, CorePermissionName.AdminRead],
			[7, CorePermissionName.AdminRead],
			[7, CorePermissionName.AdminRead],
			[7, CorePermissionName.AdminRead],
			[7, CorePermissionName.AdminAll],
			[7, CorePermissionName.AdminRead],
			[7, CorePermissionName.AdminAll],
			[7, CorePermissionName.AdminRead],
			[7, CorePermissionName.AdminRead],
			[7, CorePermissionName.AdminRead],
		]);
		assert.deepEqual(storageSpaceCalls, [
			["overview"],
			["typeBreakdown", query],
			["topContents", query],
			["topFileCatalogItems", query],
			["fileCatalogFolders", {...query, parentItemId: "8"}],
			["topGroups", query],
			["groupPosts", {...query, groupId: "3"}],
			["generatedOutputs", query],
			["sharedStorageIds", query],
			["pinnedStorageObjects", query],
			["previewStorage", query],
			["availabilitySignals", query],
			["availabilityNetworkInspection", {...query, providerLimit: "2"}],
			["cleanupBlockers", {...query, contentId: "1"}],
			["storageRemovals", {...query, delayMs: "60000"}],
			["generatedOutputInspection", query],
			["generatedOutputReconcile", query],
			["generatedOutputChildInspection", {...query, childLimit: "3"}],
			["generatedOutputChildReconcile", {...query, childLimit: "3"}],
			["snapshot"],
			["refreshSnapshot", 7, query],
			["queueSnapshot", 7, 12, query],
		]);
	});
});

describe("storage space query helpers", function () {
	it("keeps remote pin refs optional when the pin model is absent", async () => {
		const capturedSql: string[] = [];
		const fakeSequelize = {
			models: {},
			query: async (sql) => {
				capturedSql.push(sql);
				return [];
			}
		};

		await storageSpaceQueries.getStorageSpaceOverview(fakeSequelize);
		await storageSpaceQueries.getStorageSpacePinnedStorageObjects(fakeSequelize, {limit: 1, offset: 0});
		await storageSpaceQueries.getStorageSpaceAvailabilitySignals(fakeSequelize, {limit: 1, offset: 0});

		assert.equal(capturedSql.join("\n").includes('"pinStorageObjects"'), false);
	});
});

describe("storage space network signal inspection", function () {
	it("normalizes provider lookup events and timed stat checks", async () => {
		const fakeStorage = {
			node: {
				routing: {
					findProvs: async function* (storageId, options) {
						assert.equal(storageId, "bafy-signal");
						assert.equal(options.numProviders, 2);
						yield {
							routing: "kubo-routing",
							providers: [{
								id: "peer-a",
								multiaddrs: ["/ip4/127.0.0.1/tcp/4001", "/ip4/127.0.0.1/tcp/4002"],
								protocols: ["transport-bitswap"],
							}],
						};
						yield {
							type: "provider",
							ID: "peer-b",
							Addrs: ["/ip4/127.0.0.2/tcp/4001"],
						};
					},
				},
			},
			getFileStat: async (storageId, options) => {
				assert.equal(storageId, "bafy-signal");
				assert.equal(options.attemptTimeout, 7000);
				assert.equal(options.withLocal, false);
				return {type: "file", cumulativeSize: "42"};
			},
		};
		const row = await inspectStorageSpaceAvailabilityNetworkSignal(fakeStorage as any, {
			storageId: "bafy-signal",
			physicalBytes: 40,
			contentRowsCount: 1,
			usersCount: 1,
			activeFileCatalogRefsCount: 0,
			groupPostRefsCount: 0,
			generatedOutputRefsCount: 0,
			localPinRefsCount: 0,
			remotePinsCount: 0,
			pinAccountsCount: 0,
			contentPeerRowsCount: 0,
			postPeerRowsCount: 0,
			groupPeerRowsCount: 0,
			maxContentPeersCount: 0,
			maxPostPeersCount: 0,
			maxGroupPeersCount: 0,
			maxPeerCount: 0,
			maxFullyPeerCount: 0,
			isPinned: false,
		}, {
			providerLimit: 2,
			providerAddressLimit: 1,
			providerTimeoutMs: 5000,
			statTimeoutMs: 7000,
			statWithLocal: false,
		});

		assert.equal(row.providerLookupOk, true);
		assert.equal(row.providersCount, 2);
		assert.equal(row.providersTruncated, true);
		assert.equal(row.providers[0].id, "peer-a");
		assert.deepEqual(row.providers[0].multiaddrs, ["/ip4/127.0.0.1/tcp/4001"]);
		assert.equal(row.providers[0].source, "kubo-routing");
		assert.equal(row.providers[1].id, "peer-b");
		assert.equal(row.retrievalStatOk, true);
		assert.equal(row.retrievalType, "file");
		assert.equal(row.retrievalMeasuredBytes, 42);
	});
});
