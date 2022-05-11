
export default interface IGeesomeAccountStorageModule {
	getAccountPeerId(name: string): Promise<any>;

	createAccount(name: string, userId: number): Promise<IStaticIdAccount>;

	getOrCreateAccountStaticId(name: string, userId: number): Promise<string>;

	getLocalAccountStaticIdByNameAndUserId(name: string, userId: number): Promise<string>;

	getAccountStaticId(name): Promise<string>;

	getAccountPublicKey(name): Promise<string>;

	destroyStaticId(name): Promise<any>;

	setStaticIdKey(userId, staticId, publicKey, name?, encryptedPrivateKey?): Promise<IStaticIdAccount>;

	getStaticIdPublicKeyByOr(staticId, name?): Promise<string>;

	getStaticIdByName(name): Promise<string>;

	getUserIdOfLocalStaticIdAccount(staticId): Promise<number>;

	getStaticIdEncryptedPrivateKey(staticId?, name?): Promise<string>;

	destroyStaticIdByOr(staticId, name?): Promise<void>;
}

export interface IStaticIdAccount {
	id?: number;
	name?: string;
	userId?: number;
	isRemote: boolean;
	staticId: string;
	publicKey: string;
	encryptedPrivateKey?: string;
}