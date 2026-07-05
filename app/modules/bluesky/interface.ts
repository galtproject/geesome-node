import {IBlueskyActorProfile, IBlueskyPostProjection, IBlueskyRecordCreateResult, IBlueskyRecordDeleteResult} from './helpers.js';
import {IListParams} from '../database/interface.js';
import {IUserOperationQueue} from '../asyncOperation/interface.js';
import {IPostListResponse} from '../group/interface.js';
import type {IBlueskyMigrationPreview} from './migration.js';
import type {
	IRemoteContentModerationPolicyInput,
	IRemoteContentModerationRule,
	IRemoteContentModerationSummary,
	RemoteContentModerationMode
} from '../remoteContentModeration/helpers.js';

export enum BlueskySourceSubscriptionStatus {
	Active = 'active',
	Paused = 'paused',
	Removed = 'removed'
}

export enum BlueskySourcePostReviewState {
	Pending = 'pending',
	Quarantined = 'quarantined',
	Blocked = 'blocked',
	Rejected = 'rejected',
	Imported = 'imported'
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
	moderationPolicy?: IRemoteContentModerationPolicyInput;
}

export interface IBlueskyPublicAuthorFeedPreview {
	actor: string;
	cursor: string | null;
	list: IBlueskyPostProjection[];
}

export interface IBlueskyMigrationPreviewInput extends IBlueskyPublicAuthorFeedPreviewInput, IBlueskyAccountVerifyInput {
	claimed?: boolean | string;
}

export interface IBlueskyMigrationPreviewResult extends IBlueskyMigrationPreview {
	cursor: string | null;
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

export interface IBlueskyAccountDataInput {
	id?: number | string;
	accountId?: string;
	username?: string;
}

export interface IBlueskyAccountLoginInput {
	identifier?: string;
	password?: string;
	appPassword?: string;
	apiKey?: string;
	encryptedApiKey?: string;
	accountData?: IBlueskyAccountDataInput;
	isEncrypted?: boolean | string;
}

export interface IBlueskyAccountVerifyInput {
	accountData?: IBlueskyAccountDataInput;
	password?: string;
	appPassword?: string;
	apiKey?: string;
}

export interface IBlueskyAccountReport {
	id?: number;
	userId: number;
	socNet: string;
	accountId?: string | null;
	username?: string | null;
	fullName?: string | null;
	hasApiKey: boolean;
	hasAccessToken: boolean;
	hasSessionKey: boolean;
	isEncrypted?: boolean;
}

export interface IBlueskyAccountVerificationResult {
	account: IBlueskyAccountReport;
	profile: IBlueskyActorProfile;
	did: string;
	handle: string | null;
}

export interface IBlueskyCrossPostInput extends IBlueskyAccountVerifyInput {
	langs?: string[];
	createdAt?: string | Date;
	force?: boolean | string;
}

export interface IBlueskyCrossPostResult {
	account: IBlueskyAccountReport;
	profile: IBlueskyActorProfile;
	did: string;
	handle: string | null;
	post: {
		id?: number;
		groupId?: number;
		status?: string;
	};
	record: IBlueskyRecordCreateResult;
	alreadyExists: boolean;
}

export interface IBlueskyUpdateCrossPostInput extends IBlueskyCrossPostInput {}

export interface IBlueskyUpdateCrossPostResult {
	account: IBlueskyAccountReport;
	profile: IBlueskyActorProfile;
	did: string;
	handle: string | null;
	post: {
		id?: number;
		groupId?: number;
		status?: string;
	};
	record: IBlueskyRecordCreateResult;
	previousRecord: {
		uri: string;
		cid?: string | null;
	};
	updated: boolean;
}

export interface IBlueskyDeleteCrossPostInput extends IBlueskyAccountVerifyInput {}

export interface IBlueskyDeleteCrossPostResult {
	account: IBlueskyAccountReport;
	profile: IBlueskyActorProfile;
	did: string;
	handle: string | null;
	post: {
		id?: number;
		groupId?: number;
		status?: string;
	};
	record: {
		uri: string;
		cid?: string | null;
	};
	deleteRecord: IBlueskyRecordDeleteResult;
}

export interface IBlueskySourceSubscriptionInput {
	actor?: string;
	filter?: string;
	displayName?: string;
	groupName?: string;
	accountId?: number | null;
	importLimit?: number | string | null;
	moderationMode?: RemoteContentModerationMode | string | null;
	moderationRules?: IRemoteContentModerationRule[] | any[] | null;
}

export interface IBlueskySourceSubscriptionUpdateInput {
	filter?: string | null;
	displayName?: string | null;
	status?: BlueskySourceSubscriptionStatus | string;
	groupName?: string | null;
	accountId?: number | null;
	importLimit?: number | string | null;
	moderationMode?: RemoteContentModerationMode | string | null;
	moderationRules?: IRemoteContentModerationRule[] | any[] | null;
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
	moderationMode?: RemoteContentModerationMode;
	moderationRules?: IRemoteContentModerationRule[];
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

export interface IBlueskySourceFeedFilters {
	cursorPublishedAt?: string | Date;
	cursorId?: number | string;
}

export interface IBlueskySourceReviewFilters {
	state?: BlueskySourcePostReviewState | string;
}

export interface IBlueskySourceReviewUpdateInput {
	state?: BlueskySourcePostReviewState | string;
}

export interface IBlueskySourceReviewImportInput {
	force?: boolean | string;
}

export interface IBlueskySourceReviewReport {
	id?: number;
	userId: number;
	sourceSubscriptionId: number;
	actor: string;
	uri: string;
	cid?: string | null;
	sourceChannelId: string;
	state: BlueskySourcePostReviewState;
	moderationAction: string;
	moderationDecision?: any;
	preview?: any;
	publishedAt?: Date | null;
	importedAt?: Date | null;
	reviewedAt?: Date | null;
	reviewedByUserId?: number | null;
	lastError?: string | null;
	createdAt?: Date;
	updatedAt?: Date;
}

export interface IBlueskySourceReviewListResponse {
	source: IBlueskySourceSubscriptionReport;
	list: IBlueskySourceReviewReport[];
	total: number;
}

export interface IBlueskySourceReviewImportResult {
	source: IBlueskySourceSubscriptionReport;
	review: IBlueskySourceReviewReport;
	dbChannel: {
		id;
		groupId;
		channelId;
		title;
		socNet;
	} | null;
	imported: number;
}

export interface IBlueskySourceFeedResponse {
	source: IBlueskySourceSubscriptionReport;
	dbChannel: {
		id;
		groupId;
		channelId;
		title;
		socNet;
	} | null;
	posts: IPostListResponse;
}

export interface IBlueskySourceRefreshInput {
	filter?: string | null;
	cursor?: string | null;
	limit?: number | string | null;
	force?: boolean | string;
	mergeSeconds?: number | string | null;
	advancedSettings?: any;
	moderationPolicy?: IRemoteContentModerationPolicyInput;
}

export interface IBlueskySourceRefreshQueueInput extends IBlueskySourceRefreshInput {
	process?: boolean | string;
}

export interface IBlueskySourceRefreshResult {
	source: IBlueskySourceSubscriptionReport;
	actor: string;
	cursor: string | null;
	fetched: number;
	imported: number;
	moderation?: IRemoteContentModerationSummary;
	dbChannel?: {
		id;
		groupId;
		channelId;
		title;
		socNet;
	} | null;
}

export interface IBlueskySourceRefreshQueueProcessOptions {
	limit?: number | string;
}

export interface IBlueskySourceRefreshQueueProcessResult {
	processed: number;
}

export interface IBlueskySourceRefreshPollOptions {
	limit?: number | string;
	staleMs?: number | string;
	now?: Date | string;
	refreshInput?: IBlueskySourceRefreshInput;
}

export interface IBlueskySourceRefreshPollResult {
	queued: number;
}

export interface IBlueskySourceSyncInput {
	limit?: number | string;
	cursorPublishedAt?: string | Date;
	cursorId?: number | string;
	force?: boolean | string;
}

export interface IBlueskySourceSyncError {
	postId?: number;
	sourcePostId?: string | null;
	message: string;
}

export interface IBlueskySourceSyncResult {
	source: IBlueskySourceSubscriptionReport;
	dbChannel: {
		id;
		groupId;
		channelId;
		title;
		socNet;
	} | null;
	checked: number;
	updated: number;
	deleted: number;
	skipped: number;
	failed: number;
	moderation?: IRemoteContentModerationSummary;
	errors: IBlueskySourceSyncError[];
	nextCursor?: {publishedAt: any; id: any} | null;
}

export default interface IGeesomeBlueskyModule {
	getPublicAuthorFeedPreview(input?: IBlueskyPublicAuthorFeedPreviewInput): Promise<IBlueskyPublicAuthorFeedPreview>;
	getMigrationPreview(userId: number, input?: IBlueskyMigrationPreviewInput): Promise<IBlueskyMigrationPreviewResult>;
	importPublicAuthorFeed(userId: number, userApiKeyId: number | null, input?: IBlueskyPublicAuthorFeedImportInput): Promise<IBlueskyPublicAuthorFeedImportResult>;
	loginAccount(userId: number, input?: IBlueskyAccountLoginInput): Promise<IBlueskyAccountVerificationResult>;
	verifyAccount(userId: number, input?: IBlueskyAccountVerifyInput): Promise<IBlueskyAccountVerificationResult>;
	crossPostPost(userId: number, postId: number | string, input?: IBlueskyCrossPostInput): Promise<IBlueskyCrossPostResult>;
	updateCrossPostPost(userId: number, postId: number | string, input?: IBlueskyUpdateCrossPostInput): Promise<IBlueskyUpdateCrossPostResult>;
	deleteCrossPostPost(userId: number, postId: number | string, input?: IBlueskyDeleteCrossPostInput): Promise<IBlueskyDeleteCrossPostResult>;
	getSourceSubscriptions(userId: number, filters?: IBlueskySourceSubscriptionFilters, listParams?: IListParams): Promise<IBlueskySourceSubscriptionListResponse>;
	getSourceFeed(userId: number, sourceId: number | string, filters?: IBlueskySourceFeedFilters, listParams?: IListParams): Promise<IBlueskySourceFeedResponse>;
	getSourceReviews(userId: number, sourceId: number | string, filters?: IBlueskySourceReviewFilters, listParams?: IListParams): Promise<IBlueskySourceReviewListResponse>;
	subscribeSource(userId: number, input?: IBlueskySourceSubscriptionInput): Promise<IBlueskySourceSubscriptionReport>;
	updateSourceSubscription(userId: number, sourceId: number | string, input?: IBlueskySourceSubscriptionUpdateInput): Promise<IBlueskySourceSubscriptionReport>;
	removeSourceSubscription(userId: number, sourceId: number | string): Promise<IBlueskySourceSubscriptionReport>;
	refreshSourceSubscription(userId: number, sourceId: number | string, input?: IBlueskySourceRefreshInput): Promise<IBlueskySourceRefreshResult>;
	updateSourceReviewState(userId: number, sourceId: number | string, reviewId: number | string, input?: IBlueskySourceReviewUpdateInput): Promise<IBlueskySourceReviewReport>;
	importSourceReviewPost(userId: number, sourceId: number | string, reviewId: number | string, input?: IBlueskySourceReviewImportInput): Promise<IBlueskySourceReviewImportResult>;
	queueSourceSubscriptionRefresh(userId: number, sourceId: number | string, userApiKeyId?: number | null, input?: IBlueskySourceRefreshQueueInput): Promise<IUserOperationQueue>;
	processSourceSubscriptionRefreshQueue(options?: IBlueskySourceRefreshQueueProcessOptions): Promise<IBlueskySourceRefreshQueueProcessResult>;
	queueDueSourceSubscriptionRefreshes(options?: IBlueskySourceRefreshPollOptions): Promise<IBlueskySourceRefreshPollResult>;
	syncSourceSubscriptionPosts(userId: number, sourceId: number | string, input?: IBlueskySourceSyncInput): Promise<IBlueskySourceSyncResult>;
}
