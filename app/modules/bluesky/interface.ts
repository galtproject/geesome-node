import {IBlueskyPostProjection} from './helpers.js';
import {IListParams} from '../database/interface.js';

export enum BlueskySourceSubscriptionStatus {
	Active = 'active',
	Paused = 'paused',
	Removed = 'removed'
}

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

export interface IBlueskySourceSubscriptionInput {
	actor?: string;
	filter?: string;
	displayName?: string;
	groupName?: string;
	accountId?: number | null;
	importLimit?: number | string | null;
}

export interface IBlueskySourceSubscriptionUpdateInput {
	filter?: string | null;
	displayName?: string | null;
	status?: BlueskySourceSubscriptionStatus | string;
	groupName?: string | null;
	accountId?: number | null;
	importLimit?: number | string | null;
}

export interface IBlueskySourceSubscriptionFilters {
	status?: BlueskySourceSubscriptionStatus | string;
	actor?: string;
}

export interface IBlueskySourceSubscriptionReport {
	id?: number;
	userId: number;
	actor: string;
	filter?: string | null;
	displayName?: string | null;
	status: BlueskySourceSubscriptionStatus;
	groupName?: string | null;
	accountId?: number | null;
	importLimit?: number | null;
	dbChannelId?: number | null;
	lastCursor?: string | null;
	lastRefreshRequestedAt?: Date | null;
	lastImportedAt?: Date | null;
	lastError?: string | null;
	createdAt?: Date;
	updatedAt?: Date;
}

export interface IBlueskySourceSubscriptionListResponse {
	list: IBlueskySourceSubscriptionReport[];
	total: number;
}

export default interface IGeesomeBlueskyModule {
	getPublicAuthorFeedPreview(input?: IBlueskyPublicAuthorFeedPreviewInput): Promise<IBlueskyPublicAuthorFeedPreview>;
	importPublicAuthorFeed(userId: number, userApiKeyId: number | null, input?: IBlueskyPublicAuthorFeedImportInput): Promise<IBlueskyPublicAuthorFeedImportResult>;
	getSourceSubscriptions(userId: number, filters?: IBlueskySourceSubscriptionFilters, listParams?: IListParams): Promise<IBlueskySourceSubscriptionListResponse>;
	subscribeSource(userId: number, input?: IBlueskySourceSubscriptionInput): Promise<IBlueskySourceSubscriptionReport>;
	updateSourceSubscription(userId: number, sourceId: number | string, input?: IBlueskySourceSubscriptionUpdateInput): Promise<IBlueskySourceSubscriptionReport>;
	removeSourceSubscription(userId: number, sourceId: number | string): Promise<IBlueskySourceSubscriptionReport>;
}
