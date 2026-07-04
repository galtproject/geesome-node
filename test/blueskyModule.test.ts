import assert from 'node:assert';
import registerBlueskyApi from '../app/modules/bluesky/api.js';
import {getModule as getBlueskyModule} from '../app/modules/bluesky/index.js';
import IGeesomeBlueskyModule, {BlueskySourceSubscriptionStatus} from '../app/modules/bluesky/interface.js';
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

	it('manages native Bluesky source subscriptions as local state', async () => {
		const subscriptionModel = getBlueskySourceSubscriptionModel();
		const module = getBlueskyModule({
			config: {},
			checkModules: (modulesList) => {
				assert.deepEqual(modulesList, ['api']);
			}
		} as any, {
			models: {
				BlueskySourceSubscription: subscriptionModel
			}
		});

		const first = await module.subscribeSource(7, {
			actor: '@bsky.app',
			filter: 'posts_no_replies',
			displayName: ' Official ',
			groupName: 'official-feed',
			accountId: 1234,
			importLimit: 500
		});

		assert.equal(first.actor, 'bsky.app');
		assert.equal(first.status, BlueskySourceSubscriptionStatus.Active);
		assert.equal(first.filter, 'posts_no_replies');
		assert.equal(first.displayName, 'Official');
		assert.equal(first.accountId, 1234);
		assert.equal(first.importLimit, 100);

		const updatedExisting = await module.subscribeSource(7, {
			actor: 'bsky.app',
			filter: 'posts_with_media',
			displayName: 'Media',
			groupName: 'media-feed',
			accountId: null,
			importLimit: 2
		});

		assert.equal(updatedExisting.id, first.id);
		assert.equal(subscriptionModel.rows.length, 1);
		assert.equal(updatedExisting.filter, 'posts_with_media');
		assert.equal(updatedExisting.displayName, 'Media');
		assert.equal(updatedExisting.groupName, 'media-feed');
		assert.equal(updatedExisting.accountId, null);
		assert.equal(updatedExisting.importLimit, 2);

		const activeList = await module.getSourceSubscriptions(7, {
			status: BlueskySourceSubscriptionStatus.Active
		}, {
			limit: 10
		});

		assert.equal(activeList.total, 1);
		assert.equal(activeList.list[0].actor, 'bsky.app');

		const paused = await module.updateSourceSubscription(7, first.id, {
			status: BlueskySourceSubscriptionStatus.Paused,
			filter: null,
			displayName: null,
			groupName: null,
			accountId: null,
			importLimit: null
		});

		assert.equal(paused.status, BlueskySourceSubscriptionStatus.Paused);
		assert.equal(paused.filter, null);
		assert.equal(paused.displayName, null);
		assert.equal(paused.groupName, null);
		assert.equal(paused.accountId, null);
		assert.equal(paused.importLimit, null);

		await assert.rejects(
			() => module.updateSourceSubscription(7, first.id, {status: BlueskySourceSubscriptionStatus.Removed}),
			/bluesky_source_subscription_status_invalid/
		);
		await assert.rejects(
			() => module.updateSourceSubscription(7, 'bad-source-id', {status: BlueskySourceSubscriptionStatus.Active}),
			/bluesky_source_subscription_not_found/
		);

		const removed = await module.removeSourceSubscription(7, first.id);
		assert.equal(removed.status, BlueskySourceSubscriptionStatus.Removed);

		const defaultList = await module.getSourceSubscriptions(7);
		assert.equal(defaultList.total, 0);

		const removedList = await module.getSourceSubscriptions(7, {
			status: BlueskySourceSubscriptionStatus.Removed
		});
		assert.equal(removedList.total, 1);

		await assert.rejects(
			() => module.updateSourceSubscription(7, first.id, {status: BlueskySourceSubscriptionStatus.Active}),
			/bluesky_source_subscription_not_found/
		);
	});

	it('refreshes native Bluesky source subscriptions through the social import pipeline', async () => {
		const checks: any[] = [];
		const imports: any[] = [];
		const subscriptionModel = getBlueskySourceSubscriptionModel();
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
					importChannelPosts: async (client) => {
						imports.push({method: 'importChannelPosts', client});
						assert.equal(client.messages.list.length, 2);
						assert.equal(client.messages.list[0].id, 'at://did:plc:alice/app.bsky.feed.post/older');
						assert.equal(client.messages.list[1].id, 'at://did:plc:alice/app.bsky.feed.post/newer');
						await client.onRemotePostProcess(client.messages.list[0], getDbChannel(), {id: 1}, 'post');
						await client.onRemotePostProcess(client.messages.list[1], getDbChannel(), {id: 2}, 'post');
					}
				}
			},
			checkModules: () => {},
			checkUserCan: async (userId, permission) => {
				checks.push({userId, permission});
			}
		} as any, {
			models: {
				BlueskySourceSubscription: subscriptionModel
			},
			fetch: async (url) => {
				assert.equal(url, 'https://public.example/xrpc/app.bsky.feed.getAuthorFeed?actor=alice.bsky.social&limit=2&filter=posts_no_replies');
				return {
					ok: true,
					json: async () => getTwoPostAuthorFeedFixture()
				};
			}
		});
		const subscription = await module.subscribeSource(7, {
			actor: '@alice.bsky.social',
			filter: 'posts_no_replies',
			groupName: 'alice-feed',
			importLimit: 2
		});

		const result = await module.refreshSourceSubscription(7, subscription.id);

		assert.deepEqual(checks, [{
			userId: 7,
			permission: CorePermissionName.UserGroupManagement
		}]);
		assert.equal(imports[0].method, 'importChannelMetadata');
		assert.equal(imports[0].args[0], 7);
		assert.equal(imports[0].args[1], 'bluesky');
		assert.equal(imports[0].args[4].name, 'alice-feed');
		assert.equal(imports[1].method, 'importChannelPosts');
		assert.equal(result.actor, 'alice.bsky.social');
		assert.equal(result.cursor, 'cursor-after');
		assert.equal(result.fetched, 2);
		assert.equal(result.imported, 2);
		assert.equal(result.dbChannel.id, 9);
		assert.equal(result.source.dbChannelId, 9);
		assert.equal(result.source.lastCursor, 'cursor-after');
		assert.equal(result.source.lastError, null);
		assert.ok(result.source.lastRefreshRequestedAt);
		assert.ok(result.source.lastImportedAt);
	});

	it('queues and polls native Bluesky source refreshes through async operations', async () => {
		const calls = getAsyncOperationCalls();
		const subscriptionModel = getBlueskySourceSubscriptionModel();
		const module = getBlueskyModule({
			config: {
				blueskyConfig: {
					publicApiOrigin: 'https://public.example/'
				}
			},
			ms: {
				asyncOperation: getAsyncOperationModule(calls),
				socNetImport: {
					importChannelMetadata: async () => getDbChannel(),
					importChannelPosts: async (client) => {
						await client.onRemotePostProcess(client.messages.list[0], getDbChannel(), {id: 1}, 'post');
					}
				}
			},
			checkModules: () => {},
			checkUserCan: async () => {}
		} as any, {
			models: {
				BlueskySourceSubscription: subscriptionModel
			},
			fetch: async () => ({
				ok: true,
				json: async () => ({
					cursor: null,
					feed: [getFeedItem('queued', 'Queued post', '2026-07-04T08:00:00.000Z')]
				})
			})
		});
		const subscription = await module.subscribeSource(7, {
			actor: '@alice.bsky.social'
		});

		const queue = await module.queueSourceSubscriptionRefresh(7, subscription.id, 13, {
			limit: '1',
			filter: 'posts_with_media',
			process: false
		});
		const processResult = await module.processSourceSubscriptionRefreshQueue({limit: 1});

		assert.equal(queue.module, 'bluesky-source-refresh');
		assert.equal(queue.userApiKeyId, 13);
		assert.deepEqual(JSON.parse(queue.inputJson), {
			type: 'source-refresh',
			sourceId: subscription.id,
			input: {
				filter: 'posts_with_media',
				limit: 1
			}
		});
		assert.deepEqual(processResult, {processed: 1});
		assert.equal(queue.isWaiting, false);
		assert.equal(calls.asyncOperations[0].name, 'refresh-bluesky-source');
		assert.equal(calls.asyncOperations[0].channel, `bluesky-source-refresh:${subscription.id}`);
		assert.equal(calls.processedResults[0].source.id, subscription.id);
		assert.equal(calls.processedResults[0].imported, 1);
		assert.deepEqual(calls.asyncOperationProgress, [{
			userId: 7,
			asyncOperationId: 1,
			percent: 99
		}]);

		await subscriptionModel.create({
			userId: 7,
			actor: 'never-refreshed.bsky.social',
			status: BlueskySourceSubscriptionStatus.Active,
			lastRefreshRequestedAt: null
		});
		await subscriptionModel.create({
			userId: 8,
			actor: 'stale.bsky.social',
			status: BlueskySourceSubscriptionStatus.Active,
			lastRefreshRequestedAt: new Date('2026-06-01T11:00:00Z')
		});
		await subscriptionModel.create({
			userId: 9,
			actor: 'recent.bsky.social',
			status: BlueskySourceSubscriptionStatus.Active,
			lastRefreshRequestedAt: new Date('2026-06-01T11:59:00Z')
		});
		await subscriptionModel.create({
			userId: 10,
			actor: 'paused.bsky.social',
			status: BlueskySourceSubscriptionStatus.Paused,
			lastRefreshRequestedAt: new Date('2026-06-01T10:00:00Z')
		});

		const dueResult = await module.queueDueSourceSubscriptionRefreshes({
			limit: 10,
			staleMs: 15 * 60 * 1000,
			now: '2026-06-01T12:00:00Z',
			refreshInput: {
				limit: 5
			}
		});
		await module.queueDueSourceSubscriptionRefreshes({
			limit: 10,
			staleMs: 15 * 60 * 1000,
			now: '2026-06-01T12:00:00Z',
			refreshInput: {
				limit: 5
			}
		});

		assert.deepEqual(dueResult, {queued: 2});
		assert.deepEqual(calls.asyncOperationQueues.slice(1).map((item) => item.userId).sort(), [7, 8]);
		assert.deepEqual(calls.asyncOperationQueues.slice(1).map((item) => JSON.parse(item.inputJson)), [
			{
				type: 'source-refresh',
				sourceId: 2,
				input: {limit: 5}
			},
			{
				type: 'source-refresh',
				sourceId: 3,
				input: {limit: 5}
			}
		]);
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
					},
					onAuthorizedGet: (path, handler) => {
						routes[`AUTH GET ${path}`] = handler;
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
					},
					onAuthorizedGet: (path, handler) => {
						routes[`AUTH GET ${path}`] = handler;
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

	it('registers native Bluesky source subscription admin routes', async () => {
		const routes = {};
		const permissionChecks: any[] = [];
		const moduleCalls: any[] = [];
		const app = {
			ms: {
				api: {
					onAuthorizedPost: (path, handler) => {
						routes[`AUTH POST ${path}`] = handler;
					},
					onAuthorizedGet: (path, handler) => {
						routes[`AUTH GET ${path}`] = handler;
					}
				}
			},
			checkUserCan: async (userId, permission) => {
				permissionChecks.push({userId, permission});
			}
		};
		const module = {
			getPublicAuthorFeedPreview: async () => ({actor: 'bsky.app', cursor: null, list: []}),
			importPublicAuthorFeed: async () => ({actor: 'bsky.app', cursor: null, projectedPostsCount: 0}),
			getSourceSubscriptions: async (userId, filters, listParams) => {
				moduleCalls.push({method: 'getSourceSubscriptions', userId, filters, listParams});
				return {list: [{id: 4, actor: 'bsky.app'}], total: 1};
			},
			subscribeSource: async (userId, input) => {
				moduleCalls.push({method: 'subscribeSource', userId, input});
				return {id: 5, actor: input.actor};
			},
			updateSourceSubscription: async (userId, sourceId, input) => {
				moduleCalls.push({method: 'updateSourceSubscription', userId, sourceId, input});
				return {id: Number(sourceId), ...input};
			},
			removeSourceSubscription: async (userId, sourceId) => {
				moduleCalls.push({method: 'removeSourceSubscription', userId, sourceId});
				return {id: Number(sourceId), status: BlueskySourceSubscriptionStatus.Removed};
			},
			refreshSourceSubscription: async (userId, sourceId, input) => {
				moduleCalls.push({method: 'refreshSourceSubscription', userId, sourceId, input});
				return {source: {id: Number(sourceId)}, fetched: 1, imported: 1};
			},
			queueSourceSubscriptionRefresh: async (userId, sourceId, userApiKeyId, input) => {
				moduleCalls.push({method: 'queueSourceSubscriptionRefresh', userId, sourceId, userApiKeyId, input});
				return {id: 44, module: 'bluesky-source-refresh', userApiKeyId, isWaiting: true};
			}
		};

		registerBlueskyApi(app as any, module as IGeesomeBlueskyModule);

		const listResponse = await callRoute(routes, 'AUTH GET admin/bluesky/sources', {
			user: {id: 7},
			query: {status: 'active', limit: '5'}
		});
		const subscribeResponse = await callRoute(routes, 'AUTH POST admin/bluesky/sources', {
			user: {id: 7},
			body: {actor: 'bsky.app'}
		});
		const updateResponse = await callRoute(routes, 'AUTH POST admin/bluesky/sources/:sourceId/update', {
			user: {id: 7},
			params: {sourceId: '5'},
			body: {status: 'paused'}
		});
		const refreshResponse = await callRoute(routes, 'AUTH POST admin/bluesky/sources/:sourceId/refresh', {
			user: {id: 7},
			params: {sourceId: '5'},
			body: {limit: 1}
		});
		const refreshQueueResponse = await callRoute(routes, 'AUTH POST admin/bluesky/sources/:sourceId/refresh-async', {
			user: {id: 7},
			apiKey: {id: 12},
			params: {sourceId: '5'},
			body: {limit: 1, process: false}
		});
		const removeResponse = await callRoute(routes, 'AUTH POST admin/bluesky/sources/:sourceId/remove', {
			user: {id: 7},
			params: {sourceId: '5'}
		});

		assert.deepEqual(permissionChecks, [
			{userId: 7, permission: CorePermissionName.AdminRead},
			{userId: 7, permission: CorePermissionName.AdminAll},
			{userId: 7, permission: CorePermissionName.AdminAll},
			{userId: 7, permission: CorePermissionName.AdminAll},
			{userId: 7, permission: CorePermissionName.UserGroupManagement},
			{userId: 7, permission: CorePermissionName.AdminAll},
			{userId: 7, permission: CorePermissionName.UserGroupManagement},
			{userId: 7, permission: CorePermissionName.AdminAll}
		]);
		assert.deepEqual(moduleCalls, [
			{method: 'getSourceSubscriptions', userId: 7, filters: {status: 'active', limit: '5'}, listParams: {status: 'active', limit: '5'}},
			{method: 'subscribeSource', userId: 7, input: {actor: 'bsky.app'}},
			{method: 'updateSourceSubscription', userId: 7, sourceId: '5', input: {status: 'paused'}},
			{method: 'refreshSourceSubscription', userId: 7, sourceId: '5', input: {limit: 1}},
			{method: 'queueSourceSubscriptionRefresh', userId: 7, sourceId: '5', userApiKeyId: 12, input: {limit: 1, process: false}},
			{method: 'removeSourceSubscription', userId: 7, sourceId: '5'}
		]);
		assert.deepEqual(listResponse.body, {list: [{id: 4, actor: 'bsky.app'}], total: 1});
		assert.deepEqual(subscribeResponse.body, {id: 5, actor: 'bsky.app'});
		assert.deepEqual(updateResponse.body, {id: 5, status: 'paused'});
		assert.deepEqual(refreshResponse.body, {source: {id: 5}, fetched: 1, imported: 1});
		assert.deepEqual(refreshQueueResponse.body, {id: 44, module: 'bluesky-source-refresh', userApiKeyId: 12, isWaiting: true});
		assert.deepEqual(removeResponse.body, {id: 5, status: BlueskySourceSubscriptionStatus.Removed});
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

class FakeBlueskySourceSubscription {
	id: number;
	userId: number;
	actor: string;
	filter: string | null;
	displayName: string | null;
	status: string;
	groupName: string | null;
	accountId: number | null;
	importLimit: number | null;
	dbChannelId: number | null;
	lastCursor: string | null;
	lastRefreshRequestedAt: Date | null;
	lastImportedAt: Date | null;
	lastError: string | null;
	createdAt: Date;
	updatedAt: Date;

	constructor(id: number, data: any) {
		Object.assign(this, {
			dbChannelId: null,
			lastCursor: null,
			lastRefreshRequestedAt: null,
			lastImportedAt: null,
			createdAt: new Date('2026-07-04T08:00:00.000Z'),
			updatedAt: new Date('2026-07-04T08:00:00.000Z'),
			...data,
			id
		});
	}

	async update(data: any) {
		Object.assign(this, data);
		this.updatedAt = new Date('2026-07-04T08:01:00.000Z');
		return this;
	}
}

function getBlueskySourceSubscriptionModel() {
	const rows: FakeBlueskySourceSubscription[] = [];
	return {
		rows,
		async create(data) {
			if (rows.some(row => row.userId === data.userId && row.actor === data.actor)) {
				throw {name: 'SequelizeUniqueConstraintError'};
			}
			const row = new FakeBlueskySourceSubscription(rows.length + 1, data);
			rows.push(row);
			return row;
		},
		async findOne(options) {
			return rows.find(row => matchesBlueskySourceSubscriptionWhere(row, options.where)) || null;
		},
		async findAndCountAll(options) {
			const matchingRows = rows
				.filter(row => matchesBlueskySourceSubscriptionWhere(row, options.where))
				.sort((a, b) => compareBlueskySourceSubscriptionRows(a, b, options.order));
			const offset = options.offset || 0;
			const limit = options.limit || matchingRows.length;
			return {
				rows: matchingRows.slice(offset, offset + limit),
				count: matchingRows.length
			};
		},
		async findAll(options) {
			return rows
				.filter(row => matchesBlueskySourceSubscriptionWhere(row, options.where))
				.sort((a, b) => compareBlueskySourceSubscriptionRows(a, b, options.order))
				.slice(0, options.limit || rows.length);
		}
	};
}

function matchesBlueskySourceSubscriptionWhere(row: FakeBlueskySourceSubscription, where: any): boolean {
	const keyMatches = Object.keys(where || {}).every((key) => {
		const condition = where[key];
		const rowValue = row[key];
		if (key === 'id') {
			return Number(rowValue) === Number(condition);
		}
		if (isNotInCondition(condition)) {
			return !getNotInConditionValues(condition).includes(rowValue);
		}
		if (isLessThanCondition(condition)) {
			return rowValue < getLessThanConditionValue(condition);
		}
		return rowValue === condition;
	});
	const symbolMatches = Object.getOwnPropertySymbols(where || {}).every((symbol) => {
		const condition = where[symbol];
		if (Array.isArray(condition)) {
			return condition.some(item => matchesBlueskySourceSubscriptionWhere(row, item));
		}
		return true;
	});
	return keyMatches && symbolMatches;
}

function isNotInCondition(condition: any): boolean {
	return getNotInConditionValues(condition).length > 0;
}

function getNotInConditionValues(condition: any): any[] {
	if (!condition || typeof condition !== 'object') {
		return [];
	}
	const notInValues = Object.getOwnPropertySymbols(condition)
		.map(symbol => condition[symbol])
		.find(value => Array.isArray(value));
	return notInValues || [];
}

function isLessThanCondition(condition: any): boolean {
	return getLessThanConditionValue(condition) !== undefined;
}

function getLessThanConditionValue(condition: any): any {
	if (!condition || typeof condition !== 'object') {
		return undefined;
	}
	return Object.getOwnPropertySymbols(condition)
		.map(symbol => condition[symbol])
		.find(value => value instanceof Date);
}

function compareBlueskySourceSubscriptionRows(a: any, b: any, order: any[]): number {
	const [sortBy, sortDir] = order?.[0] || ['id', 'ASC'];
	if (a[sortBy] === b[sortBy]) {
		return 0;
	}
	if (sortDir === 'DESC') {
		return a[sortBy] > b[sortBy] ? -1 : 1;
	}
	return a[sortBy] > b[sortBy] ? 1 : -1;
}

function getAsyncOperationCalls() {
	return {
		asyncOperationQueues: [],
		asyncOperations: [],
		processedResults: [],
		asyncOperationProgress: []
	};
}

function getAsyncOperationModule(calls) {
	return {
		async addUniqueUserOperationQueue(userId, module, userApiKeyId, input) {
			const inputJson = JSON.stringify(input);
			const existingQueue = calls.asyncOperationQueues.find((queue) => {
				return queue.module === module && queue.inputJson === inputJson && queue.isWaiting;
			});
			if (existingQueue) {
				return existingQueue;
			}
			const queue = {
				id: calls.asyncOperationQueues.length + 1,
				userId,
				module,
				userApiKeyId,
				inputJson,
				isWaiting: true
			};
			calls.asyncOperationQueues.push(queue);
			return queue;
		},
		async processModuleOperationQueue(moduleName, options) {
			let processed = 0;
			const queues = calls.asyncOperationQueues.filter(queue => queue.module === moduleName && queue.isWaiting);
			for (const queue of queues.slice(0, options.limit)) {
				const payload = await options.getPayload(queue);
				const asyncOperation = {
					id: calls.asyncOperations.length + 1,
					userId: queue.userId,
					module: moduleName,
					...(await options.getAsyncOperationData(queue, payload))
				};
				calls.asyncOperations.push(asyncOperation);
				const result = await options.run(queue, asyncOperation, payload);
				calls.processedResults.push(result);
				queue.isWaiting = false;
				processed += 1;
			}
			return {processed};
		},
		async handleOperationCancel() {},
		async updateAsyncOperation(userId, asyncOperationId, percent) {
			calls.asyncOperationProgress.push({userId, asyncOperationId, percent});
		}
	};
}
