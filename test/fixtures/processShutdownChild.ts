import http from 'node:http';
import {closeHttpServer} from '../../app/httpServer.js';
import {registerProcessShutdown} from '../../app/processShutdown.js';

const server = http.createServer((_req, res) => {
	process.stdout.write('REQUEST_STARTED\n');
	setTimeout(() => {
		res.setHeader('Connection', 'close');
		res.end('ok');
	}, 25);
});

server.listen(0, '127.0.0.1', () => {
	const address = server.address();
	if (!address || typeof address === 'string') {
		throw new Error('http_server_address_unavailable');
	}
	registerProcessShutdown({
		stop: () => closeHttpServer(server)
	} as any, {timeoutMs: 1000});
	process.stdout.write(`READY:${address.port}\n`);
});
