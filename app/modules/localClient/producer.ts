import {createHash} from 'node:crypto';

// This ordered representation is shared with producer and local executor.
// Derived download URLs and filenames are deliberately not identity fields.
export function publicationDigest(network, localAccountId, payload, target = {}) {
	const sortedTarget = Object.fromEntries(Object.keys(target).sort().map(key => [key, target[key]]));
	return createHash('sha256').update(JSON.stringify({network, localAccountId, text: payload.text,
		attachments: (payload.attachments || []).map(item => ({storageId: item.storageId, mimeType: item.mimeType})), target: sortedTarget})).digest('hex');
}

export function publicationDestinationDigest(destinationId, clientId, network, localAccountId, payload, target = {}) {
	const sortedTarget = Object.fromEntries(Object.keys(target).sort().map(key => [key, target[key]]));
	return createHash('sha256').update(JSON.stringify({version: 4, destinationId, clientId, network, localAccountId, text: payload.text,
		attachments: (payload.attachments || []).map(item => ({storageId: item.storageId, mimeType: item.mimeType})), target: sortedTarget})).digest('hex');
}
