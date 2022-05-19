export default interface IGeesomeForeignAccountsModule {
	setUserAccounts(userId: number, accounts: IForeignAccount[]): Promise<IForeignAccount[]>;

	createAccount(userId: number, account: IForeignAccount): Promise<IForeignAccount>;

	updateAccount(userId: number, id: number, updateData: IForeignAccount): Promise<IForeignAccount>;

	getUserAccount(id: number): Promise<IForeignAccount>;

	getUserAccountByProvider(userId, provider): Promise<IForeignAccount>;

	getUserAccountByAddress(provider, address): Promise<IForeignAccount>;

	getUserAccountsList(userId: number): Promise<IForeignAccount[]>;

	getAuthMessage(id): Promise<IAuthMessage>;

	createAuthMessage(authMessageData): Promise<IAuthMessage>;
}

export interface IForeignAccount {
	id?: number;
	title?: string;
	provider?: string;
	userId?: number;
	type?: string;
	address?: string;
	description?: string;
	signature?: string;
}

export interface IAuthMessage {
	id: number;
	userAccountId: number;
	provider: string;
	address: string;
	message: string;
}