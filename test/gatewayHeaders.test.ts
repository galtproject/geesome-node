import assert from "assert";
import http from "node:http";
import gatewayModule from "../app/modules/gateway/index.js";
import {IGeesomeApp} from "../app/interface.js";

function requestHead(port: number, path: string): Promise<http.IncomingMessage> {
	return new Promise((resolve, reject) => {
		const req = http.request({host: "127.0.0.1", port, path, method: "HEAD"}, resolve);
		req.on("error", reject);
		req.end();
	});
}

describe("gateway headers", function () {
	this.timeout(10000);

	it("lets gateway HEAD handlers set storage response headers", async () => {
		const port = 7789;
		const gateway = await gatewayModule({
			checkModules: () => null,
			ms: {
				api: {
					reqToModuleInput: (req) => ({
						headers: req.headers,
						route: req.url,
						fullRoute: req.originalUrl,
						stream: req
					}),
					resToModuleOutput: (res) => ({
						send: res.send.bind(res),
						setHeader: res.setHeader.bind(res),
						writeHead: res.writeHead.bind(res),
						stream: res
					})
				}
			}
		} as unknown as IGeesomeApp, {registerApi: false, port});

		try {
			gateway.onHeadRequest(async (req, res) => {
				res.writeHead(200, {
					"Content-Length": "7",
					"Content-Type": "text/html",
					"x-test-head-handler": "gateway"
				});
				res.stream.end();
			});

			const res = await requestHead(port, "/published/index.html");

			assert.equal(res.statusCode, 200);
			assert.equal(res.headers["content-length"], "7");
			assert.equal(res.headers["content-type"], "text/html");
			assert.equal(res.headers["x-test-head-handler"], "gateway");
		} finally {
			gateway.stop();
		}
	});
});
