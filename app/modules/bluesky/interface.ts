import {IBlueskyPostProjection} from './helpers.js';

export interface IBlueskyPublicAuthorFeedPreviewInput {
	actor?: string;
	filter?: string;
	cursor?: string;
	limit?: number;
}

export interface IBlueskyPublicAuthorFeedImportInput extends IBlueskyPublicAuthorFeedPreviewInput {
	accountId?: number | null;
	groupName?: string;
	advancedSettings?: any;
	force?: boolean;
	mergeSeconds?: number;
}

export interface IBlueskyPublicAuthorFeedPreview {
	actor: string;
	cursor: string | null;
	list: IBlueskyPostProjection[];
}

export interface IBlueskyPublicAuthorFeedImportResult {
	actor: string;
	cursor: string | null;
	projectedPostsCount: number;
	dbChannel: {
		id;
		groupId;
		channelId;
		title;
		socNet;
	};
	asyncOperation;
}

export default interface IGeesomeBlueskyModule {
	getPublicAuthorFeedPreview(input?: IBlueskyPublicAuthorFeedPreviewInput): Promise<IBlueskyPublicAuthorFeedPreview>;
	importPublicAuthorFeed(userId: number, userApiKeyId: number | null, input?: IBlueskyPublicAuthorFeedImportInput): Promise<IBlueskyPublicAuthorFeedImportResult>;
}
