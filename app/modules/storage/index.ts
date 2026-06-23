import {IGeesomeApp} from "../../interface.js";
import IGeesomeStorageModule from "./interface.js";
import ipfsHelper from "geesome-libs/src/ipfsHelper.js";

export default async (app: IGeesomeApp, options = {implementation: null}) => {
	const implementation = options.implementation || app.config.storageConfig.implementation;
	const module: IGeesomeStorageModule = await (await import(`./${implementation}.js`)).default(app);
	return suppressStoragePinLogs(normalizeStorageAddresses(module));
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
	const addPin = (module as any).addPin?.bind(module);
	if (!addPin) {
		return module;
	}
	(module as any).addPin = (hash, ...args) => addStoragePinWithoutDependencyLog(module, addPin, hash, args);
	return module;
}

async function addStoragePinWithoutDependencyLog(module: IGeesomeStorageModule, addPin, hash, args) {
	const cid = ipfsHelper.ipfsHashToCid(hash);
	if ((module as any).node?.pins?.add) {
		for await (const _value of (module as any).node.pins.add(cid, ...args)) {}
		return;
	}
	if ((module as any).node?.pin?.add) {
		await (module as any).node.pin.add(cid, ...args);
		return;
	}
	return withSuppressedStoragePinLogs(() => addPin(hash, ...args));
}

function withSuppressedStoragePinLogs(callback) {
	const originalLog = console.log;
	console.log = (...args) => {
		if (isStoragePinLog(args)) {
			return;
		}
		originalLog.apply(console, args);
	};

	try {
		const result = callback();
		if (result && typeof result.finally === 'function') {
			return result.finally(() => {
				console.log = originalLog;
			});
		}
		console.log = originalLog;
		return result;
	} catch (e) {
		console.log = originalLog;
		throw e;
	}
}

function isStoragePinLog(args) {
	return args.length >= 2 && args[1] === 'pinned:';
}
