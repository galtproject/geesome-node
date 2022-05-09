import {IStaticIdHistoryItem} from "../database/interface";

export default interface IGeesomeStaticIdModule {
	bindToStaticId(dynamicId, staticId): Promise<IStaticIdHistoryItem>;

	resolveStaticId(staticId): Promise<string>;

	//TODO: define interface
	getStaticIdPeers(ipns): Promise<any>;

	getSelfStaticAccountId(): Promise<string>;

	createStaticAccountId(accountName): Promise<string>;
}