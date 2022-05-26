
export default interface IGeesomeAccountStorageModule {
	getAccountPeerId(name: string): Promise<any>;

	createAccount(name: string, userId: number, groupId?: number): Promise<IStaticIdAccount>;

	getOrCreateAccountStaticId(name: string, userId: number, groupId?: number): Promise<string>;

	getLocalAccountStaticIdByNameAndUserId(name: string, userId: number): Promise<string>;

	getLocalAccountStaticIdByNameAndGroupId(name: string, groupId: number): Promise<string>;

	getAccountStaticId(name): Promise<string>;

	getAccountByName(name): Promise<IStaticIdAccount>;

	renameAccount(oldName, newName): Promise<any>;

	getAccountPublicKey(name): Promise<string>;

	destroyStaticId(name): Promise<any>;

	createRemoteAccount(staticId, publicKey, name?, groupId?): Promise<IStaticIdAccount>;

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
	groupId?: number;
	isRemote: boolean;
	staticId: string;
	publicKey: string;
	encryptedPrivateKey?: string;
}