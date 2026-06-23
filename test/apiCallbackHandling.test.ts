import assert from "assert";
import net from "node:net";
import apiModule from "../app/modules/api/index.js";
import {IGeesomeApp} from "../app/interface.js";

describe("api callback handling", function () {
	this.timeout(10000);

	it("allows handlers to send a response and return no promise", async () => {
		const port = await getAvailablePort();
		const previousPort = process.env.PORT;
		let api;
		delete process.env.PORT;

		let consoleErrors;
		try {
			consoleErrors = await captureConsoleErrors(async () => {
				try {
					api = await apiModule({
						config: {port},
						ms: {
							database: {getUsersCount: async () => 0},
							storage: {remoteNodeAddressList: async () => []},
							communicator: {nodeAddressList: async () => []}
						}
					} as unknown as IGeesomeApp);

					const response = getResponseStub();
					await (api as any).handleCallback(getRequestStub("/sync-send"), response, (_req, res) => {
						res.send({ok: true}, 200);
					});

					assert.deepEqual(response.sent, [[{ok: true}, 200]]);
				} finally {
					api?.stop();
				}
			});
		} finally {
			if (previousPort === undefined) {
				delete process.env.PORT;
			} else {
				process.env.PORT = previousPort;
			}
		}
		assert.deepEqual(consoleErrors, []);
	});
});

async function getAvailablePort(): Promise<number> {
	return new Promise((resolve, reject) => {
		const server = net.createServer();
		server.on("error", reject);
		server.listen(0, "127.0.0.1", () => {
			const address = server.address();
			const port = typeof address === "object" && address ? address.port : 0;
			server.close(() => resolve(port));
		});
	});
}

function getRequestStub(path: string) {
	return {
		headers: {},
		params: {},
		url: path,
		originalUrl: path
	};
}

function getResponseStub() {
	return {
		headersSent: false,
		writableEnded: false,
		statusCode: undefined as number | undefined,
		sent: [] as any[],
		send(...args) {
			this.sent.push(args);
			this.headersSent = true;
			return this;
		},
		setHeader() {
			return this;
		},
		status(statusCode) {
			this.statusCode = statusCode;
			return this;
		},
		writeHead(statusCode) {
			this.statusCode = statusCode;
			this.headersSent = true;
			return this;
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
