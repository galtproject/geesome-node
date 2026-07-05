import {IGeesomeApp} from '../../interface.js';
import {RICH_TEXT_MIME_TYPE, richTextToPlainText} from '../../richText.js';
import IGeesomeContentModule from '../content/interface.js';
import {ContentView, IContent} from '../database/interface.js';
import {IPost} from '../group/interface.js';
import IGeesomeSocNetImport, {IGeesomeSocNetImportClient, ISocNetDbChannel} from '../socNetImport/interface.js';
import {IBlueskyAuthorProjection, IBlueskyPostProjection, blueskyPostSource, blueskySocNet} from './helpers.js';

export interface IBlueskyImportMessage extends IBlueskyPostProjection {
	id: string;
	date: number;
	text: string;
	projection: IBlueskyPostProjection;
}

export interface IBlueskyImportMessages {
	list: IBlueskyImportMessage[];
	authorById: {[key: string]: IBlueskyAuthorProjection};
	messagesByUri: {[key: string]: IBlueskyImportMessage};
	projectionsByUri: {[key: string]: IBlueskyPostProjection};
}

export class BlueskyImportClient implements IGeesomeSocNetImportClient {
	socNet = blueskySocNet;
	userId: number;
	dbChannel: ISocNetDbChannel;
	advancedSettings: {fromMessage, toMessage, mergeSeconds, force};
	messages: IBlueskyImportMessages;
	content: IGeesomeContentModule;
	socNetImport: IGeesomeSocNetImport;
	onRemotePostProcess: (m: IBlueskyImportMessage | null, dbChannel: ISocNetDbChannel | null, post: IPost | null, type: any) => any;

	constructor(
		app: IGeesomeApp,
		userId: number,
		dbChannel: ISocNetDbChannel,
		projectionsOrMessages: IBlueskyPostProjection[] | IBlueskyImportMessages,
		advancedSettings: any = {},
		onRemotePostProcess: (m: IBlueskyImportMessage | null, dbChannel: ISocNetDbChannel | null, post: IPost | null, type: any) => any = null
	) {
		this.content = app.ms.content;
		this.socNetImport = app.ms.socNetImport;
		this.userId = userId;
		this.dbChannel = dbChannel;
		this.messages = getBlueskyImportMessages(projectionsOrMessages);
		this.advancedSettings = advancedSettings;
		this.onRemotePostProcess = onRemotePostProcess;
	}

	async getRemotePostLink(_dbChannel: ISocNetDbChannel, msgId: string): Promise<string | null> {
		const message = this.messages.messagesByUri[msgId];
		if (!message) {
			return null;
		}
		return getBlueskyPostWebUrl(message, _dbChannel);
	}

	async getRemotePostDbChannel(m: IBlueskyImportMessage, type: string = 'post'): Promise<ISocNetDbChannel | null> {
		if (!isImportableBlueskyMessage(m)) {
			return null;
		}
		if (type === 'post') {
			return this.dbChannel;
		}
		if (type === 'reply') {
			const replyMessage = await this.getReplyMessage(this.dbChannel, m);
			return replyMessage ? this.dbChannel : null;
		}
		return null;
	}

	async getReplyMessage(_dbChannel: ISocNetDbChannel, m: IBlueskyImportMessage): Promise<IBlueskyImportMessage | null> {
		const parentUri = m?.reply?.parentUri;
		if (!parentUri) {
			return null;
		}
		const replyMessage = this.messages.messagesByUri[parentUri] || null;
		if (!replyMessage) {
			return null;
		}
		if (!isBlueskyMessageFromDbChannel(replyMessage, this.dbChannel)) {
			return null;
		}
		return replyMessage;
	}

	async getRepostMessage(_dbChannel: ISocNetDbChannel, _m: IBlueskyImportMessage): Promise<null> {
		return null;
	}

	async getRemotePostProperties(_dbChannel: ISocNetDbChannel, m: IBlueskyImportMessage, type: string): Promise<any> {
		return {
			bluesky: getBlueskyMessageProperties(m, type)
		};
	}

	async getRemotePostContents(dbChannel: ISocNetDbChannel, m: IBlueskyImportMessage, _type: string): Promise<IContent[]> {
		if (!richTextToPlainText(m?.richText)) {
			return [];
		}
		const content = await this.content.saveData(
			this.userId,
			JSON.stringify(m.richText),
			getBlueskyContentFileName(m),
			{
				userId: this.userId,
				mimeType: RICH_TEXT_MIME_TYPE,
				view: ContentView.Contents,
				properties: {
					source: blueskyPostSource,
					bluesky: getBlueskyMessageProperties(m, 'content')
				}
			}
		);
		await this.socNetImport.storeContentMessage({
			userId: this.userId,
			msgId: m.id,
			dbChannelId: dbChannel.id
		}, content);
		return [content];
	}
}

export function createBlueskyImportMessages(projections: IBlueskyPostProjection[]): IBlueskyImportMessages {
	const list = projections
		.map(projection => createBlueskyImportMessage(projection))
		.filter(Boolean) as IBlueskyImportMessage[];
	return {
		list,
		authorById: getBlueskyImportAuthorMap(list),
		messagesByUri: getBlueskyImportMessageMap(list),
		projectionsByUri: getBlueskyProjectionMap(list)
	};
}

function getBlueskyImportMessages(value: IBlueskyPostProjection[] | IBlueskyImportMessages): IBlueskyImportMessages {
	if (Array.isArray(value)) {
		return createBlueskyImportMessages(value);
	}
	return value;
}

function createBlueskyImportMessage(projection: IBlueskyPostProjection): IBlueskyImportMessage | null {
	const date = getBlueskyProjectionDate(projection);
	if (!projection?.uri || date === null) {
		return null;
	}
	return {
		...projection,
		id: projection.uri,
		date,
		text: richTextToPlainText(projection.richText),
		projection
	};
}

function getBlueskyImportAuthorMap(list: IBlueskyImportMessage[]): {[key: string]: IBlueskyAuthorProjection} {
	const authorById = {};
	list.forEach((message) => {
		setBlueskyAuthorMapValue(authorById, message.author.did, message.author);
		setBlueskyAuthorMapValue(authorById, message.author.handle, message.author);
		setBlueskyAuthorMapValue(authorById, message.sourceIdentity.sourceChannelId, message.author);
	});
	return authorById;
}

function getBlueskyImportMessageMap(list: IBlueskyImportMessage[]): {[key: string]: IBlueskyImportMessage} {
	const messagesByUri = {};
	list.forEach((message) => {
		messagesByUri[message.uri] = message;
	});
	return messagesByUri;
}

function getBlueskyProjectionMap(list: IBlueskyImportMessage[]): {[key: string]: IBlueskyPostProjection} {
	const projectionsByUri = {};
	list.forEach((message) => {
		projectionsByUri[message.uri] = message.projection;
	});
	return projectionsByUri;
}

function setBlueskyAuthorMapValue(authorById: {[key: string]: IBlueskyAuthorProjection}, key: string | null, author: IBlueskyAuthorProjection): void {
	if (!key) {
		return;
	}
	authorById[key] = author;
}

function isImportableBlueskyMessage(m: IBlueskyImportMessage): boolean {
	if (!m || !m.id || !m.date) {
		return false;
	}
	return Number.isFinite(m.date);
}

function isBlueskyMessageFromDbChannel(m: IBlueskyImportMessage, dbChannel: ISocNetDbChannel): boolean {
	if (!m || !dbChannel?.channelId) {
		return false;
	}
	if (m.sourceIdentity.sourceChannelId === dbChannel.channelId) {
		return true;
	}
	if (m.author.handle === dbChannel.channelId) {
		return true;
	}
	return m.author.did === dbChannel.channelId;
}

function getBlueskyProjectionDate(projection: IBlueskyPostProjection): number | null {
	return getDateSeconds(projection?.createdAt) || getDateSeconds(projection?.indexedAt);
}

function getDateSeconds(value: string | null): number | null {
	if (!value) {
		return null;
	}
	const dateMs = Date.parse(value);
	if (!Number.isFinite(dateMs)) {
		return null;
	}
	return Math.floor(dateMs / 1000);
}

function getBlueskyPostWebUrl(message: IBlueskyImportMessage, dbChannel: ISocNetDbChannel): string | null {
	const rkey = getBlueskyPostRkey(message.uri);
	if (!rkey) {
		return null;
	}
	const profileId = getBlueskyPostProfileId(message, dbChannel);
	if (!profileId) {
		return null;
	}
	return `https://bsky.app/profile/${encodeURIComponent(profileId)}/post/${encodeURIComponent(rkey)}`;
}

function getBlueskyPostProfileId(message: IBlueskyImportMessage, dbChannel: ISocNetDbChannel): string | null {
	return message.author.handle || getRepoFromAtUri(message.uri) || dbChannel?.channelId || null;
}

function getBlueskyPostRkey(uri: string): string | null {
	const match = String(uri || '').match(/^at:\/\/[^/]+\/app\.bsky\.feed\.post\/([^/]+)$/);
	if (!match) {
		return null;
	}
	return match[1] || null;
}

function getRepoFromAtUri(uri: string): string | null {
	const match = String(uri || '').match(/^at:\/\/([^/]+)\//);
	if (!match) {
		return null;
	}
	return match[1] || null;
}

function getBlueskyMessageProperties(m: IBlueskyImportMessage, type: string): any {
	const properties = {
		type,
		uri: m.uri,
		cid: m.cid || null,
		author: m.author,
		sourceIdentity: m.sourceIdentity,
		createdAt: m.createdAt,
		indexedAt: m.indexedAt,
		langs: m.langs,
		reply: m.reply,
		repost: m.repost,
		quote: m.quote,
		embed: m.embed,
		facetsCount: m.facetsCount
	};
	if (m.moderationDecision) {
		properties['moderation'] = m.moderationDecision;
	}
	return properties;
}

function getBlueskyContentFileName(m: IBlueskyImportMessage): string {
	return `bluesky-${sanitizeFileNamePart(m.id)}.json`;
}

function sanitizeFileNamePart(value: string): string {
	return String(value || '')
		.replace(/[^a-zA-Z0-9._-]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 120) || 'post';
}
