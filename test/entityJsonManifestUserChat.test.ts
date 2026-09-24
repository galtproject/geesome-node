import assert from 'node:assert';
import {getModule} from '../app/modules/entityJsonManifest/index.js';
import {buildChatPublicNodeInfoResponse} from '../app/modules/chat/publicNodeInfo.js';

describe('user manifest chat transport', () => {
	it('advertises configured chat transport without changing user identity fields', async () => {
		const manifestModule = getModule(createManifestApp(
			buildChatPublicNodeInfoResponse('https://node.example')
		));
		const manifest = await manifestModule.generateManifest('user', {
			id: 1,
			name: 'alice',
			title: 'Alice',
			manifestStaticStorageId: 'owner-alice'
		});

		assert.equal(manifest.staticId, 'owner-alice');
		assert.equal(manifest.publicKey, 'alice-public-key');
		assert.deepEqual(manifest.chatTransport, {
			protocol: 'geesome-chat-delivery-v1',
			syncProtocol: 'geesome-chat-sync-v1',
			publicUrl: 'https://node.example',
			inboxUrl: 'https://node.example/v1/chat/inbox',
			syncUrl: 'https://node.example/v1/chat/sync',
			deviceDiscoveryTemplate: 'https://node.example/v1/chat/public/users/{ownerId}/devices'
		});
	});

	it('omits transport for unconfigured nodes and invalid remote advertisements', async () => {
		const unconfiguredModule = getModule(createManifestApp(
			buildChatPublicNodeInfoResponse(null)
		));
		const manifest = await unconfiguredModule.generateManifest('user', {
			id: 1,
			name: 'alice',
			manifestStaticStorageId: 'owner-alice'
		});
		assert.equal(manifest.chatTransport, undefined);

		const invalidRemoteModule = getModule(createManifestApp(null, {
			_entityName: 'user',
			name: 'mallory',
			staticId: 'owner-mallory',
			publicKey: 'mallory-public-key',
			chatTransport: {
				...buildChatPublicNodeInfoResponse('https://node.example'),
				inboxUrl: 'https://localhost/v1/chat/inbox'
			}
		}));
		const imported = await invalidRemoteModule.manifestIdToDbObject(
			'remote-user-manifest',
			'user'
		);
		assert.equal(imported.chatTransport, undefined);
	});

	it('preserves a canonical transport when importing a remote user manifest', async () => {
		const chatTransport = buildChatPublicNodeInfoResponse('https://remote.example');
		const manifestModule = getModule(createManifestApp(null, {
			_entityName: 'user',
			name: 'bob',
			staticId: 'owner-bob',
			publicKey: 'bob-public-key',
			chatTransport
		}));
		const imported = await manifestModule.manifestIdToDbObject(
			'remote-user-manifest',
			'user'
		);

		assert.deepEqual(imported.chatTransport, chatTransport);
	});
});

function createManifestApp(publicNodeInfo, storedManifest: any = {}) {
	return {
		checkModules: () => true,
		callHook: async () => true,
		ms: {
			accountStorage: {
				getStaticIdPublicKeyByOr: async () => 'alice-public-key',
				createRemoteAccount: async () => true
			},
			chat: {
				getPublicNodeInfo: async () => publicNodeInfo
			},
			staticId: {
				addStaticIdHistoryItem: async () => true
			},
			storage: {
				getObject: async () => storedManifest
			}
		}
	} as any;
}
