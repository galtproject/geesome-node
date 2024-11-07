import {IUserAuthMessageResponse} from "../../interface.js";

export default interface IGeesomeEthereumAuthorizationModule {
	generateUserAccountAuthMessage(accountProvider, accountAddress): Promise<IUserAuthMessageResponse>;

	loginAuthMessage(authMessageId, address, signature, params?);
}