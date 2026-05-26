import assert from "assert";
import contentApi from "../app/modules/content/api.js";
import gatewayApi from "../app/modules/gateway/api.js";
import staticIdApi from "../app/modules/staticId/api.js";
import {IGeesomeApp} from "../app/interface.js";

describe("content route errors", function () {
	it("keeps handled content route failures out of stderr", async () => {
		const routes: any = {};
		const consoleErrors = await captureConsoleErrors(async () => {
			contentApi({
				ms: {
					api: getApiRouteStub(routes),
					storage: {
						getFileStat: async () => null
					}
				}
			} as unknown as IGeesomeApp, {
				getFileStreamForApiRequest: async () => {
					throw new Error("missing content stream");
				},
				getContentHead: async () => {
					throw new Error("missing content head");
				}
			} as any);

			const getResponse = getResponseStub();
			await routes["GET content-data/*"]({route: "content-data/missing.txt"} as any, getResponse);
			await flushAsyncHandlers();
			assert.deepEqual(getResponse.sent, [[400]]);

			const headResponse = getResponseStub();
			await routes["HEAD content-data/*"]({route: "content-data/missing.txt"} as any, headResponse);
			await flushAsyncHandlers();
			assert.deepEqual(headResponse.sent, [[400]]);
		});

		assert.deepEqual(consoleErrors, []);
	});

	it("keeps handled gateway route failures out of stderr", async () => {
		let getHandler;
		let headHandler;
		const consoleErrors = await captureConsoleErrors(async () => {
			gatewayApi({
				ms: {
					content: {
						getFileStreamForApiRequest: async () => {
							throw new Error("gateway stream failed");
						},
						getContentHead: async () => {
							throw new Error("gateway head failed");
						}
					},
					staticId: {
						resolveStaticId: async (id) => id
					}
				}
			} as unknown as IGeesomeApp, {
				getDnsLinkPathFromRequest: async () => "ipfs/root-cid",
				onGetRequest: (handler) => {
					getHandler = handler;
				},
				onHeadRequest: (handler) => {
					headHandler = handler;
				}
			} as any);

			const getResponse = getResponseStub();
			await getHandler({headers: {}, route: "/file.txt"} as any, getResponse);
			await flushAsyncHandlers();
			assert.deepEqual(getResponse.sent, [[400]]);

			const headResponse = getResponseStub();
			await headHandler({headers: {}, route: "/file.txt"} as any, headResponse);
			await flushAsyncHandlers();
			assert.deepEqual(headResponse.sent, [[400]]);
		});

		assert.deepEqual(consoleErrors, []);
	});

	it("keeps handled ipns route failures out of stderr", async () => {
		const routes: any = {};
		const consoleErrors = await captureConsoleErrors(async () => {
			staticIdApi({
				ms: {
					api: getApiRouteStub(routes),
					content: {
						getFileStreamForApiRequest: async () => {
							throw new Error("ipns stream failed");
						},
						getContentHead: async () => {
							throw new Error("ipns head failed");
						}
					}
				}
			} as unknown as IGeesomeApp, {
				getSelfStaticAccountId: async () => "self-id",
				resolveStaticId: async () => "resolved-cid"
			} as any);

			const getResponse = getResponseStub();
			await routes["UNVERSION_GET /ipns/*"]({route: "/ipns/static-id/path.txt?x=1"} as any, getResponse);
			await flushAsyncHandlers();
			assert.deepEqual(getResponse.sent, [[400]]);

			const headResponse = getResponseStub();
			await routes["UNVERSION_HEAD /ipns/*"]({route: "/ipns/static-id/path.txt?x=1"} as any, headResponse);
			await flushAsyncHandlers();
			assert.deepEqual(headResponse.sent, [[400]]);
		});

		assert.deepEqual(consoleErrors, []);
	});
});

function getApiRouteStub(routes) {
	return {
		onGet: (route, handler) => {
			routes[`GET ${route}`] = handler;
		},
		onHead: (route, handler) => {
			routes[`HEAD ${route}`] = handler;
		},
		onUnversionGet: (route, handler) => {
			routes[`UNVERSION_GET ${route}`] = handler;
		},
		onUnversionHead: (route, handler) => {
			routes[`UNVERSION_HEAD ${route}`] = handler;
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
