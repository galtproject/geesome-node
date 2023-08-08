import {IGeesomeApp} from "../../interface";
import IGeesomeStorageModule from "./interface";

module.exports = async (app: IGeesomeApp, options = {implementation: null}) => {
	const implementation = options.implementation || app.config.storageConfig.implementation;
	const module: IGeesomeStorageModule = await require(`./${implementation}`)(app);
	return module;
};