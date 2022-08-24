export default interface IGeesomeSocNetAccount {
	createOrUpdateAccount(userId, accData): Promise<IAccount>;

	getAccount(userId, socNet, accountData): Promise<IAccount>;

	getAccountByUsernameOrPhone(userId, socNet, username, phoneNumber): Promise<IAccount>;

	getAccountList(userId, accountData): Promise<IAccount[]>;

	flushDatabase(): Promise<any>;
}

export interface IAccount {
	id: number;
	userId: number;
	socNet: string;
	userAddress: string;
	phoneNumber: string;
	username: string;
	fullName: string;
	apiId: string;
	apiKey: string;
	sessionKey: string;
	isEncrypted: boolean;
}