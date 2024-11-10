import {IGeesomeApp} from "../../interface.js";
import IGeesomeStorageModule from "./interface.js";

export default async (app: IGeesomeApp, options = {implementation: null}) => {
	const implementation = options.implementation || app.config.storageConfig.implementation;
	const module: IGeesomeStorageModule = (await import(`./${implementation}.js`)).default(app);
	return module;
};