import assert from 'node:assert/strict';
import { createPayments } from '../app/modules/payments/index.js';
import { siteProblem } from '../app/modules/api/browserSession.js';
function workerFixture(config) {
	const timers: any[] = [], cancelled: any[] = [];
	const app = { config: { paymentsConfig: config }, ms: { database: { sequelize: {} } } };
	const module = createPayments(app, {}, { env: {}, schedule(callback, interval) {
			const timer = { callback, interval, unref() { } };
			timers.push(timer);
			return timer;
		}, cancel(timer) { cancelled.push(timer); } });
	module.configureLedger({ models: {}, resource: async () => null, serial: async () => null,
		grantPaidInvoice: async () => null, clock: () => new Date(), fail: siteProblem });
	return { module, timers, cancelled };
}
describe('creator payment worker lifecycle', () => {
	it('starts no network or signing loop by default', async () => {
		const fixture = workerFixture({});
		fixture.module.startWorkers();
		assert.equal(fixture.timers.length, 0);
		await fixture.module.stop();
	});
	it('keeps observer and collection independent and drains in-flight work before stop', async () => {
		const fixture = workerFixture({ worker: true, collectionWorker: true });
		let releaseObserver;
		let observerCalls = 0, collectionCalls = 0;
		fixture.module.engine.run = async () => {
			observerCalls += 1;
			await new Promise(resolve => { releaseObserver = resolve; });
		};
		fixture.module.engine.treasury.run = async () => { collectionCalls += 1; };
		fixture.module.startWorkers();
		fixture.module.startWorkers();
		assert.equal(fixture.timers.length, 2);
		fixture.timers[0].callback();
		await new Promise(resolve => setImmediate(resolve));
		fixture.timers[0].callback();
		fixture.timers[1].callback();
		await new Promise(resolve => setImmediate(resolve));
		assert.equal(observerCalls, 1);
		assert.equal(collectionCalls, 1);
		let stopped = false;
		const stopping = fixture.module.stop().then(() => { stopped = true; });
		await new Promise(resolve => setImmediate(resolve));
		assert.equal(stopped, false);
		assert.equal(fixture.cancelled.length, 2);
		releaseObserver();
		await stopping;
		fixture.timers[0].callback();
		fixture.timers[1].callback();
		fixture.module.startWorkers();
		await new Promise(resolve => setImmediate(resolve));
		assert.equal(observerCalls, 1);
		assert.equal(collectionCalls, 1);
		assert.equal(fixture.timers.length, 2);
	});
});
