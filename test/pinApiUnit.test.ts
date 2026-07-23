import assert from "assert";
import registerPinApi from "../app/modules/pin/api.js";
import IGeesomePinModule from "../app/modules/pin/interface.js";

function createPinApiHarness(pinModule: Partial<IGeesomePinModule>) {
	const routes = {};
	const app = {
		ms: {
			api: {
				onAuthorizedPost: (path, handler) => {
					routes[`POST ${path}`] = handler;
				},
				onAuthorizedGet: (path, handler) => {
					routes[`GET ${path}`] = handler;
				}
			}
		}
	};

	registerPinApi(app as any, pinModule as IGeesomePinModule);

	return {
		async call(method, path, req = {}) {
			let responseBody;
			await routes[`${method} ${path}`]({
				user: {id: 1},
				body: {},
				params: {},
				query: {},
				...req
			}, {
				send: (body) => {
					responseBody = body;
				}
			});
			return responseBody;
		}
	};
}

describe("pin api", function () {
	it("keeps pin account secrets write-only in API responses", async () => {
		let userAccountListParams;
		let groupAccountListParams;
		const secretAccount = {
			id: 1,
			userId: 1,
			name: "pinata",
			service: "pinata",
			apiKey: "pinata-key",
			secretApiKey: "pinata-secret",
			secretApiKeyEncrypted: "encrypted-pinata-secret",
			isEncrypted: true,
			options: JSON.stringify({autoPin: {enabled: true}})
		};
		const {call} = createPinApiHarness({
			createAccount: async () => ({...secretAccount}),
			updateAccount: async () => ({...secretAccount, apiKey: "updated-key"}),
			getUserAccountsList: async (userId, listParams) => {
				userAccountListParams = listParams;
				return [{...secretAccount}];
			},
			getGroupAccountsList: async (userId, groupId, listParams) => {
				groupAccountListParams = listParams;
				return [{...secretAccount, groupId: 10}];
			},
			deleteAccount: async () => ({success: true})
		});

		const created = await call("POST", "user/pin/create-account");
		assert.equal(created.secretApiKey, undefined);
		assert.equal(created.secretApiKeyEncrypted, undefined);
		assert.equal(created.apiKey, "pinata-key");
		assert.deepEqual(created.options, {autoPin: {enabled: true}});

		const updated = await call("POST", "user/pin/update-account/:id", {params: {id: 1}});
		assert.equal(updated.secretApiKey, undefined);
		assert.equal(updated.secretApiKeyEncrypted, undefined);
		assert.equal(updated.apiKey, "updated-key");

		const userAccounts = await call("GET", "user/pin/user-accounts", {
			query: {limit: "7", sortBy: "name"}
		});
		assert.equal(userAccounts.list[0].secretApiKey, undefined);
		assert.equal(userAccounts.list[0].secretApiKeyEncrypted, undefined);
		assert.deepEqual(userAccounts.list[0].options, {autoPin: {enabled: true}});
		assert.deepEqual(userAccountListParams, {limit: "7", sortBy: "name"});

		const groupAccounts = await call("GET", "user/pin/group-accounts/:groupId", {
			params: {groupId: 10},
			query: {offset: "3", sortDir: "ASC"}
		});
		assert.equal(groupAccounts.list[0].secretApiKey, undefined);
		assert.equal(groupAccounts.list[0].secretApiKeyEncrypted, undefined);
		assert.deepEqual(groupAccountListParams, {offset: "3", sortDir: "ASC"});

		assert.deepEqual(await call("POST", "user/pin/delete-account/:id", {params: {id: 1}}), {success: true});
	});

	it('forwards account health, credential tests, and bounded reconciliation to the pin module', async () => {
		const calls = [];
		const {call} = createPinApiHarness({
			testAccountCredentials: async (userId, id) => {
				calls.push(['credentials', userId, id]);
				return {ok: true, service: 'pinata', checkedAt: new Date(1000)};
			},
			getAccountHealth: async (userId, id, options) => {
				calls.push(['health', userId, id, options]);
				return {accountId: 4, totalCount: 0, statusCounts: {}, dueReconciliationCount: 0, activeClaimCount: 0, recent: []};
			},
			queueAccountReconciliation: async (userId, id, options) => {
				calls.push(['reconcile', userId, id, options]);
				return {queued: 1, accountId: 4};
			}
		});

		const credentialResult = await call('POST', 'user/pin/account/:id/test-credentials', {
			params: {id: 4}
		});
		const healthResult = await call('GET', 'user/pin/account/:id/health', {
			params: {id: 4},
			query: {historyLimit: '7'}
		});
		const reconcileResult = await call('POST', 'user/pin/account/:id/reconcile', {
			params: {id: 4},
			body: {storageId: 'bafy-test'}
		});

		assert.equal(credentialResult.ok, true);
		assert.equal(healthResult.accountId, 4);
		assert.deepEqual(reconcileResult, {queued: 1, accountId: 4});
		assert.deepEqual(calls, [
			['credentials', 1, 4],
			['health', 1, 4, {historyLimit: '7'}],
			['reconcile', 1, 4, {storageId: 'bafy-test'}]
		]);
	});
});
