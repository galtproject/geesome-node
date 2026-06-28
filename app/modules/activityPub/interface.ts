import type {IGroup} from '../group/interface.js';
import type {IContentData, IListParams} from '../database/interface.js';

export interface IActivityPubConfig {
	enabled?: boolean | string;
	publicUrl?: string;
	domain?: string;
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

export interface IActivityPubActorKey {
	keyId: string;
	actorUrl: string;
	publicKeyPem: string;
	privateKeyPem: string;
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

export interface IActivityPubSignedRequest {
	headers: Record<string, string>;
	signature: string;
	signingString: string;
	signedHeaders: string[];
}

export type IActivityPubActorObject = Record<string, any>;

export type IActivityPubNoteObject = Record<string, any>;

export type IActivityPubCreateActivity = Record<string, any>;

export type IActivityPubOutboxCollection = Record<string, any>;

export default interface IGeesomeActivityPubModule {
	isEnabled(): boolean;

	getWebFingerResponse(resource: string): Promise<IActivityPubWebFingerResponse>;

	getGroupActor(groupName: string): Promise<IActivityPubActorObject>;

	getGroupOutbox(groupName: string, listParams?: IListParams): Promise<IActivityPubOutboxCollection>;

	getGroupPostNote(groupName: string, localId: number | string): Promise<IActivityPubNoteObject>;

	getGroupActorKey(groupName: string): Promise<IActivityPubActorKey>;

	signGroupRequest(groupName: string, options: IActivityPubSignRequestOptions): Promise<IActivityPubSignedRequest>;

	flushDatabase(): Promise<void>;
}
