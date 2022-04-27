import IGeesomeCommunicatorModule from "./interface";
import {IGeesomeApp} from "../../interface";

module.exports = async (app: IGeesomeApp) => {
	app.checkModules(['accountStorage']);

	const module: IGeesomeCommunicatorModule = await require('./fluence')(app);
	require('./api')(app, module);
	return module;
};