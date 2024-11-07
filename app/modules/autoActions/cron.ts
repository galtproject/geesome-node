import {IGeesomeApp} from "../../interface";
import IGeesomeAutoActionsModule from "./interface";
import CronService from "./cronService";

export default (app: IGeesomeApp, autoActionsModule: IGeesomeAutoActionsModule) => {
	const cronService = new CronService(app, autoActionsModule);

	setInterval(async () => {
		await cronService.getActionsAndAddToQueueAndRun().catch(e => console.error('getActionsAndAddToQueue error', e));
	}, 60 * 1000);
}