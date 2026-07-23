import assert from 'node:assert';
import http from 'node:http';
import createApp from '../app/index.js';
import {cleanupAndRethrow, cleanupResource} from '../app/resourceCleanup.js';
import {initializeDatabaseModels} from '../app/modules/database/index.js';
import createApiModule from '../app/modules/api/index.js';
import {closeHttpServer} from '../app/httpServer.js';

describe('app bootstrap cleanup', () => {
	it('rejects with the original module error after stopping initialized modules in lifecycle order', async () => {
		const initializationError = new Error('third_module_failed');
		const stopOrder: string[] = [];
		const warnings: string[] = [];
		const originalWarn = console.warn;
		console.warn = message => warnings.push(String(message));

		try {
			await assert.rejects(
				createApp({
					modules: ['first', 'second', 'third'],
					skipFrontendStorage: true,
					storageConfig: {jsNode: {pass: 'pass', salt: 'salt'}}
				}, {
					async loadModule(moduleName) {
						if (moduleName === 'third') {
							throw initializationError;
						}
						return {
							async stop() {
								stopOrder.push(moduleName);
								if (moduleName === 'second') {
									throw new Error('second_stop_failed');
								}
							}
						};
					}
				}),
				error => error === initializationError
			);
		} finally {
			console.warn = originalWarn;
		}

		assert.deepEqual(stopOrder, ['second', 'first']);
		assert.equal((initializationError as any).bootstrapStage, 'module_initialization');
		assert.equal((initializationError as any).bootstrapModuleName, 'third');
		assert.deepEqual(warnings, [
			'resource_cleanup_failed resource=module:second error=second_stop_failed'
		]);
	});

	it('keeps cleanup failures secondary to the triggering error', async () => {
		const initializationError = new Error('bootstrap_failed');
		const warnings: string[] = [];

		await assert.rejects(
			cleanupAndRethrow(
				initializationError,
				'test_resource',
				async () => {
					throw new Error('cleanup failed\nwith details');
				},
				message => warnings.push(message)
			),
			error => error === initializationError
		);
		assert.deepEqual(warnings, [
			'resource_cleanup_failed resource=test_resource error=cleanup failed with details'
		]);
	});

	it('reports whether cleanup succeeded', async () => {
		assert.equal(await cleanupResource('ok', async () => undefined), true);
	});

	it('closes Sequelize when database model initialization fails', async () => {
		const initializationError = new Error('model_initialization_failed');
		let closeCalls = 0;
		const sequelize = {
			async close() {
				closeCalls += 1;
			}
		};

		await assert.rejects(
			initializeDatabaseModels(sequelize, async () => {
				throw initializationError;
			}),
			error => error === initializationError
		);
		assert.equal(closeCalls, 1);
	});

	it('closes a listening API server when route registration fails', async () => {
		const initializationError = new Error('api_routes_failed');
		const port = await getAvailablePort();

		await assert.rejects(
			createApiModule({config: {}} as any, {
				port,
				async registerRoutes() {
					throw initializationError;
				}
			}),
			error => error === initializationError
		);

		const server = http.createServer();
		await listen(server, port);
		await closeHttpServer(server);
	});
});

function getAvailablePort(): Promise<number> {
	const server = http.createServer();
	return listen(server, 0).then(async () => {
		const address = server.address();
		if (!address || typeof address === 'string') {
			throw new Error('test_server_address_unavailable');
		}
		await closeHttpServer(server);
		return address.port;
	});
}

function listen(server: http.Server, port: number): Promise<void> {
	return new Promise((resolve, reject) => {
		server.once('error', reject);
		server.listen(port, '127.0.0.1', resolve);
	});
}
