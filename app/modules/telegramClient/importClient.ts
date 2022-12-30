import IGeesomeTelegramClient from "./interface";
import IGeesomeSocNetImport, {ISocNetDbChannel} from "../socNetImport/interface";

const telegramHelpers = require('./helpers');
const clone = require('lodash/clone');
const helpers = require('../../helpers');

export class TelegramImportClient {
	socNet = 'telegram';

	connectClient;
	telegramClient: IGeesomeTelegramClient;
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

	constructor(_connectClient, _telegramClient, _socNetImport, _userId, _dbChannel, _messages, _advancedSettings, _onRemotePostProcess) {
		this.connectClient = _connectClient;
		this.telegramClient = _telegramClient;
		this.socNetImport = _socNetImport;
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
		m.id = m.fwdFrom.channelPost ? m.fwdFrom.channelPost : helpers.keccak(JSON.stringify(m));
		delete m.fwdFrom;
		return m;
	}
	async getRemotePostContents (userId, dbChannel, m, type) {
		if (type === 'post' && m.fwdFrom) {
			return [];
		}
		console.log("getRemotePostContents", m);
		return this.telegramClient.messageToContents(this.connectClient, userId, dbChannel, m);
	}
	getRemotePostProperties (userId, dbChannel, m) {
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
}