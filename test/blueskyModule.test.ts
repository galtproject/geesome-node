import assert from 'node:assert';
import registerBlueskyApi from '../app/modules/bluesky/api.js';
import {getModule as getBlueskyModule} from '../app/modules/bluesky/index.js';
import IGeesomeBlueskyModule from '../app/modules/bluesky/interface.js';
import {CorePermissionName} from '../app/modules/database/interface.js';
import {richTextToPlainText} from '../app/richText.js';

describe('bluesky module', () => {
	it('previews public author feeds from configured native ATProto origin', async () => {
		const calls: any[] = [];
		const module = getBlueskyModule({
			config: {
				blueskyConfig: {
					publicApiOrigin: 'https://public.example/',
					publicApiTimeoutMs: 1234
				}
			},
			checkModules: (modulesList) => {
				assert.deepEqual(modulesList, ['api']);
			}
		} as any, {
			fetch: async (url, options) => {
				calls.push({url, options});
				return {
					ok: true,
					json: async () => getAuthorFeedFixture()
				};
			}
		});

		const preview = await module.getPublicAuthorFeedPreview({
			actor: '@bsky.app',
			limit: 1,
			cursor: 'next-page'
		});

		assert.equal(calls[0].url, 'https://public.example/xrpc/app.bsky.feed.getAuthorFeed?actor=bsky.app&limit=1&cursor=next-page');
		assert.equal(calls[0].options.headers.Accept, 'application/json');
		assert.equal(preview.actor, 'bsky.app');
		assert.equal(preview.cursor, 'cursor-after');
		assert.equal(preview.list.length, 1);
		assert.equal(preview.list[0].sourceIdentity.source, 'socNetImport:bluesky');
		assert.equal(preview.list[0].sourceIdentity.sourceChannelId, 'did:plc:alice');
		assert.equal(preview.list[0].sourceIdentity.sourcePostId, 'at://did:plc:alice/app.bsky.feed.post/3k4duaz5vfs2b');
		assert.equal(richTextToPlainText(preview.list[0].richText), 'Hello site');
	});

	it('registers an admin read-only public author feed preview route', async () => {
		const routes = {};
		const permissionChecks: any[] = [];
		const moduleCalls: any[] = [];
		const app = {
			ms: {
				api: {
					onAuthorizedPost: (path, handler) => {
						routes[`AUTH POST ${path}`] = handler;
					}
				}
			},
			checkUserCan: async (userId, permission) => {
				permissionChecks.push({userId, permission});
			}
		};
		const module = {
			getPublicAuthorFeedPreview: async (input) => {
				moduleCalls.push(input);
				return {
					actor: 'bsky.app',
					cursor: null,
					list: []
				};
			}
		};

		registerBlueskyApi(app as any, module as IGeesomeBlueskyModule);
		const response = await callRoute(routes, 'AUTH POST admin/bluesky/public-author-feed/preview', {
			user: {id: 7},
			body: {actor: 'bsky.app', limit: 2}
		});

		assert.deepEqual(permissionChecks, [{
			userId: 7,
			permission: CorePermissionName.AdminRead
		}]);
		assert.deepEqual(moduleCalls, [{
			actor: 'bsky.app',
			limit: 2
		}]);
		assert.deepEqual(response.body, {
			actor: 'bsky.app',
			cursor: null,
			list: []
		});
	});
});

async function callRoute(routes, key: string, req: any = {}) {
	const route = routes[key];
	assert.equal(typeof route, 'function', `missing route ${key}`);
	const response: any = {};
	await route({
		user: {id: 1},
		body: {},
		params: {},
		query: {},
		...req
	}, {
		send: (body, status) => {
			response.body = body;
			response.status = status;
		}
	});
	return response;
}

function getAuthorFeedFixture() {
	return {
		cursor: 'cursor-after',
		feed: [{
			post: {
				uri: 'at://did:plc:alice/app.bsky.feed.post/3k4duaz5vfs2b',
				cid: 'bafyreibsky',
				author: {
					did: 'did:plc:alice',
					handle: 'alice.bsky.social'
				},
				indexedAt: '2026-07-04T08:00:00.000Z',
				record: {
					$type: 'app.bsky.feed.post',
					text: 'Hello site',
					createdAt: '2026-07-04T07:59:00.000Z',
					facets: [{
						index: {byteStart: 6, byteEnd: 10},
						features: [{
							$type: 'app.bsky.richtext.facet#link',
							uri: 'https://example.com'
						}]
					}]
				}
			}
		}]
	};
}
