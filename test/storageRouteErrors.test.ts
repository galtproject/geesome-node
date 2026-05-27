import assert from "assert";
import http from "node:http";
import {EventEmitter} from "node:events";
import coreApi from "../app/modules/api/api.js";
import {IGeesomeApp} from "../app/interface.js";

describe("storage route errors", function () {
	it("keeps failed IPFS refs proxy requests out of stderr", async () => {
		const routes: any = {};
		let storageHeadersSet = false;
		const consoleErrors = await captureConsoleErrors(async () => {
			await withHttpGetFailure(async () => {
				coreApi({} as IGeesomeApp, {
					...getApiRouteStub(routes),
					handleAuthResult: async () => null,
					setStorageHeaders: () => {
						storageHeadersSet = true;
					}
				} as any);

				const response = getResponseStub();
				routes["GET /api/v0/refs*"]({
					route: "/api/v0/refs?arg=bafk"
				} as any, response);
				await flushAsyncHandlers();

				assert.equal(storageHeadersSet, true);
				assert.deepEqual(response.sent, [[null, 502]]);
			});
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
		}
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

async function withHttpGetFailure(callback) {
	const originalGet = http.get;
	(http as any).get = () => {
		const upstream = new EventEmitter();
		setImmediate(() => {
			upstream.emit("error", new Error("proxy connection failed"));
		});
		return upstream;
	};
	try {
		await callback();
	} finally {
		(http as any).get = originalGet;
	}
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
