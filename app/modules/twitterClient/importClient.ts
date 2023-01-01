import IGeesomeSocNetImport, {IGeesomeSocNetImportClient, ISocNetDbChannel} from "../socNetImport/interface";
import IGeesomeTwitterClient from "./interface";
import {IPost} from "../group/interface";
import {ContentView} from "../database/interface";
import IGeesomeContentModule from "../content/interface";

const pIteration = require('p-iteration');

const {getReplyToId, getRetweetId, clearMessageFromMediaMessages} = require('./helpers');

export class TwitterImportClient implements IGeesomeSocNetImportClient {
	socNet = 'twitter';
	userId: number;
	dbChannel: ISocNetDbChannel;
	advancedSettings: {fromMessage, toMessage, mergeSeconds, force};
	messages: {list, authorById};

	connectClient;
	twitterClient: IGeesomeTwitterClient;
	socNetImport: IGeesomeSocNetImport;
	content: IGeesomeContentModule;
	onRemotePostProcess: (m: any, post: IPost, type: any) => any;
	authorById: {};
	msgLinkTplByAccountId = {};
	channelByAuthorId = {};
	messagesById = {};

	constructor(_app, _connectClient, _userId, _dbChannel, _messages, _advancedSettings, _onRemotePostProcess) {
		this.connectClient = _connectClient;

		this.twitterClient = _app.ms.twitterClient;
		this.socNetImport = _app.ms.socNetImport;
		this.content = _app.ms.content;

		this.userId = _userId;
		this.dbChannel = _dbChannel;
		this.messages = _messages;
		this.authorById = _messages.authorById;
		this.advancedSettings = _advancedSettings;
		this.onRemotePostProcess = _onRemotePostProcess;
	}

	async getRemotePostLink(_channel, msgId) {
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
	async getRemotePostContents (dbChannel, m, type) {
		return this.messageToContents(this.userId, dbChannel, m, type);
	}
	async getRemotePostProperties(userId, dbChannel, m) {
		//TODO: get forward from username and id
		return {};
	}
	async getReplyMessage(dbChannel, m) {
		return null;
		// if (m.replyTo) {
		// 	const {replyToMsgId} = m.replyTo;
		// 	const {result: messages} = await this.telegramClient.getMessagesByClient(this.connectClient, dbChannel.channelId, [replyToMsgId]);
		// 	return messages.list[0];
		// } else {
		// 	return null;
		// }
	}
	async getRepostMessage(dbChannel, m) {
		return null;
		// if (!m.fwdFrom) {
		// 	return null;
		// }
		// m = clone(m);
		// m.id = m.fwdFrom.channelPost ? m.fwdFrom.channelPost : helpers.keccak(JSON.stringify(m));
		// delete m.fwdFrom;
		// return m;
	}
	async messageToContents(userId, dbChannel, m, type?) {
		const contentMessageData = {userId, msgId: m.id, dbChannelId: dbChannel.id};
		let {entities, text} = m;
		if (entities) {
			text = clearMessageFromMediaMessages(m);
		}
		let textContent;
		if (text) {
			textContent = await this.content.saveData(userId, text, 'tw-' + m.id, {
				mimeType: 'text/html',
				view: ContentView.Contents
			});
			await this.socNetImport.storeContentMessage(contentMessageData, textContent);
		}
		return pIteration
			.map(m.medias, async (media) => {
				const content = await this.twitterClient.saveMedia(userId, media);
				await this.socNetImport.storeContentMessage(contentMessageData, content);
				return content;
			})
			.then(list => [textContent].concat(list).filter(c => c));
	}
}