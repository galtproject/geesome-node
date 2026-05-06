import assert from "assert";
import registerAutoActionsApi from "../app/modules/autoActions/api.js";
import registerSocNetAccountApi from "../app/modules/socNetAccount/api.js";
import registerTelegramClientApi from "../app/modules/telegramClient/api.js";
import registerTwitterClientApi from "../app/modules/twitterClient/api.js";
import IGeesomeAutoActionsModule from "../app/modules/autoActions/interface.js";
import IGeesomeSocNetAccount from "../app/modules/socNetAccount/interface.js";

function createApiHarness(registerApi, moduleInstance) {
	const routes = {};
	const api = {
		onAuthorizedPost: (path, handler) => {
			routes[`POST ${path}`] = handler;
		},
		onAuthorizedGet: (path, handler) => {
			routes[`GET ${path}`] = handler;
		},
		prefix: (prefix) => ({
			onAuthorizedPost: (path, handler) => {
				routes[`POST ${prefix}${path}`] = handler;
			},
			onAuthorizedGet: (path, handler) => {
				routes[`GET ${prefix}${path}`] = handler;
			}
		})
	};
	const app = {ms: {api}};
	registerApi(app as any, moduleInstance);

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

describe("security-sensitive api response shapes", function () {
	it("keeps auto action function args write-only in user API responses", async () => {
		const action = {
			id: 1,
			userId: 1,
			moduleName: "telegramClient",
			funcName: "runChannelImport",
			funcArgs: "{\"sessionKey\":\"telegram-session\"}",
			funcArgsEncrypted: "encrypted-telegram-session",
			isEncrypted: true,
			nextActions: [{
				id: 2,
				funcArgs: "{\"apiKey\":\"nested-secret\"}",
				funcArgsEncrypted: "encrypted-nested-secret",
				isEncrypted: true
			}]
		};
		const {call} = createApiHarness(registerAutoActionsApi, {
			addSerialAutoActions: async () => [{...action}],
			getUserActions: async () => ({list: [{...action}]}),
			updateAutoAction: async () => ({...action})
		} as Partial<IGeesomeAutoActionsModule> as IGeesomeAutoActionsModule);

		const created = await call("POST", "user/add-serial-auto-actions");
		assert.equal(created[0].funcArgs, undefined);
		assert.equal(created[0].funcArgsEncrypted, undefined);
		assert.equal(created[0].nextActions[0].funcArgs, undefined);
		assert.equal(created[0].nextActions[0].funcArgsEncrypted, undefined);

		const listed = await call("GET", "user/get-auto-actions");
		assert.equal(listed.list[0].funcArgs, undefined);
		assert.equal(listed.list[0].funcArgsEncrypted, undefined);

		const updated = await call("POST", "user/update-auto-action/:id", {params: {id: 1}});
		assert.equal(updated.funcArgs, undefined);
		assert.equal(updated.funcArgsEncrypted, undefined);
	});

	it("keeps social account credentials write-only in account API responses", async () => {
		const account = {
			id: 1,
			userId: 1,
			socNet: "telegram",
			username: "alice",
			apiId: "public-api-id",
			apiKey: "telegram-api-key",
			accessToken: "twitter-access-token",
			sessionKey: "telegram-session",
			isEncrypted: true
		};
		const {call} = createApiHarness(registerSocNetAccountApi, {
			getAccount: async () => ({...account}),
			getAccountList: async () => [{...account}],
			createOrUpdateAccount: async () => ({...account})
		} as Partial<IGeesomeSocNetAccount> as IGeesomeSocNetAccount);

		const returnedAccount = await call("POST", "soc-net-account/get", {body: {socNet: "telegram", accountData: {id: 1}}});
		assert.equal(returnedAccount.apiKey, undefined);
		assert.equal(returnedAccount.accessToken, undefined);
		assert.equal(returnedAccount.sessionKey, undefined);
		assert.equal(returnedAccount.hasApiKey, true);
		assert.equal(returnedAccount.hasAccessToken, true);
		assert.equal(returnedAccount.hasSessionKey, true);
		assert.equal(returnedAccount.apiId, "public-api-id");

		const listed = await call("POST", "soc-net-account/list");
		assert.equal(listed[0].apiKey, undefined);
		assert.equal(listed[0].accessToken, undefined);
		assert.equal(listed[0].sessionKey, undefined);

		const updated = await call("POST", "soc-net-account/update");
		assert.equal(updated.apiKey, undefined);
		assert.equal(updated.accessToken, undefined);
		assert.equal(updated.sessionKey, undefined);
	});

	it("keeps Telegram login credentials write-only in API responses", async () => {
		const account = {
			id: 1,
			apiKey: "telegram-api-key",
			accessToken: "telegram-access-token",
			sessionKey: "telegram-session",
			isEncrypted: true
		};
		const {call} = createApiHarness(registerTelegramClientApi, {
			login: async () => ({
				result: {
					response: {id: 10, username: "alice"},
					sessionKey: "telegram-session",
					account
				}
			}),
			getMeByUserId: async () => ({result: {username: "alice", firstName: "Alice", lastName: "Doe"}}),
			createOrUpdateAccount: async () => ({...account}),
			getUserInfoByUserId: async () => ({result: {id: 10}}),
			getUserChannelsByUserId: async () => ({result: []}),
			getChannelInfoByUserId: async () => ({result: {id: 1}}),
			runChannelImport: async () => ({result: {asyncOperation: {id: 1}}})
		} as any);

		const loginResult = await call("POST", "soc-net/telegram/login");
		assert.equal(loginResult.sessionKey, undefined);
		assert.equal(loginResult.account.apiKey, undefined);
		assert.equal(loginResult.account.accessToken, undefined);
		assert.equal(loginResult.account.sessionKey, undefined);
		assert.equal(loginResult.account.hasApiKey, true);
		assert.equal(loginResult.account.hasAccessToken, true);
		assert.equal(loginResult.account.hasSessionKey, true);

		const updatedAccount = await call("POST", "soc-net/telegram/update-account", {body: {accountData: {id: 1}}});
		assert.equal(updatedAccount.apiKey, undefined);
		assert.equal(updatedAccount.accessToken, undefined);
		assert.equal(updatedAccount.sessionKey, undefined);
	});

	it("keeps Twitter login credentials write-only in API responses", async () => {
		const {call} = createApiHarness(registerTwitterClientApi, {
			login: async () => ({
				response: {id: 10, username: "alice"},
				apiKey: "twitter-api-key",
				sessionKey: "twitter-session",
				account: {
					id: 1,
					apiKey: "stored-api-key",
					accessToken: "stored-access-token",
					sessionKey: "stored-session",
					isEncrypted: true
				}
			}),
			getMeByUserId: async () => ({id: 10}),
			getUserInfoByUserId: async () => ({id: 11}),
			getUserChannelsByUserId: async () => [],
			getChannelInfoByUserId: async () => ({id: 1}),
			runChannelImport: async () => ({result: {asyncOperation: {id: 1}}})
		} as any);

		const loginResult = await call("POST", "soc-net/twitter/login");
		assert.equal(loginResult.apiKey, undefined);
		assert.equal(loginResult.sessionKey, undefined);
		assert.equal(loginResult.account.apiKey, undefined);
		assert.equal(loginResult.account.accessToken, undefined);
		assert.equal(loginResult.account.sessionKey, undefined);
		assert.equal(loginResult.account.hasApiKey, true);
		assert.equal(loginResult.account.hasAccessToken, true);
		assert.equal(loginResult.account.hasSessionKey, true);
	});
});
