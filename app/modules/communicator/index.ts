import IGeesomeCommunicatorModule from "./interface";
import {IGeesomeApp} from "../../interface";

export default async (app: IGeesomeApp) => {
	app.checkModules(['accountStorage']);

	const module: IGeesomeCommunicatorModule = await (await import('./fluence')).default(app);
	(await import('./api')).default(app, module);
	return module;
};