import type {IGroup, IPost} from '../group/interface.js';
import type {IContentData, IListParams} from '../database/interface.js';
import type {IUserOperationQueue} from '../asyncOperation/interface.js';
import type {RichTextDocument} from '../../richText.js';

export interface IActivityPubConfig {
	enabled?: boolean | string;
	publicUrl?: string;
	domain?: string;
	deliveryWorker?: boolean | string;
	deliveryWorkerIntervalMs?: number | string;
	deliveryWorkerLimit?: number | string;
	deliveryClaimTtlMs?: number | string;
	sourceRefreshWorker?: boolean | string;
	sourceRefreshWorkerIntervalMs?: number | string;
	sourceRefreshWorkerLimit?: number | string;
	sourceRefreshPoller?: boolean | string;
	sourceRefreshPollerIntervalMs?: number | string;
	sourceRefreshPollerLimit?: number | string;
	sourceRefreshPollerStaleMs?: number | string;
}

export interface IResolvedActivityPubConfig {
	enabled: boolean;
	publicUrl: string;
	domain: string;
}

export interface IActivityPubGroupActorUrls {
	actorUrl: string;
	inboxUrl: string;
	outboxUrl: string;
	followersUrl: string;
	followingUrl: string;
	sharedInboxUrl: string;
}

export interface IActivityPubWebFingerLink {
	rel: string;
	type?: string;
	href: string;
}

export interface IActivityPubWebFingerResponse {
	subject: string;
	aliases: string[];
	links: IActivityPubWebFingerLink[];
}

export interface IActivityPubNodeInfoDiscoveryResponse {
	links: IActivityPubWebFingerLink[];
}

export interface IActivityPubNodeInfoResponse {
	version: '2.1';
	software: {
		name: string;
		version: string;
		repository?: string;
		homepage?: string;
	};
	protocols: string[];
	services: {
		inbound: string[];
		outbound: string[];
	};
	openRegistrations: boolean;
	usage: {
		users: Record<string, number>;
		localPosts: number;
		localComments: number;
	};
	metadata: Record<string, any>;
}

export type IActivityPubGroupInput = IGroup | string;

export interface IActivityPubActorOptions {
	publicKeyPem?: string;
}

export interface IActivityPubPostSerializerOptions {
	contents?: IContentData[];
}

export interface IActivityPubOutboxOptions {
	contentsByPostId?: Map<number, IContentData[]>;
}

export interface IActivityPubFollowersCollectionOptions {
	totalItems?: number;
}

export interface IActivityPubFollowActivityOptions {
	activityId: string;
}

export interface IActivityPubOutboundFollowOptions {
	now?: Date | string;
}

export interface IActivityPubOutboundFollowResult {
	ok: boolean;
	message: string;
	localActorUrl: string;
	remoteActorUrl: string;
	followId: number;
	followState: ActivityPubFollowState;
	deliveryId?: number;
}

export interface IActivityPubActorKey {
	keyId: string;
	actorUrl: string;
	publicKeyPem: string;
	privateKeyPem: string;
}

export interface IActivityPubRemoteActorKey {
	keyId: string;
	actorUrl?: string;
	publicKeyPem: string;
}

export interface IActivityPubRemoteActor {
	actorUrl: string;
	publicKeyId: string;
	preferredUsername?: string;
	domain: string;
	inboxUrl?: string;
	sharedInboxUrl?: string;
	publicKeyPem: string;
	lastFetchedAt: Date;
	rawJson: string;
}

export enum ActivityPubFollowDirection {
	Inbound = 'inbound',
	Outbound = 'outbound'
}

export enum ActivityPubFollowState {
	Pending = 'pending',
	Accepted = 'accepted',
	Rejected = 'rejected',
	Cancelled = 'cancelled'
}

export enum ActivityPubDeliveryState {
	Pending = 'pending',
	Delivered = 'delivered',
	Failed = 'failed'
}

export enum ActivityPubFlagState {
	Pending = 'pending',
	Resolved = 'resolved'
}

export enum ActivityPubObjectOrigin {
	Local = 'local',
	Remote = 'remote'
}

export enum ActivityPubObjectVisibility {
	Public = 'public',
	Followers = 'followers',
	Direct = 'direct'
}

export enum ActivityPubObjectReviewState {
	Pending = 'pending',
	Accepted = 'accepted',
	Rejected = 'rejected'
}

export enum ActivityPubSourceSubscriptionStatus {
	Active = 'active',
	Paused = 'paused',
	Removed = 'removed'
}

export interface IActivityPubFollow {
	localActorId: number;
	remoteActorId: number;
	direction: ActivityPubFollowDirection;
	state: ActivityPubFollowState;
	remoteActivityId?: string;
	acceptedAt?: Date;
	rejectedAt?: Date;
	rawActivityJson: string;
}

export interface IActivityPubDelivery {
	localActorId: number;
	remoteActorId: number;
	followId?: number;
	activityId: string;
	activityType: string;
	inboxUrl: string;
	bodyJson: string;
	state: ActivityPubDeliveryState;
	attempts: number;
	nextAttemptAt: Date;
	deliveredAt?: Date;
	lastError?: string;
	deliveryClaimedAt?: Date;
	deliveryClaimExpiresAt?: Date;
}

export interface IActivityPubFlag {
	localActorId: number;
	remoteActorId: number;
	activityId: string;
	objectId: string;
	state: ActivityPubFlagState;
	rawActivityJson: string;
}

export interface IActivityPubRemoteActorReport {
	id?: number;
	actorUrl?: string;
	preferredUsername?: string;
	domain?: string;
	inboxUrl?: string;
	sharedInboxUrl?: string;
}

export type IActivityPubFlagReportRemoteActor = IActivityPubRemoteActorReport;
export type ActivityPubFlagReportTargetType = 'localActor' | 'localObject' | 'unknown';

export interface IActivityPubFlagReportTarget {
	objectId: string;
	type: ActivityPubFlagReportTargetType;
	localActorId?: number;
	activityPubObjectId?: number;
	localPostId?: number;
	objectType?: string;
}

export interface IActivityPubFlagReport {
	id?: number;
	localActorId: number;
	remoteActorId: number;
	remoteActor?: IActivityPubFlagReportRemoteActor;
	activityId: string;
	objectId: string;
	target: IActivityPubFlagReportTarget;
	state: ActivityPubFlagState;
	activity?: Record<string, any> | null;
	createdAt?: Date;
	updatedAt?: Date;
}

export interface IActivityPubFlagReportFilters {
	state?: ActivityPubFlagState | string;
	objectId?: string;
	remoteActorId?: number | string;
}

export interface IActivityPubFlagReportStateInput {
	state: ActivityPubFlagState | string;
}

export interface IActivityPubFlagReportListResponse {
	list: IActivityPubFlagReport[];
	total: number;
}

export interface IActivityPubRemoteObjectReport {
	id?: number;
	localActorId?: number;
	localPostId?: number;
	remoteActorId?: number;
	remoteActor?: IActivityPubRemoteActorReport;
	remoteObjectUrl?: string;
	activityId?: string;
	objectId: string;
	objectType: string;
	visibility: ActivityPubObjectVisibility;
	reviewState: ActivityPubObjectReviewState;
	reviewedAt?: Date;
	reviewedByUserId?: number;
	publishedAt?: Date;
	object?: Record<string, any> | null;
	preview?: IActivityPubRemoteObjectPreview;
	createdAt?: Date;
	updatedAt?: Date;
}

export interface IActivityPubRemoteObjectPreview {
	name?: string;
	contentHtml?: string;
	contentText?: string;
	contentRichText?: RichTextDocument;
	summaryHtml?: string;
	summaryText?: string;
	url?: string;
	attachments?: IActivityPubRemoteObjectAttachmentPreview[];
}

export type ActivityPubRemoteAttachmentBackupUnsupportedReason =
	'activitypub_remote_attachment_backup_unsupported_category'
	| 'activitypub_remote_attachment_backup_unsupported_url_scheme';

export type ActivityPubRemoteAttachmentEmbedMode =
	'inlineMedia'
	| 'documentLink'
	| 'externalLink'
	| 'provenanceOnly';

export type ActivityPubRemoteAttachmentEmbedUnsupportedReason =
	'activitypub_remote_attachment_embed_sensitive'
	| 'activitypub_remote_attachment_embed_unsupported_category'
	| 'activitypub_remote_attachment_embed_unsupported_url_scheme';

export interface IActivityPubRemoteAttachmentEmbedPolicy {
	mode: ActivityPubRemoteAttachmentEmbedMode;
	canEmbedInline: boolean;
	requiresUserAction: boolean;
	unsupportedReason?: ActivityPubRemoteAttachmentEmbedUnsupportedReason;
}

export interface IActivityPubRemoteObjectAttachmentPreview {
	url: string;
	type?: string;
	mediaType?: string;
	mediaCategory?: 'image' | 'video' | 'audio' | 'link' | 'document';
	name?: string;
	altText?: string;
	summaryText?: string;
	width?: number;
	height?: number;
	durationSeconds?: number;
	blurhash?: string;
	sensitive?: boolean;
	canBackupRemoteBytes?: boolean;
	backupUnsupportedReason?: ActivityPubRemoteAttachmentBackupUnsupportedReason;
	embedPolicy?: IActivityPubRemoteAttachmentEmbedPolicy;
}

export interface IActivityPubRemoteObjectFilters {
	objectId?: string;
	objectType?: string;
	visibility?: ActivityPubObjectVisibility | string;
	reviewState?: ActivityPubObjectReviewState | string;
	remoteActorId?: number | string;
}

export interface IActivityPubRemoteObjectListResponse {
	list: IActivityPubRemoteObjectReport[];
	total: number;
}

export interface IActivityPubSourceResolveInput {
	actorUrl?: string;
	resource?: string;
	handle?: string;
	bridgeProvider?: string;
	preset?: string;
}

export interface IActivityPubSourceResolveResult {
	sourceResource?: string;
	sourceActorUrl: string;
	bridgeProvider?: string;
	remoteActor?: IActivityPubRemoteActorReport;
}

export interface IActivityPubSourceSubscriptionInput extends IActivityPubSourceResolveInput {
	displayName?: string;
}

export interface IActivityPubSourceSubscriptionUpdateInput {
	displayName?: string;
	status?: ActivityPubSourceSubscriptionStatus | string;
}

export interface IActivityPubSourceSubscriptionFilters {
	status?: ActivityPubSourceSubscriptionStatus | string;
	remoteActorId?: number | string;
}

export interface IActivityPubSourceSubscriptionReport {
	id?: number;
	userId: number;
	remoteActorId: number;
	remoteActor?: IActivityPubRemoteActorReport;
	sourceResource?: string;
	sourceActorUrl: string;
	bridgeProvider?: string;
	displayName?: string;
	status: ActivityPubSourceSubscriptionStatus;
	lastReadAt?: Date;
	lastRefreshRequestedAt?: Date;
	lastError?: string;
	createdAt?: Date;
	updatedAt?: Date;
}

export interface IActivityPubSourceSubscriptionListResponse {
	list: IActivityPubSourceSubscriptionReport[];
	total: number;
}

export interface IActivityPubSourceFeedFilters extends IActivityPubRemoteObjectFilters {
	cursorPublishedAt?: string | Date;
	cursorId?: number | string;
}

export interface IActivityPubSourceFeedItem extends IActivityPubRemoteObjectReport {
	sourceSubscriptionId?: number;
	isUnread?: boolean;
}

export interface IActivityPubSourceFeedResponse {
	source: IActivityPubSourceSubscriptionReport;
	list: IActivityPubSourceFeedItem[];
	total: number | null;
	nextCursor?: {publishedAt: any; id: any} | null;
}

export interface IActivityPubSourceRefreshInput {
	limit?: number | string;
	includeFeatured?: boolean | string;
	includeOutbox?: boolean | string;
}

export interface IActivityPubSourceRefreshResult {
	source: IActivityPubSourceSubscriptionReport;
	fetched: number;
	cached: number;
	skipped: number;
	errors: string[];
}

export interface IActivityPubSourceRefreshQueueInput extends IActivityPubSourceRefreshInput {
	process?: boolean | string;
}

export interface IActivityPubSourceRefreshQueueProcessOptions {
	limit?: number | string;
}

export interface IActivityPubSourceRefreshQueueProcessResult {
	processed: number;
}

export interface IActivityPubSourceRefreshPollOptions {
	limit?: number | string;
	staleMs?: number | string;
	now?: Date | string;
	refreshInput?: IActivityPubSourceRefreshInput;
}

export interface IActivityPubSourceRefreshPollResult {
	queued: number;
}

export interface IActivityPubSourceReadInput {
	readAt?: Date | string;
}

export interface IActivityPubRemoteObjectPostDraftSource {
	protocol: 'activitypub';
	objectId: string;
	activityId?: string;
	remoteObjectUrl?: string;
	remoteActorUrl?: string;
}

export type ActivityPubRemoteAttachmentImportMode = 'provenanceOnly' | 'backupOnCreate';

export interface IActivityPubRemoteAttachmentImportPolicy {
	mode: 'provenanceOnly';
	defaultMode: 'provenanceOnly';
	canImportRemoteBytes: boolean;
	supportedModes: ActivityPubRemoteAttachmentImportMode[];
	reason?: 'activitypub_remote_attachment_import_disabled';
}

export interface IActivityPubRemoteAttachmentBackup {
	url: string;
	contentId: number;
	storageId?: string;
	mediaType?: string;
	mediaCategory?: IActivityPubRemoteObjectAttachmentPreview['mediaCategory'];
	name?: string;
}

export interface IActivityPubRemoteObjectPostDraft {
	remoteObject: IActivityPubRemoteObjectReport;
	canCreatePost: boolean;
	reasons: string[];
	title?: string;
	contentText?: string;
	contentRichText?: RichTextDocument;
	summaryText?: string;
	attachments?: IActivityPubRemoteObjectAttachmentPreview[];
	attachmentImportPolicy?: IActivityPubRemoteAttachmentImportPolicy;
	replyToPostId?: number;
	source: IActivityPubRemoteObjectPostDraftSource;
}

export interface IActivityPubRemoteObjectPostCreateOptions {
	importRemoteAttachments?: boolean | string;
}

export interface IActivityPubRemoteObjectPostCreateResult {
	post: IPost;
	remoteObject: IActivityPubRemoteObjectReport;
	attachmentBackups?: IActivityPubRemoteAttachmentBackup[];
}

export interface IActivityPubRemoteAttachmentBackupQueueOptions {
	process?: boolean;
	limit?: number | string;
}

export interface IActivityPubRemoteAttachmentBackupQueueProcessOptions {
	limit?: number | string;
}

export interface IActivityPubRemoteAttachmentBackupQueueProcessResult {
	processed: number;
}

export interface IActivityPubRemoteAttachmentBackupRetryResult {
	postId: number;
	remoteObjectId: number;
	attempted: number;
	backedUp: number;
	skipped: number;
	attachmentBackups: IActivityPubRemoteAttachmentBackup[];
}

export interface IActivityPubRemoteObjectReviewStateInput {
	state: ActivityPubObjectReviewState | string;
}

export interface IActivityPubObject {
	localActorId?: number;
	localPostId?: number;
	remoteActorId?: number;
	remoteObjectUrl?: string;
	activityId?: string;
	objectId: string;
	objectType: string;
	origin: ActivityPubObjectOrigin;
	visibility: ActivityPubObjectVisibility;
	reviewState?: ActivityPubObjectReviewState;
	reviewedAt?: Date;
	reviewedByUserId?: number;
	publishedAt?: Date;
	rawJson: string;
}

export interface IActivityPubDeliveryRequest {
	delivery: any;
	method: string;
	url: string;
	headers: Record<string, string>;
	body: string;
}

export interface IActivityPubDeliveryResponse {
	ok?: boolean;
	status?: number;
	statusText?: string;
}

export interface IActivityPubDeliveryProcessOptions {
	limit?: number;
	now?: Date | string;
	maxAttempts?: number;
	retryDelayMs?: number;
	claimTtlMs?: number;
	deliverActivityPubRequest?: IActivityPubDeliveryRequestSender;
}

export interface IActivityPubDeliveryProcessResult {
	processed: number;
	delivered: number;
	failed: number;
}

export interface IActivityPubPostDeliveryResult {
	objectId?: number;
	queued: number;
	deliveryIds: number[];
}

export type IActivityPubDeliveryRequestSender = (request: IActivityPubDeliveryRequest) => Promise<IActivityPubDeliveryResponse | void> | IActivityPubDeliveryResponse | void;

export interface IActivityPubFollowAcceptOptions {
	activityId: string;
}

export interface IActivityPubGeneratedKeyPair {
	publicKeyPem: string;
	privateKeyPem: string;
}

export interface IActivityPubSignRequestOptions {
	method: string;
	url: string;
	body?: string | Buffer;
	date?: Date | string;
	headers?: Record<string, string | number>;
	signedHeaders?: string[];
}

export interface IActivityPubVerifyRequestOptions {
	method: string;
	url: string;
	body?: string | Buffer;
	headers?: Record<string, string | number | string[] | undefined>;
	now?: Date | string;
	maxClockSkewMs?: number;
	requiredSignedHeaders?: string[];
}

export interface IActivityPubSignedRequest {
	headers: Record<string, string>;
	signature: string;
	signingString: string;
	signedHeaders: string[];
}

export interface IActivityPubRequestSignatureInfo {
	keyId: string;
	algorithm: string;
	signature: string;
	signedHeaders: string[];
}

export interface IActivityPubVerifiedRequest extends IActivityPubRequestSignatureInfo {
	signingString: string;
	digestVerified: boolean;
}

export interface IActivityPubInboundRequest {
	method: string;
	url: string;
	headers?: Record<string, string | number | string[] | undefined>;
	rawBody?: Buffer;
	body?: any;
	now?: Date | string;
	maxClockSkewMs?: number;
}

export interface IActivityPubInboxVerification extends IActivityPubVerifiedRequest {
	localActorUrl?: string;
	activityType?: string;
	actor?: string;
}

export interface IActivityPubInboxResult extends Partial<IActivityPubInboxVerification> {
	ok: boolean;
	accepted: boolean;
	message: string;
	followId?: number;
	followState?: ActivityPubFollowState;
	deliveryId?: number;
	flagId?: number;
	flagState?: ActivityPubFlagState;
	activityPubObjectId?: number;
	objectId?: string;
	inReplyTo?: string;
	localPostUpdated?: boolean;
	localPostDeleted?: boolean;
}

export type IActivityPubRemoteActorKeyResolver = (input: {
	keyId: string;
	actor?: string;
	activity?: any;
}) => Promise<IActivityPubRemoteActorKey | null> | IActivityPubRemoteActorKey | null;

export type IActivityPubRemoteActorFetcher = (actorUrl: string) => Promise<any>;

export type IActivityPubWebFingerFetcher = (resource: string, domain: string) => Promise<IActivityPubWebFingerResponse>;

export type IActivityPubSourceJsonFetcher = (url: string) => Promise<any>;

export type IActivityPubActorObject = Record<string, any>;

export type IActivityPubNoteObject = Record<string, any>;

export type IActivityPubCreateActivity = Record<string, any>;

export type IActivityPubFollowActivity = Record<string, any>;

export type IActivityPubAcceptActivity = Record<string, any>;

export type IActivityPubOutboxCollection = Record<string, any>;

export type IActivityPubFollowersCollection = Record<string, any>;

export type IActivityPubFollowingCollection = Record<string, any>;

export default interface IGeesomeActivityPubModule {
	isEnabled(): boolean;

	getWebFingerResponse(resource: string): Promise<IActivityPubWebFingerResponse>;

	getNodeInfoDiscovery(): Promise<IActivityPubNodeInfoDiscoveryResponse>;

	getNodeInfo(): Promise<IActivityPubNodeInfoResponse>;

	getGroupActor(groupName: string): Promise<IActivityPubActorObject>;

	getGroupOutbox(groupName: string, listParams?: IListParams): Promise<IActivityPubOutboxCollection>;

	getGroupFollowers(groupName: string, listParams?: IListParams): Promise<IActivityPubFollowersCollection>;

	getGroupFollowing(groupName: string, listParams?: IListParams): Promise<IActivityPubFollowingCollection>;

	getGroupPostNote(groupName: string, localId: number | string): Promise<IActivityPubNoteObject>;

	getGroupFlagReports(groupName: string, filters?: IActivityPubFlagReportFilters, listParams?: IListParams): Promise<IActivityPubFlagReportListResponse>;

	resolveActivityPubSource(input: IActivityPubSourceResolveInput): Promise<IActivityPubSourceResolveResult>;

	getActivityPubSourceSubscriptions(userId: number, filters?: IActivityPubSourceSubscriptionFilters, listParams?: IListParams): Promise<IActivityPubSourceSubscriptionListResponse>;

	subscribeActivityPubSource(userId: number, input: IActivityPubSourceSubscriptionInput): Promise<IActivityPubSourceSubscriptionReport>;

	updateActivityPubSourceSubscription(userId: number, sourceId: number | string, input: IActivityPubSourceSubscriptionUpdateInput): Promise<IActivityPubSourceSubscriptionReport>;

	removeActivityPubSourceSubscription(userId: number, sourceId: number | string): Promise<IActivityPubSourceSubscriptionReport>;

	getActivityPubSourceFeed(userId: number, sourceId: number | string, filters?: IActivityPubSourceFeedFilters, listParams?: IListParams): Promise<IActivityPubSourceFeedResponse>;

	refreshActivityPubSource(userId: number, sourceId: number | string, input?: IActivityPubSourceRefreshInput): Promise<IActivityPubSourceRefreshResult>;

	queueActivityPubSourceRefresh(userId: number, sourceId: number | string, userApiKeyId?: number | null, input?: IActivityPubSourceRefreshQueueInput): Promise<IUserOperationQueue>;

	processActivityPubSourceRefreshQueue(options?: IActivityPubSourceRefreshQueueProcessOptions): Promise<IActivityPubSourceRefreshQueueProcessResult>;

	queueDueActivityPubSourceRefreshes(options?: IActivityPubSourceRefreshPollOptions): Promise<IActivityPubSourceRefreshPollResult>;

	markActivityPubSourceRead(userId: number, sourceId: number | string, input?: IActivityPubSourceReadInput): Promise<IActivityPubSourceSubscriptionReport>;

	getGroupRemoteObjects(groupName: string, filters?: IActivityPubRemoteObjectFilters, listParams?: IListParams): Promise<IActivityPubRemoteObjectListResponse>;

	getGroupRemoteObject(groupName: string, remoteObjectId: number | string): Promise<IActivityPubRemoteObjectReport>;

	getGroupRemoteObjectPostDraft(groupName: string, remoteObjectId: number | string): Promise<IActivityPubRemoteObjectPostDraft>;

	createGroupRemoteObjectPost(groupName: string, remoteObjectId: number | string, userId: number, options?: IActivityPubRemoteObjectPostCreateOptions): Promise<IActivityPubRemoteObjectPostCreateResult>;

	queueGroupRemoteObjectAttachmentBackups(groupName: string, remoteObjectId: number | string, userId: number, userApiKeyId?: number | null, options?: IActivityPubRemoteAttachmentBackupQueueOptions): Promise<IUserOperationQueue>;

	processRemoteAttachmentBackupQueue(options?: IActivityPubRemoteAttachmentBackupQueueProcessOptions): Promise<IActivityPubRemoteAttachmentBackupQueueProcessResult>;

	setGroupRemoteObjectReviewState(groupName: string, remoteObjectId: number | string, input: IActivityPubRemoteObjectReviewStateInput, reviewedByUserId?: number): Promise<IActivityPubRemoteObjectReport>;

	setGroupFlagReportState(groupName: string, flagId: number | string, state: ActivityPubFlagState | string): Promise<IActivityPubFlagReport>;

	followRemoteActor(groupName: string, remoteActorUrl: string, options?: IActivityPubOutboundFollowOptions): Promise<IActivityPubOutboundFollowResult>;

	getGroupActorKey(groupName: string): Promise<IActivityPubActorKey>;

	signGroupRequest(groupName: string, options: IActivityPubSignRequestOptions): Promise<IActivityPubSignedRequest>;

	getRemoteActorKey(input: {keyId: string; actor?: string; activity?: any}): Promise<IActivityPubRemoteActorKey | null>;

	processDeliveryQueue(options?: IActivityPubDeliveryProcessOptions): Promise<IActivityPubDeliveryProcessResult>;

	afterPostManifestUpdate(userId: number, postId: number): Promise<IActivityPubPostDeliveryResult>;

	handleGroupInboxRequest(groupName: string, request: IActivityPubInboundRequest): Promise<IActivityPubInboxResult>;

	verifyGroupInboxRequest(groupName: string, request: IActivityPubInboundRequest): Promise<IActivityPubInboxVerification>;

	verifySharedInboxRequest(request: IActivityPubInboundRequest): Promise<IActivityPubInboxVerification>;

	handleSharedInboxRequest(request: IActivityPubInboundRequest): Promise<IActivityPubInboxResult>;

	flushDatabase(): Promise<void>;
}
