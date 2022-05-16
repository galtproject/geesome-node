
export default interface IGeesomeForeignAccountsModule {
	createAccount(userId: number, account: IForeignAccount): Promise<IForeignAccount>;

	updateAccount(userId: number, id: number, updateData: IForeignAccount): Promise<IForeignAccount>;

	getUserAccount(userId: number, name: string): Promise<IForeignAccount>;

	getGroupAccount(userId: number, groupId: number, name: string): Promise<IForeignAccount>;

	getUserAccountsList(userId: number): Promise<IForeignAccount[]>;

	getGroupAccountsList(userId: number, groupId: number): Promise<IForeignAccount[]>;

	pinByUserAccount(userId: number, name: string, storageId: string, options?): Promise<any>;

	pinByGroupAccount(userId: number, groupId: number, name: string, storageId: string, options?): Promise<any>;
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