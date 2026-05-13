import assert from "assert";
import registerForeignAccountsApi from "../app/modules/foreignAccounts/api.js";
import IGeesomeForeignAccountsModule from "../app/modules/foreignAccounts/interface.js";

function createForeignAccountsApiHarness(foreignAccountsModule: Partial<IGeesomeForeignAccountsModule>) {
	const routes = {};
	const app = {
		isAdminCan: async () => false,
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

	registerForeignAccountsApi(app as any, foreignAccountsModule as IGeesomeForeignAccountsModule);

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

describe("foreign accounts api", function () {
	it("passes list query params to the user account list module method", async () => {
		let gotListParams;
		const {call} = createForeignAccountsApiHarness({
			getUserAccountsList: async (userId, listParams) => {
				gotListParams = listParams;
				return [{
					id: 1,
					userId,
					provider: "ethereum",
					address: "0xabc"
				}];
			}
		});

		const accounts = await call("GET", "user/get-accounts", {
			query: {limit: "7", sortBy: "provider", sortDir: "ASC"}
		});

		assert.deepEqual(gotListParams, {limit: "7", sortBy: "provider", sortDir: "ASC"});
		assert.equal(accounts[0].provider, "ethereum");
	});
});
