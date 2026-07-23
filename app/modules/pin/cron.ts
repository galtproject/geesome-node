import {IGeesomeApp} from '../../interface.js';
import {startIntervalWorker} from '../../backgroundWorker.js';
import type {IBackgroundWorker} from '../../backgroundWorker.js';
import IGeesomePinModule from './interface.js';
import PinReconciliationCronService from './cronService.js';

const defaultPinReconciliationWorkerIntervalMs = 5 * 60 * 1000;

interface IPinReconciliationCronOptions {
	cronService?: PinReconciliationCronService;
	intervalMs?: number;
}

export default (
	app: IGeesomeApp,
	pinModule: IGeesomePinModule,
	options: IPinReconciliationCronOptions = {}
): IBackgroundWorker | null => {
	if (!isPinReconciliationWorkerEnabled(app)) {
		return null;
	}

	const cronService = options.cronService || new PinReconciliationCronService(app, pinModule);
	return startIntervalWorker(
		() => cronService.runSweep(),
		{
			intervalMs: parsePositiveInteger(
				options.intervalMs ?? app.config.pinConfig?.reconciliationWorkerIntervalMs,
				defaultPinReconciliationWorkerIntervalMs
			),
			runImmediately: true,
			onError: e => console.error('pinReconciliationSweep error', e)
		}
	);
}

function isPinReconciliationWorkerEnabled(app: IGeesomeApp): boolean {
	const value = app.config.pinConfig?.reconciliationWorker;
	return value === true || value === '1' || value === 'true';
}

function parsePositiveInteger(value, fallback: number): number {
	const parsed = Number.parseInt(value as any, 10);
	if (Number.isFinite(parsed) && parsed > 0) {
		return parsed;
	}
	return fallback;
}
