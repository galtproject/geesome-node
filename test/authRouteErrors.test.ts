import assert from "assert";
import coreApi from "../app/modules/api/api.js";
import ethereumAuthorizationApi from "../app/modules/ethereumAuthorization/api.js";
import {IGeesomeApp} from "../app/interface.js";

describe("auth route errors", function () {
	it("keeps failed password login attempts out of stderr", async () => {
		const routes: any = {};
		const consoleErrors = await captureConsoleErrors(async () => {
			coreApi({
				loginPassword: async () => {
					throw new Error("invalid_password");
				}
			} as unknown as IGeesomeApp, {
				...getApiRouteStub(routes),
				handleAuthResult: async () => null
			} as any);

			const response = getResponseStub();
			await routes["POST login/password"]({
				body: {
					username: "alice",
					password: "wrong-password"
				}
			} as any, response);
			await flushAsyncHandlers();

			assert.deepEqual(response.sent, [[403]]);
		});

		assert.deepEqual(consoleErrors, []);
	});

	it("keeps failed signature login attempts out of stderr", async () => {
		const routes: any = {};
		const consoleErrors = await captureConsoleErrors(async () => {
			ethereumAuthorizationApi({
				ms: {
					api: {
						...getApiRouteStub(routes),
						handleAuthResult: async () => null
					}
				}
			} as unknown as IGeesomeApp, {
				generateUserAccountAuthMessage: async () => ({}),
				loginAuthMessage: async () => {
					throw new Error("not_valid");
				}
			} as any);

			const response = getResponseStub();
			await routes["POST login/auth-message"]({
				body: {
					authMessageId: 1,
					accountAddress: "0x0000000000000000000000000000000000000000",
					signature: "bad-signature"
				}
			} as any, response);
			await flushAsyncHandlers();

			assert.deepEqual(response.sent, [[403]]);
		});

		assert.deepEqual(consoleErrors, []);
	});
});

function getApiRouteStub(routes) {
	return {
		onGet: (route, handler) => {
			routes[`GET ${route}`] = handler;
		},
		onPost: (route, handler) => {
			routes[`POST ${route}`] = handler;
		},
		onAuthorizedGet: (route, handler) => {
			routes[`AUTHORIZED_GET ${route}`] = handler;
		},
		onAuthorizedPost: (route, handler) => {
			routes[`AUTHORIZED_POST ${route}`] = handler;
		},
		setStorageHeaders: () => null
	};
}

function getResponseStub() {
	return {
		sent: [] as any[],
		send(...args) {
			this.sent.push(args);
		}
	};
}

async function captureConsoleErrors(callback) {
	const originalConsoleError = console.error;
	const consoleErrors: any[] = [];
	console.error = ((...args) => {
		consoleErrors.push(args);
	}) as any;
	try {
		await callback();
		return consoleErrors;
	} finally {
		console.error = originalConsoleError;
	}
}

async function flushAsyncHandlers() {
	await new Promise((resolve) => setImmediate(resolve));
}
