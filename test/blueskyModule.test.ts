import assert from 'node:assert';
import registerBlueskyApi from '../app/modules/bluesky/api.js';
import {getModule as getBlueskyModule} from '../app/modules/bluesky/index.js';
import IGeesomeBlueskyModule, {BlueskySourcePostReviewState, BlueskySourceSubscriptionStatus} from '../app/modules/bluesky/interface.js';
import {ContentView, CorePermissionName} from '../app/modules/database/interface.js';
import {PostStatus} from '../app/modules/group/interface.js';
import {RemoteContentModerationMode} from '../app/modules/remoteContentModeration/helpers.js';
import {RICH_TEXT_MIME_TYPE, createRichTextDocument, richTextToPlainText} from '../app/richText.js';

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

	it('previews Bluesky social-page migrations with optional ownership proof', async () => {
		const calls: any[] = [];
		const accounts = getSocNetAccountModule([{
			userId: 7,
			socNet: 'bluesky',
			accountId: 'did:plc:alice',
			username: 'alice.bsky.social',
			apiKey: 'app-password'
		}]);
		const module = getBlueskyModule({
			config: {
				blueskyConfig: {
					publicApiOrigin: 'https://public.example/',
					authApiOrigin: 'https://auth.example/'
				}
			},
			ms: {
				socNetAccount: accounts
			},
			checkModules: (modulesList) => {
				calls.push({method: 'checkModules', modulesList});
			}
		} as any, {
			fetch: async (url, options) => {
				calls.push({method: 'fetch', url, options});
				if (String(url).includes('getAuthorFeed')) {
					return {
						ok: true,
						json: async () => getAuthorFeedFixture()
					};
				}
				if (String(url).includes('createSession')) {
					return {
						ok: true,
						json: async () => ({
							did: 'did:plc:alice',
							handle: 'alice.bsky.social',
							accessJwt: 'access-token'
						})
					};
				}
				return {
					ok: true,
					json: async () => ({
						did: 'did:plc:alice',
						handle: 'alice.bsky.social',
						displayName: 'Alice'
					})
				};
			}
		});

		const preview = await module.getMigrationPreview(7, {
			actor: '@alice.bsky.social',
			claimed: true,
			accountData: {id: 1},
			limit: 1
		});

		assert.equal(preview.actor, 'alice.bsky.social');
		assert.equal(preview.cursor, 'cursor-after');
		assert.equal(preview.ownership.verified, true);
		assert.equal(preview.ownership.method, 'did');
		assert.equal(preview.summary.total, 1);
		assert.equal(preview.summary.localPosts, 1);
		assert.equal(preview.summary.remotePlaceholders, 0);
		assert.equal(preview.list[0].importKind, 'localPost');
		assert.deepEqual(calls.filter(call => call.method === 'checkModules'), [
			{method: 'checkModules', modulesList: ['api']},
			{method: 'checkModules', modulesList: ['socNetAccount']}
		]);
		assert.equal(calls.filter(call => call.method === 'fetch').length, 3);
		assert.equal(
			calls.find(call => call.method === 'fetch' && call.url.includes('getAuthorFeed')).url,
			'https://public.example/xrpc/app.bsky.feed.getAuthorFeed?actor=alice.bsky.social&limit=1'
		);
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

	it('starts a claimed Bluesky migration import through a verified stored account', async () => {
		const calls: any[] = [];
		const checks: any[] = [];
		const imports: any[] = [];
		const asyncUpdates: any[] = [];
		let closedOperation;
		const accounts = getSocNetAccountModule([{
			userId: 7,
			socNet: 'bluesky',
			accountId: 'did:plc:alice',
			username: 'alice.bsky.social',
			apiKey: 'app-password'
		}]);
		const module = getBlueskyModule({
			config: {
				blueskyConfig: {
					publicApiOrigin: 'https://public.example/',
					authApiOrigin: 'https://auth.example/'
				}
			},
			ms: {
				socNetAccount: accounts,
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
			checkModules: (modulesList) => {
				calls.push({method: 'checkModules', modulesList});
			},
			checkUserCan: async (userId, permission) => {
				checks.push({userId, permission});
			}
		} as any, {
			fetch: async (url, options) => {
				calls.push({method: 'fetch', url, options});
				if (String(url).includes('getAuthorFeed')) {
					return {
						ok: true,
						json: async () => getTwoPostAuthorFeedFixture()
					};
				}
				if (String(url).includes('createSession')) {
					return {
						ok: true,
						json: async () => ({
							did: 'did:plc:alice',
							handle: 'alice.bsky.social',
							accessJwt: 'access-token'
						})
					};
				}
				return {
					ok: true,
					json: async () => ({
						did: 'did:plc:alice',
						handle: 'alice.bsky.social',
						displayName: 'Alice'
					})
				};
			}
		});

		const result = await module.importMigration(7, 12, {
			actor: '@alice.bsky.social',
			claimed: true,
			accountData: {id: 1},
			limit: 2,
			groupName: 'alice-migration',
			force: true
		});
		await waitForBackgroundTasks();

		assert.deepEqual(calls.filter(call => call.method === 'checkModules'), [
			{method: 'checkModules', modulesList: ['api']},
			{method: 'checkModules', modulesList: ['socNetAccount']},
			{method: 'checkModules', modulesList: ['asyncOperation', 'group', 'content', 'socNetImport']}
		]);
		assert.deepEqual(checks, [{
			userId: 7,
			permission: CorePermissionName.UserGroupManagement
		}]);
		assert.equal(calls.filter(call => call.method === 'fetch' && call.url.includes('getAuthorFeed')).length, 1);
		assert.deepEqual(imports[0], {
			method: 'importChannelMetadata',
			args: [
				7,
				'bluesky',
				1,
				{
					id: 'did:plc:alice',
					username: 'alice.bsky.social',
					title: 'Alice',
					about: '',
					lang: 'en'
				},
				{name: 'alice-migration'}
			]
		});
		assert.equal(imports[1].method, 'openImportAsyncOperation');
		assert.equal(imports[1].userApiKeyId, 12);
		assert.equal(imports[2].method, 'importChannelPosts');
		assert.equal(imports[2].client.advancedSettings.force, true);
		assert.deepEqual(asyncUpdates, [
			{method: 'handleOperationCancel', userId: 7, asyncOperationId: 44},
			{method: 'updateAsyncOperation', userId: 7, asyncOperationId: 44, percent: 50}
		]);
		assert.deepEqual(closedOperation, {
			userId: 7,
			asyncOperation: {id: 44, channel: 'import-channel', inProcess: true},
			error: null
		});
		assert.equal(result.actor, 'alice.bsky.social');
		assert.equal(result.cursor, 'cursor-after');
		assert.equal(result.projectedPostsCount, 2);
		assert.equal(result.asyncOperation.id, 44);
		assert.deepEqual(result.ownership, {
			claimed: true,
			verified: true,
			method: 'did',
			did: 'did:plc:alice',
			handle: 'alice.bsky.social',
			reason: null
		});
	});

	it('applies moderation before claimed Bluesky migration imports become visible', async () => {
		const imports: any[] = [];
		const asyncUpdates: any[] = [];
		let closedOperation;
		const accounts = getSocNetAccountModule([{
			userId: 7,
			socNet: 'bluesky',
			accountId: 'did:plc:alice',
			username: 'alice.bsky.social',
			apiKey: 'app-password'
		}]);
		const module = getBlueskyModule({
			config: {
				blueskyConfig: {
					publicApiOrigin: 'https://public.example/',
					authApiOrigin: 'https://auth.example/'
				}
			},
			ms: {
				socNetAccount: accounts,
				socNetImport: {
					importChannelMetadata: async (...args) => {
						imports.push({method: 'importChannelMetadata', args});
						return getDbChannel();
					},
					openImportAsyncOperation: async () => {
						imports.push({method: 'openImportAsyncOperation'});
						return {id: 44, channel: 'import-channel', inProcess: true};
					},
					importChannelPosts: async (client) => {
						imports.push({method: 'importChannelPosts', client});
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
			checkUserCan: async () => {}
		} as any, {
			fetch: async (url) => {
				if (String(url).includes('getAuthorFeed')) {
					return {
						ok: true,
						json: async () => ({
							cursor: null,
							feed: [
								getFeedItem('allowed', 'Allowed post', '2026-07-04T08:00:00.000Z'),
								getFeedItem('spam', 'Spam post', '2026-07-04T07:59:00.000Z')
							]
						})
					};
				}
				if (String(url).includes('createSession')) {
					return {
						ok: true,
						json: async () => ({
							did: 'did:plc:alice',
							handle: 'alice.bsky.social',
							accessJwt: 'access-token'
						})
					};
				}
				return {
					ok: true,
					json: async () => ({
						did: 'did:plc:alice',
						handle: 'alice.bsky.social',
						displayName: 'Alice'
					})
				};
			}
		});

		const result = await module.importMigration(7, 12, {
			actor: '@alice.bsky.social',
			claimed: true,
			accountData: {id: 1},
			groupName: 'alice-migration',
			moderationPolicy: {
				rules: [{name: 'spam', value: 'spam'}]
			}
		});
		await waitForBackgroundTasks();

		assert.equal(result.projectedPostsCount, 2);
		assert.deepEqual(result.moderation, {
			allowed: 1,
			review: 0,
			quarantined: 0,
			blocked: 1,
			matches: 1
		});
		assert.equal(imports[2].method, 'importChannelPosts');
		assert.equal(imports[2].client.messages.list.length, 1);
		assert.equal(imports[2].client.messages.list[0].text, 'Allowed post');
		assert.deepEqual(asyncUpdates, [
			{method: 'handleOperationCancel', userId: 7, asyncOperationId: 44},
			{method: 'updateAsyncOperation', userId: 7, asyncOperationId: 44, percent: 99}
		]);
		assert.deepEqual(closedOperation, {
			userId: 7,
			asyncOperation: {id: 44, channel: 'import-channel', inProcess: true},
			error: null
		});
	});

	it('queues claimed Bluesky migration imports through async operations without storing secrets', async () => {
		const calls = getAsyncOperationCalls();
		const checks: any[] = [];
		const imports: any[] = [];
		const feedUrls: string[] = [];
		const accounts = getSocNetAccountModule([{
			userId: 7,
			socNet: 'bluesky',
			accountId: 'did:plc:alice',
			username: 'alice.bsky.social',
			apiKey: 'app-password'
		}]);
		const module = getBlueskyModule({
			config: {
				blueskyConfig: {
					publicApiOrigin: 'https://public.example/',
					authApiOrigin: 'https://auth.example/'
				}
			},
			ms: {
				asyncOperation: getAsyncOperationModule(calls),
				socNetAccount: accounts,
				socNetImport: {
					importChannelMetadata: async (...args) => {
						imports.push({method: 'importChannelMetadata', args});
						return getDbChannel();
					},
					importChannelPosts: async (client) => {
						imports.push({method: 'importChannelPosts', client});
						for (const message of client.messages.list) {
							await client.onRemotePostProcess(message, getDbChannel(), {id: 1}, 'post');
						}
					}
				}
			},
			checkModules: () => {},
			checkUserCan: async (userId, permission) => {
				checks.push({userId, permission});
			}
		} as any, {
			fetch: async (url) => {
				if (String(url).includes('getAuthorFeed')) {
					feedUrls.push(String(url));
					if (String(url).includes('cursor=cursor-after')) {
						return {
							ok: true,
							json: async () => ({
								cursor: null,
								feed: [getFeedItem('oldest', 'Oldest post', '2026-07-04T07:58:00.000Z')]
							})
						};
					}
					return {
						ok: true,
						json: async () => getTwoPostAuthorFeedFixture()
					};
				}
				if (String(url).includes('createSession')) {
					return {
						ok: true,
						json: async () => ({
							did: 'did:plc:alice',
							handle: 'alice.bsky.social',
							accessJwt: 'access-token'
						})
					};
				}
				return {
					ok: true,
					json: async () => ({
						did: 'did:plc:alice',
						handle: 'alice.bsky.social',
						displayName: 'Alice'
					})
				};
			}
		});

		const queue = await module.queueMigrationImport(7, 13, {
			actor: '@alice.bsky.social',
			claimed: true,
			accountData: {id: '1'},
			appPassword: '',
			async: true,
			limit: '2' as any,
			filter: 'posts_no_replies',
			groupName: 'alice-migration',
			force: 'true' as any,
			moderationPolicy: {
				rules: [{name: 'skip', value: 'not-in-feed'}]
			},
			maxPages: '2',
			process: false
		});
		const processResult = await module.processMigrationImportQueue({limit: 1});

		assert.equal(queue.module, 'bluesky-migration-import');
		assert.equal(queue.userApiKeyId, 13);
		assert.deepEqual(JSON.parse(queue.inputJson), {
			type: 'migration-import',
			input: {
				actor: 'alice.bsky.social',
				claimed: true,
				accountData: {id: 1},
				filter: 'posts_no_replies',
				limit: 2,
				groupName: 'alice-migration',
				force: true,
				moderationPolicy: {
					rules: [{
						name: 'skip',
						type: 'keyword',
						field: 'text',
						value: 'not-in-feed',
						action: 'block'
					}]
				},
				maxPages: 2
			}
		});
		assert.deepEqual(processResult, {processed: 1});
		assert.deepEqual(calls.asyncOperations[0], {
			id: 1,
			userId: 7,
			module: 'bluesky-migration-import',
			name: 'import-bluesky-migration',
			channel: 'bluesky-migration-import:alice.bsky.social',
			percent: 5
		});
		assert.deepEqual(checks, [
			{userId: 7, permission: CorePermissionName.UserGroupManagement},
			{userId: 7, permission: CorePermissionName.UserGroupManagement}
		]);
		assert.equal(imports[0].method, 'importChannelMetadata');
		assert.equal(imports[0].args[2], 1);
		assert.equal(imports[1].method, 'importChannelPosts');
		assert.equal(imports[1].client.messages.list.length, 2);
		assert.equal(imports[2].method, 'importChannelPosts');
		assert.equal(imports[2].client.messages.list.length, 1);
		assert.deepEqual(feedUrls, [
			'https://public.example/xrpc/app.bsky.feed.getAuthorFeed?actor=alice.bsky.social&limit=2&filter=posts_no_replies',
			'https://public.example/xrpc/app.bsky.feed.getAuthorFeed?actor=alice.bsky.social&limit=2&filter=posts_no_replies&cursor=cursor-after'
		]);
		assert.deepEqual(calls.asyncOperationProgress, [
			{userId: 7, asyncOperationId: 1, percent: 50},
			{userId: 7, asyncOperationId: 1, percent: 99},
			{userId: 7, asyncOperationId: 1, percent: 99}
		]);
		assert.equal(calls.processedResults[0].actor, 'alice.bsky.social');
		assert.equal(calls.processedResults[0].cursor, null);
		assert.equal(calls.processedResults[0].projectedPostsCount, 3);
		assert.equal(calls.processedResults[0].imported, 3);
		assert.equal(calls.processedResults[0].pages, 2);
		assert.equal(calls.processedResults[0].maxPages, 2);
		assert.deepEqual(calls.processedResults[0].moderation, {
			allowed: 3,
			review: 0,
			quarantined: 0,
			blocked: 0,
			matches: 0
		});
		assert.equal(calls.processedResults[0].ownership.verified, true);

		await assert.rejects(
			() => module.queueMigrationImport(7, 13, {
				actor: '@alice.bsky.social',
				claimed: true,
				accountData: {id: 1},
				appPassword: 'do-not-store',
				process: false
			}),
			/bluesky_migration_queue_secret_not_supported/
		);
	});

	it('rejects claimed Bluesky migration imports when the stored account does not own the actor', async () => {
		const imports: any[] = [];
		const accounts = getSocNetAccountModule([{
			userId: 7,
			socNet: 'bluesky',
			accountId: 'did:plc:mallory',
			username: 'mallory.bsky.social',
			apiKey: 'app-password'
		}]);
		const module = getBlueskyModule({
			config: {
				blueskyConfig: {
					publicApiOrigin: 'https://public.example/',
					authApiOrigin: 'https://auth.example/'
				}
			},
			ms: {
				socNetAccount: accounts,
				socNetImport: {
					importChannelMetadata: async (...args) => {
						imports.push(args);
					}
				}
			},
			checkModules: () => {},
			checkUserCan: async () => {
				throw new Error('unexpected_permission_check');
			}
		} as any, {
			fetch: async (url) => {
				if (String(url).includes('getAuthorFeed')) {
					return {
						ok: true,
						json: async () => getTwoPostAuthorFeedFixture()
					};
				}
				if (String(url).includes('createSession')) {
					return {
						ok: true,
						json: async () => ({
							did: 'did:plc:mallory',
							handle: 'mallory.bsky.social',
							accessJwt: 'access-token'
						})
					};
				}
				return {
					ok: true,
					json: async () => ({
						did: 'did:plc:mallory',
						handle: 'mallory.bsky.social',
						displayName: 'Mallory'
					})
				};
			}
		});

		await assert.rejects(
			() => module.importMigration(7, 12, {
				actor: '@alice.bsky.social',
				claimed: true,
				accountData: {id: 1}
			}),
			/bluesky_migration_account_mismatch/
		);
		assert.deepEqual(imports, []);
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

	it('connects and verifies user-scoped Bluesky social accounts', async () => {
		const calls: any[] = [];
		const accounts = getSocNetAccountModule([{
			id: 1,
			userId: 7,
			socNet: 'telegram',
			accountId: 'telegram-account',
			username: 'telegram-user',
			apiKey: 'telegram-secret'
		}]);
		const module = getBlueskyModule({
			config: {
				blueskyConfig: {
					authApiOrigin: 'https://auth.example/',
					authApiTimeoutMs: 1234
				}
			},
			ms: {
				socNetAccount: accounts
			},
			checkModules: (modulesList) => {
				calls.push({method: 'checkModules', modulesList});
			}
		} as any, {
			fetch: async (url, options) => {
				calls.push({method: 'fetch', url, options});
				if (String(url).includes('createSession')) {
					return {
						ok: true,
						json: async () => ({
							did: 'did:plc:alice',
							handle: 'alice.bsky.social',
							accessJwt: 'access-token',
							refreshJwt: 'refresh-token'
						})
					};
				}
				return {
					ok: true,
					json: async () => ({
						did: 'did:plc:alice',
						handle: 'alice.bsky.social',
						displayName: 'Alice'
					})
				};
			}
		});

		const connected = await module.loginAccount(7, {
			identifier: '@alice.bsky.social',
			appPassword: 'app-password'
		});
		const verified = await module.verifyAccount(7, {
			accountData: {id: connected.account.id}
		});

		assert.equal(accounts.rows.length, 2);
		assert.equal(accounts.rows[0].socNet, 'telegram');
		assert.equal(accounts.rows[0].apiKey, 'telegram-secret');
		assert.equal(accounts.rows[1].socNet, 'bluesky');
		assert.equal(accounts.rows[1].accountId, 'did:plc:alice');
		assert.equal(accounts.rows[1].username, 'alice.bsky.social');
		assert.equal(accounts.rows[1].apiKey, 'app-password');
		assert.equal(connected.account.hasApiKey, true);
		assert.equal(connected.account['apiKey'], undefined);
		assert.equal(connected.did, 'did:plc:alice');
		assert.equal(connected.handle, 'alice.bsky.social');
		assert.equal(connected.profile.displayName, 'Alice');
		assert.equal(verified.account.id, connected.account.id);
		assert.equal(verified.did, 'did:plc:alice');
		assert.deepEqual(calls.filter(call => call.method === 'checkModules'), [
			{method: 'checkModules', modulesList: ['api']},
			{method: 'checkModules', modulesList: ['socNetAccount']},
			{method: 'checkModules', modulesList: ['socNetAccount']}
		]);
		assert.equal(calls.filter(call => call.method === 'fetch').length, 4);
		const createSessionCall = calls.find(call => call.method === 'fetch' && call.url.includes('createSession'));
		assert.equal(JSON.parse(createSessionCall.options.body).identifier, 'alice.bsky.social');

		accounts.rows[1].username = 'previous.handle';
		const verifiedAfterHandleChange = await module.verifyAccount(7, {
			accountData: {id: connected.account.id},
			appPassword: 'app-password'
		});
		assert.equal(verifiedAfterHandleChange.did, 'did:plc:alice');

		accounts.rows[1].accountId = 'did:plc:other';
		await assert.rejects(
			() => module.verifyAccount(7, {accountData: {id: connected.account.id}, appPassword: 'app-password'}),
			/bluesky_account_identity_mismatch/
		);
		await assert.rejects(
			() => module.verifyAccount(8, {accountData: {id: connected.account.id}, appPassword: 'app-password'}),
			/bluesky_account_not_found/
		);
	});

	it('requires plaintext password overrides for encrypted Bluesky account verification', async () => {
		const accounts = getSocNetAccountModule();
		const module = getBlueskyModule({
			config: {},
			ms: {
				socNetAccount: accounts
			},
			checkModules: () => {}
		} as any, {
			fetch: async (url) => {
				if (String(url).includes('createSession')) {
					return {
						ok: true,
						json: async () => ({
							did: 'did:plc:bob',
							handle: 'bob.bsky.social',
							accessJwt: 'access-token'
						})
					};
				}
				return {
					ok: true,
					json: async () => ({
						did: 'did:plc:bob',
						handle: 'bob.bsky.social'
					})
				};
			}
		});

		const connected = await module.loginAccount(7, {
			identifier: 'bob.bsky.social',
			appPassword: 'plain-app-password',
			encryptedApiKey: 'encrypted-app-password',
			isEncrypted: true
		});

		assert.equal(accounts.rows[0].apiKey, 'encrypted-app-password');
		assert.equal(accounts.rows[0].isEncrypted, true);
		assert.equal(connected.account.hasApiKey, true);
		await assert.rejects(
			() => module.verifyAccount(7, {accountData: {id: connected.account.id}}),
			/bluesky_account_password_required/
		);
		const verified = await module.verifyAccount(7, {
			accountData: {id: connected.account.id},
			appPassword: 'plain-app-password'
		});
		assert.equal(verified.did, 'did:plc:bob');
	});

	it('cross-posts local rich-text posts to Bluesky once per account', async () => {
		const calls: any[] = [];
		const permissionChecks: any[] = [];
		let post: any = getCrossPostPostFixture();
		const richText = createRichTextDocument([{
			type: 'paragraph',
			children: [
				{text: 'Hello '},
				{text: 'site', marks: [{type: 'link', href: 'https://example.com'}]}
			]
		}], {lang: 'en'});
		const module = getBlueskyModule({
			config: {
				blueskyConfig: {
					authApiOrigin: 'https://auth.example/'
				}
			},
			ms: {
				socNetAccount: getSocNetAccountModule([{
					userId: 7,
					socNet: 'bluesky',
					accountId: 'did:plc:alice',
					username: 'alice.bsky.social',
					apiKey: 'app-password'
				}]),
				group: {
					getPost: async (userId, postId) => {
						calls.push({method: 'getPost', userId, postId});
						return post;
					},
					canEditPostInGroup: async (userId, groupId, postId) => {
						calls.push({method: 'canEditPostInGroup', userId, groupId, postId});
						return true;
					},
					getPostContentData: async (dbPost, baseStorageUri, options) => {
						calls.push({method: 'getPostContentData', postId: dbPost.id, baseStorageUri, options});
						return [{
							id: 101,
							type: 'json',
							view: ContentView.Contents,
							mimeType: RICH_TEXT_MIME_TYPE,
							json: richText
						}];
					},
					updatePost: async (userId, postId, postData) => {
						calls.push({method: 'updatePost', userId, postId, postData});
						post = {...post, ...postData};
						return post;
					}
				}
			},
			checkModules: (modulesList) => {
				calls.push({method: 'checkModules', modulesList});
			},
			checkUserCan: async (userId, permission) => {
				permissionChecks.push({userId, permission});
			}
		} as any, {
			fetch: async (url, options) => {
				calls.push({method: 'fetch', url, options});
				if (String(url).includes('createSession')) {
					return {
						ok: true,
						json: async () => ({
							did: 'did:plc:alice',
							handle: 'alice.bsky.social',
							accessJwt: 'access-token'
						})
					};
				}
				if (String(url).includes('getProfile')) {
					return {
						ok: true,
						json: async () => ({
							did: 'did:plc:alice',
							handle: 'alice.bsky.social',
							displayName: 'Alice'
						})
					};
				}
				return {
					ok: true,
					json: async () => ({
						uri: 'at://did:plc:alice/app.bsky.feed.post/created',
						cid: 'bafycreated'
					})
				};
			}
		});

		const firstResult = await module.crossPostPost(7, 44, {
			accountData: {id: 1}
		});
		const secondResult = await module.crossPostPost(7, 44, {
			accountData: {id: 1}
		});
		const createRecordCalls = calls.filter(call => call.method === 'fetch' && String(call.url).includes('createRecord'));
		const createRecordBody = JSON.parse(createRecordCalls[0].options.body);
		const storedProperties = JSON.parse(post.propertiesJson);

		assert.deepEqual(permissionChecks, [
			{userId: 7, permission: CorePermissionName.UserGroupManagement},
			{userId: 7, permission: CorePermissionName.UserGroupManagement}
		]);
		assert.equal(createRecordCalls.length, 1);
		assert.equal(createRecordBody.repo, 'did:plc:alice');
		assert.equal(createRecordBody.collection, 'app.bsky.feed.post');
		assert.equal(createRecordBody.record.text, 'Hello site');
		assert.equal(createRecordBody.record.langs[0], 'en');
		assert.deepEqual(createRecordBody.record.facets, [{
			$type: 'app.bsky.richtext.facet',
			index: {byteStart: 6, byteEnd: 10},
			features: [{
				$type: 'app.bsky.richtext.facet#link',
				uri: 'https://example.com'
			}]
		}]);
		assert.equal(firstResult.alreadyExists, false);
		assert.deepEqual(firstResult.record, {
			uri: 'at://did:plc:alice/app.bsky.feed.post/created',
			cid: 'bafycreated'
		});
		assert.equal(secondResult.alreadyExists, true);
		assert.deepEqual(secondResult.record, firstResult.record);
		assert.equal(storedProperties.bluesky.crossPosts['did:plc:alice'].uri, firstResult.record.uri);
		assert.equal(storedProperties.bluesky.crossPosts['did:plc:alice'].cid, firstResult.record.cid);
		assert.equal(storedProperties.bluesky.crossPosts['did:plc:alice'].accountId, 1);
	});

	it('cross-posts local replies as native Bluesky replies when the parent has a stored record', async () => {
		const calls: any[] = [];
		let post: any = getCrossPostPostFixture({
			id: 45,
			replyToId: 44
		});
		const parentPost = getCrossPostPostFixture({
			id: 44,
			propertiesJson: JSON.stringify({
				bluesky: {
					crossPosts: {
						'did:plc:alice': {
							uri: 'at://did:plc:alice/app.bsky.feed.post/parent',
							cid: 'bafyparent',
							replyRootUri: 'at://did:plc:alice/app.bsky.feed.post/root',
							replyRootCid: 'bafyroot'
						}
					}
				}
			})
		});
		const module = getBlueskyModule({
			config: {},
			ms: {
				socNetAccount: getSocNetAccountModule([{
					id: 1,
					userId: 7,
					socNet: 'bluesky',
					accountId: 'did:plc:alice',
					username: 'alice.bsky.social',
					apiKey: 'app-password'
				}]),
				group: {
					getPost: async () => post,
					getPostPure: async (postId) => {
						calls.push({method: 'getPostPure', postId});
						return parentPost;
					},
					canEditPostInGroup: async () => true,
					getPostContentData: async () => [{
						id: 101,
						type: 'text',
						view: ContentView.Contents,
						mimeType: 'text/plain',
						text: 'Reply post'
					}],
					updatePost: async (_userId, _postId, postData) => {
						post = {...post, ...postData};
						return post;
					}
				}
			},
			checkModules: () => {},
			checkUserCan: async () => {}
		} as any, {
			fetch: getBlueskyAccountFetch(calls, {
				uri: 'at://did:plc:alice/app.bsky.feed.post/reply',
				cid: 'bafyreply'
			})
		});

		await module.crossPostPost(7, 45, {accountData: {id: 1}});
		const createRecordCall = calls.find(call => call.method === 'fetch' && String(call.url).includes('createRecord'));
		const createRecordBody = JSON.parse(createRecordCall.options.body);
		const storedProperties = JSON.parse(post.propertiesJson);

		assert.deepEqual(createRecordBody.record.reply, {
			root: {
				uri: 'at://did:plc:alice/app.bsky.feed.post/root',
				cid: 'bafyroot'
			},
			parent: {
				uri: 'at://did:plc:alice/app.bsky.feed.post/parent',
				cid: 'bafyparent'
			}
		});
		assert.equal(storedProperties.bluesky.crossPosts['did:plc:alice'].replyRootUri, 'at://did:plc:alice/app.bsky.feed.post/root');
		assert.equal(storedProperties.bluesky.crossPosts['did:plc:alice'].replyRootCid, 'bafyroot');
		assert.equal(storedProperties.bluesky.crossPosts['did:plc:alice'].replyParentUri, 'at://did:plc:alice/app.bsky.feed.post/parent');
		assert.equal(storedProperties.bluesky.crossPosts['did:plc:alice'].replyParentCid, 'bafyparent');
	});

	it('cross-posts local repost references as native Bluesky quote embeds', async () => {
		const calls: any[] = [];
		let post: any = getCrossPostPostFixture({
			id: 46,
			repostOfId: 41
		});
		const quotedPost = getImportedBlueskyPostRef(41, 'quoted', 'bafyquote', '2026-07-04T07:00:00.000Z');
		const module = getBlueskyModule({
			config: {},
			ms: {
				socNetAccount: getSocNetAccountModule([{
					id: 1,
					userId: 7,
					socNet: 'bluesky',
					accountId: 'did:plc:alice',
					username: 'alice.bsky.social',
					apiKey: 'app-password'
				}]),
				group: {
					getPost: async () => post,
					getPostPure: async (postId) => {
						calls.push({method: 'getPostPure', postId});
						return quotedPost;
					},
					canEditPostInGroup: async () => true,
					getPostContentData: async () => [
						{
							id: 101,
							type: 'text',
							view: ContentView.Contents,
							mimeType: 'text/plain',
							text: 'Quote post'
						},
						{
							id: 102,
							type: 'json',
							view: ContentView.Link,
							mimeType: 'application/json',
							json: {
								url: 'https://example.com/article',
								title: 'Article',
								description: 'Article preview'
							}
						}
					],
					updatePost: async (_userId, _postId, postData) => {
						post = {...post, ...postData};
						return post;
					}
				}
			},
			checkModules: () => {},
			checkUserCan: async () => {}
		} as any, {
			fetch: getBlueskyAccountFetch(calls, {
				uri: 'at://did:plc:alice/app.bsky.feed.post/quote',
				cid: 'bafycreatedquote'
			})
		});

		await module.crossPostPost(7, 46, {accountData: {id: 1}});
		const createRecordCall = calls.find(call => call.method === 'fetch' && String(call.url).includes('createRecord'));
		const createRecordBody = JSON.parse(createRecordCall.options.body);
		const storedProperties = JSON.parse(post.propertiesJson);

		assert.equal(createRecordBody.record.text, 'Quote post\nhttps://example.com/article');
		assert.deepEqual(createRecordBody.record.embed, {
			$type: 'app.bsky.embed.recordWithMedia',
			record: {
				record: {
					uri: 'at://did:plc:alice/app.bsky.feed.post/quoted',
					cid: 'bafyquote'
				}
			},
			media: {
				$type: 'app.bsky.embed.external',
				external: {
					uri: 'https://example.com/article',
					title: 'Article',
					description: 'Article preview'
				}
			}
		});
		assert.equal(storedProperties.bluesky.crossPosts['did:plc:alice'].quoteUri, 'at://did:plc:alice/app.bsky.feed.post/quoted');
		assert.equal(storedProperties.bluesky.crossPosts['did:plc:alice'].quoteCid, 'bafyquote');
	});

	it('rejects Bluesky reply cross-posts when the local parent has no Bluesky record', async () => {
		const calls: any[] = [];
		const post: any = getCrossPostPostFixture({
			id: 45,
			replyToId: 44
		});
		const parentPost = getCrossPostPostFixture({id: 44});
		const module = getBlueskyModule({
			config: {},
			ms: {
				socNetAccount: getSocNetAccountModule([{
					id: 1,
					userId: 7,
					socNet: 'bluesky',
					accountId: 'did:plc:alice',
					username: 'alice.bsky.social',
					apiKey: 'app-password'
				}]),
				storage: {
					getFileData: async () => {
						throw new Error('unexpected_storage_read');
					}
				},
				group: {
					getPost: async () => post,
					getPostPure: async () => parentPost,
					canEditPostInGroup: async () => true,
					getPostContentData: async () => [
						{
							id: 101,
							type: 'text',
							view: ContentView.Contents,
							mimeType: 'text/plain',
							text: 'Reply post'
						},
						{
							id: 102,
							type: 'image',
							view: ContentView.Media,
							mimeType: 'image/png',
							storageId: 'bafyimage'
						}
					],
					updatePost: async () => {
						throw new Error('unexpected_update_post');
					}
				}
			},
			checkModules: () => {},
			checkUserCan: async () => {}
		} as any, {
			fetch: getBlueskyAccountFetch(calls, {
				uri: 'at://did:plc:alice/app.bsky.feed.post/reply',
				cid: 'bafyreply'
			})
		});

		await assert.rejects(
			() => module.crossPostPost(7, 45, {accountData: {id: 1}}),
			/bluesky_cross_post_reply_parent_record_required/
		);
		assert.equal(calls.some(call => String(call.url).includes('createRecord')), false);
	});

	it('updates stored Bluesky cross-post records in place', async () => {
		const calls: any[] = [];
		let post: any = getCrossPostPostFixture({
			propertiesJson: JSON.stringify({
				bluesky: {
					crossPosts: {
						'did:plc:alice': {
							uri: 'at://did:plc:alice/app.bsky.feed.post/created',
							cid: 'bafyold',
							accountId: 1,
							postedAt: '2026-07-04T08:00:00.000Z'
						}
					}
				}
			})
		});
		const module = getBlueskyModule({
			config: {
				blueskyConfig: {
					authApiOrigin: 'https://auth.example/'
				}
			},
			ms: {
				socNetAccount: getSocNetAccountModule([{
					id: 1,
					userId: 7,
					socNet: 'bluesky',
					accountId: 'did:plc:alice',
					username: 'alice.bsky.social',
					apiKey: 'app-password'
				}]),
				group: {
					getPost: async () => post,
					canEditPostInGroup: async () => true,
					getPostContentData: async () => [{
						id: 101,
						type: 'text',
						view: ContentView.Contents,
						mimeType: 'text/plain',
						text: 'Updated post'
					}],
					updatePost: async (userId, postId, postData) => {
						calls.push({method: 'updatePost', userId, postId, postData});
						post = {...post, ...postData};
						return post;
					}
				}
			},
			checkModules: () => {},
			checkUserCan: async (userId, permission) => {
				calls.push({method: 'checkUserCan', userId, permission});
			}
		} as any, {
			fetch: async (url, options) => {
				calls.push({method: 'fetch', url, options});
				if (String(url).includes('createSession')) {
					return {
						ok: true,
						json: async () => ({
							did: 'did:plc:alice',
							handle: 'alice.bsky.social',
							accessJwt: 'access-token'
						})
					};
				}
				if (String(url).includes('getProfile')) {
					return {
						ok: true,
						json: async () => ({
							did: 'did:plc:alice',
							handle: 'alice.bsky.social'
						})
					};
				}
				return {
					ok: true,
					json: async () => ({
						uri: 'at://did:plc:alice/app.bsky.feed.post/created',
						cid: 'bafyupdated'
					})
				};
			}
		});

		const result = await module.updateCrossPostPost(7, 44, {
			accountData: {id: 1},
			createdAt: '2026-07-04T09:00:00.000Z'
		});
		const putRecordCall = calls.find(call => call.method === 'fetch' && String(call.url).includes('putRecord'));
		const putRecordBody = JSON.parse(putRecordCall.options.body);
		const storedProperties = JSON.parse(post.propertiesJson);

		assert.deepEqual(calls.filter(call => call.method === 'checkUserCan'), [{
			method: 'checkUserCan',
			userId: 7,
			permission: CorePermissionName.UserGroupManagement
		}]);
		assert.deepEqual(putRecordBody, {
			repo: 'did:plc:alice',
			collection: 'app.bsky.feed.post',
			rkey: 'created',
			record: {
				$type: 'app.bsky.feed.post',
				text: 'Updated post',
				createdAt: '2026-07-04T09:00:00.000Z'
			},
			swapRecord: 'bafyold'
		});
		assert.deepEqual(result.previousRecord, {
			uri: 'at://did:plc:alice/app.bsky.feed.post/created',
			cid: 'bafyold'
		});
		assert.deepEqual(result.record, {
			uri: 'at://did:plc:alice/app.bsky.feed.post/created',
			cid: 'bafyupdated'
		});
		assert.equal(result.updated, true);
		assert.equal(storedProperties.bluesky.crossPosts['did:plc:alice'].cid, 'bafyupdated');
		assert.equal(storedProperties.bluesky.crossPosts['did:plc:alice'].postedAt, '2026-07-04T08:00:00.000Z');
		assert.equal(typeof storedProperties.bluesky.crossPosts['did:plc:alice'].updatedAt, 'string');
		assert.equal(calls.some(call => String(call.url).includes('createRecord')), false);
	});

	it('deletes stored Bluesky cross-post records and clears only that account metadata', async () => {
		const calls: any[] = [];
		let post: any = getCrossPostPostFixture({
			propertiesJson: JSON.stringify({
				bluesky: {
					crossPosts: {
						'did:plc:alice': {
							uri: 'at://did:plc:alice/app.bsky.feed.post/created',
							cid: 'bafycreated',
							accountId: 1
						},
						'did:plc:bob': {
							uri: 'at://did:plc:bob/app.bsky.feed.post/created',
							cid: 'bafybob',
							accountId: 2
						}
					}
				}
			})
		});
		const module = getBlueskyModule({
			config: {
				blueskyConfig: {
					authApiOrigin: 'https://auth.example/'
				}
			},
			ms: {
				socNetAccount: getSocNetAccountModule([{
					id: 1,
					userId: 7,
					socNet: 'bluesky',
					accountId: 'did:plc:alice',
					username: 'alice.bsky.social',
					apiKey: 'app-password'
				}]),
				group: {
					getPost: async () => post,
					canEditPostInGroup: async () => true,
					updatePost: async (userId, postId, postData) => {
						calls.push({method: 'updatePost', userId, postId, postData});
						post = {...post, ...postData};
						return post;
					}
				}
			},
			checkModules: () => {},
			checkUserCan: async (userId, permission) => {
				calls.push({method: 'checkUserCan', userId, permission});
			}
		} as any, {
			fetch: async (url, options) => {
				calls.push({method: 'fetch', url, options});
				if (String(url).includes('createSession')) {
					return {
						ok: true,
						json: async () => ({
							did: 'did:plc:alice',
							handle: 'alice.bsky.social',
							accessJwt: 'access-token'
						})
					};
				}
				if (String(url).includes('getProfile')) {
					return {
						ok: true,
						json: async () => ({
							did: 'did:plc:alice',
							handle: 'alice.bsky.social'
						})
					};
				}
				return {
					ok: true,
					json: async () => ({})
				};
			}
		});

		const result = await module.deleteCrossPostPost(7, 44, {accountData: {id: 1}});
		const deleteRecordCall = calls.find(call => call.method === 'fetch' && String(call.url).includes('deleteRecord'));
		const deleteRecordBody = JSON.parse(deleteRecordCall.options.body);
		const storedProperties = JSON.parse(post.propertiesJson);

		assert.deepEqual(calls.filter(call => call.method === 'checkUserCan'), [{
			method: 'checkUserCan',
			userId: 7,
			permission: CorePermissionName.UserGroupManagement
		}]);
		assert.deepEqual(deleteRecordBody, {
			repo: 'did:plc:alice',
			collection: 'app.bsky.feed.post',
			rkey: 'created'
		});
		assert.deepEqual(result.record, {
			uri: 'at://did:plc:alice/app.bsky.feed.post/created',
			cid: 'bafycreated'
		});
		assert.deepEqual(result.deleteRecord, {
			uri: 'at://did:plc:alice/app.bsky.feed.post/created',
			deleted: true,
			alreadyDeleted: false
		});
		assert.equal(storedProperties.bluesky.crossPosts['did:plc:alice'], undefined);
		assert.equal(storedProperties.bluesky.crossPosts['did:plc:bob'].cid, 'bafybob');
		assert.equal(calls.some(call => String(call.url).includes('createRecord')), false);
	});

	it('cleans Bluesky cross-post metadata when the remote record is already missing', async () => {
		let post: any = getCrossPostPostFixture({
			propertiesJson: JSON.stringify({
				bluesky: {
					crossPosts: {
						'did:plc:alice': {
							uri: 'at://did:plc:alice/app.bsky.feed.post/missing',
							cid: 'bafymissing',
							accountId: 1
						}
					}
				}
			})
		});
		const module = getBlueskyModule({
			config: {},
			ms: {
				socNetAccount: getSocNetAccountModule([{
					id: 1,
					userId: 7,
					socNet: 'bluesky',
					accountId: 'did:plc:alice',
					username: 'alice.bsky.social',
					apiKey: 'app-password'
				}]),
				group: {
					getPost: async () => post,
					canEditPostInGroup: async () => true,
					updatePost: async (userId, postId, postData) => {
						post = {...post, ...postData};
						return post;
					}
				}
			},
			checkModules: () => {},
			checkUserCan: async () => {}
		} as any, {
			fetch: async (url) => {
				if (String(url).includes('createSession')) {
					return {
						ok: true,
						json: async () => ({
							did: 'did:plc:alice',
							handle: 'alice.bsky.social',
							accessJwt: 'access-token'
						})
					};
				}
				if (String(url).includes('getProfile')) {
					return {
						ok: true,
						json: async () => ({
							did: 'did:plc:alice',
							handle: 'alice.bsky.social'
						})
					};
				}
				return {
					ok: false,
					status: 404,
					json: async () => ({error: 'RecordNotFound'})
				};
			}
		});

		const result = await module.deleteCrossPostPost(7, 44, {accountData: {id: 1}});
		const storedProperties = JSON.parse(post.propertiesJson);

		assert.deepEqual(result.deleteRecord, {
			uri: 'at://did:plc:alice/app.bsky.feed.post/missing',
			deleted: false,
			alreadyDeleted: true
		});
		assert.equal(storedProperties.bluesky.crossPosts['did:plc:alice'], undefined);
	});

	it('rejects Bluesky cross-post delete when stored record belongs to another DID', async () => {
		const calls: any[] = [];
		const module = getBlueskyModule({
			config: {},
			ms: {
				socNetAccount: getSocNetAccountModule([{
					id: 1,
					userId: 7,
					socNet: 'bluesky',
					accountId: 'did:plc:alice',
					username: 'alice.bsky.social',
					apiKey: 'app-password'
				}]),
				group: {
					getPost: async () => getCrossPostPostFixture({
						propertiesJson: JSON.stringify({
							bluesky: {
								crossPosts: {
									'did:plc:alice': {
										uri: 'at://did:plc:bob/app.bsky.feed.post/created',
										cid: 'bafycreated',
										accountId: 1
									}
								}
							}
						})
					}),
					canEditPostInGroup: async () => true,
					updatePost: async () => {
						throw new Error('unexpected_update_post');
					}
				}
			},
			checkModules: () => {},
			checkUserCan: async () => {}
		} as any, {
			fetch: async (url) => {
				calls.push({url});
				if (String(url).includes('createSession')) {
					return {
						ok: true,
						json: async () => ({
							did: 'did:plc:alice',
							handle: 'alice.bsky.social',
							accessJwt: 'access-token'
						})
					};
				}
				if (String(url).includes('getProfile')) {
					return {
						ok: true,
						json: async () => ({
							did: 'did:plc:alice',
							handle: 'alice.bsky.social'
						})
					};
				}
				throw new Error('unexpected_delete_record');
			}
		});

		await assert.rejects(
			() => module.deleteCrossPostPost(7, 44, {accountData: {id: 1}}),
			/bluesky_cross_post_record_identity_mismatch/
		);
		assert.equal(calls.some(call => String(call.url).includes('deleteRecord')), false);
	});

	it('cross-posts local posts with supported images to Bluesky', async () => {
		const calls: any[] = [];
		let post = getCrossPostPostFixture();
		const module = getBlueskyModule({
			config: {},
			ms: {
				socNetAccount: getSocNetAccountModule([{
					id: 2,
					userId: 7,
					socNet: 'bluesky',
					accountId: 'did:plc:alice',
					username: 'alice.bsky.social',
					apiKey: 'app-password'
				}]),
				storage: {
					getFileData: async (storageId) => {
						calls.push({method: 'getFileData', storageId});
						return getTinyPngData();
					}
				},
				group: {
					getPost: async () => post,
					canEditPostInGroup: async () => true,
					getPostContentData: async () => [
						{
							id: 101,
							type: 'text',
							view: ContentView.Contents,
							mimeType: 'text/plain',
							text: 'Photo post'
						},
						{
							id: 102,
							type: 'image',
							view: ContentView.Media,
							mimeType: 'image/png',
							storageId: 'bafyimage',
							name: 'photo.png',
							description: 'Alt text'
						}
					],
					updatePost: async (userId, postId, postData) => {
						calls.push({method: 'updatePost', userId, postId, postData});
						post = {...post, ...postData};
						return post;
					}
				}
			},
			checkModules: (modulesList) => {
				calls.push({method: 'checkModules', modulesList});
			},
			checkUserCan: async (userId, permission) => {
				calls.push({method: 'checkUserCan', userId, permission});
			}
		} as any, {
			fetch: async (url, options) => {
				calls.push({method: 'fetch', url, options});
				if (String(url).includes('createSession')) {
					return {
						ok: true,
						json: async () => ({
							did: 'did:plc:alice',
							handle: 'alice.bsky.social',
							accessJwt: 'access-token'
						})
					};
				}
				if (String(url).includes('getProfile')) {
					return {
						ok: true,
						json: async () => ({
							did: 'did:plc:alice',
							handle: 'alice.bsky.social',
							displayName: 'Alice'
						})
					};
				}
				if (String(url).includes('uploadBlob')) {
					return {
						ok: true,
						json: async () => ({
							blob: {
								$type: 'blob',
								ref: {'$link': 'bafkimage'},
								mimeType: options.headers['Content-Type'],
								size: options.body.length
							}
						})
					};
				}
				return {
					ok: true,
					json: async () => ({
						uri: 'at://did:plc:alice/app.bsky.feed.post/image-created',
						cid: 'bafyimagecreated'
					})
				};
			}
		});

		const result = await module.crossPostPost(7, 44, {accountData: {id: 1}});
		const uploadIndex = calls.findIndex(call => call.method === 'fetch' && String(call.url).includes('uploadBlob'));
		const createIndex = calls.findIndex(call => call.method === 'fetch' && String(call.url).includes('createRecord'));
		const uploadCall = calls[uploadIndex];
		const createRecordBody = JSON.parse(calls[createIndex].options.body);

		assert.deepEqual(calls[0], {method: 'checkModules', modulesList: ['api']});
		assert.deepEqual(calls[1], {method: 'checkModules', modulesList: ['group', 'socNetAccount', 'storage']});
		assert.equal(uploadIndex > -1, true);
		assert.equal(createIndex > uploadIndex, true);
		assert.equal(uploadCall.options.method, 'POST');
		assert.equal(uploadCall.options.headers.Authorization, 'Bearer access-token');
		assert.equal(uploadCall.options.headers['Content-Type'], 'image/png');
		assert.equal(Buffer.isBuffer(uploadCall.options.body), true);
		assert.equal(createRecordBody.record.text, 'Photo post');
		assert.deepEqual(createRecordBody.record.embed, {
			$type: 'app.bsky.embed.images',
			images: [{
				alt: 'Alt text',
				image: {
					$type: 'blob',
					ref: {'$link': 'bafkimage'},
					mimeType: 'image/png',
					size: uploadCall.options.body.length
				},
				aspectRatio: {width: 1, height: 1}
			}]
		});
		assert.equal(result.record.uri, 'at://did:plc:alice/app.bsky.feed.post/image-created');
	});

	it('falls back to public image links when Bluesky image upload fails', async () => {
		let post = getCrossPostPostFixture();
		const calls: any[] = [];
		const module = getBlueskyModule({
			config: {
				blueskyConfig: {
					publicUrl: 'https://node.example/geesome/'
				}
			},
			ms: {
				socNetAccount: getSocNetAccountModule([{
					userId: 7,
					socNet: 'bluesky',
					accountId: 'did:plc:alice',
					username: 'alice.bsky.social',
					apiKey: 'app-password'
				}]),
				storage: {
					getFileData: async (storageId) => {
						calls.push({method: 'getFileData', storageId});
						return getTinyPngData();
					}
				},
				group: {
					getPost: async () => post,
					canEditPostInGroup: async () => true,
					getPostContentData: async () => [
						{
							id: 101,
							type: 'text',
							view: ContentView.Contents,
							mimeType: 'text/plain',
							text: 'Photo post'
						},
						{
							id: 102,
							type: 'image',
							view: ContentView.Media,
							mimeType: 'image/png',
							storageId: 'bafyimage',
							description: 'Alt fallback'
						}
					],
					updatePost: async (userId, postId, postData) => {
						post = {...post, ...postData};
						return post;
					}
				}
			},
			checkModules: () => {},
			checkUserCan: async () => {}
		} as any, {
			fetch: async (url, options) => {
				calls.push({method: 'fetch', url, options});
				if (String(url).includes('createSession')) {
					return {
						ok: true,
						json: async () => ({
							did: 'did:plc:alice',
							handle: 'alice.bsky.social',
							accessJwt: 'access-token'
						})
					};
				}
				if (String(url).includes('getProfile')) {
					return {
						ok: true,
						json: async () => ({
							did: 'did:plc:alice',
							handle: 'alice.bsky.social'
						})
					};
				}
				if (String(url).includes('uploadBlob')) {
					return {
						ok: false,
						status: 500,
						json: async () => ({})
					};
				}
				return {
					ok: true,
					json: async () => ({
						uri: 'at://did:plc:alice/app.bsky.feed.post/fallback-created',
						cid: 'bafyfallbackcreated'
					})
				};
			}
		});

		const result = await module.crossPostPost(7, 44, {accountData: {id: 1}});
		const createRecordCall = calls.find(call => call.method === 'fetch' && String(call.url).includes('createRecord'));
		const createRecordBody = JSON.parse(createRecordCall.options.body);
		const fallbackUrl = 'https://node.example/geesome/ipfs/bafyimage';
		const fallbackByteStart = Buffer.byteLength('Photo post\n', 'utf8');

		assert.equal(result.record.uri, 'at://did:plc:alice/app.bsky.feed.post/fallback-created');
		assert.equal(createRecordBody.record.text, `Photo post\n${fallbackUrl}`);
		assert.deepEqual(createRecordBody.record.facets, [{
			$type: 'app.bsky.richtext.facet',
			index: {
				byteStart: fallbackByteStart,
				byteEnd: fallbackByteStart + Buffer.byteLength(fallbackUrl, 'utf8')
			},
			features: [{
				$type: 'app.bsky.richtext.facet#link',
				uri: fallbackUrl
			}]
		}]);
		assert.deepEqual(createRecordBody.record.embed, {
			$type: 'app.bsky.embed.external',
			external: {
				uri: fallbackUrl,
				title: 'Alt fallback',
				description: 'GeeSome image attachment'
			}
		});
	});

	it('uses GeeSome node domain as the public image link fallback', async () => {
		let post = getCrossPostPostFixture();
		const calls: any[] = [];
		const module = getBlueskyModule({
			config: {
				domain: '@node.example/'
			},
			ms: {
				socNetAccount: getSocNetAccountModule([{
					userId: 7,
					socNet: 'bluesky',
					accountId: 'did:plc:alice',
					username: 'alice.bsky.social',
					apiKey: 'app-password'
				}]),
				storage: {
					getFileData: async (storageId) => {
						calls.push({method: 'getFileData', storageId});
						return getTinyPngData();
					}
				},
				group: {
					getPost: async () => post,
					canEditPostInGroup: async () => true,
					getPostContentData: async () => [
						{
							id: 101,
							type: 'text',
							view: ContentView.Contents,
							mimeType: 'text/plain',
							text: 'Domain fallback'
						},
						{
							id: 102,
							type: 'image',
							view: ContentView.Media,
							mimeType: 'image/png',
							storageId: 'bafyimage'
						}
					],
					updatePost: async (userId, postId, postData) => {
						post = {...post, ...postData};
						return post;
					}
				}
			},
			checkModules: () => {},
			checkUserCan: async () => {}
		} as any, {
			fetch: async (url, options) => {
				calls.push({method: 'fetch', url, options});
				if (String(url).includes('createSession')) {
					return {
						ok: true,
						json: async () => ({
							did: 'did:plc:alice',
							handle: 'alice.bsky.social',
							accessJwt: 'access-token'
						})
					};
				}
				if (String(url).includes('getProfile')) {
					return {
						ok: true,
						json: async () => ({
							did: 'did:plc:alice',
							handle: 'alice.bsky.social'
						})
					};
				}
				if (String(url).includes('uploadBlob')) {
					return {
						ok: false,
						status: 500,
						json: async () => ({})
					};
				}
				return {
					ok: true,
					json: async () => ({
						uri: 'at://did:plc:alice/app.bsky.feed.post/domain-fallback-created',
						cid: 'bafydomainfallbackcreated'
					})
				};
			}
		});

		const result = await module.crossPostPost(7, 44, {accountData: {id: 1}});
		const createRecordCall = calls.find(call => call.method === 'fetch' && String(call.url).includes('createRecord'));
		const createRecordBody = JSON.parse(createRecordCall.options.body);
		const fallbackUrl = 'https://node.example/ipfs/bafyimage';

		assert.equal(result.record.uri, 'at://did:plc:alice/app.bsky.feed.post/domain-fallback-created');
		assert.equal(createRecordBody.record.text, `Domain fallback\n${fallbackUrl}`);
		assert.deepEqual(createRecordBody.record.embed, {
			$type: 'app.bsky.embed.external',
			external: {
				uri: fallbackUrl,
				title: 'GeeSome image',
				description: 'GeeSome image attachment'
			}
		});
	});

	it('cross-posts local posts with public non-image attachment links to Bluesky', async () => {
		let post = getCrossPostPostFixture();
		const calls: any[] = [];
		const module = getBlueskyModule({
			config: {
				domain: 'node.example'
			},
			ms: {
				socNetAccount: getSocNetAccountModule([{
					userId: 7,
					socNet: 'bluesky',
					accountId: 'did:plc:alice',
					username: 'alice.bsky.social',
					apiKey: 'app-password'
				}]),
				group: {
					getPost: async () => post,
					canEditPostInGroup: async () => true,
					getPostContentData: async () => [
						{
							id: 101,
							type: 'text',
							view: ContentView.Contents,
							mimeType: 'text/plain',
							text: 'Document post'
						},
						{
							id: 102,
							type: 'file',
							view: ContentView.Attachment,
							mimeType: 'application/pdf',
							storageId: 'bafydocument',
							name: 'report.pdf',
							description: 'Quarterly report'
						}
					],
					updatePost: async (userId, postId, postData) => {
						post = {...post, ...postData};
						return post;
					}
				}
			},
			checkModules: () => {},
			checkUserCan: async () => {}
		} as any, {
			fetch: async (url, options) => {
				calls.push({method: 'fetch', url, options});
				if (String(url).includes('createSession')) {
					return {
						ok: true,
						json: async () => ({
							did: 'did:plc:alice',
							handle: 'alice.bsky.social',
							accessJwt: 'access-token'
						})
					};
				}
				if (String(url).includes('getProfile')) {
					return {
						ok: true,
						json: async () => ({
							did: 'did:plc:alice',
							handle: 'alice.bsky.social'
						})
					};
				}
				return {
					ok: true,
					json: async () => ({
						uri: 'at://did:plc:alice/app.bsky.feed.post/document-created',
						cid: 'bafydocumentcreated'
					})
				};
			}
		});

		const result = await module.crossPostPost(7, 44, {accountData: {id: 1}});
		const createRecordCall = calls.find(call => call.method === 'fetch' && String(call.url).includes('createRecord'));
		const createRecordBody = JSON.parse(createRecordCall.options.body);
		const fallbackUrl = 'https://node.example/ipfs/bafydocument';
		const fallbackByteStart = Buffer.byteLength('Document post\n', 'utf8');

		assert.equal(result.record.uri, 'at://did:plc:alice/app.bsky.feed.post/document-created');
		assert.equal(createRecordBody.record.text, `Document post\n${fallbackUrl}`);
		assert.deepEqual(createRecordBody.record.facets, [{
			$type: 'app.bsky.richtext.facet',
			index: {
				byteStart: fallbackByteStart,
				byteEnd: fallbackByteStart + Buffer.byteLength(fallbackUrl, 'utf8')
			},
			features: [{
				$type: 'app.bsky.richtext.facet#link',
				uri: fallbackUrl
			}]
		}]);
		assert.deepEqual(createRecordBody.record.embed, {
			$type: 'app.bsky.embed.external',
			external: {
				uri: fallbackUrl,
				title: 'report.pdf',
				description: 'Quarterly report'
			}
		});
	});

	it('cross-posts local posts with link preview records to Bluesky external cards', async () => {
		let post = getCrossPostPostFixture();
		const calls: any[] = [];
		const module = getBlueskyModule({
			config: {},
			ms: {
				socNetAccount: getSocNetAccountModule([{
					userId: 7,
					socNet: 'bluesky',
					accountId: 'did:plc:alice',
					username: 'alice.bsky.social',
					apiKey: 'app-password'
				}]),
				group: {
					getPost: async () => post,
					canEditPostInGroup: async () => true,
					getPostContentData: async () => [
						{
							id: 101,
							type: 'text',
							view: ContentView.Contents,
							mimeType: 'text/plain',
							text: 'Link post'
						},
						{
							id: 102,
							type: 'json',
							view: ContentView.Link,
							mimeType: 'application/json',
							json: {
								url: 'https://example.com/article',
								displayUrl: 'example.com/article',
								siteName: 'Example',
								title: 'Example article',
								description: 'Readable preview'
							}
						}
					],
					updatePost: async (userId, postId, postData) => {
						post = {...post, ...postData};
						return post;
					}
				}
			},
			checkModules: () => {},
			checkUserCan: async () => {}
		} as any, {
			fetch: async (url, options) => {
				calls.push({method: 'fetch', url, options});
				if (String(url).includes('createSession')) {
					return {
						ok: true,
						json: async () => ({
							did: 'did:plc:alice',
							handle: 'alice.bsky.social',
							accessJwt: 'access-token'
						})
					};
				}
				if (String(url).includes('getProfile')) {
					return {
						ok: true,
						json: async () => ({
							did: 'did:plc:alice',
							handle: 'alice.bsky.social'
						})
					};
				}
				return {
					ok: true,
					json: async () => ({
						uri: 'at://did:plc:alice/app.bsky.feed.post/link-created',
						cid: 'bafylinkcreated'
					})
				};
			}
		});

		const result = await module.crossPostPost(7, 44, {accountData: {id: 1}});
		const createRecordCall = calls.find(call => call.method === 'fetch' && String(call.url).includes('createRecord'));
		const createRecordBody = JSON.parse(createRecordCall.options.body);
		const fallbackUrl = 'https://example.com/article';
		const fallbackByteStart = Buffer.byteLength('Link post\n', 'utf8');

		assert.equal(result.record.uri, 'at://did:plc:alice/app.bsky.feed.post/link-created');
		assert.equal(createRecordBody.record.text, `Link post\n${fallbackUrl}`);
		assert.deepEqual(createRecordBody.record.facets, [{
			$type: 'app.bsky.richtext.facet',
			index: {
				byteStart: fallbackByteStart,
				byteEnd: fallbackByteStart + Buffer.byteLength(fallbackUrl, 'utf8')
			},
			features: [{
				$type: 'app.bsky.richtext.facet#link',
				uri: fallbackUrl
			}]
		}]);
		assert.deepEqual(createRecordBody.record.embed, {
			$type: 'app.bsky.embed.external',
			external: {
				uri: fallbackUrl,
				title: 'Example article',
				description: 'Readable preview'
			}
		});
	});

	it('rejects oversized Bluesky image cross-posts before reading storage bytes', async () => {
		const module = getBlueskyModule({
			config: {},
			ms: {
				socNetAccount: getSocNetAccountModule([{
					userId: 7,
					socNet: 'bluesky',
					accountId: 'did:plc:alice',
					username: 'alice.bsky.social',
					apiKey: 'app-password'
				}]),
				storage: {
					getFileData: async () => {
						throw new Error('unexpected_storage_read');
					}
				},
				group: {
					getPost: async () => getCrossPostPostFixture(),
					canEditPostInGroup: async () => true,
					getPostContentData: async () => [
						{
							id: 101,
							type: 'text',
							view: ContentView.Contents,
							mimeType: 'text/plain',
							text: 'Photo post'
						},
						{
							id: 102,
							type: 'image',
							view: ContentView.Media,
							mimeType: 'image/png',
							storageId: 'bafylargeimage',
							size: 20000001
						}
					]
				}
			},
			checkModules: () => {},
			checkUserCan: async () => {}
		} as any, {
			fetch: async (url) => {
				if (String(url).includes('createSession')) {
					return {
						ok: true,
						json: async () => ({
							did: 'did:plc:alice',
							handle: 'alice.bsky.social',
							accessJwt: 'access-token'
						})
					};
				}
				if (String(url).includes('getProfile')) {
					return {
						ok: true,
						json: async () => ({
							did: 'did:plc:alice',
							handle: 'alice.bsky.social'
						})
					};
				}
				throw new Error('unexpected_create_record');
			}
		});

		await assert.rejects(
			() => module.crossPostPost(7, 44, {accountData: {id: 1}}),
			/bluesky_cross_post_image_too_large/
		);
	});

	it('rejects Bluesky cross-posts with unsafe link preview URLs', async () => {
		const module = getBlueskyModule({
			config: {},
			ms: {
				socNetAccount: getSocNetAccountModule([{
					userId: 7,
					socNet: 'bluesky',
					accountId: 'did:plc:alice',
					username: 'alice.bsky.social',
					apiKey: 'app-password'
				}]),
				group: {
					getPost: async () => getCrossPostPostFixture(),
					canEditPostInGroup: async () => true,
					getPostContentData: async () => [
						{
							id: 101,
							type: 'text',
							view: ContentView.Contents,
							mimeType: 'text/plain',
							text: 'Unsafe link'
						},
						{
							id: 102,
							type: 'json',
							view: ContentView.Link,
							mimeType: 'application/json',
							json: {
								url: 'javascript:alert(1)',
								title: 'Bad link'
							}
						}
					]
				}
			},
			checkModules: () => {},
			checkUserCan: async () => {}
		} as any, {
			fetch: async (url) => {
				if (String(url).includes('createSession')) {
					return {
						ok: true,
						json: async () => ({
							did: 'did:plc:alice',
							handle: 'alice.bsky.social',
							accessJwt: 'access-token'
						})
					};
				}
				if (String(url).includes('getProfile')) {
					return {
						ok: true,
						json: async () => ({
							did: 'did:plc:alice',
							handle: 'alice.bsky.social'
						})
					};
				}
				throw new Error('unexpected_create_record');
			}
		});

		await assert.rejects(
			() => module.crossPostPost(7, 44, {accountData: {id: 1}}),
			/bluesky_cross_post_attachments_unsupported/
		);
	});

	it('rejects Bluesky cross-posts without public attachment URLs or remote source identity', async () => {
		const calls: any[] = [];
		const attachmentModule = getBlueskyModule({
			config: {},
			ms: {
				socNetAccount: getSocNetAccountModule([{
					userId: 7,
					socNet: 'bluesky',
					accountId: 'did:plc:alice',
					username: 'alice.bsky.social',
					apiKey: 'app-password'
				}]),
				group: {
					getPost: async () => getCrossPostPostFixture(),
					canEditPostInGroup: async () => true,
					getPostContentData: async () => [
						{
							id: 101,
							type: 'text',
							view: ContentView.Contents,
							mimeType: 'text/plain',
							text: 'Text body'
						},
						{
							id: 102,
							type: 'file',
							view: ContentView.Attachment,
							mimeType: 'application/pdf',
							storageId: 'bafydocument'
						}
					]
				}
			},
			checkModules: () => {},
			checkUserCan: async () => {}
		} as any, {
			fetch: async (url) => {
				calls.push({url});
				if (String(url).includes('createSession')) {
					return {
						ok: true,
						json: async () => ({
							did: 'did:plc:alice',
							handle: 'alice.bsky.social',
							accessJwt: 'access-token'
						})
					};
				}
				if (String(url).includes('getProfile')) {
					return {
						ok: true,
						json: async () => ({
							did: 'did:plc:alice',
							handle: 'alice.bsky.social'
						})
					};
				}
				throw new Error('unexpected_create_record');
			}
		});
		const remoteModule = getBlueskyModule({
			config: {},
			ms: {
				socNetAccount: getSocNetAccountModule(),
				group: {
					getPost: async () => getCrossPostPostFixture({
						isRemote: true,
						source: 'socNetImport:bluesky'
					}),
					canEditPostInGroup: async () => true
				}
			},
			checkModules: () => {},
			checkUserCan: async () => {}
		} as any, {
			fetch: async () => {
				throw new Error('unexpected_fetch');
			}
		});

		await assert.rejects(
			() => attachmentModule.crossPostPost(7, 44, {accountData: {id: 1}}),
			/bluesky_cross_post_attachment_public_url_required/
		);
		await assert.rejects(
			() => remoteModule.crossPostPost(7, 44, {accountData: {id: 1}}),
			/bluesky_cross_post_remote_post_not_supported/
		);
		assert.equal(calls.some(call => String(call.url).includes('createRecord')), false);
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
		assert.equal(first.moderationMode, RemoteContentModerationMode.AutoImport);
		assert.deepEqual(first.moderationRules, []);

		const updatedExisting = await module.subscribeSource(7, {
			actor: 'bsky.app',
			filter: 'posts_with_media',
			displayName: 'Media',
			groupName: 'media-feed',
			accountId: null,
			importLimit: 2,
			moderationMode: 'review-first',
			moderationRules: [{name: 'spam', value: 'spam', action: 'block'}]
		});

		assert.equal(updatedExisting.id, first.id);
		assert.equal(subscriptionModel.rows.length, 1);
		assert.equal(updatedExisting.filter, 'posts_with_media');
		assert.equal(updatedExisting.displayName, 'Media');
		assert.equal(updatedExisting.groupName, 'media-feed');
		assert.equal(updatedExisting.accountId, null);
		assert.equal(updatedExisting.importLimit, 2);
		assert.equal(updatedExisting.moderationMode, RemoteContentModerationMode.ReviewFirst);
		assert.deepEqual(updatedExisting.moderationRules, [{
			name: 'spam',
			type: 'keyword',
			field: 'text',
			value: 'spam',
			action: 'block'
		}]);

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
			importLimit: null,
			moderationMode: RemoteContentModerationMode.AutoImport
		});

		assert.equal(paused.status, BlueskySourceSubscriptionStatus.Paused);
		assert.equal(paused.filter, null);
		assert.equal(paused.displayName, null);
		assert.equal(paused.groupName, null);
		assert.equal(paused.accountId, null);
		assert.equal(paused.importLimit, null);
		assert.equal(paused.moderationMode, RemoteContentModerationMode.AutoImport);
		assert.deepEqual(paused.moderationRules, updatedExisting.moderationRules);

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

	it('reads imported native Bluesky source feed from the linked channel', async () => {
		const calls: any[] = [];
		const subscriptionModel = getBlueskySourceSubscriptionModel();
		const subscription = await subscriptionModel.create({
			userId: 7,
			actor: 'alice.bsky.social',
			status: BlueskySourceSubscriptionStatus.Active,
			dbChannelId: 9
		});
		const module = getBlueskyModule({
			config: {},
			ms: {
				socNetImport: {
					getDbChannel: async (userId, where) => {
						calls.push({method: 'getDbChannel', userId, where});
						return getDbChannel();
					}
				},
				group: {
					getGroupPosts: async (groupId, filters, listParams) => {
						calls.push({method: 'getGroupPosts', groupId, filters, listParams});
						return {
							list: [{id: 44, sourcePostId: 'at://did:plc:alice/app.bsky.feed.post/newer'}],
							total: null,
							nextCursor: {publishedAt: '2026-07-04T08:00:00.000Z', id: 44}
						};
					}
				}
			},
			checkModules: () => {}
		} as any, {
			models: {
				BlueskySourceSubscription: subscriptionModel
			}
		});

		const feed = await module.getSourceFeed(7, subscription.id, {
			cursorPublishedAt: '2026-07-04T08:01:00.000Z',
			cursorId: '45',
			status: 'draft',
			includeAllStatuses: true,
			isDeleted: true
		} as any, {
			limit: 2
		});

		assert.deepEqual(calls, [
			{method: 'getDbChannel', userId: 7, where: {id: 9}},
			{
				method: 'getGroupPosts',
				groupId: 3,
				filters: {
					cursorPublishedAt: '2026-07-04T08:01:00.000Z',
					cursorId: '45'
				},
				listParams: {limit: 2}
			}
		]);
		assert.equal(feed.source.id, subscription.id);
		assert.equal(feed.source.actor, 'alice.bsky.social');
		assert.deepEqual(feed.dbChannel, {
			id: 9,
			groupId: 3,
			channelId: 'did:plc:alice',
			title: 'Alice',
			socNet: 'bluesky'
		});
		assert.equal(feed.posts.list[0].id, 44);

		const notReadySubscription = await subscriptionModel.create({
			userId: 7,
			actor: 'not-ready.bsky.social',
			status: BlueskySourceSubscriptionStatus.Active
		});
		await assert.rejects(
			() => module.getSourceFeed(7, notReadySubscription.id),
			/bluesky_source_feed_not_ready/
		);
	});

	it('does not expose a Bluesky source feed through another user subscription', async () => {
		const subscriptionModel = getBlueskySourceSubscriptionModel();
		const subscription = await subscriptionModel.create({
			userId: 8,
			actor: 'private.bsky.social',
			status: BlueskySourceSubscriptionStatus.Active,
			dbChannelId: 9
		});
		const module = getBlueskyModule({
			config: {},
			ms: {
				socNetImport: {
					getDbChannel: async () => getDbChannel()
				},
				group: {
					getGroupPosts: async () => ({list: [], total: 0})
				}
			},
			checkModules: () => {}
		} as any, {
			models: {
				BlueskySourceSubscription: subscriptionModel
			}
		});

		await assert.rejects(
			() => module.getSourceFeed(7, subscription.id),
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

	it('applies moderation policy before native Bluesky source posts become visible imports', async () => {
		const imports: any[] = [];
		const subscriptionModel = getBlueskySourceSubscriptionModel();
		const reviewModel = getBlueskySourcePostReviewModel();
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
						assert.deepEqual(client.messages.list.map(m => m.text), ['Allowed post']);
						assert.equal(client.messages.list[0].moderationDecision.action, 'allow');
						await client.onRemotePostProcess(client.messages.list[0], getDbChannel(), {id: 10}, 'post');
					}
				}
			},
			checkModules: () => {},
			checkUserCan: async () => {}
		} as any, {
			models: {
				BlueskySourceSubscription: subscriptionModel,
				BlueskySourcePostReview: reviewModel
			},
			fetch: async () => ({
				ok: true,
				json: async () => ({
					cursor: 'cursor-after',
					feed: [
						getFeedItem('blocked', 'Blocked spam post', '2026-07-04T08:00:00.000Z'),
						getFeedItem('allowed', 'Allowed post', '2026-07-04T07:59:00.000Z')
					]
				})
			})
		});
		const subscription = await module.subscribeSource(7, {
			actor: '@alice.bsky.social',
			importLimit: 2,
			moderationRules: [{name: 'spam filter', value: 'spam', action: 'block'}]
		});

		const result = await module.refreshSourceSubscription(7, subscription.id);

		assert.equal(imports[0].method, 'importChannelMetadata');
		assert.equal(imports[0].args[3].id, 'did:plc:alice');
		assert.equal(imports[1].method, 'importChannelPosts');
		assert.equal(result.fetched, 2);
		assert.equal(result.imported, 1);
		assert.deepEqual(result.moderation, {
			allowed: 1,
			review: 0,
			quarantined: 0,
			blocked: 1,
			matches: 1
		});
		assert.equal(reviewModel.rows.length, 1);
		assert.equal(reviewModel.rows[0].uri, 'at://did:plc:alice/app.bsky.feed.post/blocked');
		assert.equal(reviewModel.rows[0].state, BlueskySourcePostReviewState.Blocked);
		assert.equal(result.source.lastImportedAt instanceof Date, true);
	});

	it('keeps review-first native Bluesky source refreshes out of visible posts until review exists', async () => {
		const imports: any[] = [];
		const subscriptionModel = getBlueskySourceSubscriptionModel();
		const reviewModel = getBlueskySourcePostReviewModel();
		const module = getBlueskyModule({
			config: {},
			ms: {
				socNetImport: {
					importChannelMetadata: async (...args) => {
						imports.push({method: 'importChannelMetadata', args});
						return getDbChannel();
					},
					importChannelPosts: async (client) => {
						imports.push({method: 'importChannelPosts', client});
					}
				}
			},
			checkModules: () => {},
			checkUserCan: async () => {}
		} as any, {
			models: {
				BlueskySourceSubscription: subscriptionModel,
				BlueskySourcePostReview: reviewModel
			},
			fetch: async () => ({
				ok: true,
				json: async () => getTwoPostAuthorFeedFixture()
			})
		});
		const subscription = await module.subscribeSource(7, {
			actor: '@alice.bsky.social',
			moderationMode: 'review-first'
		});
		await subscriptionModel.rows[0].update({lastCursor: 'old-cursor'});

		const result = await module.refreshSourceSubscription(7, subscription.id);

		assert.deepEqual(imports, []);
		assert.equal(result.fetched, 2);
		assert.equal(result.imported, 0);
		assert.deepEqual(result.moderation, {
			allowed: 0,
			review: 2,
			quarantined: 0,
			blocked: 0,
			matches: 0
		});
		assert.equal(result.dbChannel, null);
		assert.equal(result.source.lastCursor, 'cursor-after');
		assert.equal(result.source.lastImportedAt, null);
		assert.deepEqual(reviewModel.rows.map(row => row.state), [
			BlueskySourcePostReviewState.Pending,
			BlueskySourcePostReviewState.Pending
		]);
	});

	it('lists, rejects, and imports cached native Bluesky source review records', async () => {
		const checks: any[] = [];
		const imports: any[] = [];
		const subscriptionModel = getBlueskySourceSubscriptionModel();
		const reviewModel = getBlueskySourcePostReviewModel();
		const module = getBlueskyModule({
			config: {},
			ms: {
				socNetImport: {
					importChannelMetadata: async (...args) => {
						imports.push({method: 'importChannelMetadata', args});
						return getDbChannel();
					},
					importChannelPosts: async (client) => {
						imports.push({method: 'importChannelPosts', client});
						assert.deepEqual(client.messages.list.map(m => m.id), ['at://did:plc:alice/app.bsky.feed.post/newer']);
						await client.onRemotePostProcess(client.messages.list[0], getDbChannel(), {id: 50}, 'post');
					}
				}
			},
			checkModules: () => {},
			checkUserCan: async (userId, permission) => {
				checks.push({userId, permission});
			}
		} as any, {
			models: {
				BlueskySourceSubscription: subscriptionModel,
				BlueskySourcePostReview: reviewModel
			},
			fetch: async () => ({
				ok: true,
				json: async () => getTwoPostAuthorFeedFixture()
			})
		});
		const subscription = await module.subscribeSource(7, {
			actor: '@alice.bsky.social',
			moderationMode: 'review-first',
			groupName: 'alice-review'
		});

		await module.refreshSourceSubscription(7, subscription.id);
		const reviewQueue = await module.getSourceReviews(7, subscription.id, {
			state: BlueskySourcePostReviewState.Pending
		}, {
			limit: 10
		});
		const rejected = await module.updateSourceReviewState(7, subscription.id, reviewQueue.list[1].id!, {
			state: BlueskySourcePostReviewState.Rejected
		});
		const imported = await module.importSourceReviewPost(7, subscription.id, reviewQueue.list[0].id!, {force: true});
		const defaultQueue = await module.getSourceReviews(7, subscription.id);

		assert.equal(reviewQueue.total, 2);
		assert.deepEqual(reviewQueue.list.map(item => item.preview?.text), ['Newer post', 'Older post']);
		assert.equal(rejected.state, BlueskySourcePostReviewState.Rejected);
		assert.equal(rejected.reviewedByUserId, 7);
		assert.equal(imported.imported, 1);
		assert.equal(imported.review.state, BlueskySourcePostReviewState.Imported);
		assert.equal(imported.review.importedAt instanceof Date, true);
		assert.equal(imported.source.dbChannelId, 9);
		assert.equal(imports[0].method, 'importChannelMetadata');
		assert.equal(imports[0].args[4].name, 'alice-review');
		assert.equal(imports[1].method, 'importChannelPosts');
		assert.equal(defaultQueue.total, 0);
		assert.deepEqual(checks, [
			{userId: 7, permission: CorePermissionName.UserGroupManagement},
			{userId: 7, permission: CorePermissionName.AdminAll},
			{userId: 7, permission: CorePermissionName.AdminAll},
			{userId: 7, permission: CorePermissionName.UserGroupManagement}
		]);
	});

	it('syncs imported native Bluesky source posts against current ATProto records', async () => {
		const checks: any[] = [];
		const imports: any[] = [];
		const deletedPostIds: number[] = [];
		const fetchUrls: string[] = [];
		const subscriptionModel = getBlueskySourceSubscriptionModel();
		const module = getBlueskyModule({
			config: {
				blueskyConfig: {
					publicApiOrigin: 'https://public.example/'
				}
			},
			ms: {
				socNetImport: {
					getDbChannel: async (userId, where) => {
						assert.equal(userId, 7);
						assert.deepEqual(where, {id: 9});
						return getDbChannel();
					},
					importChannelPosts: async (client) => {
						imports.push({method: 'importChannelPosts', client});
						assert.deepEqual(client.messages.list.map(m => m.id), ['at://did:plc:alice/app.bsky.feed.post/updated']);
						assert.equal(client.advancedSettings.force, true);
						await client.onRemotePostProcess(client.messages.list[0], getDbChannel(), {id: 21}, 'post');
					}
				},
				group: {
					getGroupPostRefs: async (groupId, filters, listParams, options) => {
						assert.equal(groupId, 3);
						assert.deepEqual(filters, {
							source: 'socNetImport:bluesky',
							sourceChannelId: 'did:plc:alice',
							sourcePostIdNe: null,
							cursorPublishedAt: undefined,
							cursorId: undefined
						});
						assert.deepEqual(listParams, {sortBy: 'publishedAt', sortDir: 'DESC', limit: 3});
						assert.deepEqual(options.attributes, ['id', 'publishedAt', 'source', 'sourceChannelId', 'sourcePostId', 'propertiesJson']);
						return [
							getImportedBlueskyPostRef(21, 'updated', 'oldcid', '2026-07-04T08:03:00.000Z'),
							getImportedBlueskyPostRef(22, 'same', 'samecid', '2026-07-04T08:02:00.000Z'),
							getImportedBlueskyPostRef(23, 'deleted', 'deletedcid', '2026-07-04T08:01:00.000Z')
						];
					},
					deletePosts: async (userId, postIds) => {
						assert.equal(userId, 7);
						deletedPostIds.push(...postIds);
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
				fetchUrls.push(url);
				if (String(url).includes('rkey=deleted')) {
					return {
						ok: false,
						status: 404,
						json: async () => ({error: 'RecordNotFound'})
					};
				}
				const isUpdated = String(url).includes('rkey=updated');
				return {
					ok: true,
					json: async () => ({
						uri: `at://did:plc:alice/app.bsky.feed.post/${isUpdated ? 'updated' : 'same'}`,
						cid: isUpdated ? 'newcid' : 'samecid',
						value: {
							$type: 'app.bsky.feed.post',
							text: isUpdated ? 'Updated text' : 'Same text',
							createdAt: '2026-07-04T08:00:00.000Z'
						}
					})
				};
			}
		});
		const subscription = await module.subscribeSource(7, {
			actor: '@alice.bsky.social'
		});
		await subscriptionModel.rows[0].update({dbChannelId: 9});

		const result = await module.syncSourceSubscriptionPosts(7, subscription.id, {limit: 3});

		assert.deepEqual(checks, [{
			userId: 7,
			permission: CorePermissionName.UserGroupManagement
		}]);
		assert.equal(fetchUrls.length, 3);
		assert.equal(fetchUrls[0], 'https://public.example/xrpc/com.atproto.repo.getRecord?repo=did%3Aplc%3Aalice&collection=app.bsky.feed.post&rkey=updated');
		assert.equal(imports.length, 1);
		assert.deepEqual(deletedPostIds, [23]);
		assert.equal(result.checked, 3);
		assert.equal(result.updated, 1);
		assert.equal(result.deleted, 1);
		assert.equal(result.skipped, 1);
		assert.equal(result.failed, 0);
		assert.deepEqual(result.errors, []);
		assert.deepEqual(result.nextCursor, {publishedAt: new Date('2026-07-04T08:01:00.000Z'), id: 23});
		assert.equal(result.dbChannel?.id, 9);
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
			moderationPolicy: {
				rules: [{name: 'spam', value: 'spam'}]
			},
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
					limit: 1,
					moderationPolicy: {
						rules: [{
							name: 'spam',
							type: 'keyword',
							field: 'text',
							value: 'spam',
							action: 'block'
						}]
					}
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

	it('registers user Bluesky account routes', async () => {
		const routes = {};
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
			}
		};
		const module = {
			loginAccount: async (userId, input) => {
				moduleCalls.push({method: 'loginAccount', userId, input});
				return {did: 'did:plc:alice', account: {id: 3, hasApiKey: true}};
			},
			verifyAccount: async (userId, input) => {
				moduleCalls.push({method: 'verifyAccount', userId, input});
				return {did: 'did:plc:alice', account: {id: 3, hasApiKey: true}};
			},
			getMigrationPreview: async (userId, input) => {
				moduleCalls.push({method: 'getMigrationPreview', userId, input});
				return {actor: 'alice.bsky.social', summary: {total: 1}, list: []};
			},
			importMigration: async (userId, userApiKeyId, input) => {
				moduleCalls.push({method: 'importMigration', userId, userApiKeyId, input});
				return {
					actor: 'alice.bsky.social',
					projectedPostsCount: 1,
					ownership: {verified: true},
					asyncOperation: {id: 44}
				};
			},
			queueMigrationImport: async (userId, userApiKeyId, input) => {
				moduleCalls.push({method: 'queueMigrationImport', userId, userApiKeyId, input});
				return {id: 45, module: 'bluesky-migration-import', userApiKeyId};
			},
			crossPostPost: async (userId, postId, input) => {
				moduleCalls.push({method: 'crossPostPost', userId, postId, input});
				return {
					record: {uri: 'at://did:plc:alice/app.bsky.feed.post/created', cid: 'bafycreated'},
					alreadyExists: false
				};
			},
			updateCrossPostPost: async (userId, postId, input) => {
				moduleCalls.push({method: 'updateCrossPostPost', userId, postId, input});
				return {
					record: {uri: 'at://did:plc:alice/app.bsky.feed.post/created', cid: 'bafyupdated'},
					previousRecord: {uri: 'at://did:plc:alice/app.bsky.feed.post/created', cid: 'bafycreated'},
					updated: true
				};
			},
			deleteCrossPostPost: async (userId, postId, input) => {
				moduleCalls.push({method: 'deleteCrossPostPost', userId, postId, input});
				return {
					record: {uri: 'at://did:plc:alice/app.bsky.feed.post/created', cid: 'bafycreated'},
					deleteRecord: {
						uri: 'at://did:plc:alice/app.bsky.feed.post/created',
						deleted: true,
						alreadyDeleted: false
					}
				};
			}
		};

		registerBlueskyApi(app as any, module as IGeesomeBlueskyModule);
		const loginResponse = await callRoute(routes, 'AUTH POST soc-net/bluesky/login', {
			user: {id: 7},
			body: {identifier: 'alice.bsky.social', appPassword: 'app-password'}
		});
		const verifyResponse = await callRoute(routes, 'AUTH POST soc-net/bluesky/verify-account', {
			user: {id: 7},
			body: {accountData: {id: 3}}
		});
		const migrationPreviewResponse = await callRoute(routes, 'AUTH POST soc-net/bluesky/migration/preview', {
			user: {id: 7},
			body: {actor: 'alice.bsky.social', claimed: true, accountData: {id: 3}}
		});
		const migrationImportResponse = await callRoute(routes, 'AUTH POST soc-net/bluesky/migration/import', {
			user: {id: 7},
			apiKey: {id: 12},
			body: {actor: 'alice.bsky.social', claimed: true, accountData: {id: 3}, groupName: 'alice-page'}
		});
		const migrationImportAsyncResponse = await callRoute(routes, 'AUTH POST soc-net/bluesky/migration/import', {
			user: {id: 7},
			apiKey: {id: 12},
			body: {actor: 'alice.bsky.social', claimed: true, accountData: {id: 3}, groupName: 'alice-page', async: true, process: false}
		});
		const crossPostResponse = await callRoute(routes, 'AUTH POST soc-net/bluesky/posts/:postId/cross-post', {
			user: {id: 7},
			params: {postId: '44'},
			body: {accountData: {id: 3}}
		});
		const updateCrossPostResponse = await callRoute(routes, 'AUTH POST soc-net/bluesky/posts/:postId/update-cross-post', {
			user: {id: 7},
			params: {postId: '44'},
			body: {accountData: {id: 3}}
		});
		const deleteCrossPostResponse = await callRoute(routes, 'AUTH POST soc-net/bluesky/posts/:postId/delete-cross-post', {
			user: {id: 7},
			params: {postId: '44'},
			body: {accountData: {id: 3}}
		});

		assert.deepEqual(moduleCalls, [
			{method: 'loginAccount', userId: 7, input: {identifier: 'alice.bsky.social', appPassword: 'app-password'}},
			{method: 'verifyAccount', userId: 7, input: {accountData: {id: 3}}},
			{method: 'getMigrationPreview', userId: 7, input: {actor: 'alice.bsky.social', claimed: true, accountData: {id: 3}}},
			{method: 'importMigration', userId: 7, userApiKeyId: 12, input: {actor: 'alice.bsky.social', claimed: true, accountData: {id: 3}, groupName: 'alice-page'}},
			{method: 'queueMigrationImport', userId: 7, userApiKeyId: 12, input: {actor: 'alice.bsky.social', claimed: true, accountData: {id: 3}, groupName: 'alice-page', async: true, process: false}},
			{method: 'crossPostPost', userId: 7, postId: '44', input: {accountData: {id: 3}}},
			{method: 'updateCrossPostPost', userId: 7, postId: '44', input: {accountData: {id: 3}}},
			{method: 'deleteCrossPostPost', userId: 7, postId: '44', input: {accountData: {id: 3}}}
		]);
		assert.deepEqual(loginResponse.body, {did: 'did:plc:alice', account: {id: 3, hasApiKey: true}});
		assert.deepEqual(verifyResponse.body, {did: 'did:plc:alice', account: {id: 3, hasApiKey: true}});
		assert.deepEqual(migrationPreviewResponse.body, {actor: 'alice.bsky.social', summary: {total: 1}, list: []});
		assert.deepEqual(migrationImportResponse.body, {
			actor: 'alice.bsky.social',
			projectedPostsCount: 1,
			ownership: {verified: true},
			asyncOperation: {id: 44}
		});
		assert.deepEqual(migrationImportAsyncResponse.body, {id: 45, module: 'bluesky-migration-import', userApiKeyId: 12});
		assert.deepEqual(crossPostResponse.body, {
			record: {uri: 'at://did:plc:alice/app.bsky.feed.post/created', cid: 'bafycreated'},
			alreadyExists: false
		});
		assert.deepEqual(updateCrossPostResponse.body, {
			record: {uri: 'at://did:plc:alice/app.bsky.feed.post/created', cid: 'bafyupdated'},
			previousRecord: {uri: 'at://did:plc:alice/app.bsky.feed.post/created', cid: 'bafycreated'},
			updated: true
		});
		assert.deepEqual(deleteCrossPostResponse.body, {
			record: {uri: 'at://did:plc:alice/app.bsky.feed.post/created', cid: 'bafycreated'},
			deleteRecord: {
				uri: 'at://did:plc:alice/app.bsky.feed.post/created',
				deleted: true,
				alreadyDeleted: false
			}
		});
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
			getSourceFeed: async (userId, sourceId, filters, listParams) => {
				moduleCalls.push({method: 'getSourceFeed', userId, sourceId, filters, listParams});
				return {source: {id: Number(sourceId)}, dbChannel: {id: 9}, posts: {list: [{id: 44}], total: null}};
			},
			getSourceReviews: async (userId, sourceId, filters, listParams) => {
				moduleCalls.push({method: 'getSourceReviews', userId, sourceId, filters, listParams});
				return {source: {id: Number(sourceId)}, list: [{id: 6, state: 'pending'}], total: 1};
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
			},
			syncSourceSubscriptionPosts: async (userId, sourceId, input) => {
				moduleCalls.push({method: 'syncSourceSubscriptionPosts', userId, sourceId, input});
				return {source: {id: Number(sourceId)}, checked: 1, updated: 0, deleted: 1};
			},
			updateSourceReviewState: async (userId, sourceId, reviewId, input) => {
				moduleCalls.push({method: 'updateSourceReviewState', userId, sourceId, reviewId, input});
				return {id: Number(reviewId), state: input.state};
			},
			importSourceReviewPost: async (userId, sourceId, reviewId, input) => {
				moduleCalls.push({method: 'importSourceReviewPost', userId, sourceId, reviewId, input});
				return {source: {id: Number(sourceId)}, review: {id: Number(reviewId), state: 'imported'}, imported: 1};
			}
		};

		registerBlueskyApi(app as any, module as IGeesomeBlueskyModule);

		const listResponse = await callRoute(routes, 'AUTH GET admin/bluesky/sources', {
			user: {id: 7},
			query: {status: 'active', limit: '5'}
		});
		const feedResponse = await callRoute(routes, 'AUTH GET admin/bluesky/sources/:sourceId/feed', {
			user: {id: 7},
			params: {sourceId: '4'},
			query: {limit: '2', cursorId: '44'}
		});
		const reviewsResponse = await callRoute(routes, 'AUTH GET admin/bluesky/sources/:sourceId/reviews', {
			user: {id: 7},
			params: {sourceId: '4'},
			query: {state: 'pending', limit: '2'}
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
		const syncResponse = await callRoute(routes, 'AUTH POST admin/bluesky/sources/:sourceId/sync', {
			user: {id: 7},
			params: {sourceId: '5'},
			body: {limit: 2}
		});
		const reviewStateResponse = await callRoute(routes, 'AUTH POST admin/bluesky/sources/:sourceId/reviews/:reviewId/state', {
			user: {id: 7},
			params: {sourceId: '5', reviewId: '6'},
			body: {state: 'rejected'}
		});
		const reviewImportResponse = await callRoute(routes, 'AUTH POST admin/bluesky/sources/:sourceId/reviews/:reviewId/import', {
			user: {id: 7},
			params: {sourceId: '5', reviewId: '6'},
			body: {force: true}
		});
		const removeResponse = await callRoute(routes, 'AUTH POST admin/bluesky/sources/:sourceId/remove', {
			user: {id: 7},
			params: {sourceId: '5'}
		});

		assert.deepEqual(permissionChecks, [
			{userId: 7, permission: CorePermissionName.AdminRead},
			{userId: 7, permission: CorePermissionName.AdminRead},
			{userId: 7, permission: CorePermissionName.AdminRead},
			{userId: 7, permission: CorePermissionName.AdminAll},
			{userId: 7, permission: CorePermissionName.AdminAll},
			{userId: 7, permission: CorePermissionName.AdminAll},
			{userId: 7, permission: CorePermissionName.UserGroupManagement},
			{userId: 7, permission: CorePermissionName.AdminAll},
			{userId: 7, permission: CorePermissionName.UserGroupManagement},
			{userId: 7, permission: CorePermissionName.AdminAll},
			{userId: 7, permission: CorePermissionName.UserGroupManagement},
			{userId: 7, permission: CorePermissionName.AdminAll},
			{userId: 7, permission: CorePermissionName.AdminAll},
			{userId: 7, permission: CorePermissionName.UserGroupManagement},
			{userId: 7, permission: CorePermissionName.AdminAll}
		]);
		assert.deepEqual(moduleCalls, [
			{method: 'getSourceSubscriptions', userId: 7, filters: {status: 'active', limit: '5'}, listParams: {status: 'active', limit: '5'}},
			{method: 'getSourceFeed', userId: 7, sourceId: '4', filters: {limit: '2', cursorId: '44'}, listParams: {limit: '2', cursorId: '44'}},
			{method: 'getSourceReviews', userId: 7, sourceId: '4', filters: {state: 'pending', limit: '2'}, listParams: {state: 'pending', limit: '2'}},
			{method: 'subscribeSource', userId: 7, input: {actor: 'bsky.app'}},
			{method: 'updateSourceSubscription', userId: 7, sourceId: '5', input: {status: 'paused'}},
			{method: 'refreshSourceSubscription', userId: 7, sourceId: '5', input: {limit: 1}},
			{method: 'queueSourceSubscriptionRefresh', userId: 7, sourceId: '5', userApiKeyId: 12, input: {limit: 1, process: false}},
			{method: 'syncSourceSubscriptionPosts', userId: 7, sourceId: '5', input: {limit: 2}},
			{method: 'updateSourceReviewState', userId: 7, sourceId: '5', reviewId: '6', input: {state: 'rejected'}},
			{method: 'importSourceReviewPost', userId: 7, sourceId: '5', reviewId: '6', input: {force: true}},
			{method: 'removeSourceSubscription', userId: 7, sourceId: '5'}
		]);
		assert.deepEqual(listResponse.body, {list: [{id: 4, actor: 'bsky.app'}], total: 1});
		assert.deepEqual(feedResponse.body, {source: {id: 4}, dbChannel: {id: 9}, posts: {list: [{id: 44}], total: null}});
		assert.deepEqual(reviewsResponse.body, {source: {id: 4}, list: [{id: 6, state: 'pending'}], total: 1});
		assert.deepEqual(subscribeResponse.body, {id: 5, actor: 'bsky.app'});
		assert.deepEqual(updateResponse.body, {id: 5, status: 'paused'});
		assert.deepEqual(refreshResponse.body, {source: {id: 5}, fetched: 1, imported: 1});
		assert.deepEqual(refreshQueueResponse.body, {id: 44, module: 'bluesky-source-refresh', userApiKeyId: 12, isWaiting: true});
		assert.deepEqual(syncResponse.body, {source: {id: 5}, checked: 1, updated: 0, deleted: 1});
		assert.deepEqual(reviewStateResponse.body, {id: 6, state: 'rejected'});
		assert.deepEqual(reviewImportResponse.body, {source: {id: 5}, review: {id: 6, state: 'imported'}, imported: 1});
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

function getImportedBlueskyPostRef(id: number, rkey: string, cid: string, publishedAt: string) {
	return {
		id,
		status: PostStatus.Published,
		isDeleted: false,
		isEncrypted: false,
		publishedAt: new Date(publishedAt),
		source: 'socNetImport:bluesky',
		sourceChannelId: 'did:plc:alice',
		sourcePostId: `at://did:plc:alice/app.bsky.feed.post/${rkey}`,
		group: {
			id: 9,
			isPublic: true,
			isEncrypted: false
		},
		propertiesJson: JSON.stringify({
			bluesky: {
				cid
			}
		})
	};
}

function getBlueskyAccountFetch(calls: any[], record: {uri: string; cid: string}) {
	return async (url, options) => {
		calls.push({method: 'fetch', url, options});
		if (String(url).includes('createSession')) {
			return {
				ok: true,
				json: async () => ({
					did: 'did:plc:alice',
					handle: 'alice.bsky.social',
					accessJwt: 'access-token'
				})
			};
		}
		if (String(url).includes('getProfile')) {
			return {
				ok: true,
				json: async () => ({
					did: 'did:plc:alice',
					handle: 'alice.bsky.social',
					displayName: 'Alice'
				})
			};
		}
		return {
			ok: true,
			json: async () => record
		};
	};
}

function getCrossPostPostFixture(overrides: any = {}) {
	return {
		id: 44,
		groupId: 9,
		userId: 7,
		status: PostStatus.Published,
		isDeleted: false,
		isEncrypted: false,
		isRemote: false,
		source: null,
		propertiesJson: null,
		group: {
			id: 9,
			isPublic: true,
			isEncrypted: false
		},
		...overrides
	};
}

function getTinyPngData(): Buffer {
	return Buffer.from(
		'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=',
		'base64'
	);
}

function waitForBackgroundTasks() {
	return new Promise(resolve => setImmediate(resolve));
}

class FakeSocNetAccount {
	id: number;
	userId: number;
	socNet: string;
	accountId: string | null;
	username: string | null;
	fullName: string | null;
	apiKey: string | null;
	accessToken: string | null;
	sessionKey: string | null;
	isEncrypted: boolean;

	constructor(id: number, data: any) {
		Object.assign(this, {
			accountId: null,
			username: null,
			fullName: null,
			apiKey: null,
			accessToken: null,
			sessionKey: null,
			isEncrypted: false,
			...data,
			id
		});
	}

	async update(data: any) {
		Object.assign(this, data);
		return this;
	}

	toJSON() {
		return {...this};
	}
}

function getSocNetAccountModule(initialRows: any[] = []) {
	const rows = initialRows.map((row, index) => new FakeSocNetAccount(index + 1, row));
	return {
		rows,
		async getAccount(userId, socNet, accountData) {
			return rows.find(row => matchesSocNetAccountWhere(row, {userId, socNet, ...accountData})) || null;
		},
		async createOrUpdateAccount(userId, accountData) {
			const where = getSocNetAccountLookupWhere(userId, accountData);
			const existingAccount = rows.find(row => matchesSocNetAccountWhere(row, where));
			if (existingAccount) {
				await existingAccount.update(accountData);
				return existingAccount;
			}
			const row = new FakeSocNetAccount(rows.length + 1, {...accountData, userId});
			rows.push(row);
			return row;
		}
	};
}

function getSocNetAccountLookupWhere(userId, accountData) {
	if (accountData.id) {
		return {userId, id: accountData.id};
	}
	if (accountData.socNet && accountData.accountId) {
		return {userId, socNet: accountData.socNet, accountId: accountData.accountId};
	}
	if (accountData.socNet && accountData.username) {
		return {userId, socNet: accountData.socNet, username: accountData.username};
	}
	if (accountData.socNet && accountData.phoneNumber) {
		return {userId, socNet: accountData.socNet, phoneNumber: accountData.phoneNumber};
	}
	return {userId, id: null};
}

function matchesSocNetAccountWhere(row: FakeSocNetAccount, where: any): boolean {
	return Object.keys(where || {}).every((key) => {
		if (key === 'id' || key === 'userId') {
			return Number(row[key]) === Number(where[key]);
		}
		return row[key] === where[key];
	});
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
	moderationMode: string;
	moderationRulesJson: string | null;
	dbChannelId: number | null;
	lastCursor: string | null;
	lastRefreshRequestedAt: Date | null;
	lastImportedAt: Date | null;
	lastError: string | null;
	createdAt: Date;
	updatedAt: Date;

	constructor(id: number, data: any) {
		Object.assign(this, {
			moderationMode: RemoteContentModerationMode.AutoImport,
			moderationRulesJson: null,
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

class FakeBlueskySourcePostReview {
	id: number;
	userId: number;
	sourceSubscriptionId: number;
	actor: string;
	uri: string;
	cid: string | null;
	sourceChannelId: string;
	state: string;
	moderationAction: string;
	moderationDecisionJson: string | null;
	projectionJson: string;
	publishedAt: Date | null;
	importedAt: Date | null;
	reviewedAt: Date | null;
	reviewedByUserId: number | null;
	lastError: string | null;
	createdAt: Date;
	updatedAt: Date;

	constructor(id: number, data: any) {
		Object.assign(this, {
			cid: null,
			state: BlueskySourcePostReviewState.Pending,
			importedAt: null,
			reviewedAt: null,
			reviewedByUserId: null,
			lastError: null,
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

function getBlueskySourcePostReviewModel() {
	const rows: FakeBlueskySourcePostReview[] = [];
	return {
		rows,
		async create(data) {
			if (rows.some(row => row.sourceSubscriptionId === data.sourceSubscriptionId && row.uri === data.uri)) {
				throw {name: 'SequelizeUniqueConstraintError'};
			}
			const row = new FakeBlueskySourcePostReview(rows.length + 1, data);
			rows.push(row);
			return row;
		},
		async findOne(options) {
			return rows.find(row => matchesBlueskySourceReviewWhere(row, options.where)) || null;
		},
		async findAndCountAll(options) {
			const matchingRows = rows
				.filter(row => matchesBlueskySourceReviewWhere(row, options.where))
				.sort((a, b) => compareBlueskySourceSubscriptionRows(a, b, options.order));
			const offset = options.offset || 0;
			const limit = options.limit || matchingRows.length;
			return {
				rows: matchingRows.slice(offset, offset + limit),
				count: matchingRows.length
			};
		}
	};
}

function matchesBlueskySourceReviewWhere(row: FakeBlueskySourcePostReview, where: any): boolean {
	return Object.keys(where || {}).every((key) => {
		const condition = where[key];
		const rowValue = row[key];
		if (key === 'id' || key === 'userId' || key === 'sourceSubscriptionId') {
			return Number(rowValue) === Number(condition);
		}
		if (isNotInCondition(condition)) {
			return !getNotInConditionValues(condition).includes(rowValue);
		}
		return rowValue === condition;
	});
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
