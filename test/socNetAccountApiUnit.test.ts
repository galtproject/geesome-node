import assert from "assert";
import registerSocNetAccountApi from "../app/modules/socNetAccount/api.js";
import IGeesomeSocNetAccount from "../app/modules/socNetAccount/interface.js";

function createSocNetAccountApiHarness(socNetAccountModule: Partial<IGeesomeSocNetAccount>) {
	const routes = {};
	const api = {
		prefix: (prefix) => ({
			onAuthorizedPost: (path, handler) => {
				routes[`POST ${prefix}${path}`] = handler;
			}
		})
	};
	const app = {ms: {api}};

	registerSocNetAccountApi(app as any, socNetAccountModule as IGeesomeSocNetAccount);

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

describe("social network accounts api", function () {
	it("passes list params and legacy accountData socNet filters to the module", async () => {
		let gotUserId;
		let gotSocNet;
		let gotListParams;
		const {call} = createSocNetAccountApiHarness({
			getAccountList: async (userId, socNet, listParams) => {
				gotUserId = userId;
				gotSocNet = socNet;
				gotListParams = listParams;
				return [{
					id: 1,
					userId,
					socNet,
					username: "alice",
					apiKey: "secret-api-key",
					accessToken: "secret-access-token",
					sessionKey: "secret-session-key"
				}];
			}
		});

		const accounts = await call("POST", "soc-net-account/list", {
			body: {
				accountData: {socNet: "telegram"},
				limit: "7",
				sortBy: "username",
				sortDir: "ASC"
			}
		});

		assert.equal(gotUserId, 1);
		assert.equal(gotSocNet, "telegram");
		assert.deepEqual(gotListParams, {
			accountData: {socNet: "telegram"},
			limit: "7",
			sortBy: "username",
			sortDir: "ASC"
		});
		assert.equal(accounts[0].apiKey, undefined);
		assert.equal(accounts[0].accessToken, undefined);
		assert.equal(accounts[0].sessionKey, undefined);
		assert.equal(accounts[0].hasApiKey, true);
		assert.equal(accounts[0].hasAccessToken, true);
		assert.equal(accounts[0].hasSessionKey, true);
	});
});
