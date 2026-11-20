import {randomBytes} from 'node:crypto';
import {createServer} from 'node:http';
import {connect, Socket} from 'node:net';
import {createSafeLookup, ISafeHttpsAgentOptions} from '../../helpers/safeHttpsAgent.js';

// yt-dlp only extracts metadata. Every HTTPS connection it opens, including a
// redirect or manifest request, must resolve and connect through this proxy.
export async function createYoutubeProxy(options: ISafeHttpsAgentOptions & {connect?: typeof connect} = {}) {
	const password = randomBytes(24).toString('hex');
	const authorization = `Basic ${Buffer.from(`youtube:${password}`).toString('base64')}`;
	const sockets = new Set<Socket>();
	let closed = false;
	const server = createServer((_req, res) => {
		// No plaintext HTTP, upgrades, or alternate proxy protocols.
		res.writeHead(403, {Connection: 'close'});
		res.end();
	});
	function track(socket: Socket) {
		sockets.add(socket);
		socket.once('close', () => sockets.delete(socket));
		socket.on('error', () => socket.destroy());
		socket.setTimeout(30000, () => socket.destroy());
	}
	server.on('connection', track);
	server.on('connect', (req, client, head) => {
		const reject = () => client.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
		if (req.headers['proxy-authorization'] !== authorization || !/^(\[[\da-f:]+\]|[^\s:/?#@]+):443$/i.test(req.url || '')) {
			reject();
			return;
		}
		void (async () => {
			const target = new URL(`https://${req.url}`);
			const hostname = target.hostname.replace(/^\[|\]$/g, '');
			const lookup = await createSafeLookup(hostname, {...options, errorPrefix: 'youtube_proxy'});
			if (closed || client.destroyed) {
				return;
			}
			const upstream = (options.connect || connect)({host: hostname, port: 443, lookup});
			track(upstream);
			client.once('close', () => upstream.destroy());
			upstream.once('close', () => client.destroy());
			upstream.once('connect', () => {
				client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
				if (head.length) {
					upstream.write(head);
				}
				client.pipe(upstream).pipe(client);
			});
		})().catch(reject);
	});
	server.on('upgrade', (_req, socket) => socket.destroy());
	await new Promise<void>((resolve, reject) => {
		server.once('error', reject);
		server.listen(0, '127.0.0.1', resolve);
	});
	const address = server.address();
	if (!address || typeof address === 'string') {
		throw new Error('youtube_proxy_listen_failed');
	}
	return {
		url: `http://youtube:${password}@127.0.0.1:${address.port}`,
		async close() {
			if (closed) {
				return;
			}
			closed = true;
			for (const socket of sockets) {
				socket.destroy();
			}
			await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
		}
	};
}
