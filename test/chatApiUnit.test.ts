import assert from 'node:assert';
import registerChatApi from '../app/modules/chat/api.js';

describe('chat api', () => {
	it('registers public transport routes and protects user chat operations', async () => {
		const routes = [];
		const permissions = [];
		const app: any = {
			checkUserCan: async (...args) => permissions.push(args),
			ms: {
				api: {
					onGet: (path, callback) => routes.push({
						method: 'GET',
						path,
						callback,
						authorized: false
					}),
					onPost: (path, callback) => routes.push({
						method: 'POST',
						path,
						callback,
						authorized: false
					}),
					onAuthorizedGet: (path, callback) => routes.push({method: 'GET', path, callback}),
					onAuthorizedPost: (path, callback) => routes.push({method: 'POST', path, callback})
				}
			}
		};
		const calls = [];
		const chat: any = {
			getPublicNodeInfo: async (...args) => record(calls, 'getPublicNodeInfo', args),
			acceptRemoteDelivery: async (...args) => record(calls, 'acceptRemoteDelivery', args),
			acceptSyncRequest: async (...args) => record(calls, 'acceptSyncRequest', args),
			registerDevice: async (...args) => record(calls, 'registerDevice', args),
			getOwnDevices: async (...args) => record(calls, 'getOwnDevices', args),
			getPublicDevices: async (...args) => record(calls, 'getPublicDevices', args),
			revokeDevice: async (...args) => record(calls, 'revokeDevice', args),
			createAttachmentUploadReservation: async (...args) =>
				record(calls, 'createAttachmentUploadReservation', args),
			cancelAttachmentUploadReservation: async (...args) =>
				record(calls, 'cancelAttachmentUploadReservation', args),
			processAttachmentCleanup: async (...args) =>
				record(calls, 'processAttachmentCleanup', args),
			acceptEncryptedEvent: async (...args) => record(calls, 'acceptEncryptedEvent', args),
			getEventDeliveries: async (...args) => record(calls, 'getEventDeliveries', args),
			getEncryptedEvents: async (...args) => record(calls, 'getEncryptedEvents', args),
			getConversationHead: async (...args) => record(calls, 'getConversationHead', args),
			reconcileConversation: async (...args) => record(calls, 'reconcileConversation', args),
			setEventReceipt: async (...args) => record(calls, 'setEventReceipt', args)
		};

		registerChatApi(app, chat);
		assert.deepEqual(routes.map(({method, path}) => `${method} ${path}`), [
			'GET chat/public/node',
			'GET chat/public/users/:ownerId/devices',
			'POST chat/inbox',
			'POST chat/sync',
			'POST chat/devices',
			'GET chat/devices',
			'GET chat/users/:ownerId/devices',
			'POST chat/devices/:deviceId/revoke',
			'POST chat/attachments/reservations',
			'POST chat/attachments/reservations/:reservationId/cancel',
			'POST admin/chat/attachments/cleanup',
			'POST chat/events',
			'GET chat/events/:messageId/deliveries',
			'GET chat/conversations/:conversationId/events',
			'GET chat/conversations/:conversationId/head',
			'POST chat/conversations/:conversationId/reconcile',
			'POST chat/events/:messageId/receipt'
		]);
		assert.deepEqual(
			routes.filter(route => route.authorized === false)
				.map(({method, path}) => `${method} ${path}`),
			[
				'GET chat/public/node',
				'GET chat/public/users/:ownerId/devices',
				'POST chat/inbox',
				'POST chat/sync'
			]
		);

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
		await getRoute(routes, 'POST', 'chat/attachments/reservations').callback({
			user: {id: 7},
			body: {expectedBytes: 32}
		}, response);
		await getRoute(
			routes,
			'POST',
			'chat/attachments/reservations/:reservationId/cancel'
		).callback({
			user: {id: 7},
			params: {reservationId: 'reservation-1'}
		}, response);
		await getRoute(
			routes,
			'POST',
			'admin/chat/attachments/cleanup'
		).callback({
			user: {id: 7},
			body: {limit: 5}
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
				method: 'createAttachmentUploadReservation',
				args: [7, 32]
			},
			{
				method: 'cancelAttachmentUploadReservation',
				args: [7, 'reservation-1']
			},
			{
				method: 'processAttachmentCleanup',
				args: [{limit: 5}]
			},
			{
				method: 'setEventReceipt',
				args: [7, 'message-1', 'read']
			}
		]);
		assert.deepEqual(permissions, [[7, 'admin:all']]);
	});
});

function record(calls, method, args) {
	calls.push({method, args});
	return {method};
}

function getRoute(routes, method, path) {
	return routes.find(route => route.method === method && route.path === path);
}
