import assert from 'assert';
import http from 'node:http';
import net from 'node:net';
import apiModule from '../app/modules/api/index.js';
import {IGeesomeApp} from '../app/interface.js';

describe('api unversioned POST routes', function () {
	this.timeout(10000);

	it('exposes unversioned JSON POST handlers with the raw body', async () => {
		const port = await getAvailablePort();
		const previousPort = process.env.PORT;
		let api;
		let handlerInput: any;
		delete process.env.PORT;

		try {
			api = await apiModule(getAppStub(port));
			api.onUnversionPost('ap/shared-inbox', async (req, res) => {
				handlerInput = req;
				res.stream.status(202).send({ok: true});
			});

			const body = '{"type":"Follow","actor":"https://remote.example/users/alice"}';
			const response = await requestPostJson(port, '/ap/shared-inbox', body, 'application/activity+json');

			assert.equal(response.statusCode, 202);
			assert.deepEqual(JSON.parse(response.body), {ok: true});
			assert.deepEqual(handlerInput.body, {
				type: 'Follow',
				actor: 'https://remote.example/users/alice'
			});
			assert.equal(Buffer.isBuffer(handlerInput.rawBody), true);
			assert.equal(handlerInput.rawBody.toString('utf8'), body);
		} finally {
			restorePort(previousPort);
			api?.stop();
		}
	});
});

async function getAvailablePort(): Promise<number> {
	return new Promise((resolve, reject) => {
		const server = net.createServer();
		server.on('error', reject);
		server.listen(0, '127.0.0.1', () => {
			const address = server.address();
			const port = typeof address === 'object' && address ? address.port : 0;
			server.close(() => resolve(port));
		});
	});
}

function getAppStub(port: number): IGeesomeApp {
	return {
		config: {port},
		ms: {
			database: {getUsersCount: async () => 0},
			storage: {remoteNodeAddressList: async () => []},
			communicator: {nodeAddressList: async () => []}
		}
	} as unknown as IGeesomeApp;
}

function requestPostJson(port: number, path: string, body: string, contentType = 'application/json'): Promise<any> {
	return new Promise((resolve, reject) => {
		const req = http.request({
			host: '127.0.0.1',
			port,
			path,
			method: 'POST',
			headers: {
				'content-type': contentType,
				'content-length': Buffer.byteLength(body)
			}
		}, (res) => {
			let responseBody = '';
			res.setEncoding('utf8');
			res.on('data', (chunk) => {
				responseBody += chunk;
			});
			res.on('end', () => {
				resolve({
					statusCode: res.statusCode,
					body: responseBody
				});
			});
		});
		req.on('error', reject);
		req.write(body);
		req.end();
	});
}

function restorePort(previousPort) {
	if (previousPort === undefined) {
		delete process.env.PORT;
		return;
	}
	process.env.PORT = previousPort;
}
