import {IGeesomeApp} from "../../interface.js";
import IGeesomeStorageModule from "./interface.js";
import {storageRpc, pinTimeoutMs, storageImportTimeoutMs} from './rpcDeadline.js';
import ipfsHelper from "geesome-libs/src/ipfsHelper.js";

export default async (app: IGeesomeApp, options = {implementation: null}) => {
	const implementation = options.implementation || app.config.storageConfig.implementation;
	const module: IGeesomeStorageModule = await (await import(`./${implementation}.js`)).default(app);
	return makeStorageStopIdempotent(configureStoragePinning(normalizeStorageAddresses(module)));
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

export function configureStoragePinning(module: IGeesomeStorageModule,
	policy = {importTimeoutMs: storageImportTimeoutMs(), pinProofTimeoutMs: pinTimeoutMs}): IGeesomeStorageModule {
	for (const value of [policy.importTimeoutMs, policy.pinProofTimeoutMs]) {
		if (!Number.isSafeInteger(value) || value < 1) {
			throw new Error('storage_import_timeout_configuration_invalid');
		}
	}
	// Pinned imports no longer pass through addPin. Retain the same bounded RPC
	// and fence-loss cancellation over import, stream consumption and pin proof.
	for (const name of ['saveFile', 'saveDirectory', 'saveObject']) {
		const original = (module as any)[name];
		if (typeof original === 'function') {
			(module as any)[name] = function (data, options = {}) {
				const requestedProof = (options as any).pinProofTimeoutMs ?? policy.pinProofTimeoutMs;
				if (!Number.isSafeInteger(requestedProof) || requestedProof < 1) {
					return Promise.reject(new Error('kubo_import_pin_proof_budget_invalid'));
				}
				return storageRpc('import', options, bounded => original.call(this, data,
					{...bounded, pinProofTimeoutMs: Math.min(requestedProof, policy.pinProofTimeoutMs)}), policy.importTimeoutMs);
			};
		}
	}
	if (!(module as any).addPin) {
		return module;
	}
	(module as any).addPin = async (hash, options = {}) => {
		const cid = ipfsHelper.ipfsHashToCid(hash);
		return storageRpc('pin', options, async bounded => {
			if ((module as any).type === 'helia') {
				for await (const _value of module.node.pins.add(cid, bounded)) {
					// Iterating completes the Helia pin operation.
				}
				return;
			}
			await module.node.pin.add(cid, bounded);
		});
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
