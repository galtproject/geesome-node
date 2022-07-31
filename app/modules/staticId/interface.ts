export default interface IGeesomeStaticIdModule {
	addStaticIdHistoryItem(staticIdItem): Promise<IStaticIdHistoryItem>;

	getActualStaticIdItem(staticId): Promise<IStaticIdHistoryItem>;

	destroyStaticIdHistory(staticId): Promise<any>;

	getStaticIdItemByDynamicId(dynamicId): Promise<IStaticIdHistoryItem>;

	bindToStaticId(userId, dynamicId, staticId): Promise<IStaticIdHistoryItem>;

	bindToStaticIdByGroup(userId, groupId, dynamicId, staticId): Promise<IStaticIdHistoryItem>;

	resolveStaticId(staticId): Promise<string>;

	setStaticAccountGroupId(userId, name, groupId): Promise<any>;

	//TODO: define interface
	getStaticIdPeers(ipns): Promise<any>;

	getSelfStaticAccountId(): Promise<string>;

	createStaticAccountId(userId, accountName): Promise<string>;

	createStaticGroupAccountId(userId, groupId, accountName): Promise<string>;

	getOrCreateStaticAccountId(userId, accountName): Promise<string>;

	getOrCreateStaticGroupAccountId(userId, groupId, name): Promise<string>;

	renameStaticAccountId(userId, oldName, newName): Promise<any>;

	renameGroupStaticAccountId(userId, groupId, oldName, newName): Promise<any>;
}

export interface IStaticIdHistoryItem {
	id?: number;
	staticId: string;
	dynamicId: string;
	periodTimestamp?: number;
	isActive: boolean;
	boundAt: Date;
}