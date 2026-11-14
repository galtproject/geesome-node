import assert from 'node:assert/strict';
import {request} from 'node:http';
import {connect, createServer, Socket} from 'node:net';
import {createYoutubeProxy} from '../app/modules/drivers/youtubeProxy.js';

describe('YouTube metadata proxy', function () {
	this.timeout(5000);

	it('requires proxy credentials, HTTPS tunneling, and port 443 before DNS lookup', async () => {
		let lookups = 0;
		const proxy = await createYoutubeProxy({lookup: (async () => { lookups++; return []; }) as any});
		try {
			for (const authority of ['public.example:80', 'public.example:443/path', 'user@public.example:443']) {
				const result = await tunnel(proxy.url, authority);
				assert.equal(result.status, 403);
			}
			assert.equal((await tunnel(proxy.url, 'public.example:443', false)).status, 403);
			const target = new URL(proxy.url);
			await new Promise<void>((resolve, reject) => {
				request({hostname: target.hostname, port: target.port, path: 'http://public.example/', method: 'GET'}, res => {
					res.resume();
					assert.equal(res.statusCode, 403);
					resolve();
				}).on('error', reject).end();
			});
			assert.equal(lookups, 0);
		} finally {
			await proxy.close();
		}
	});

	for (const addresses of [
		[{address: '127.0.0.1', family: 4}],
		[{address: '169.254.169.254', family: 4}],
		[{address: '::1', family: 6}],
		[{address: '::ffff:127.0.0.1', family: 6}],
		[{address: '8.8.8.8', family: 4}, {address: '10.0.0.1', family: 4}],
		[]
	]) {
		it(`rejects DNS answers ${JSON.stringify(addresses)} before opening an upstream socket`, async () => {
			let connections = 0;
			const proxy = await createYoutubeProxy({
				lookup: (async () => addresses) as any,
				connect: (() => { connections++; throw new Error('must not connect'); }) as any
			});
			try {
				assert.equal((await tunnel(proxy.url, 'metadata.example:443')).status, 403);
				assert.equal(connections, 0);
			} finally {
				await proxy.close();
			}
		});
	}

	it('pins a public tunnel and rejects private redirect destinations and later DNS rebinding', async () => {
		const echo = createServer(socket => socket.pipe(socket));
		await new Promise<void>(resolve => echo.listen(0, '127.0.0.1', resolve));
		const address = echo.address();
		assert.ok(address && typeof address !== 'string');
		let lookups = 0;
		let connections = 0;
		const proxy = await createYoutubeProxy({
			lookup: (async hostname => {
				lookups++;
				return hostname === 'public.example' && lookups === 1
					? [{address: '8.8.8.8', family: 4}]
					: [{address: '127.0.0.1', family: 4}];
			}) as any,
			connect: ((options: any) => {
				connections++;
				assert.equal(options.host, 'public.example');
				assert.equal(options.port, 443);
				options.lookup(options.host, {all: true}, (error, answers) => {
					assert.ifError(error);
					assert.deepEqual(answers, [{address: '8.8.8.8', family: 4}]);
				});
				// The production connection options are asserted above. Only this test
				// connector substitutes the loopback echo fixture for the public IP.
				return connect({host: '127.0.0.1', port: address.port});
			}) as any
		});
		try {
			const result = await tunnel(proxy.url, 'public.example:443');
			assert.equal(result.status, 200);
			try {
				const reply = new Promise<Buffer>((resolve, reject) => result.socket.once('data', resolve).once('error', reject));
				result.socket.write('metadata');
				assert.equal((await reply).toString(), 'metadata');
				assert.equal(lookups, 1);
			} finally {
				result.socket.destroy();
			}
			// Each new destination is vetted, even after a successful public tunnel.
			assert.equal((await tunnel(proxy.url, 'redirect.example:443')).status, 403);
			assert.equal((await tunnel(proxy.url, 'public.example:443')).status, 403);
			assert.equal(connections, 1);
		} finally {
			await proxy.close();
			await new Promise<void>(resolve => echo.close(() => resolve()));
		}
	});

	it('closes active tunnels when the metadata job finishes', async () => {
		const proxy = await createYoutubeProxy({
			lookup: (async () => [{address: '8.8.8.8', family: 4}]) as any,
			connect: (() => {
				const socket = new Socket();
				queueMicrotask(() => socket.emit('connect'));
				return socket;
			}) as any
		});
		try {
			const result = await tunnel(proxy.url, 'public.example:443');
			assert.equal(result.status, 200);
			const closed = new Promise<void>(resolve => result.socket.once('close', () => resolve()));
			result.socket.resume();
			await proxy.close();
			await closed;
			await proxy.close();
		} finally {
			await proxy.close();
		}
	});

	it('does not open an upstream connection if the job ends during DNS resolution', async () => {
		let completeLookup;
		let startedLookup;
		const started = new Promise<void>(resolve => { startedLookup = resolve; });
		let connections = 0;
		const proxy = await createYoutubeProxy({
			lookup: (() => {
				startedLookup();
				return new Promise(resolve => { completeLookup = resolve; });
			}) as any,
			connect: (() => { connections++; throw new Error('job already ended'); }) as any
		});
		const pending = tunnel(proxy.url, 'public.example:443').catch(error => error);
		try {
			await started;
			await proxy.close();
			completeLookup([{address: '8.8.8.8', family: 4}]);
			await pending;
			await new Promise(resolve => setImmediate(resolve));
			assert.equal(connections, 0);
		} finally {
			await proxy.close();
		}
	});
});

function tunnel(proxyUrl: string, authority: string, authenticated = true): Promise<{status: number; socket: Socket}> {
	const proxy = new URL(proxyUrl);
	return new Promise((resolve, reject) => {
		const req = request({hostname: proxy.hostname, port: proxy.port, method: 'CONNECT', path: authority,
			headers: authenticated ? {'Proxy-Authorization': `Basic ${Buffer.from(`${proxy.username}:${proxy.password}`).toString('base64')}`} : {}});
		req.setTimeout(1000, () => req.destroy(new Error('proxy test timed out')));
		req.once('connect', (res, socket) => {
			if (res.statusCode !== 200) {
				socket.destroy();
			}
			resolve({status: res.statusCode, socket});
		});
		req.once('error', reject);
		req.end();
	});
}
