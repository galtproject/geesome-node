import IGeesomeTelegramClient from "./interface";
import IGeesomeSocNetImport, {IGeesomeSocNetImportClient, ISocNetDbChannel} from "../socNetImport/interface";
import {IPost} from "../group/interface";
import {ContentView} from "../database/interface";
import IGeesomeContentModule from "../content/interface";

const clone = require('lodash/clone');
const appHelpers = require('../../helpers');
const telegramHelpers = require('./helpers');

export class TelegramImportClient implements IGeesomeSocNetImportClient {
	socNet = 'telegram';
	userId: number;
	dbChannel: ISocNetDbChannel;
	advancedSettings: {fromMessage, toMessage, mergeSeconds, force};
	messages: {list, authorById};

	connectClient;
	telegramClient: IGeesomeTelegramClient;
	socNetImport: IGeesomeSocNetImport;
	content: IGeesomeContentModule;
	onRemotePostProcess: (m: any, post: IPost, type: any) => any;

	authorById: {};
	msgLinkTplByAccountId = {};
	channelByAuthorId = {};
	messagesById = {};

	constructor(_app, _connectClient, _userId, _dbChannel, _messages, _advancedSettings, _onRemotePostProcess) {
		this.connectClient = _connectClient;

		this.telegramClient = _app.ms.telegramClient;
		this.socNetImport = _app.ms.socNetImport;
		this.content = _app.ms.content;

		this.userId = _userId;
		this.dbChannel = _dbChannel;
		this.messages = _messages;
		this.authorById = _messages.authorById;
		this.advancedSettings = _advancedSettings;
		this.onRemotePostProcess = _onRemotePostProcess;
	}

	async getRemotePostLink(_dbChannel, _msgId) {
		if (!_msgId) {
			return null;
		}
		const { channelId } = _dbChannel;
		console.log('_msgId', _msgId);
		if (!this.msgLinkTplByAccountId[channelId]) {
			const msgLink = await this.telegramClient.getMessageLink(this.connectClient, channelId, _msgId);
			if (msgLink) {
				this.msgLinkTplByAccountId[channelId] = msgLink.split('/').slice(0, -1).join('/') + '/{msgId}';
			}
		}
		return this.msgLinkTplByAccountId[channelId] ? this.msgLinkTplByAccountId[channelId].replace('{msgId}', _msgId) : null;
	}
	async getRemotePostDbChannel (m, type = 'post') {
		if(!m || !m.date) {
			return null;
		}
		if (type === 'post') {
			return this.dbChannel;
		}

		this.messagesById[m.id.toString()] = m;

		if (type === 'reply') {
			// const { replyTo } = m;
			// if (!replyTo) {
			// 	return this.dbChannel;
			// }
			//
			// let {replyToMsgId} = replyTo;
			// const {result: messages} = await this.telegramClient.getMessagesByClient(this.connectClient, this.dbChannel.channelId, [replyToMsgId]);
			// const {list: [replyM], authorById} = messages;
			// this.authorById = {...authorById, ...this.authorById};
			// const {fwdFrom} = replyM;
			// if (fwdFrom) {
			// 	return this.getDbChannelByFwdFrom(fwdFrom);
			// }
			return this.dbChannel;
		}
		//type === 'repost'
		const {fwdFrom} = m;
		return this.getDbChannelByFwdFrom(fwdFrom);
	}
	async getReplyMessage(dbChannel, m) {
		if (m.replyTo) {
			const {replyToMsgId} = m.replyTo;
			const {result: messages} = await this.telegramClient.getMessagesByClient(this.connectClient, dbChannel.channelId, [replyToMsgId]);
			return messages.list[0];
		} else {
			return null;
		}
	}
	async getRepostMessage(dbChannel, m) {
		if (!m.fwdFrom) {
			return null;
		}
		m = clone(m);
		m.id = m.fwdFrom.channelPost ? m.fwdFrom.channelPost : appHelpers.keccak(JSON.stringify(m));
		delete m.fwdFrom;
		return m;
	}
	async getRemotePostContents (dbChannel, m, type) {
		if (type === 'post' && m.fwdFrom) {
			return [];
		}
		console.log("getRemotePostContents", m);
		return this.messageToContents(this.connectClient, this.userId, dbChannel, m);
	}
	async getRemotePostProperties (dbChannel, m) {
		//TODO: get forward from username and id
		return {};
	}

	async getDbChannelByFwdFrom(fwdFrom) {
		if (!fwdFrom) {
			return null;
		}
		const {fromId} = fwdFrom;

		try {
			if (fromId) {
				let {userId: tgUserId, channelId: tgChannelId} = fromId;
				if (tgUserId) {
					return this.setChannelAuthorAndReturn('User', tgUserId);
				} else if (tgChannelId) {
					return this.setChannelAuthorAndReturn('Channel', tgChannelId);
				} else {
					return null;
				}
			} else {
				if (!this.channelByAuthorId[fwdFrom.fromName]) {
					this.channelByAuthorId[fwdFrom.fromName] = await this.socNetImport.importChannelMetadata(this.userId, this.socNet, this.dbChannel.accountId, {
						id: fwdFrom.fromName,
						username: fwdFrom.fromName,
						title: fwdFrom.fromName,
					}, { isCollateral: true });
				}
				return this.channelByAuthorId[fwdFrom.fromName];
			}
		} catch (e) {
			console.error('getRemotePostDbChannel error', e);
		}
	}

	async setChannelAuthorAndReturn(type, tgId) {
		console.log('setChannelAuthorAndReturn', type, tgId);
		tgId = tgId.toString();
		if (!this.channelByAuthorId[tgId]) {
			console.log('authorById', this.authorById);
			if (this.authorById[tgId]) {
				this.channelByAuthorId[tgId] = await this.telegramClient.storeObjToChannelDbByType(this.connectClient, this.userId, type, this.authorById[tgId], true).then(r => r.dbChannel);
			} else {
				this.channelByAuthorId[tgId] = await this.telegramClient.storeToChannelDbByType(this.connectClient, this.userId, type, tgId, true).then(r => r.dbChannel);
			}
		}
		return this.channelByAuthorId[tgId];
	}

	async messageToContents(client, userId, dbChannel, m) {
		let contents = [];
		const contentMessageData = {userId, msgId: m.id, groupedId: m.groupedId, dbChannelId: dbChannel.id};

		if (contentMessageData.groupedId) {
			contentMessageData.groupedId = contentMessageData.groupedId.toString();
		}

		if (m.message) {
			// console.log('m.message', m.message, 'm.entities', m.entities);
			let text = telegramHelpers.messageWithEntitiesToHtml(m.message, m.entities || []);
			// console.log('text', text);
			const content = await this.content.saveData(userId, text, '', {
				userId,
				mimeType: 'text/html',
				view: ContentView.Contents
			});
			contents.push(content);
			await this.socNetImport.storeContentMessage(contentMessageData, content);
		}

		if (m.media) {
			if (m.media.poll) {
				//TODO: handle and save polls (325)
				return contents;
			}
			// console.log('m.media', m.media);
			const {result: file} = await this.telegramClient.downloadMediaByClient(client, m.media);
			if (file && file.content) {
				const content = await this.content.saveData(userId, file.content, '', {
					userId,
					mimeType: file.mimeType,
					view: ContentView.Media
				});
				contents.push(content);
				await this.socNetImport.storeContentMessage(contentMessageData, content);
			}

			if (m.media.webpage && m.media.webpage.url) {
				const content = await this.content.saveData(userId, telegramHelpers.mediaWebpageToLinkStructure(m.media.webpage), '', {
					userId,
					mimeType: 'application/json',
					view: ContentView.Link
				});
				contents.push(content);
				await this.socNetImport.storeContentMessage(contentMessageData, content);
			}
		}

		return contents;
	}
}