import defineModels from './models.js';
import { createDirectCrypto } from './directCrypto.js';
import registerApi from './api.js';
export default async function (app) {
	app.checkModules(['database', 'api']);
	const module = createPayments(app, await defineModels(app.ms.database.sequelize));
	registerApi(app, module);
	return module;
}
export function createPayments(app, models, dependencies: any = {}) {
	let engine;
	let stopped = false;
	const timers = new Map();
	const running = new Map<string, Promise<void>>();
	const env = dependencies.env || process.env;
	const schedule = dependencies.schedule || setInterval;
	const cancel = dependencies.cancel || clearInterval;
	const module = {
		models,
		configureLedger(ledger) {
			if (engine) {
				throw new Error('payments_ledger_already_configured');
			}
			engine = createDirectCrypto({ ...dependencies, ...ledger, M: { ...models, ...ledger.models },
				sequelize: app.ms.database.sequelize, env });
		},
		get engine() {
			if (!engine) {
				throw new Error('payments_ledger_not_configured');
			}
			return engine;
		},
		startWorkers() {
			if (stopped) {
				return;
			}
			const workers = [
				{ name: 'observer', enabled: app.config.paymentsConfig?.worker, run: () => module.engine.run(), interval: 5000 },
				{ name: 'collection', enabled: app.config.paymentsConfig?.collectionWorker, run: () => module.engine.treasury.run(), interval: module.engine.treasury.config.workerIntervalMs }
			];
			for (const worker of workers) {
				if (worker.enabled !== true || timers.has(worker.name)) {
					continue;
				}
				const timer = schedule(() => {
					if (stopped || running.has(worker.name)) {
						return;
					}
					const work = Promise.resolve().then(worker.run).catch(() => {
						console.error(`payments_worker_failed worker=${worker.name}`);
					}).finally(() => { running.delete(worker.name); });
					running.set(worker.name, work);
				}, worker.interval);
				timer.unref();
				timers.set(worker.name, timer);
			}
		},
		async stop() {
			stopped = true;
			for (const timer of timers.values()) {
				cancel(timer);
			}
			await Promise.all(running.values());
		}
	};
	return module;
}
