import IGeesomeCommunicatorModule from "./interface.js";
import {IGeesomeApp} from "../../interface.js";

export default async (app: IGeesomeApp) => {
	app.checkModules(['accountStorage']);

	const module: IGeesomeCommunicatorModule = (await (await import('./fluence.js')).default(app)) as any;
	(await import('./api.js')).default(app, module);
	return module;
};