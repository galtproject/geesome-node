import {IGeesomeApp} from "../../interface.js";
import IGeesomeStorageModule from "./interface.js";

function normalizeStorageAddress(address): string {
	if (typeof address === "string") {
		return address;
	}
	if (address?.multiaddr) {
		return normalizeStorageAddress(address.multiaddr);
	}
	if (typeof address?.toString === "function") {
		return address.toString();
	}
	return String(address);
}

function normalizeStorageAddresses(module: IGeesomeStorageModule): IGeesomeStorageModule {
	const nodeAddressList = module.nodeAddressList.bind(module);
	const copyFileFromId = module.copyFileFromId.bind(module);

	module.nodeAddressList = async () => {
		return (await nodeAddressList()).map(normalizeStorageAddress);
	};
	module.remoteNodeAddressList = async (types = []) => {
		let addresses = (await module.nodeAddressList())
			.filter((address) => !address.includes('/127.0.0.1/'));
		types.forEach((type) => {
			addresses = addresses.filter((address) => address.includes('/' + type + '/'));
		});
		return addresses;
	};
	module.copyFileFromId = async (storageId, filePath) => {
		try {
			const exist = await module.fileLs(filePath, true);
			if (exist && module.node?.files?.rm) {
				await module.node.files.rm(filePath, {recursive: true});
			}
		} catch (e) {
			if (!e.message.includes('file does not exist')) {
				throw e;
			}
		}
		return copyFileFromId(normalizeStorageAddress(storageId), filePath);
	};

	return module;
}

export default async (app: IGeesomeApp, options = {implementation: null}) => {
	const implementation = options.implementation || app.config.storageConfig.implementation;
	const module: IGeesomeStorageModule = await (await import(`./${implementation}.js`)).default(app);
	return normalizeStorageAddresses(module);
};
