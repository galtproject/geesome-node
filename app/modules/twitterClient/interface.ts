import {IContent} from "../database/interface.js";
import {IUserAsyncOperation} from "../asyncOperation/interface.js";

export default interface IGeesomeTwitterClient {
	runChannelImport(userId, token, accData, channelId, advancedSettings?): Promise<{result: {asyncOperation: IUserAsyncOperation}}>;

	getChannelInfoByUserId(userId, accData, channelId): Promise<{
		//TODO: add fields from ...chats[0],
		photo,
		about
		chat,
		messagesCount
	}>

	getUserChannelsByUserId(userId, accData): Promise <any>;

	getChannelInfoByUserId(userId, accData, channelId): Promise<any>;

	getChannelInfoByClient(client, channelId): Promise<any>;

	getMeByUserId(userId, accData): Promise<any>;

	getUserInfoByUserId(userId, accData, userName): Promise<any>;

	login(userId, loginData): Promise<any>;

	// messageToContents(userId, dbChannel, m, type?): Promise<IContent[]>;

	// createDbChannel(channelData): Promise<any>;

	storeChannelToDb(userId, accountId, channel, updateData?, isCollateral?): Promise<any>;

	// publishPost(_importState, _existsChannelMessage, _postData, _msgData): Promise<IPost>;

	// findExistsChannelMessage(msgId, dbChannelId, userId): Promise<any>;

	saveMedia(userId, media: {url, alt_text}): Promise<IContent>;

	importMessagesList(userId, client, dbChannel, messages, advancedSettings, onRemotePostProcess?);
}

export interface IMessagesState {
	mediasByKey: {};
	tweetsById: {};
	authorById: {};
	listIds: string[];
}

export interface ITimelineMessagesState extends IMessagesState {
	nextToken;
}