import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {Readable} from 'node:stream';
import axios from 'axios';
import contentModule from '../app/modules/content/index.js';

describe('save-by-url security', function () {
	this.timeout(10000);
	let originalAdapter;
	let requests;
	let agents;
	let content;
	let savedStreams;
	const existingContent = {id: 42, storageId: 'saved-file'};

	beforeEach(async () => {
		originalAdapter = axios.defaults.adapter;
		requests = [];
		agents = [];
		savedStreams = [];
		axios.defaults.adapter = async config => {
			requests.push(config);
			agents.push(config.httpAgent, config.httpsAgent);
			return {status: 200, statusText: 'OK', headers: {'content-type': 'text/plain'},
				data: Readable.from(['downloaded file']), config};
		};
		content = await contentModule({
			checkModules: () => null,
			checkUserCan: async () => null,
			ms: {
				api: {
					onGet: () => null, onHead: () => null,
					onUnversionGet: () => null, onUnversionHead: () => null,
					onAuthorizedGet: () => null, onAuthorizedPost: () => null
				},
				drivers: {upload: {}},
				storage: {},
				database: {getContentByStorageAndUserId: async () => existingContent}
			},
			callHook: async () => null
		} as any);
		content.checkFileSizeAndSaveByStream = async (userId, stream, mimeType, options) => {
			let data = '';
			for await (const chunk of stream) {
				data += chunk.toString();
			}
			savedStreams.push({userId, data, mimeType, options});
			return {resultFile: {id: 'saved-file'}, resultMimeType: mimeType, resultExtension: 'txt'};
		};
		content.updateExistsContentMetadata = async () => null;
	});

	afterEach(() => {
		axios.defaults.adapter = originalAdapter;
		for (const agent of agents) {
			agent?.destroy();
		}
	});

	for (const url of ['file:///etc/passwd', 'ftp://8.8.8.8/file.txt', 'data:text/plain,hello']) {
		it(`rejects scheme before downloading: ${url.split(':')[0]}`, async () => {
			await assert.rejects(content.saveDataByUrl(7, url), {message: 'save_by_url_scheme_not_allowed'});
			assert.equal(requests.length, 0);
			assert.equal(savedStreams.length, 0);
		});
	}

	for (const hostname of [
		'127.0.0.1', '2130706433', '0x7f000001', '10.0.0.1', '169.254.169.254',
		'172.16.0.1', '192.168.1.1', '[::1]', '[::ffff:127.0.0.1]'
	]) {
		it(`rejects private literal ${hostname} before downloading`, async () => {
			await assert.rejects(content.saveDataByUrl(7, `http://${hostname}/file.txt`), {
				message: 'save_by_url_address_not_allowed'
			});
			assert.equal(requests.length, 0);
			assert.equal(savedStreams.length, 0);
		});
	}

	for (const protocol of ['http', 'https']) {
		it(`keeps public ${protocol.toUpperCase()} streaming behind vetted agents`, async () => {
			const url = `${protocol}://8.8.8.8/file.txt`;
			assert.equal(await content.saveDataByUrl(7, url), existingContent);
			assert.equal(requests.length, 1);
			const [config] = requests;
			assert.equal(config.url, url);
			assert.equal(config.method, 'get');
			assert.equal(config.responseType, 'stream');
			assert.equal(config.maxRedirects, 0);
			for (const agent of [config.httpAgent, config.httpsAgent]) {
				assert.ok(agent);
				await new Promise<void>((resolve, reject) => {
					agent.options.lookup('8.8.8.8', {all: true}, (error, addresses) => {
						if (error) {
							reject(error);
							return;
						}
						assert.deepEqual(addresses, [{address: '8.8.8.8', family: 4}]);
						resolve();
					});
				});
			}
			assert.deepEqual(savedStreams, [{userId: 7, data: 'downloaded file',
				mimeType: 'text/plain', options: {extension: 'txt', driver: undefined}}]);
		});
	}

	it('refuses redirects without contacting their destination', async () => {
		const paths: string[] = [];
		let redirectStatus = 302;
		const server = createServer((req, res) => {
			paths.push(req.url);
			if (req.url === '/redirect') {
				res.writeHead(redirectStatus, {Location: '/private'});
				res.end();
				return;
			}
			res.end('private response');
		});
		await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
		const address = server.address();
		assert.ok(address && typeof address !== 'string');
		const httpAdapter = axios.getAdapter('http');
		axios.defaults.adapter = config => {
			requests.push(config);
			agents.push(config.httpAgent, config.httpsAgent);
			// URL validation runs on a public IP literal. Only the test adapter routes the
			// request to a local fixture; Axios redirect handling remains real.
			return httpAdapter({...config, url: `http://127.0.0.1:${address.port}/redirect`, proxy: false, timeout: 1000});
		};
		try {
			for (const status of [301, 302, 303, 307, 308]) {
				redirectStatus = status;
				await assert.rejects(content.saveDataByUrl(7, 'http://8.8.8.8/file.txt'), (error: any) => {
					error.response?.data?.destroy();
					assert.equal(error.response?.status, status);
					return true;
				});
			}
			assert.deepEqual(paths, Array(5).fill('/redirect'));
			assert.equal(savedStreams.length, 0);
		} finally {
			server.closeAllConnections();
			await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
		}
	});
});
