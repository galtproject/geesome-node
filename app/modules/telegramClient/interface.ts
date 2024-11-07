import {IUserAsyncOperation} from "../asyncOperation/interface";
import {IAccount} from "../socNetAccount/interface";

export default interface IGeesomeTelegramClient {
	runChannelImport(userId, token, accData, channelId, advancedSettings?): Promise<{ result: {asyncOperation: IUserAsyncOperation}, client }>;

	getChannelInfoByUserId(userId, accData, channelId): Promise<{
		client,
		result: {
			//TODO: add fields from ...chats[0],
			photo,
			about
			chat,
			messagesCount
		}
	}>;

	getUserChannelsByUserId(userId, accData): Promise <{ result, client }>;

	createOrUpdateAccount(userId, accData): Promise <IAccount>;

	getMeByUserId(userId, accData): Promise<{ result, client }>;

	getUserInfoByUserId(userId, accData, userName): Promise<{ client, result }>;

	login(userId, loginData): Promise<{ client, result: { response, sessionKey, account } }>;

	getMessageLink(client, channelId, messageId): Promise<string>;

	getMessagesByClient(client, channelId, messagesIds): Promise<{client, result: {list, authorById}}>;

	storeToChannelDbByType(client, userId, type, storeId, isCollateral?): Promise<{dbChannel}>

	storeObjToChannelDbByType(client, userId, type, storeObj, isCollateral?): Promise<{dbChannel}>

	// getMessage(dbChannel, m): Promise<any>

	downloadMediaByClient(client, media): Promise<{client, result}>;
}