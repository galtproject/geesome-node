import {IContent} from "../database/interface";
import {IPost} from "../group/interface";

export default interface IGeesomeSocNetImport {
	getDbChannel(userId, where);

	createDbChannel(channelData);

	reinitializeDbChannel(id, channelData);

	importChannelMetadata(userId, socNet, accountId, channelMetadata, updateData?);

	prepareChannelQuery(dbChannel, remotePostsCount, advancedSettings);

	openImportAsyncOperation(userId, userApiKeyId, dbChannel);

	importChannelPosts(userId, dbChannel, messages, advancedSettings = {}, client = {});

	storeContentMessage(contentMessageData, content: IContent);

	getDbChannelLastMessage(dbChannelId);

	findExistsChannelMessage(msgId, dbChannelId, userId);

	publishPost(_importState, _existsChannelMessage, _postData, _msgData): Promise<IPost>;

	flushDatabase(): Promise<any>;
}

export interface IGeesomeSocNetImportClient {
	getRemotePostLink(_channel, msgId): Promise<string>;
	getRemotePostReplyToMsgId(m): string;
	getRemotePostRepostOfMsgId(m): string;
	getRemotePostDbChannel(m, type): Promise<ISocNetDbChannel>;
	getRemotePostContents(userId, dbChannel, m, type): Promise<IContent[]>;
	getRemotePostProperties(userId, dbChannel, m, type): Promise<any>;
	onRemotePostProcess(m, post: IPost, type);
	getReplyMessage(dbChannel, m): Promise<any>
	getRepostMessage(dbChannel, m): Promise<any>
}

export interface ISocNetDbChannel {
	id;
	title;
	socNet;
	userId;
	groupId;
	accountId;
	channelId;
}