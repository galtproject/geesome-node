import type {IBackgroundWorker} from '../../backgroundWorker.js';
import type {IChatPublicNodeInfoResponse} from './publicNodeInfo.js';

export enum ChatEventState {
	AcceptedLocal = 'accepted_local',
	ReceivedRemote = 'received_remote'
}

export enum ChatReceiptState {
	Received = 'received',
	Read = 'read'
}

export enum ChatDeliveryState {
	Pending = 'pending',
	Delivered = 'delivered',
	Failed = 'failed'
}

export interface IChatRecipientEndpoint {
	ownerId: string;
	publicKey: string;
	inboxUrl: string;
}

export interface IChatDeliveryProcessOptions {
	limit?: number;
	claimTtlMs?: number;
	now?: Date;
	deliverChatRequest?: (inboxUrl: string, delivery: any) => Promise<any>;
}

export interface IChatReconcileOptions {
	sourceOwnerId: string;
	sourcePublicKey?: string;
	syncUrl?: string;
	limit?: number;
	maxPages?: number;
	requestChatSync?: (syncUrl: string, request: any) => Promise<any>;
}

export interface IChatReconciliationProcessOptions {
	limit?: number;
	perRecipientLimit?: number;
	claimTtlMs?: number;
	refreshIntervalMs?: number;
	continuationDelayMs?: number;
	pageLimit?: number;
	maxPages?: number;
	now?: Date;
	requestChatSync?: (syncUrl: string, request: any) => Promise<any>;
}

export interface IChatDeviceBundleRecord {
	id?: number;
	userId: number;
	ownerId: string;
	deviceId: string;
	keyId: string;
	bundleJson: string;
	revokedAt?: Date | null;
	lastSeenAt?: Date | null;
	createdAt?: Date;
	updatedAt?: Date;
}

export default interface IGeesomeChatModule {
	setDeliveryWorker(worker: IBackgroundWorker | null): void;
	stop(): Promise<void>;
	flushDatabase(): Promise<void>;
	registerDevice(userId: number, publicBundle: any): Promise<any>;
	getOwnDevices(userId: number, options?: {includeRevoked?: boolean}): Promise<any[]>;
	getPublicDevices(ownerId: string): Promise<any[]>;
	getPublicNodeInfo(): Promise<IChatPublicNodeInfoResponse>;
	revokeDevice(userId: number, deviceId: string): Promise<any>;
	createAttachmentUploadReservation(userId: number, expectedBytes): Promise<any>;
	cancelAttachmentUploadReservation(userId: number, reservationId: string): Promise<any>;
	afterContentAdding(userId: number, content, options?): Promise<any>;
	existsContentAdding(userId: number, content, options?): Promise<any>;
	acceptEncryptedEvent(
		userId: number,
		envelope: any,
		options?: {recipientEndpoints?: IChatRecipientEndpoint[]}
	): Promise<any>;
	acceptRemoteDelivery(delivery: any): Promise<any>;
	acceptSyncRequest(request: any): Promise<any>;
	reconcileConversation(
		userId: number,
		conversationId: string,
		options: IChatReconcileOptions
	): Promise<any>;
	processReconciliationQueue(
		options?: IChatReconciliationProcessOptions
	): Promise<any>;
	processDeliveryQueue(options?: IChatDeliveryProcessOptions): Promise<any>;
	getEventDeliveries(userId: number, messageId: string): Promise<any[]>;
	getEncryptedEvents(userId: number, conversationId: string, options?: any): Promise<any>;
	getConversationHead(userId: number, conversationId: string): Promise<any>;
	setEventReceipt(userId: number, messageId: string, state: ChatReceiptState): Promise<any>;
}
