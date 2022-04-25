export default interface IGeesomeAccountStorageModule {
	getAccountPeerId(name: string): Promise<any>;

	getOrCreateAccountStaticId(name): Promise<string>;

	getAccountStaticId(name): Promise<string>;

	getAccountPublicKey(name): Promise<string>;

	destroyStaticId(name): Promise<any>;
}