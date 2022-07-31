import {IContent} from "../database/interface";
import {IPost} from "../group/interface";

export default interface IGeesomeSocNetImport {
	getDbChannel(userId, where);

	createDbChannel(channelData);

	reinitializeDbChannel(id, channelData);

	importChannelPosts(userId, dbChannel, messages, advancedSettings = {}, client = {});

	storeContentMessage(contentMessageData, content: IContent);

	getDbChannelLastMessage(dbChannelId);

	findExistsChannelMessage(msgId, dbChannelId, userId);

	publishPost(_importState, _existsChannelMessage, _postData, _msgData): Promise<IPost>;

	flushDatabase(): Promise<any>;
}