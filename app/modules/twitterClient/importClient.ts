import IGeesomeSocNetImport, {ISocNetDbChannel} from "../socNetImport/interface";
import IGeesomeTwitterClient from "./interface";

const {getReplyToId, getRetweetId} = require('./helpers');

export class TwitterImportClient {
	socNet = 'twitter';

	connectClient;
	twitterClient: IGeesomeTwitterClient;
	socNetImport: IGeesomeSocNetImport;
	userId: number;
	dbChannel: ISocNetDbChannel;
	messages: {list, authorById};
	advancedSettings: {fromMessage, toMessage, mergeSeconds, force};

	onRemotePostProcess: Function;

	authorById: {};
	msgLinkTplByAccountId = {};
	channelByAuthorId = {};
	messagesById = {};

	constructor(_connectClient, _twitterClient, _socNetImport, _userId, _dbChannel, _messages, _advancedSettings, _onRemotePostProcess) {
		this.connectClient = _connectClient;
		this.twitterClient = _twitterClient;
		this.socNetImport = _socNetImport;
		this.userId = _userId;
		this.dbChannel = _dbChannel;
		this.messages = _messages;
		this.authorById = _messages.authorById;
		this.advancedSettings = _advancedSettings;
		this.onRemotePostProcess = _onRemotePostProcess;
	}

	getRemotePostLink(_channel, msgId) {
		return `https://twitter.com/${_channel.username}/${msgId}`;
	}
	getRemotePostReplyToMsgId(m) {
		return getReplyToId(m)
	}
	getRemotePostRepostOfMsgId(m) {
		return getRetweetId(m)
	}
	async getRemotePostDbChannel (m) {
		if (!this.channelByAuthorId[m.author_id]) {
			this.channelByAuthorId[m.author_id] = await this.twitterClient.storeChannelToDb(this.userId, m.author, this.dbChannel.accountId !== m.author_id);
		}
		return this.channelByAuthorId[m.author_id];
	}
	getRemotePostContents (userId, dbChannel, m, type) {
		return this.twitterClient.messageToContents(userId, dbChannel, m, type);
	}
	getRemotePostProperties(userId, dbChannel, m) {
		//TODO: get forward from username and id
		return {};
	}
}