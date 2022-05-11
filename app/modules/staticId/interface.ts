export default interface IGeesomeStaticIdModule {
	addStaticIdHistoryItem(staticIdItem): Promise<IStaticIdHistoryItem>;

	getActualStaticIdItem(staticId): Promise<IStaticIdHistoryItem>;

	destroyStaticIdHistory(staticId): Promise<any>;

	getStaticIdItemByDynamicId(dynamicId): Promise<IStaticIdHistoryItem>;

	bindToStaticId(userId, dynamicId, staticId): Promise<IStaticIdHistoryItem>;

	resolveStaticId(staticId): Promise<string>;

	//TODO: define interface
	getStaticIdPeers(ipns): Promise<any>;

	getSelfStaticAccountId(): Promise<string>;

	createStaticAccountId(userId, accountName): Promise<string>;

	getOrCreateStaticAccountId(userId, accountName): Promise<string>;
}

export interface IStaticIdHistoryItem {
	id?: number;
	staticId: string;
	dynamicId: string;
	periodTimestamp?: number;
	isActive: boolean;
	boundAt: Date;
}