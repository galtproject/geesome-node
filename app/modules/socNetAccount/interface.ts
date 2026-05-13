import {IListParams} from "../database/interface.js";

export default interface IGeesomeSocNetAccount {
	createOrUpdateAccount(userId, accData): Promise<IAccount>;

	getAccount(userId, socNet, accountData): Promise<IAccount>;

	getAccountByUsernameOrPhone(userId, socNet, username, phoneNumber): Promise<IAccount>;

	getAccountList(userId, socNet?, listParams?: IListParams): Promise<IAccount[]>;

	flushDatabase(): Promise<any>;
}

export interface IAccount {
	id: number;
	userId: number;
	socNet: string;
	accountId: string;
	userAddress: string;
	phoneNumber: string;
	username: string;
	fullName: string;
	apiId: string;
	apiKey: string;
	accessToken: string;
	sessionKey: string;
	isEncrypted: boolean;
}

export interface ISocNetAccountListInput {
	socNet?: string;
	accountData?: string | {
		socNet?: string;
	};
	limit?: number;
	offset?: number;
	sortBy?: string;
	sortDir?: string;
}
