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
			filter: 'posts_and_author_threads',
			limit: 1,
			cursor: 'next-page'
		});

		assert.equal(calls[0].url, 'https://public.example/xrpc/app.bsky.feed.getAuthorFeed?actor=bsky.app&limit=1&filter=posts_and_author_threads&cursor=next-page');
		assert.equal(calls[0].options.headers.Accept, 'application/json');
		assert.equal(preview.actor, 'bsky.app');
		assert.equal(preview.cursor, 'cursor-after');
		assert.equal(preview.list.length, 1);
		assert.equal(preview.list[0].sourceIdentity.source, 'socNetImport:bluesky');
		assert.equal(preview.list[0].sourceIdentity.sourceChannelId, 'did:plc:alice');
		assert.equal(preview.list[0].sourceIdentity.sourcePostId, 'at://did:plc:alice/app.bsky.feed.post/3k4duaz5vfs2b');
		assert.equal(richTextToPlainText(preview.list[0].richText), 'Hello site');
	});

	it('starts an async public author feed import through socNetImport', async () => {
		const checks: any[] = [];
		const imports: any[] = [];
		const asyncUpdates: any[] = [];
		let closedOperation;
		const module = getBlueskyModule({
			config: {
				blueskyConfig: {
					publicApiOrigin: 'https://public.example/'
				}
			},
			ms: {
				socNetImport: {
					importChannelMetadata: async (...args) => {
						imports.push({method: 'importChannelMetadata', args});
						return getDbChannel();
					},
					openImportAsyncOperation: async (userId, userApiKeyId, dbChannel) => {
						imports.push({method: 'openImportAsyncOperation', userId, userApiKeyId, dbChannel});
						return {id: 44, channel: 'import-channel', inProcess: true};
					},
					importChannelPosts: async (client) => {
						imports.push({method: 'importChannelPosts', client});
						assert.equal(client.messages.list.length, 2);
						assert.equal(client.messages.list[0].id, 'at://did:plc:alice/app.bsky.feed.post/older');
						assert.equal(client.messages.list[1].id, 'at://did:plc:alice/app.bsky.feed.post/newer');
						await client.onRemotePostProcess(client.messages.list[0], getDbChannel(), {id: 1}, 'post');
					}
				},
				asyncOperation: {
					handleOperationCancel: async (userId, asyncOperationId) => {
						asyncUpdates.push({method: 'handleOperationCancel', userId, asyncOperationId});
					},
					updateAsyncOperation: async (userId, asyncOperationId, percent) => {
						asyncUpdates.push({method: 'updateAsyncOperation', userId, asyncOperationId, percent});
					},
					closeImportAsyncOperation: async (userId, asyncOperation, error) => {
						closedOperation = {userId, asyncOperation, error};
					}
				}
			},
			checkModules: () => {},
			checkUserCan: async (userId, permission) => {
				checks.push({userId, permission});
			}
		} as any, {
			fetch: async () => ({
				ok: true,
				json: async () => getTwoPostAuthorFeedFixture()
			})
		});

		const result = await module.importPublicAuthorFeed(7, 12, {
			actor: '@alice.bsky.social',
			filter: 'posts_no_replies',
			limit: 2,
			groupName: 'alice-feed',
			force: true,
			mergeSeconds: 60
		});
		await waitForBackgroundTasks();

		assert.deepEqual(checks, [{
			userId: 7,
			permission: CorePermissionName.UserGroupManagement
		}]);
		assert.deepEqual(imports[0], {
			method: 'importChannelMetadata',
			args: [
				7,
				'bluesky',
				null,
				{
					id: 'did:plc:alice',
					username: 'alice.bsky.social',
					title: 'Alice',
					about: '',
					lang: 'en'
				},
				{name: 'alice-feed'}
			]
		});
		assert.equal(imports[1].method, 'openImportAsyncOperation');
		assert.equal(imports[1].userApiKeyId, 12);
		assert.equal(imports[2].method, 'importChannelPosts');
		assert.equal(imports[2].client.advancedSettings.force, true);
		assert.equal(imports[2].client.advancedSettings.mergeSeconds, 60);
		assert.deepEqual(asyncUpdates, [
			{method: 'handleOperationCancel', userId: 7, asyncOperationId: 44},
			{method: 'updateAsyncOperation', userId: 7, asyncOperationId: 44, percent: 50}
		]);
		assert.deepEqual(closedOperation, {
			userId: 7,
			asyncOperation: {id: 44, channel: 'import-channel', inProcess: true},
			error: null
		});
		assert.deepEqual(result, {
			actor: 'alice.bsky.social',
			cursor: 'cursor-after',
			projectedPostsCount: 2,
			dbChannel: {
				id: 9,
				groupId: 3,
				channelId: 'did:plc:alice',
				title: 'Alice',
				socNet: 'bluesky'
			},
			asyncOperation: {id: 44, channel: 'import-channel', inProcess: true}
		});
	});

	it('rejects public feed imports when no projected posts can identify the channel', async () => {
		const module = getBlueskyModule({
			config: {},
			ms: {},
			checkModules: () => {},
			checkUserCan: async () => {}
		} as any, {
			fetch: async () => ({
				ok: true,
				json: async () => ({feed: []})
			})
		});

		await assert.rejects(
			() => module.importPublicAuthorFeed(7, null, {actor: 'empty.bsky.social'}),
			/bluesky_feed_empty/
		);
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

	it('registers an admin write public author feed import route', async () => {
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
			getPublicAuthorFeedPreview: async () => ({actor: 'bsky.app', cursor: null, list: []}),
			importPublicAuthorFeed: async (userId, userApiKeyId, input) => {
				moduleCalls.push({userId, userApiKeyId, input});
				return {
					actor: 'bsky.app',
					cursor: null,
					projectedPostsCount: 1,
					dbChannel: {id: 9},
					asyncOperation: {id: 44}
				};
			}
		};

		registerBlueskyApi(app as any, module as IGeesomeBlueskyModule);
		const response = await callRoute(routes, 'AUTH POST admin/bluesky/public-author-feed/import', {
			user: {id: 7},
			apiKey: {id: 12},
			body: {actor: 'bsky.app', limit: 2}
		});

		assert.deepEqual(permissionChecks, [
			{userId: 7, permission: CorePermissionName.AdminAll},
			{userId: 7, permission: CorePermissionName.UserGroupManagement}
		]);
		assert.deepEqual(moduleCalls, [{
			userId: 7,
			userApiKeyId: 12,
			input: {actor: 'bsky.app', limit: 2}
		}]);
		assert.deepEqual(response.body, {
			actor: 'bsky.app',
			cursor: null,
			projectedPostsCount: 1,
			dbChannel: {id: 9},
			asyncOperation: {id: 44}
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

function getTwoPostAuthorFeedFixture() {
	return {
		cursor: 'cursor-after',
		feed: [
			getFeedItem('newer', 'Newer post', '2026-07-04T08:00:00.000Z'),
			getFeedItem('older', 'Older post', '2026-07-04T07:59:00.000Z')
		]
	};
}

function getFeedItem(rkey: string, text: string, createdAt: string) {
	return {
		post: {
			uri: `at://did:plc:alice/app.bsky.feed.post/${rkey}`,
			cid: `bafyrei${rkey}`,
			author: {
				did: 'did:plc:alice',
				handle: 'alice.bsky.social',
				displayName: 'Alice'
			},
			indexedAt: createdAt,
			record: {
				$type: 'app.bsky.feed.post',
				text,
				createdAt,
				langs: ['en']
			}
		}
	};
}

function getDbChannel() {
	return {
		id: 9,
		userId: 7,
		groupId: 3,
		accountId: null,
		channelId: 'did:plc:alice',
		socNet: 'bluesky',
		title: 'Alice'
	};
}

function waitForBackgroundTasks() {
	return new Promise(resolve => setImmediate(resolve));
}
