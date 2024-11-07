import {IContent} from "../database/interface.js";
import {IPost} from "../group/interface.js";

export default interface IGeesomeSocNetImport {
	getDbChannel(userId, where);

	createDbChannel(channelData);

	reinitializeDbChannel(id, channelData);

	importChannelMetadata(userId, socNet, accountId, channelMetadata, updateData?);

	prepareChannelQuery(dbChannel, remotePostsCount, advancedSettings);

	openImportAsyncOperation(userId, userApiKeyId, dbChannel);

	importChannelPosts(client: IGeesomeSocNetImportClient);

	storeContentMessage(contentMessageData, content: IContent);

	getDbChannelLastMessage(dbChannelId);

	findExistsChannelMessage(msgId, dbChannelId, userId);

	publishPost(_importState, _existsChannelMessage, _postData, _msgData): Promise<IPost>;

	reversePostsLocalIds(userId, dbChannelId): Promise<any>;

	getDbChannelStartReverseMessage(dbChannelId): Promise<ISocNetDbMessage>;

	flushDatabase(): Promise<any>;
}

export interface IGeesomeSocNetImportClient {
	socNet: string;
	userId: number;
	dbChannel: ISocNetDbChannel;
	advancedSettings: {fromMessage, toMessage, mergeSeconds, force};
	messages: {list, authorById};

	getRemotePostLink(dbChannel, msgId): Promise<string>;
	getRemotePostDbChannel (m, type: string): Promise<ISocNetDbChannel>;
	getReplyMessage(dbChannel, m): Promise<any>;
	getRepostMessage(dbChannel, m): Promise<any>;
	onRemotePostProcess(m, dbChannel, post: IPost, type);
	getRemotePostProperties(dbChannel, m, type): Promise<any>;
	getRemotePostContents(dbChannel, m, type): Promise<IContent[]>;
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

export interface ISocNetDbMessage {
	userId;
	groupedId;
	msgId;
	replyToMsgId;
	repostOfMsgId;
	postId;
	timestamp;
	isNeedToReverse;
}