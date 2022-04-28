import {IGeesomeApp} from "../../interface";
import IGeesomeStorageModule from "./interface";

module.exports = async (app: IGeesomeApp, options = {implementation: null}) => {
	const module: IGeesomeStorageModule = await require('./' + (options.implementation || app.config.storageConfig.implementation))(app);
	return module;
};