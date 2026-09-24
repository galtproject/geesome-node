import assert from "assert";
import http from "node:http";
import net from "node:net";
import apiModule from "../app/modules/api/index.js";
import {IGeesomeApp} from "../app/interface.js";

describe("api headers", function () {
	this.timeout(10000);

	it("lets module HEAD handlers set storage response headers", async () => {
		const port = 7788;
		const previousPort = process.env.PORT;
		let api;
		delete process.env.PORT;

		try {
			api = await apiModule({
				config: {port},
				ms: {
					database: {getUsersCount: async () => 0},
					storage: {remoteNodeAddressList: async () => []},
					communicator: {nodeAddressList: async () => []}
				}
			} as unknown as IGeesomeApp);

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
			if (previousPort === undefined) {
				delete process.env.PORT;
			} else {
				process.env.PORT = previousPort;
			}
			api?.stop();
		}
	});

	it("exposes docs discovery links in headers and discovery JSON", async () => {
		const port = await getAvailablePort();
		const previousPort = process.env.PORT;
		let api;
		delete process.env.PORT;

		try {
			api = await apiModule({
				config: {port, apiConfig: {publicUrl: 'https://geesome.example', publicBasePath: '/api/v1'}},
				docsStorageId: "docs-root",
				ms: {
					database: {getUsersCount: async () => 0},
					storage: {remoteNodeAddressList: async () => []},
					communicator: {nodeAddressList: async () => []}
				}
			} as unknown as IGeesomeApp);

			const {res, body} = await requestJson(port, "/v1");

			assert.equal(res.statusCode, 200);
			assert.equal(res.headers["x-api-docs"], "https://geesome.example/ipfs/docs-root");
			assert.equal(res.headers["x-api-docs-openapi"], "https://geesome.example/api/v1/openapi.json");
			assert.equal(res.headers["x-api-docs-discovery"], "https://geesome.example/api/v1");
			assert.equal(res.headers["x-api-docs-ipfs"], "https://geesome.example/ipfs/docs-root");
			assert.match(String(res.headers["x-request-id"]), /^req_/);
			assert.match(String(res.headers.link), /rel="service-desc"/);
			assert.match(String(res.headers.link), /modules\.md/);
			assert.equal(body.docs.openapi, "https://geesome.example/api/v1/openapi.json");
			assert.equal(body.docs.apidoc, "https://geesome.example/api/v1/apidoc.json");
			assert.equal(body.docs.apiHtml, "https://geesome.example/ipfs/docs-root");
			assert.equal(body.docs.repoDocs, "https://geesome.example/ipfs/docs-root/README.md");
			assert.equal(body.docs.moduleDocs, "https://geesome.example/ipfs/docs-root/modules.md");
			assert.equal(body.docs.agentMap, "https://geesome.example/ipfs/docs-root/agent-map.md");
			assert.equal(body.docs.conventionalOpenapi.wellKnown, "https://geesome.example/.well-known/openapi.json");

			const discovery = await requestJson(port, "/.well-known/geesome");
			assert.equal(discovery.body.apiBaseUrl, "https://geesome.example/api/v1");
			assert.equal(discovery.body.openapiUrl, "https://geesome.example/api/v1/openapi.json");
			assert.equal(discovery.body.gatewayBaseUrl, "https://geesome.example");
			assert.equal(discovery.body.storage.contentDigest, "sha-256");
		} finally {
			if (previousPort === undefined) {
				delete process.env.PORT;
			} else {
				process.env.PORT = previousPort;
			}
			api?.stop();
		}
	});
});

function requestHead(port: number, path: string): Promise<http.IncomingMessage> {
	return new Promise((resolve, reject) => {
		const req = http.request({host: "127.0.0.1", port, path, method: "HEAD"}, resolve);
		req.on("error", reject);
		req.end();
	});
}

function requestJson(port: number, path: string): Promise<{res: http.IncomingMessage, body: any}> {
	return new Promise((resolve, reject) => {
		const req = http.request({host: "127.0.0.1", port, path, method: "GET"}, (res) => {
			const chunks: Buffer[] = [];
			res.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
			res.on("end", () => {
				const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
				resolve({res, body});
			});
		});
		req.on("error", reject);
		req.end();
	});
}

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
