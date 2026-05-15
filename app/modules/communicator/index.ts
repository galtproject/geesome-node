import IGeesomeCommunicatorModule from "./interface.js";
import {IGeesomeApp} from "../../interface.js";

function getDisabledCommunicator(): IGeesomeCommunicatorModule {
	return {
		async isReady() { return false; },
		async getAccountIdByName() { return null; },
		async getAccountPeerId() { return null; },
		async getAccountPublicKey() { return null; },
		async getCurrentAccountId() { return null; },
		async createAccountIfNotExists() { return null; },
		async removeAccountIfExists() {},
		async bindToStaticId() { return null; },
		async resolveStaticId() { return null; },
		async resolveStaticItem() { return null; },
		async resolveStaticIdEntry() { return null; },
		async keyLookup() { return null; },
		async getBootNodeList() { return []; },
		async addBootNode() { return []; },
		async removeBootNode() { return []; },
		async nodeAddressList() { return []; },
		async publishEventByStaticId() {},
		async publishEvent() {},
		async subscribeToStaticIdUpdates() {},
		async subscribeToEvent() {},
		async getStaticIdPeers() { return []; },
		async getPubSubLs() { return []; },
		async getPeers() { return []; },
		async getUpdatesTopic(cid, type) { return `${cid}:${type}`; },
		async getAccountsGroupUpdatesTopic(cids, type) { return `${cids.join(':')}:${type}`; },
		async stop() {}
	};
}

export default async (app: IGeesomeApp) => {
	app.checkModules(['accountStorage']);
	if (process.env.GEESOME_MAINTENANCE_DISABLE_COMMUNICATOR === '1') {
		return getDisabledCommunicator();
	}

	const module: IGeesomeCommunicatorModule = (await (await import('./fluence.js')).default(app)) as any;
	(await import('./api.js')).default(app, module);
	return module;
};
