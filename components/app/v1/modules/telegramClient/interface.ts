import {IUserAsyncOperation} from "../database/interface";

export default interface IGeesomeTelegramClient {
	runChannelImport(userId, apiKey, accData, channelId): Promise<{ result: {asyncOperation: IUserAsyncOperation}, client }>;

	getChannelInfoByUserId(userId, accData, channelId): Promise<{
		client,
		result: {
			//TODO: add fields from ...chats[0],
			photo,
			about
			chat,
			messagesCount
		}
	}>

	getUserChannelsByUserId(userId, accData): Promise <{ result, client }>;

	createOrUpdateAccount(accData): Promise <any>;

	getMeByUserId(userId, accData): Promise<{ result, client }>;

	getUserInfoByUserId(userId, accData, userName): Promise<{ client, result }>;

	login(userId, loginData): Promise<{ client, result: { response, sessionKey, account } }>;
}