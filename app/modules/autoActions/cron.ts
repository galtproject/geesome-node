import {IGeesomeApp} from "../../interface.js";
import helpers from "../../helpers.js";
import IGeesomeAutoActionsModule from "./interface.js";
import CronService from "./cronService.js";

const defaultAutoActionsCronIntervalMs = 60 * 1000;

export interface IAutoActionsCronWorker {
	stop(): Promise<void>;
}

interface IAutoActionsCronOptions {
	intervalMs?: number;
	cronService?: CronService;
}

export default (
	app: IGeesomeApp,
	autoActionsModule: IGeesomeAutoActionsModule,
	options: IAutoActionsCronOptions = {}
): IAutoActionsCronWorker => {
	const cronService = options.cronService || new CronService(app, autoActionsModule);
	const intervalMs = helpers.parsePositiveInteger(options.intervalMs, defaultAutoActionsCronIntervalMs);
	let runPromise: Promise<any> | null = null;
	let stopped = false;
	const timer = setInterval(() => {
		if (stopped || runPromise) {
			return;
		}
		runPromise = cronService.getActionsAndAddToQueueAndRun()
			.catch(e => console.error('getActionsAndAddToQueue error', e))
			.finally(() => {
				runPromise = null;
			});
	}, intervalMs);
	timer.unref?.();

	return {
		async stop() {
			stopped = true;
			clearInterval(timer);
			await runPromise;
		}
	};
}
