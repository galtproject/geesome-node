import {IContent} from "../database/interface";

export default interface IGeesomeSocNetImport {
	getDbChannel(userId, where);

	createDbChannel(channelData);

	reinitializeDbChannel(id, channelData);

	importChannelPosts(client, userId, dbChannel, messages, force = false, advancedSettings = {}, onMessageProcess = null);

	storeContentMessage(contentMessageData, content: IContent);

	getDbChannelLastMessage(dbChannelId);

	findExistsChannelMessage(msgId, dbChannelId, userId);

	flushDatabase(): Promise<any>;
}