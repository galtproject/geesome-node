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
	Rejected = 'rejected'
}

export enum ActivityPubDeliveryState {
	Pending = 'pending',
	Delivered = 'delivered',
	Failed = 'failed'
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

export type IActivityPubAcceptActivity = Record<string, any>;

export type IActivityPubOutboxCollection = Record<string, any>;

export type IActivityPubFollowersCollection = Record<string, any>;

export default interface IGeesomeActivityPubModule {
	isEnabled(): boolean;

	getWebFingerResponse(resource: string): Promise<IActivityPubWebFingerResponse>;

	getGroupActor(groupName: string): Promise<IActivityPubActorObject>;

	getGroupOutbox(groupName: string, listParams?: IListParams): Promise<IActivityPubOutboxCollection>;

	getGroupFollowers(groupName: string, listParams?: IListParams): Promise<IActivityPubFollowersCollection>;

	getGroupPostNote(groupName: string, localId: number | string): Promise<IActivityPubNoteObject>;

	getGroupActorKey(groupName: string): Promise<IActivityPubActorKey>;

	signGroupRequest(groupName: string, options: IActivityPubSignRequestOptions): Promise<IActivityPubSignedRequest>;

	getRemoteActorKey(input: {keyId: string; actor?: string; activity?: any}): Promise<IActivityPubRemoteActorKey | null>;

	processDeliveryQueue(options?: IActivityPubDeliveryProcessOptions): Promise<IActivityPubDeliveryProcessResult>;

	handleGroupInboxRequest(groupName: string, request: IActivityPubInboundRequest): Promise<IActivityPubInboxResult>;

	verifyGroupInboxRequest(groupName: string, request: IActivityPubInboundRequest): Promise<IActivityPubInboxVerification>;

	verifySharedInboxRequest(request: IActivityPubInboundRequest): Promise<IActivityPubInboxVerification>;

	flushDatabase(): Promise<void>;
}
