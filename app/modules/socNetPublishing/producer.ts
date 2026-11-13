import {createHash} from 'node:crypto';
import {normalizeContentType} from './contentPolicy.js';

// Field order and explicit nulls are shared with producers and local executors.
export function publicationIntentDigest(intent, payload) {
	normalizeContentType(intent.contentType);
	return createHash('sha256').update(JSON.stringify({version: 6, contentType: intent.contentType,
		destinationId: intent.destinationId ?? null, executionMode: intent.executionMode ?? 'client',
		accountIdentity: intent.accountIdentity ?? null, clientId: intent.clientId ?? null,
		network: intent.network, localAccountId: intent.localAccountId || null, text: payload.text,
		attachments: (payload.attachments || []).map(item => ({storageId: item.storageId, mimeType: item.mimeType})),
		target: Object.fromEntries(Object.keys(intent.target || {}).sort().map(key => [key, intent.target[key]])), ...(payload.sourceImageSet ? {sourceImageSet: payload.sourceImageSet} : {})})).digest('hex');
}
