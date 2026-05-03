import assert from "assert";
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
});
