import {IGeesomeApp} from "../../interface.js";
import IGeesomeStorageModule from "./interface.js";
import ipfsHelper from "geesome-libs/src/ipfsHelper.js";

export default async (app: IGeesomeApp, options = {implementation: null}) => {
	const implementation = options.implementation || app.config.storageConfig.implementation;
	const module: IGeesomeStorageModule = await (await import(`./${implementation}.js`)).default(app);
	return makeStorageStopIdempotent(suppressStoragePinLogs(normalizeStorageAddresses(module)));
};

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

function suppressStoragePinLogs(module: IGeesomeStorageModule): IGeesomeStorageModule {
	if (!(module as any).addPin) {
		return module;
	}
	(module as any).addPin = async hash => {
		const cid = ipfsHelper.ipfsHashToCid(hash);
		if ((module as any).type === 'helia') {
			for await (const _value of module.node.pins.add(cid)) {
				// Iterating completes the Helia pin operation.
			}
			return;
		}
		await module.node.pin.add(cid);
	};
	return module;
}

function makeStorageStopIdempotent(module: IGeesomeStorageModule): IGeesomeStorageModule {
	const stop = module.stop?.bind(module);
	if (!stop) {
		return module;
	}
	let stopPromise: Promise<any> | null = null;
	module.stop = () => {
		if (!stopPromise) {
			stopPromise = Promise.resolve().then(stop);
		}
		return stopPromise;
	};
	return module;
}
