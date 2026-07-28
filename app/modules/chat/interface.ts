export enum ChatEventState {
	AcceptedLocal = 'accepted_local',
	ReceivedRemote = 'received_remote'
}

export enum ChatReceiptState {
	Received = 'received',
	Read = 'read'
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
	flushDatabase(): Promise<void>;
	registerDevice(userId: number, publicBundle: any): Promise<any>;
	getOwnDevices(userId: number, options?: {includeRevoked?: boolean}): Promise<any[]>;
	getPublicDevices(userId: number, ownerId: string): Promise<any[]>;
	revokeDevice(userId: number, deviceId: string): Promise<any>;
	acceptEncryptedEvent(userId: number, envelope: any): Promise<any>;
	getEncryptedEvents(userId: number, conversationId: string, options?: any): Promise<any>;
	getConversationHead(userId: number, conversationId: string): Promise<any>;
	setEventReceipt(userId: number, messageId: string, state: ChatReceiptState): Promise<any>;
}
