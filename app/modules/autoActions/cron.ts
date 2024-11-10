import {IGeesomeApp} from "../../interface.js";
import IGeesomeAutoActionsModule from "./interface.js";
import CronService from "./cronService.js";

export default (app: IGeesomeApp, autoActionsModule: IGeesomeAutoActionsModule) => {
	const cronService = new CronService(app, autoActionsModule);

	setInterval(async () => {
		await cronService.getActionsAndAddToQueueAndRun().catch(e => console.error('getActionsAndAddToQueue error', e));
	}, 60 * 1000);
}