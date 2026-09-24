import assert from 'node:assert';
import registerPrivateGroupApi from '../app/modules/privateGroup/api.js';

describe('private group api', () => {
	it('registers authorized membership routes and uses the authenticated actor', async () => {
		const routes = [];
		const app: any = {
			ms: {
				api: {
					onAuthorizedGet: (path, callback) => routes.push({
						method: 'GET',
						path,
						callback
					}),
					onAuthorizedPost: (path, callback) => routes.push({
						method: 'POST',
						path,
						callback
					})
				}
			}
		};
		const calls = [];
		const module: any = {
			getMembershipSnapshot: async (...args) => {
				calls.push(['getMembershipSnapshot', ...args]);
				return null;
			},
			createMembershipSnapshot: async (...args) => {
				calls.push(['createMembershipSnapshot', ...args]);
				return {id: 31, groupId: 11, version: '2'};
			}
		};
		registerPrivateGroupApi(app, module);

		assert.deepEqual(routes.map(({method, path}) => `${method} ${path}`), [
			'GET private-groups/:groupId/membership',
			'POST private-groups/:groupId/membership'
		]);

		const getResult = await callRoute(
			routes,
			'GET',
			'private-groups/:groupId/membership',
			{
				user: {id: 7},
				params: {groupId: 11},
				query: {}
			}
		);
		const postResult = await callRoute(
			routes,
			'POST',
			'private-groups/:groupId/membership',
			{
				user: {id: 7},
				params: {groupId: 11},
				body: {expectedVersion: '1', userId: 999}
			}
		);

		assert.deepEqual(calls, [
			['getMembershipSnapshot', 7, 11],
			['createMembershipSnapshot', 7, 11, '1']
		]);
		assert.deepEqual(getResult, {
			snapshot: null,
			expectedVersion: '0'
		});
		assert.deepEqual(postResult, {
			snapshot: {id: 31, groupId: 11, version: '2'},
			expectedVersion: '2'
		});
	});

	it('maps membership contract failures to documented HTTP status codes', async () => {
		const routes = [];
		const app: any = {
			ms: {
				api: {
					onAuthorizedGet: (path, callback) => routes.push({
						method: 'GET',
						path,
						callback
					}),
					onAuthorizedPost: (path, callback) => routes.push({
						method: 'POST',
						path,
						callback
					})
				}
			}
		};
		registerPrivateGroupApi(app, {
			getMembershipSnapshot: async () => {
				throw new Error('not_permitted');
			}
		} as any);

		await assert.rejects(
			() => callRoute(
				routes,
				'GET',
				'private-groups/:groupId/membership',
				{user: {id: 7}, params: {groupId: 11}, query: {}}
			),
			(error: any) => error.message === 'not_permitted' && error.code === 403
		);

		module.getMembershipSnapshot = async () => null;
		await assert.rejects(
			() => callRoute(
				routes,
				'POST',
				'private-groups/:groupId/membership',
				{user: {id: 7}, params: {groupId: 11}, body: {}}
			),
			(error: any) => (
				error.message === 'private_group_membership_version_invalid'
				&& error.code === 422
			)
		);
	});
});

async function callRoute(routes, method, path, req) {
	let body;
	await routes.find(route => route.method === method && route.path === path)
		.callback(req, {
			send: value => {
				body = value;
			}
		});
	return body;
}
