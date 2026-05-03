import assert from "assert";
import http from "node:http";
import apiModule from "../app/modules/api/index.js";
import {IGeesomeApp} from "../app/interface.js";

function requestHead(port: number, path: string): Promise<http.IncomingMessage> {
	return new Promise((resolve, reject) => {
		const req = http.request({host: "127.0.0.1", port, path, method: "HEAD"}, resolve);
		req.on("error", reject);
		req.end();
	});
}

describe("api headers", function () {
	this.timeout(10000);

	it("lets module HEAD handlers set storage response headers", async () => {
		const port = 7788;
		const api = await apiModule({
			config: {port},
			ms: {
				database: {getUsersCount: async () => 0},
				storage: {remoteNodeAddressList: async () => []},
				communicator: {nodeAddressList: async () => []}
			}
		} as unknown as IGeesomeApp);

		try {
			api.onHead("content-data/*", async (req, res) => {
				res.writeHead(200, {
					"Content-Length": "5",
					"Content-Type": "text/plain",
					"x-test-head-handler": "content-data"
				});
				res.stream.end();
			});

			const res = await requestHead(port, "/v1/content-data/example.txt");

			assert.equal(res.statusCode, 200);
			assert.equal(res.headers["content-length"], "5");
			assert.equal(res.headers["content-type"], "text/plain");
			assert.equal(res.headers["x-test-head-handler"], "content-data");
		} finally {
			api.stop();
		}
	});
});
