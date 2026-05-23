import assert from "assert";
import {PassThrough, Readable} from "node:stream";
import contentModule from "../app/modules/content/index.js";
import {ContentMimeType} from "../app/modules/database/interface.js";
import {IGeesomeApp} from "../app/interface.js";

describe("content headers", function () {
	function getApiStub() {
		return {
			onGet: () => null,
			onHead: () => null,
			onUnversionGet: () => null,
			onUnversionHead: () => null,
			onAuthorizedGet: () => null,
			onAuthorizedPost: () => null,
			setDefaultHeaders: () => null,
			setStorageHeaders: () => null
		};
	}

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
					getSharedStorageMetadataByStorageId: async () => ({
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

	it("returns 404 for allowed HEAD paths missing from storage", async () => {
		const writes: any = {};
		let streamRequested = false;
		const content = await contentModule({
			checkModules: () => null,
			callHookCheckAllowed: async () => true,
			ms: {
				api: getApiStub(),
				database: {
					getSharedStorageMetadataByStorageId: async () => null
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

		await content.getContentHead({} as any, {
			setHeader: () => null,
			writeHead: (status, responseHeaders) => {
				writes.status = status;
				writes.headers = responseHeaders;
			},
			stream: {
				end: () => {
					writes.ended = true;
				}
			}
		} as any, "missing.txt");

		assert.equal(writes.status, 404);
		assert.equal(writes.headers["Cross-Origin-Resource-Policy"], "cross-origin");
		assert.equal(writes.ended, true);
		assert.equal(streamRequested, false);
	});

	it("returns 423 for forbidden unknown HEAD storage paths before stat lookup", async () => {
		const writes: any = {};
		let statRequested = false;
		const content = await contentModule({
			checkModules: () => null,
			callHookCheckAllowed: async () => false,
			ms: {
				api: getApiStub(),
				database: {
					getSharedStorageMetadataByStorageId: async () => null
				},
				storage: {
					getFileStat: async () => {
						statRequested = true;
						return null;
					}
				}
			}
		} as unknown as IGeesomeApp);

		await content.getContentHead({} as any, {
			setHeader: () => null,
			writeHead: (status, responseHeaders) => {
				writes.status = status;
				writes.headers = responseHeaders;
			},
			stream: {
				end: () => {
					writes.ended = true;
				}
			}
		} as any, "forbidden.txt");

		assert.equal(writes.status, 423);
		assert.equal(writes.headers["Cross-Origin-Resource-Policy"], "cross-origin");
		assert.equal(writes.ended, true);
		assert.equal(statRequested, false);
	});

	it("keeps preview MIME headers on HEAD preview storage paths", async () => {
		const headers = {};
		const contentSize = 3;
		const content = await contentModule({
			checkModules: () => null,
			ms: {
				api: getApiStub(),
				database: {
					getSharedStorageMetadataByStorageId: async () => ({
						storageId: "original.txt",
						mediumPreviewStorageId: "preview.jpg",
						mimeType: ContentMimeType.Text,
						previewMimeType: "image/jpeg",
						size: 9
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
				headers["status"] = status;
				Object.assign(headers, responseHeaders);
			},
			stream: {
				end: () => null
			}
		} as any, "preview.jpg");

		assert.equal(headers["status"], 200);
		assert.equal(headers["Content-Type"], "image/jpeg");
		assert.equal(headers["Content-Length"], contentSize);
	});

	it("does not expose private content rows by database id through public metadata", async () => {
		const content = await contentModule({
			checkModules: () => null,
			ms: {
				api: getApiStub(),
				database: {
					getContent: async () => ({
						id: 7,
						userId: 12,
						name: "private-name.txt",
						description: "private description",
						storageId: "private-storage",
						mimeType: ContentMimeType.Text,
						isPublic: false
					})
				},
				storage: {}
			}
		} as unknown as IGeesomeApp);

		await assert.rejects(
			() => content.getPublicContentMetadata("7"),
			(error: Error & {code?: number}) => error.message === "content_not_found" && error.code === 404
		);
	});

	it("returns public-safe storage metadata without private library fields", async () => {
		const content = await contentModule({
			checkModules: () => null,
			ms: {
				api: getApiStub(),
				database: {
					getSharedStorageMetadataByStorageId: async () => ({
						id: 7,
						userId: 12,
						name: "private-name.txt",
						description: "private description",
						storageId: "shared-storage",
						mimeType: ContentMimeType.Text,
						size: 5,
						manifestStorageId: "private-manifest",
						propertiesJson: "{\"private\":true}",
						mediumPreviewStorageId: "preview-storage",
						previewMimeType: "image/png",
						isPublic: false
					})
				},
				storage: {}
			}
		} as unknown as IGeesomeApp);

		const metadata: any = await content.getPublicContentMetadata("shared-storage");

		assert.deepEqual(metadata, {
			mimeType: ContentMimeType.Text,
			size: 5,
			mediumPreviewStorageId: "preview-storage",
			previewMimeType: "image/png",
			storageId: "shared-storage"
		});
	});

	it("returns library metadata for public content database ids", async () => {
		const content = await contentModule({
			checkModules: () => null,
			ms: {
				api: getApiStub(),
				database: {
					getContent: async () => ({
						id: 7,
						userId: 12,
						name: "public-name.txt",
						description: "public description",
						storageId: "public-storage",
						mimeType: ContentMimeType.Text,
						size: 5,
						manifestStorageId: "public-manifest",
						propertiesJson: "{\"private\":true}",
						isPublic: true
					})
				},
				storage: {}
			}
		} as unknown as IGeesomeApp);

		const metadata: any = await content.getPublicContentMetadata("7");

		assert.equal(metadata.id, 7);
		assert.equal(metadata.name, "public-name.txt");
		assert.equal(metadata.description, "public description");
		assert.equal(metadata.storageId, "public-storage");
		assert.equal(metadata.manifestStorageId, "public-manifest");
		assert.equal(metadata.userId, undefined);
		assert.equal(metadata.propertiesJson, undefined);
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
					getSharedStorageMetadataByStorageId: async () => ({
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
					getSharedStorageMetadataByStorageId: async () => null
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

	it("streams non-range content when storage stats do not include a CID", async () => {
		const responseStream = new PassThrough();
		const finished = new Promise((resolve) => responseStream.on("finish", resolve));
		const metadataLookups: string[] = [];
		const writes: any = {};
		let streamPath = "";
		responseStream.resume();
		const contentSize = 5;
		const content = await contentModule({
			checkModules: () => null,
			ms: {
				api: getApiStub(),
				database: {
					getSharedStorageMetadataByStorageId: async (storageId) => {
						metadataLookups.push(storageId);
						return {
							storageId: "file.txt",
							mimeType: ContentMimeType.Text,
							size: contentSize
						};
					}
				},
				storage: {
					getFileStat: async () => ({size: contentSize}),
					getFileStream: async (path) => {
						streamPath = path;
						return Readable.from(["hello"]);
					}
				}
			}
		} as unknown as IGeesomeApp);

		await content.getFileStreamForApiRequest({
			headers: {}
		} as any, {
			setHeader: (name, value) => {
				writes.headers = writes.headers || {};
				writes.headers[name] = value;
			},
			writeHead: (status, responseHeaders) => {
				writes.status = status;
				writes.headers = {
					...writes.headers,
					...responseHeaders
				};
			},
			stream: responseStream
		} as any, "file.txt");
		await finished;

		assert.equal(writes.status, 200);
		assert.equal(writes.headers["Content-Type"], ContentMimeType.Text);
		assert.equal(writes.headers["Content-Length"], contentSize);
		assert.equal(writes.headers["x-ipfs-datasize"], contentSize);
		assert.equal(streamPath, "file.txt");
		assert.deepEqual(metadataLookups, ["file.txt"]);
	});

	it("returns 404 for allowed ranged storage paths missing from storage", async () => {
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
					getSharedStorageMetadataByStorageId: async () => null
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
			headers: {range: "bytes=0-1"}
		} as any, {
			send: (...args) => sends.push(args),
			setHeader: () => null
		} as any, "missing.txt");

		assert.deepEqual(sends, [[404]]);
		assert.equal(streamRequested, false);
	});

	it("returns 423 for forbidden unknown ranged storage paths before stat lookup", async () => {
		let statRequested = false;
		const sends: any[] = [];
		const content = await contentModule({
			checkModules: () => null,
			callHookCheckAllowed: async () => false,
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
					getSharedStorageMetadataByStorageId: async () => null
				},
				storage: {
					getFileStat: async () => {
						statRequested = true;
						return null;
					}
				}
			}
		} as unknown as IGeesomeApp);

		await content.getFileStreamForApiRequest({
			headers: {range: "bytes=0-1"}
		} as any, {
			send: (...args) => sends.push(args),
			setHeader: () => null
		} as any, "forbidden.txt");

		assert.deepEqual(sends, [[423]]);
		assert.equal(statRequested, false);
	});

	it("returns partial content for image byte ranges", async () => {
		let streamOptions: any;
		let sendCalled = false;
		const writes: any = {};
		const contentSize = 5;
		const content = await contentModule({
			checkModules: () => null,
			ms: {
				api: getApiStub(),
				database: {
					getSharedStorageMetadataByStorageId: async () => ({
						storageId: "image.png",
						mimeType: ContentMimeType.ImagePng,
						size: contentSize
					})
				},
				storage: {
					getFileStat: async () => ({size: contentSize}),
					getFileStream: async (_path, options) => {
						streamOptions = options;
						return Readable.from(["im"]);
					}
				}
			}
		} as unknown as IGeesomeApp);

		await content.getFileStreamForApiRequest({
			headers: {range: "bytes=0-1"}
		} as any, {
			send: () => {
				sendCalled = true;
			},
			setHeader: () => null,
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
		} as any, "image.png");

		assert.equal(writes.status, 206);
		assert.equal(writes.headers["Content-Type"], ContentMimeType.ImagePng);
		assert.equal(writes.headers["Content-Range"], "bytes 0-1/5");
		assert.equal(writes.headers["Content-Length"], 2);
		assert.deepEqual(streamOptions, {offset: 0, length: 2});
		assert.equal(sendCalled, false);
	});

	it("returns partial content for directory index byte ranges", async () => {
		let streamOptions: any;
		let streamPath = "";
		let sendCalled = false;
		const writes: any = {};
		const contentSize = 5;
		const content = await contentModule({
			checkModules: () => null,
			ms: {
				api: getApiStub(),
				database: {
					getSharedStorageMetadataByStorageId: async () => ({
						storageId: "site",
						mimeType: ContentMimeType.Directory,
						size: contentSize
					})
				},
				storage: {
					getFileStat: async () => ({size: contentSize}),
					getFileStream: async (path, options) => {
						streamPath = path;
						streamOptions = options;
						return Readable.from(["<h"]);
					}
				}
			}
		} as unknown as IGeesomeApp);

		await content.getFileStreamForApiRequest({
			headers: {range: "bytes=0-1"}
		} as any, {
			send: () => {
				sendCalled = true;
			},
			setHeader: () => null,
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
		} as any, "site");

		assert.equal(writes.status, 206);
		assert.equal(writes.headers["Content-Type"], ContentMimeType.Directory);
		assert.equal(writes.headers["Content-Range"], "bytes 0-1/5");
		assert.equal(writes.headers["Content-Length"], 2);
		assert.equal(streamPath, "site/index.html");
		assert.deepEqual(streamOptions, {offset: 0, length: 2});
		assert.equal(sendCalled, false);
	});

	it("closes the response stream when a content stream fails after headers", async () => {
		const responseStream = new PassThrough();
		const writes: any = {};
		let destroyed = false;
		responseStream.destroy = (() => {
			destroyed = true;
			return responseStream;
		}) as any;
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
					getSharedStorageMetadataByStorageId: async () => ({
						storageId: "file.txt",
						mimeType: "video/mp4",
						size: 5
					})
				},
				storage: {
					getFileStat: async () => ({size: 5}),
					getFileStream: async () => {
						const stream = new PassThrough();
						setImmediate(() => stream.emit("error", new Error("storage stream failed")));
						return stream;
					}
				}
			}
		} as unknown as IGeesomeApp);

		await content.getFileStreamForApiRequest({
			headers: {range: "bytes=0-1"}
		} as any, {
			send: (...args) => {
				writes.send = args;
			},
			setHeader: () => null,
			writeHead: (status, responseHeaders) => {
				writes.status = status;
				writes.headers = responseHeaders;
			},
			stream: responseStream
		} as any, "file.txt");
		await new Promise((resolve) => setImmediate(resolve));

		assert.equal(writes.status, 206);
		assert.equal(destroyed, true);
		assert.equal(writes.send, undefined);
	});

	it("destroys storage streams when the response closes before completion", async () => {
		const responseStream = new PassThrough();
		const storageStream = new PassThrough();
		const originalDestroy = storageStream.destroy.bind(storageStream);
		let storageDestroyed = false;
		storageStream.destroy = ((error?: Error) => {
			storageDestroyed = true;
			return originalDestroy(error);
		}) as any;
		const writes: any = {};
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
					getSharedStorageMetadataByStorageId: async () => ({
						storageId: "file.txt",
						mimeType: "video/mp4",
						size: 5
					})
				},
				storage: {
					getFileStat: async () => ({size: 5}),
					getFileStream: async () => storageStream
				}
			}
		} as unknown as IGeesomeApp);

		await content.getFileStreamForApiRequest({
			headers: {range: "bytes=0-1"}
		} as any, {
			setHeader: () => null,
			writeHead: (status, responseHeaders) => {
				writes.status = status;
				writes.headers = responseHeaders;
			},
			stream: responseStream
		} as any, "file.txt");
		responseStream.emit("close");

		assert.equal(writes.status, 206);
		assert.equal(storageDestroyed, true);
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
					getSharedStorageMetadataByStorageId: async () => ({
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
					getSharedStorageMetadataByStorageId: async () => ({
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
