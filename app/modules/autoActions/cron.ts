import {IGeesomeApp} from "../../interface";
import IGeesomeAutoActionsModule from "./interface";
import CronService from "./cronService";


module.exports = (app: IGeesomeApp, autoActionsModule: IGeesomeAutoActionsModule, models) => {
	const cronService = new CronService(app, autoActionsModule);

	setInterval(async () => {
		await cronService.getActionsAndAddToQueueAndRun().catch(e => console.error('getActionsAndAddToQueue error', e));
	}, 60 * 1000);
}