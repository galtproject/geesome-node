import {IGeesomeApp} from '../../interface.js';
import IGeesomePinModule, {IPinReconciliationQueueOptions} from './interface.js';

const defaultPinReconciliationWorkerLimit = 20;
const defaultPinReconciliationPerAccountLimit = 2;
const defaultPinReconciliationClaimTtlMs = 5 * 60 * 1000;

export interface IPinReconciliationSweepResult {
	queued: number;
	processed: number;
}

export default class PinReconciliationCronService {
	app: IGeesomeApp;
	pinModule: IGeesomePinModule;
	sweepInProcess = false;

	constructor(app: IGeesomeApp, pinModule: IGeesomePinModule) {
		this.app = app;
		this.pinModule = pinModule;
	}

	async runSweep(options: IPinReconciliationQueueOptions = {}): Promise<IPinReconciliationSweepResult> {
		if (this.sweepInProcess) {
			return {queued: 0, processed: 0};
		}

		this.sweepInProcess = true;
		try {
			const sweepOptions = {
				...getPinReconciliationWorkerOptions(this.app),
				...options
			};
			let queued = 0;
			let queueError;
			try {
				queued = (await this.pinModule.queueDuePinReconciliations(sweepOptions)).queued;
			} catch (error) {
				queueError = error;
			}

			let processed = 0;
			let processError;
			try {
				processed = (await this.pinModule.processPinReconciliationQueue(sweepOptions)).processed;
			} catch (error) {
				processError = error;
			}
			throwPinReconciliationSweepError(queueError, processError);
			return {queued, processed};
		} finally {
			this.sweepInProcess = false;
		}
	}
}

function getPinReconciliationWorkerOptions(app: IGeesomeApp): IPinReconciliationQueueOptions {
	const config = app.config.pinConfig || {};
	return {
		limit: parsePositiveInteger(config.reconciliationWorkerLimit, defaultPinReconciliationWorkerLimit),
		perAccountLimit: parsePositiveInteger(
			config.reconciliationPerAccountLimit,
			defaultPinReconciliationPerAccountLimit
		),
		claimTtlMs: parsePositiveInteger(config.reconciliationClaimTtlMs, defaultPinReconciliationClaimTtlMs)
	};
}

function throwPinReconciliationSweepError(queueError, processError) {
	if (queueError && processError) {
		throw new AggregateError([queueError, processError], 'pin_reconciliation_sweep_failed');
	}
	if (queueError) {
		throw queueError;
	}
	if (processError) {
		throw processError;
	}
}

function parsePositiveInteger(value, fallback: number): number {
	const parsed = Number.parseInt(value as any, 10);
	if (Number.isFinite(parsed) && parsed > 0) {
		return parsed;
	}
	return fallback;
}
