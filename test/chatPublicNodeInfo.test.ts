import assert from 'node:assert';
import {
	buildChatPublicNodeInfo,
	buildChatPublicNodeInfoResponse,
	normalizeChatPublicNodeInfo
} from '../app/modules/chat/publicNodeInfo.js';

describe('chat public node info', () => {
	it('builds the canonical same-origin chat transport contract', () => {
		assert.deepEqual(buildChatPublicNodeInfo('https://node.example/'), {
			protocol: 'geesome-chat-delivery-v1',
			syncProtocol: 'geesome-chat-sync-v1',
			publicUrl: 'https://node.example',
			inboxUrl: 'https://node.example/v1/chat/inbox',
			syncUrl: 'https://node.example/v1/chat/sync',
			deviceDiscoveryTemplate: 'https://node.example/v1/chat/public/users/{ownerId}/devices'
		});
		assert.equal(buildChatPublicNodeInfo(null), null);
		assert.deepEqual(buildChatPublicNodeInfoResponse(null), {
			protocol: 'geesome-chat-delivery-v1',
			syncProtocol: 'geesome-chat-sync-v1',
			publicUrl: null,
			inboxUrl: null,
			syncUrl: null,
			deviceDiscoveryTemplate: null
		});
	});

	it('accepts only canonical endpoint paths from the advertised origin', () => {
		const valid = buildChatPublicNodeInfo('https://node.example');
		assert.deepEqual(normalizeChatPublicNodeInfo(valid), valid);
		assert.equal(normalizeChatPublicNodeInfo({
			...valid,
			inboxUrl: 'https://internal.example/v1/chat/inbox'
		}), null);
		assert.equal(normalizeChatPublicNodeInfo({
			...valid,
			deviceDiscoveryTemplate: 'https://node.example/v1/users/{ownerId}'
		}), null);
		assert.equal(normalizeChatPublicNodeInfo({
			...valid,
			protocol: 'future-chat-protocol'
		}), null);
	});

	it('rejects credentialed and non-HTTP public URLs', () => {
		assert.equal(buildChatPublicNodeInfo('https://user:pass@node.example'), null);
		assert.equal(buildChatPublicNodeInfo('file:///tmp/chat'), null);
	});
});
