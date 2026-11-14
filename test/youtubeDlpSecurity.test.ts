import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createServer} from 'node:http';
import {connect} from 'node:net';
import os from 'node:os';
import path from 'node:path';
import {Readable} from 'node:stream';
import axios from 'axios';
import {downloadYoutubeThumbnail, getYoutubeInfo, normalizeYoutubeUrl, streamYoutubeFormat} from '../app/modules/drivers/youtubeDlp.js';
import {YoutubeVideoUploadDriver} from '../app/modules/drivers/upload/youtubeVideo.js';

const videoUrl = 'https://www.youtube.com/watch?v=BaW_jenozKc';
const testEnvNames = ['YT_DLP_BINARY', 'GEESOME_TEST_YOUTUBE_LOG', 'GEESOME_TEST_YOUTUBE_INFO',
	'GEESOME_TEST_YOUTUBE_MODE', 'NO_PROXY', 'no_proxy'];

describe('YouTube source download security', function () {
	this.timeout(10000);
	let directory: string;
	let logPath: string;
	let environment;
	let originalAdapter;
	let requests;
	let agents;

	beforeEach(async () => {
		environment = Object.fromEntries(testEnvNames.map(name => [name, process.env[name]]));
		originalAdapter = axios.defaults.adapter;
		requests = [];
		agents = [];
		directory = await fs.mkdtemp(path.join(os.tmpdir(), 'geesome-youtube-test-'));
		logPath = path.join(directory, 'calls.jsonl');
		const binary = path.join(directory, 'yt-dlp-test.cjs');
		await fs.writeFile(binary, `#!/usr/bin/env node
const fs = require('node:fs');
const http = require('node:http');
const args = process.argv.slice(2);
const proxy = args[args.indexOf('--proxy') + 1];
fs.appendFileSync(process.env.GEESOME_TEST_YOUTUBE_LOG, JSON.stringify({args, env: {
  NO_PROXY: process.env.NO_PROXY, no_proxy: process.env.no_proxy,
  HTTP_PROXY: process.env.HTTP_PROXY, HTTPS_PROXY: process.env.HTTPS_PROXY,
  http_proxy: process.env.http_proxy, https_proxy: process.env.https_proxy
}}) + '\\n');
if (process.env.GEESOME_TEST_YOUTUBE_MODE === 'error') {
  process.stderr.write('metadata extraction failed'); process.exit(1);
}
if (process.env.GEESOME_TEST_YOUTUBE_MODE === 'invalid-json') {
  process.stdout.write('{'); process.exit(0);
}
function finish() { process.stdout.write(process.env.GEESOME_TEST_YOUTUBE_INFO); }
if (process.env.GEESOME_TEST_YOUTUBE_MODE === 'private-request') {
  const url = new URL(proxy);
  const req = http.request({hostname: url.hostname, port: url.port, method: 'CONNECT', path: '127.0.0.1:443',
    headers: {'Proxy-Authorization': 'Basic ' + Buffer.from(url.username + ':' + url.password).toString('base64')}});
  req.on('connect', (res, socket) => {
    socket.destroy();
    if (res.statusCode !== 403) {
      process.exit(2);
    }
    finish();
  });
  req.on('error', () => process.exit(3)); req.end();
} else { finish(); }
`, {mode: 0o700});
		process.env.YT_DLP_BINARY = binary;
		process.env.GEESOME_TEST_YOUTUBE_LOG = logPath;
		process.env.GEESOME_TEST_YOUTUBE_MODE = '';
		process.env.NO_PROXY = '*';
		process.env.no_proxy = '*';
		setInfo({formats: [format('direct', 'https://8.8.8.8/video.mp4')]});
		axios.defaults.adapter = async config => {
			requests.push(config);
			agents.push(config.httpAgent, config.httpsAgent);
			return {status: 200, statusText: 'OK', config, headers: {'content-type': 'image/png'},
				data: config.responseType === 'stream' ? Readable.from(['media bytes']) : Buffer.from('image bytes')};
		};
	});

	afterEach(async () => {
		axios.defaults.adapter = originalAdapter;
		for (const agent of agents) {
			agent?.destroy();
		}
		for (const name of testEnvNames) {
			if (environment[name] === undefined) {
				delete process.env[name];
			} else {
				process.env[name] = environment[name];
			}
		}
		await fs.rm(directory, {recursive: true, force: true});
	});

	it('canonicalizes supported YouTube video links without forwarding user options or redirects', () => {
		for (const source of [
			videoUrl, 'http://youtu.be/BaW_jenozKc?t=12',
			'https://m.youtube.com/shorts/BaW_jenozKc',
			'https://www.youtube-nocookie.com/embed/BaW_jenozKc',
			'https://www.youtube.com/live/BaW_jenozKc'
		]) {
			assert.equal(normalizeYoutubeUrl(source), videoUrl);
		}
	});

	it('rejects unsafe sources before starting a child process', async () => {
		for (const source of [
			'--exec=id', 'file:///etc/passwd', 'https://127.0.0.1/video.mp4',
			'https://youtube.com.evil.example/watch?v=BaW_jenozKc',
			'https://user:pass@youtube.com/watch?v=BaW_jenozKc',
			'https://youtube.com:8443/watch?v=BaW_jenozKc',
			'https://youtube.com/redirect?q=https://127.0.0.1/',
			'https://youtube.com/watch?v=bad-id'
		]) {
			await assert.rejects(getYoutubeInfo(source), {message: 'youtube_source_not_allowed'});
		}
		await assert.rejects(fs.readFile(logPath), {code: 'ENOENT'});
	});

	it('runs only metadata extraction through the authenticated proxy, overriding NO_PROXY', async () => {
		process.env.GEESOME_TEST_YOUTUBE_MODE = 'private-request';
		const info = await getYoutubeInfo('https://youtu.be/BaW_jenozKc');
		assert.equal(info.formats[0].format_id, 'direct');
		const [call] = await calls();
		const proxy = call.args[call.args.indexOf('--proxy') + 1];
		assert.deepEqual(call.args, [
			'--ignore-config', '--no-plugin-dirs', '--use-extractors', '^youtube$',
			'--proxy', proxy, '--socket-timeout', '30',
			'--dump-single-json', '--simulate', '--no-playlist', '--', videoUrl
		]);
		assert.equal(call.env.NO_PROXY, '');
		assert.equal(call.env.no_proxy, '');
		for (const name of ['HTTP_PROXY', 'HTTPS_PROXY', 'http_proxy', 'https_proxy']) {
			assert.equal(call.env[name], proxy);
		}
		await assertProxyClosed(proxy);
	});

	for (const mode of ['error', 'invalid-json']) {
		it(`closes the proxy after ${mode}`, async () => {
			process.env.GEESOME_TEST_YOUTUBE_MODE = mode;
			await assert.rejects(getYoutubeInfo(videoUrl));
			const [call] = await calls();
			await assertProxyClosed(call.args[call.args.indexOf('--proxy') + 1]);
		});
	}

	it('streams the best direct MP4 with pinned agents instead of invoking an external media downloader', async () => {
		setInfo({formats: [
			{...format('manifest', 'https://8.8.8.8/master.m3u8'), protocol: 'm3u8_native', filesize: 9999},
			{...format('small', 'https://8.8.8.8/small.mp4'), filesize: 1},
			{...format('direct', 'https://8.8.8.8/video.mp4'), filesize: 10,
				http_headers: {'User-Agent': 'YouTube test', Host: 'internal.example', 'Proxy-Authorization': 'secret'}}
		]});
		const output = await new YoutubeVideoUploadDriver().processBySource(videoUrl);
		let bytes = '';
		for await (const chunk of output.stream) {
			bytes += chunk;
		}
		assert.equal(bytes, 'media bytes');
		assert.equal((await calls()).length, 1);
		assert.equal(requests.length, 1);
		const [config] = requests;
		assert.equal(config.url, 'https://8.8.8.8/video.mp4');
		assert.equal(config.proxy, false);
		assert.equal(config.maxRedirects, 0);
		assert.ok(config.httpAgent?.options.lookup);
		assert.ok(config.httpsAgent?.options.lookup);
		assert.equal(config.headers.get('User-Agent'), 'YouTube test');
		assert.equal(config.headers.has('Host'), false);
		assert.equal(config.headers.has('Proxy-Authorization'), false);
	});

	it('fails closed when only manifest-based formats are available', async () => {
		setInfo({formats: [{...format('hls', 'https://8.8.8.8/master.m3u8'), protocol: 'm3u8_native'}]});
		await assert.rejects(new YoutubeVideoUploadDriver().processBySource(videoUrl), {
			message: 'youtube_direct_format_required'
		});
		assert.equal(requests.length, 0);
	});

	it('disposes media agents when the caller cancels a video stream', async () => {
		let disposed = 0;
		const adapter = axios.defaults.adapter as any;
		axios.defaults.adapter = config => {
			for (const agent of [config.httpAgent, config.httpsAgent]) {
				const destroy = agent.destroy.bind(agent);
				agent.destroy = () => { disposed++; destroy(); };
			}
			return adapter(config);
		};
		const output = await new YoutubeVideoUploadDriver().processBySource(videoUrl);
		const closed = new Promise<void>(resolve => output.stream.once('close', resolve));
		output.stream.destroy();
		await closed;
		assert.equal(disposed, 2);
	});

	for (const media of [
		'http://127.0.0.1/video.mp4', 'https://169.254.169.254/video.mp4',
		'http://[::ffff:127.0.0.1]/video.mp4'
	]) {
		it(`blocks metadata-provided media URL ${media}`, async () => {
			setInfo({formats: [format('direct', media)]});
			await assert.rejects(new YoutubeVideoUploadDriver().processBySource(videoUrl), {
				message: 'youtube_media_address_not_allowed'
			});
			assert.equal(requests.length, 0);
		});
	}

	it('rejects non-HTTP media and manifests before downloading', async () => {
		await assert.rejects(streamYoutubeFormat(videoUrl, 'direct', {formats: [format('direct', 'file:///etc/passwd')]}), {
			message: 'youtube_media_source_not_allowed'
		});
		await assert.rejects(streamYoutubeFormat(videoUrl, 'hls', {formats: [{...format('hls', 'https://8.8.8.8/hls'), protocol: 'm3u8_native'}]}), {
			message: 'youtube_direct_format_required'
		});
		assert.equal(requests.length, 0);
	});

	it('does not follow media redirects into internal services', async () => {
		const paths: string[] = [];
		const server = createServer((req, res) => {
			paths.push(req.url);
			res.writeHead(req.url === '/redirect' ? 302 : 200, {Location: '/internal'});
			res.end('internal bytes');
		});
		await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
		const address = server.address();
		assert.ok(address && typeof address !== 'string');
		const httpAdapter = axios.getAdapter('http');
		axios.defaults.adapter = config => {
			agents.push(config.httpAgent, config.httpsAgent);
			return httpAdapter({...config, url: `http://127.0.0.1:${address.port}/redirect`});
		};
		try {
			await assert.rejects(new YoutubeVideoUploadDriver().processBySource(videoUrl), (error: any) => {
				assert.equal(error.response?.status, 302);
				return true;
			});
			assert.deepEqual(paths, ['/redirect']);
		} finally {
			server.closeAllConnections();
			await new Promise<void>(resolve => server.close(() => resolve()));
		}
	});

	it('blocks private thumbnail URLs before downloading', async () => {
		setInfo({thumbnail: 'http://127.0.0.1/thumbnail.png'});
		await assert.rejects(downloadYoutubeThumbnail(videoUrl), {message: 'youtube_media_address_not_allowed'});
		assert.equal(requests.length, 0);
	});

	it('downloads public thumbnails through the pinned policy and writes their bytes', async () => {
		setInfo({thumbnail: 'https://8.8.8.8/thumbnail.png'});
		const thumbnail = await downloadYoutubeThumbnail(videoUrl);
		try {
			assert.equal((await fs.readFile(thumbnail.path)).toString(), 'image bytes');
			assert.equal(thumbnail.extension, 'png');
			assert.equal(requests[0].proxy, false);
			assert.equal(requests[0].maxRedirects, 0);
			assert.ok(requests[0].httpsAgent?.options.lookup);
		} finally {
			await fs.rm(thumbnail.path);
		}
	});

	function setInfo(info) {
		process.env.GEESOME_TEST_YOUTUBE_INFO = JSON.stringify(info);
	}

	async function calls() {
		return (await fs.readFile(logPath, 'utf8')).trim().split('\n').map(line => JSON.parse(line));
	}
});

function format(formatId: string, url: string) {
	return {format_id: formatId, ext: 'mp4', protocol: 'https', url};
}

async function assertProxyClosed(proxyUrl: string) {
	const proxy = new URL(proxyUrl);
	await assert.rejects(new Promise<void>((resolve, reject) => {
		const socket = connect({host: proxy.hostname, port: Number(proxy.port)});
		socket.once('connect', () => { socket.destroy(); resolve(); });
		socket.once('error', reject);
	}), {code: 'ECONNREFUSED'});
}
