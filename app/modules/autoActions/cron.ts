import {IGeesomeApp} from "../../interface.js";
import helpers from "../../helpers.js";
import {startIntervalWorker} from "../../backgroundWorker.js";
import type {IBackgroundWorker} from "../../backgroundWorker.js";
import IGeesomeAutoActionsModule from "./interface.js";
import CronService from "./cronService.js";

const defaultAutoActionsCronIntervalMs = 60 * 1000;

interface IAutoActionsCronOptions {
	intervalMs?: number;
	cronService?: CronService;
}

export default (
	app: IGeesomeApp,
	autoActionsModule: IGeesomeAutoActionsModule,
	options: IAutoActionsCronOptions = {}
): IBackgroundWorker => {
	const cronService = options.cronService || new CronService(app, autoActionsModule);
	const intervalMs = helpers.parsePositiveInteger(options.intervalMs, defaultAutoActionsCronIntervalMs);
	return startIntervalWorker(
		() => cronService.getActionsAndAddToQueueAndRun(),
		{
			intervalMs,
			onError: e => console.error('getActionsAndAddToQueue error', e)
		}
	);
}
