import {chatSyncProtocol} from './sync.js';
import {chatDeliveryProtocol} from './transport.js';

export interface IChatPublicNodeInfo {
	protocol: typeof chatDeliveryProtocol;
	syncProtocol: typeof chatSyncProtocol;
	publicUrl: string;
	inboxUrl: string;
	syncUrl: string;
	deviceDiscoveryTemplate: string;
}

export type IChatPublicNodeInfoResponse = IChatPublicNodeInfo | {
	protocol: typeof chatDeliveryProtocol;
	syncProtocol: typeof chatSyncProtocol;
	publicUrl: null;
	inboxUrl: null;
	syncUrl: null;
	deviceDiscoveryTemplate: null;
};

export function buildChatPublicNodeInfo(publicUrl?: string | null): IChatPublicNodeInfo | null {
	const normalizedPublicUrl = normalizePublicUrl(publicUrl);
	if (!normalizedPublicUrl) {
		return null;
	}
	return {
		protocol: chatDeliveryProtocol,
		syncProtocol: chatSyncProtocol,
		publicUrl: normalizedPublicUrl,
		inboxUrl: `${normalizedPublicUrl}/v1/chat/inbox`,
		syncUrl: `${normalizedPublicUrl}/v1/chat/sync`,
		deviceDiscoveryTemplate: `${normalizedPublicUrl}/v1/chat/public/users/{ownerId}/devices`
	};
}

export function buildChatPublicNodeInfoResponse(publicUrl?: string | null): IChatPublicNodeInfoResponse {
	return buildChatPublicNodeInfo(publicUrl) || {
		protocol: chatDeliveryProtocol,
		syncProtocol: chatSyncProtocol,
		publicUrl: null,
		inboxUrl: null,
		syncUrl: null,
		deviceDiscoveryTemplate: null
	};
}

export function normalizeChatPublicNodeInfo(value: any): IChatPublicNodeInfo | null {
	if (
		!value ||
		value.protocol !== chatDeliveryProtocol ||
		value.syncProtocol !== chatSyncProtocol
	) {
		return null;
	}
	const expected = buildChatPublicNodeInfo(value.publicUrl);
	if (
		!expected ||
		value.inboxUrl !== expected.inboxUrl ||
		value.syncUrl !== expected.syncUrl ||
		value.deviceDiscoveryTemplate !== expected.deviceDiscoveryTemplate
	) {
		return null;
	}
	return expected;
}

function normalizePublicUrl(value?: string | null): string | null {
	if (!value || typeof value !== 'string') {
		return null;
	}
	try {
		const url = new URL(value);
		if (
			(url.protocol !== 'https:' && url.protocol !== 'http:') ||
			url.username ||
			url.password ||
			url.search ||
			url.hash
		) {
			return null;
		}
		url.pathname = url.pathname.replace(/\/+$/, '');
		return url.toString().replace(/\/$/, '');
	} catch (_error) {
		return null;
	}
}
