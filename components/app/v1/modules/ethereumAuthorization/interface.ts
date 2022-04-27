import {IUserAuthMessageResponse} from "../../../interface";

export default interface IGeesomeEthereumAuthorizationModule {
	generateUserAccountAuthMessage(accountProvider, accountAddress): Promise<IUserAuthMessageResponse>;

	loginAuthMessage(authMessageId, address, signature, params?);
}