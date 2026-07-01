import type {IGroup} from '../group/interface.js';
import type {IContentData, IListParams} from '../database/interface.js';

export interface IActivityPubConfig {
	enabled?: boolean | string;
	publicUrl?: string;
	domain?: string;
	deliveryWorker?: boolean | string;
	deliveryWorkerIntervalMs?: number | string;
	deliveryWorkerLimit?: number | string;
	deliveryClaimTtlMs?: number | string;
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

export interface IActivityPubFlagReport {
	id?: number;
	localActorId: number;
	remoteActorId: number;
	remoteActor?: IActivityPubFlagReportRemoteActor;
	activityId: string;
	objectId: string;
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
	summaryHtml?: string;
	summaryText?: string;
	url?: string;
}

export interface IActivityPubRemoteObjectFilters {
	objectId?: string;
	objectType?: string;
	visibility?: ActivityPubObjectVisibility | string;
	remoteActorId?: number | string;
}

export interface IActivityPubRemoteObjectListResponse {
	list: IActivityPubRemoteObjectReport[];
	total: number;
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
}

export type IActivityPubRemoteActorKeyResolver = (input: {
	keyId: string;
	actor?: string;
	activity?: any;
}) => Promise<IActivityPubRemoteActorKey | null> | IActivityPubRemoteActorKey | null;

export type IActivityPubRemoteActorFetcher = (actorUrl: string) => Promise<any>;

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

	getGroupActor(groupName: string): Promise<IActivityPubActorObject>;

	getGroupOutbox(groupName: string, listParams?: IListParams): Promise<IActivityPubOutboxCollection>;

	getGroupFollowers(groupName: string, listParams?: IListParams): Promise<IActivityPubFollowersCollection>;

	getGroupFollowing(groupName: string, listParams?: IListParams): Promise<IActivityPubFollowingCollection>;

	getGroupPostNote(groupName: string, localId: number | string): Promise<IActivityPubNoteObject>;

	getGroupFlagReports(groupName: string, filters?: IActivityPubFlagReportFilters, listParams?: IListParams): Promise<IActivityPubFlagReportListResponse>;

	getGroupRemoteObjects(groupName: string, filters?: IActivityPubRemoteObjectFilters, listParams?: IListParams): Promise<IActivityPubRemoteObjectListResponse>;

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
