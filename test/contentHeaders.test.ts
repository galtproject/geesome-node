import assert from "assert";
import {Readable} from "node:stream";
import contentModule from "../app/modules/content/index.js";
import {ContentMimeType} from "../app/modules/database/interface.js";
import {IGeesomeApp} from "../app/interface.js";

describe("content headers", function () {
	it("preserves content length on HEAD responses", async () => {
		const headers = {};
		let statusCode = 0;
		let ended = false;
		const contentSize = 5;
		const content = await contentModule({
			checkModules: () => null,
			ms: {
				api: {
					onGet: () => null,
					onHead: () => null,
					onUnversionGet: () => null,
					onUnversionHead: () => null,
					onAuthorizedGet: () => null,
					onAuthorizedPost: () => null,
					setDefaultHeaders: () => null
				},
				database: {
					getContentByStorageId: async () => ({
						storageId: "file.txt",
						mimeType: ContentMimeType.Text,
						size: contentSize
					})
				},
				storage: {
					getFileStat: async () => ({size: contentSize})
				}
			}
		} as unknown as IGeesomeApp);

		await content.getContentHead({} as any, {
			setHeader: (name, value) => {
				headers[name] = value;
			},
			writeHead: (status, responseHeaders) => {
				statusCode = status;
				Object.assign(headers, responseHeaders);
			},
			stream: {
				end: () => {
					ended = true;
				}
			}
		} as any, "file.txt");

		assert.equal(statusCode, 200);
		assert.equal(headers["Content-Length"], contentSize);
		assert.equal(headers["x-ipfs-datasize"], contentSize);
		assert.equal(headers["Content-Type"], ContentMimeType.Text);
		assert.equal(ended, true);
	});

	it("rejects unsatisfiable byte ranges before opening storage streams", async () => {
		let streamRequested = false;
		const writes: any = {};
		const contentSize = 5;
		const content = await contentModule({
			checkModules: () => null,
			ms: {
				api: {
					onGet: () => null,
					onHead: () => null,
					onUnversionGet: () => null,
					onUnversionHead: () => null,
					onAuthorizedGet: () => null,
					onAuthorizedPost: () => null,
					setStorageHeaders: () => null
				},
				database: {
					getContentByStorageId: async () => ({
						storageId: "file.txt",
						mimeType: ContentMimeType.Text,
						size: contentSize
					})
				},
				storage: {
					getFileStat: async () => ({size: contentSize}),
					getFileStream: async () => {
						streamRequested = true;
						return Readable.from(["unexpected"]);
					}
				}
			}
		} as unknown as IGeesomeApp);

		await content.getFileStreamForApiRequest({
			headers: {range: "bytes=10-20"}
		} as any, {
			writeHead: (status, responseHeaders) => {
				writes.status = status;
				writes.headers = responseHeaders;
			},
			stream: {
				end: () => {
					writes.ended = true;
				}
			}
		} as any, "file.txt");

		assert.equal(writes.status, 416);
		assert.equal(writes.headers["Content-Range"], "bytes */5");
		assert.equal(writes.headers["Accept-Ranges"], "bytes");
		assert.equal(writes.ended, true);
		assert.equal(streamRequested, false);
	});

	it("returns 404 for allowed storage paths missing from storage", async () => {
		let streamRequested = false;
		const sends: any[] = [];
		const content = await contentModule({
			checkModules: () => null,
			callHookCheckAllowed: async () => true,
			ms: {
				api: {
					onGet: () => null,
					onHead: () => null,
					onUnversionGet: () => null,
					onUnversionHead: () => null,
					onAuthorizedGet: () => null,
					onAuthorizedPost: () => null,
					setStorageHeaders: () => null
				},
				database: {
					getContentByStorageId: async () => null
				},
				storage: {
					getFileStat: async () => null,
					getFileStream: async () => {
						streamRequested = true;
						return Readable.from(["unexpected"]);
					}
				}
			}
		} as unknown as IGeesomeApp);

		await content.getFileStreamForApiRequest({
			headers: {}
		} as any, {
			send: (...args) => sends.push(args),
			setHeader: () => null
		} as any, "missing.txt");

		assert.deepEqual(sends, [[404]]);
		assert.equal(streamRequested, false);
	});

	it("rejects malformed byte ranges before opening storage streams", async () => {
		let streamRequested = false;
		const writes: any = {};
		const contentSize = 5;
		const content = await contentModule({
			checkModules: () => null,
			ms: {
				api: {
					onGet: () => null,
					onHead: () => null,
					onUnversionGet: () => null,
					onUnversionHead: () => null,
					onAuthorizedGet: () => null,
					onAuthorizedPost: () => null,
					setStorageHeaders: () => null
				},
				database: {
					getContentByStorageId: async () => ({
						storageId: "file.txt",
						mimeType: ContentMimeType.Text,
						size: contentSize
					})
				},
				storage: {
					getFileStat: async () => ({size: contentSize}),
					getFileStream: async () => {
						streamRequested = true;
						return Readable.from(["unexpected"]);
					}
				}
			}
		} as unknown as IGeesomeApp);

		await content.getFileStreamForApiRequest({
			headers: {range: "bytes=1-2-3"}
		} as any, {
			writeHead: (status, responseHeaders) => {
				writes.status = status;
				writes.headers = responseHeaders;
			},
			stream: {
				end: () => {
					writes.ended = true;
				}
			}
		} as any, "file.txt");

		assert.equal(writes.status, 416);
		assert.equal(writes.headers["Content-Range"], "bytes */5");
		assert.equal(writes.ended, true);
		assert.equal(streamRequested, false);
	});

	it("supports suffix byte ranges", async () => {
		let streamOptions: any;
		const writes: any = {};
		const contentSize = 5;
		const content = await contentModule({
			checkModules: () => null,
			ms: {
				api: {
					onGet: () => null,
					onHead: () => null,
					onUnversionGet: () => null,
					onUnversionHead: () => null,
					onAuthorizedGet: () => null,
					onAuthorizedPost: () => null,
					setStorageHeaders: () => null
				},
				database: {
					getContentByStorageId: async () => ({
						storageId: "file.txt",
						mimeType: "video/mp4",
						size: contentSize
					})
				},
				storage: {
					getFileStat: async () => ({size: contentSize}),
					getFileStream: async (_path, options) => {
						streamOptions = options;
						return Readable.from(["de"]);
					}
				}
			}
		} as unknown as IGeesomeApp);

		await content.getFileStreamForApiRequest({
			headers: {range: "bytes=-2"}
		} as any, {
			writeHead: (status, responseHeaders) => {
				writes.status = status;
				writes.headers = responseHeaders;
			},
			stream: {
				write: () => null,
				on: () => null,
				once: () => null,
				emit: () => null,
				end: () => null
			}
		} as any, "file.txt");

		assert.equal(writes.status, 206);
		assert.equal(writes.headers["Content-Range"], "bytes 3-4/5");
		assert.equal(writes.headers["Content-Length"], 2);
		assert.deepEqual(streamOptions, {offset: 3, length: 2});
	});
});
