import assert from 'node:assert';
import registerChatApi from '../app/modules/chat/api.js';

describe('chat api', () => {
	it('registers every chat route behind authorization', async () => {
		const routes = [];
		const app: any = {
			ms: {
				api: {
					onAuthorizedGet: (path, callback) => routes.push({method: 'GET', path, callback}),
					onAuthorizedPost: (path, callback) => routes.push({method: 'POST', path, callback})
				}
			}
		};
		const calls = [];
		const chat: any = {
			registerDevice: async (...args) => record(calls, 'registerDevice', args),
			getOwnDevices: async (...args) => record(calls, 'getOwnDevices', args),
			getPublicDevices: async (...args) => record(calls, 'getPublicDevices', args),
			revokeDevice: async (...args) => record(calls, 'revokeDevice', args),
			acceptEncryptedEvent: async (...args) => record(calls, 'acceptEncryptedEvent', args),
			getEncryptedEvents: async (...args) => record(calls, 'getEncryptedEvents', args),
			getConversationHead: async (...args) => record(calls, 'getConversationHead', args),
			setEventReceipt: async (...args) => record(calls, 'setEventReceipt', args)
		};

		registerChatApi(app, chat);
		assert.deepEqual(routes.map(({method, path}) => `${method} ${path}`), [
			'POST chat/devices',
			'GET chat/devices',
			'GET chat/users/:ownerId/devices',
			'POST chat/devices/:deviceId/revoke',
			'POST chat/events',
			'GET chat/conversations/:conversationId/events',
			'GET chat/conversations/:conversationId/head',
			'POST chat/events/:messageId/receipt'
		]);

		const response = {
			send: value => value
		};
		await getRoute(routes, 'POST', 'chat/devices').callback({
			user: {id: 7},
			body: {publicBundle: {keyId: 'device-key'}}
		}, response);
		await getRoute(routes, 'GET', 'chat/conversations/:conversationId/events').callback({
			user: {id: 7},
			params: {conversationId: 'conversation-1'},
			query: {afterSequence: '4'}
		}, response);
		await getRoute(routes, 'POST', 'chat/events/:messageId/receipt').callback({
			user: {id: 7},
			params: {messageId: 'message-1'},
			body: {state: 'read'}
		}, response);

		assert.deepEqual(calls, [
			{
				method: 'registerDevice',
				args: [7, {keyId: 'device-key'}]
			},
			{
				method: 'getEncryptedEvents',
				args: [7, 'conversation-1', {afterSequence: '4'}]
			},
			{
				method: 'setEventReceipt',
				args: [7, 'message-1', 'read']
			}
		]);
	});
});

function record(calls, method, args) {
	calls.push({method, args});
	return {method};
}

function getRoute(routes, method, path) {
	return routes.find(route => route.method === method && route.path === path);
}
