import {IGeesomeApp} from "../../interface";
import IGeesomeStorageModule from "./interface";

export default async (app: IGeesomeApp, options = {implementation: null}) => {
	const implementation = options.implementation || app.config.storageConfig.implementation;
	const module: IGeesomeStorageModule = (await import(`./${implementation}`)).default(app);
	return module;
};