import {IListParams} from "../database/interface.js";

export default interface IGeesomePinModule {
	createAccount(userId: number, account: IPinAccount): Promise<IPinAccount>;

	updateAccount(userId: number, id: number, updateData: IPinAccount): Promise<IPinAccount>;

	deleteAccount(userId: number, id: number): Promise<{success: boolean}>;

	getUserAccount(userId: number, name: string): Promise<IPinAccount>;

	getGroupAccount(userId: number, groupId: number, name: string): Promise<IPinAccount>;

	getUserAccountsList(userId: number, listParams?: IListParams): Promise<IPinAccount[]>;

	getGroupAccountsList(userId: number, groupId: number, listParams?: IListParams): Promise<IPinAccount[]>;

	pinByUserAccount(userId: number, name: string, storageId: string, options?): Promise<any>;

	pinByGroupAccount(userId: number, groupId: number, name: string, storageId: string, options?): Promise<any>;

	recordPinnedStorageObject?(storageId: string, account: IPinAccount, content?: any, result?: any): Promise<IPinStorageObject | null>;
}

export interface IPinAccount {
	id?: number;
	name?: string;
	service?: string;
	endpoint?: string;
	userId?: number;
	groupId?: number;
	apiKey?: string;
	isEncrypted?: boolean;
	secretApiKeyEncrypted?: string;
	secretApiKey?: string;
	options?: string;
}

export interface IPinStorageObject {
	id?: number;
	storageId: string;
	service?: string;
	status?: string;
	pinAccountId?: number;
	accountName?: string;
	userId?: number;
	groupId?: number;
	remoteId?: string;
	pinnedAt?: Date;
	checkedAt?: Date;
	resultJson?: string;
}
