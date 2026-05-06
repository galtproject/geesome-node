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
		const secretAccount = {
			id: 1,
			userId: 1,
			name: "pinata",
			service: "pinata",
			apiKey: "pinata-key",
			secretApiKey: "pinata-secret",
			secretApiKeyEncrypted: "encrypted-pinata-secret",
			isEncrypted: true
		};
		const {call} = createPinApiHarness({
			createAccount: async () => ({...secretAccount}),
			updateAccount: async () => ({...secretAccount, apiKey: "updated-key"}),
			getUserAccountsList: async () => [{...secretAccount}],
			getGroupAccountsList: async () => [{...secretAccount, groupId: 10}],
			deleteAccount: async () => ({success: true})
		});

		const created = await call("POST", "user/pin/create-account");
		assert.equal(created.secretApiKey, undefined);
		assert.equal(created.secretApiKeyEncrypted, undefined);
		assert.equal(created.apiKey, "pinata-key");

		const updated = await call("POST", "user/pin/update-account/:id", {params: {id: 1}});
		assert.equal(updated.secretApiKey, undefined);
		assert.equal(updated.secretApiKeyEncrypted, undefined);
		assert.equal(updated.apiKey, "updated-key");

		const userAccounts = await call("GET", "user/pin/user-accounts");
		assert.equal(userAccounts.list[0].secretApiKey, undefined);
		assert.equal(userAccounts.list[0].secretApiKeyEncrypted, undefined);

		const groupAccounts = await call("GET", "user/pin/group-accounts/:groupId", {params: {groupId: 10}});
		assert.equal(groupAccounts.list[0].secretApiKey, undefined);
		assert.equal(groupAccounts.list[0].secretApiKeyEncrypted, undefined);

		assert.deepEqual(await call("POST", "user/pin/delete-account/:id", {params: {id: 1}}), {success: true});
	});
});
