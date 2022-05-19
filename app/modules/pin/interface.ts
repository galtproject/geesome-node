
export default interface IGeesomePinModule {
	createAccount(userId: number, account: IPinAccount): Promise<IPinAccount>;

	updateAccount(userId: number, id: number, updateData: IPinAccount): Promise<IPinAccount>;

	getUserAccount(userId: number, name: string): Promise<IPinAccount>;

	getGroupAccount(userId: number, groupId: number, name: string): Promise<IPinAccount>;

	getUserAccountsList(userId: number): Promise<IPinAccount[]>;

	getGroupAccountsList(userId: number, groupId: number): Promise<IPinAccount[]>;

	pinByUserAccount(userId: number, name: string, storageId: string, options?): Promise<any>;

	pinByGroupAccount(userId: number, groupId: number, name: string, storageId: string, options?): Promise<any>;
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