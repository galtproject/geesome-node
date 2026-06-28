import type {IGroup} from '../group/interface.js';
import type {IContentData} from '../database/interface.js';

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

export type IActivityPubActorObject = Record<string, any>;

export type IActivityPubNoteObject = Record<string, any>;

export type IActivityPubCreateActivity = Record<string, any>;

export type IActivityPubOutboxCollection = Record<string, any>;
