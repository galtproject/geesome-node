import {IContent} from "../database/interface";
import {IPost} from "../group/interface";
import {IUserAsyncOperation} from "../asyncOperation/interface";

export default interface IGeesomeTwitterClient {
	runChannelImport(userId, token, accData, channelId, advancedSettings?): Promise<{asyncOperation: IUserAsyncOperation}>;

	getChannelInfoByUserId(userId, accData, channelId): Promise<{
		//TODO: add fields from ...chats[0],
		photo,
		about
		chat,
		messagesCount
	}>

	getUserChannelsByUserId(userId, accData): Promise <any>;

	getChannelInfoByUserId(userId, accData, channelId): Promise<any>;

	createOrUpdateAccount(accData): Promise <any>;

	getMeByUserId(userId, accData): Promise<any>;

	getUserInfoByUserId(userId, accData, userName): Promise<any>;

	login(userId, loginData): Promise<any>;

	messageToContents(userId, dbChannel, m): Promise<IContent[]>;

	createDbChannel(channelData): Promise<any>;

	publishPost(_importState, _existsChannelMessage, _postData, _msgData): Promise<IPost>;

	findExistsChannelMessage(msgId, dbChannelId, userId): Promise<any>;
}