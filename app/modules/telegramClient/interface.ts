import {IContent, IUserAsyncOperation} from "../database/interface";
import {IPost} from "../group/interface";

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
	}>

	getUserChannelsByUserId(userId, accData): Promise <{ result, client }>;

	createOrUpdateAccount(accData): Promise <any>;

	getMeByUserId(userId, accData): Promise<{ result, client }>;

	getUserInfoByUserId(userId, accData, userName): Promise<{ client, result }>;

	login(userId, loginData): Promise<{ client, result: { response, sessionKey, account } }>;

	messageToContents(client, dbChannel, m, userId): Promise<IContent[]>;

	createDbChannel(channelData): Promise<any>;

	publishPost(_importState, _existsChannelMessage, _postData, _msgData): Promise<IPost>;

	findExistsChannelMessage(msgId, dbChannelId, userId): Promise<any>;

	flushDatabase(): Promise<any>;
}