import {randomUUID} from 'node:crypto';
import {Op} from 'sequelize';
import {getModule as getBlueskyModule} from '../app/modules/bluesky/index.js';
import {
	blueskyPostSource,
	blueskySocNet,
	defaultBlueskyAuthApiOrigin,
	defaultBlueskyOfficialHandle,
	defaultBlueskyPublicApiOrigin,
	getBlueskyProjectionPreview,
	normalizeBlueskyActor
} from '../app/modules/bluesky/helpers.js';
import {BlueskySourceSubscriptionStatus} from '../app/modules/bluesky/interface.js';
import {ContentView, CorePermissionName} from '../app/modules/database/interface.js';
import {PostStatus} from '../app/modules/group/interface.js';
import {getSmokeReportPathEnvDescription, printSmokeReport as writeSmokeReport} from './helpers/smokeReport.js';

const credentialEnvNames = [
	'BLUESKY_CREDENTIAL_SMOKE_IDENTIFIER',
	'BLUESKY_CREDENTIAL_SMOKE_APP_PASSWORD'
];
const smokeReportPathEnvName = 'BLUESKY_CREDENTIAL_SMOKE_REPORT_PATH';

async function run(): Promise<void> {
	if (process.argv.includes('-h') || process.argv.includes('--help')) {
		printUsage();
		return;
	}

	const options = getSmokeOptions();
	if (!options.identifier || !options.appPassword) {
		printSmokeReport(getSkippedCredentialsReport(options));
		return;
	}

	const harness = createSmokeHarness(options);
	const module = getBlueskyModule(harness.app, {models: harness.models});
	const connected = await module.loginAccount(options.userId, {
		identifier: options.identifier,
		appPassword: options.appPassword
	});
	const verified = await module.verifyAccount(options.userId, {
		accountData: {id: connected.account.id},
		appPassword: options.appPassword
	});
	const feedPreview = await module.getPublicAuthorFeedPreview({
		actor: getReadActor(options, verified),
		limit: options.feedLimit
	});
	const sourceImportResult = await runSourceImportLifecycle(module, harness, options, connected, verified, feedPreview);
	const writeResult = await runWriteLifecycle(module, harness, options, connected);
	printSmokeReport({
		ok: true,
		skipped: false,
		authOrigin: options.authOrigin,
		publicOrigin: options.publicOrigin,
		verification: {
			did: verified.did,
			handle: verified.handle,
			account: verified.account
		},
		sourcePreview: getSourcePreviewReport(feedPreview),
		sourceImport: sourceImportResult,
		write: writeResult,
		boundaries: {
			writeOptInRequired: true,
			sourceImportWritesOnlyToLocalHarness: true,
			remoteImportedPostsRejectedByModulePolicy: true,
			activityPubSignatureAndModerationRemainOnActivityPubPaths: true
		}
	});
}

async function runSourceImportLifecycle(module, harness, options, connected, verified, feedPreview) {
	if (!options.sourceImportEnabled) {
		return {
			skipped: true,
			reason: 'bluesky_credentialed_smoke_source_import_disabled',
			enableEnv: 'BLUESKY_CREDENTIAL_SMOKE_SOURCE_IMPORT=1'
		};
	}
	if (!feedPreview.list.length) {
		return {
			skipped: true,
			reason: 'bluesky_credentialed_smoke_source_feed_empty',
			actor: feedPreview.actor
		};
	}

	const actor = getReadActor(options, verified);
	const input = getSourceImportInput(options, connected, actor);
	const publicImport = await module.importPublicAuthorFeed(options.userId, options.sourceUserApiKeyId, input);
	const publicImportClose = await harness.waitForImportClose();
	if (publicImportClose?.error) {
		throw new Error(`bluesky_credentialed_smoke_public_import_failed:${publicImportClose.error}`);
	}

	const subscription = await module.subscribeSource(options.userId, getSourceSubscriptionInput(options, connected, actor));
	const refresh = await module.refreshSourceSubscription(options.userId, subscription.id, getSourceRefreshInput(options));
	const sync = await runSourceSyncLifecycle(module, harness, options, subscription);
	return {
		skipped: false,
		actor,
		accountId: connected.account.id,
		publicImport: getPublicImportReport(publicImport, publicImportClose),
		refresh: getSourceRefreshReport(refresh),
		sync,
		localImportedPosts: harness.getImportedPosts().length
	};
}

async function runSourceSyncLifecycle(module, harness, options, subscription) {
	const importedPosts = harness.getImportedPosts();
	if (!importedPosts.length) {
		return {
			skipped: true,
			reason: 'bluesky_credentialed_smoke_source_sync_no_imported_posts'
		};
	}
	try {
		const result = await module.syncSourceSubscriptionPosts(options.userId, subscription.id, {
			limit: Math.min(importedPosts.length, options.sourceLimit),
			force: false
		});
		return getSourceSyncReport(result, harness);
	} catch (e) {
		if (options.sourceSyncRequired) {
			throw e;
		}
		return {
			skipped: true,
			reason: 'bluesky_credentialed_smoke_source_sync_failed',
			error: getErrorMessage(e),
			requireEnv: 'BLUESKY_CREDENTIAL_SMOKE_SOURCE_SYNC_REQUIRED=1'
		};
	}
}

async function runWriteLifecycle(module, harness, options, connected) {
	if (!options.writeEnabled) {
		return {
			skipped: true,
			reason: 'bluesky_credentialed_smoke_write_not_enabled',
			requiredEnv: 'BLUESKY_CREDENTIAL_SMOKE_WRITE=1'
		};
	}

	const createdAt = new Date().toISOString();
	const createText = getSmokePostText(options, 'create');
	const updateText = getSmokePostText(options, 'update');
	harness.setPostContents(getSmokePostContents(options, createText));
	const createResult = await module.crossPostPost(options.userId, options.postId, {
		accountData: {id: connected.account.id},
		createdAt,
		langs: options.langs,
		mediaPolicy: getSmokeMediaPolicy(options),
		relationPolicy: getSmokeRelationPolicy()
	});
	const idempotencyResult = await module.crossPostPost(options.userId, options.postId, {
		accountData: {id: connected.account.id},
		createdAt,
		langs: options.langs,
		mediaPolicy: getSmokeMediaPolicy(options),
		relationPolicy: getSmokeRelationPolicy()
	});
	harness.setPostContents(getSmokePostContents(options, updateText));
	const updateResult = await module.updateCrossPostPost(options.userId, options.postId, {
		accountData: {id: connected.account.id},
		createdAt,
		langs: options.langs,
		mediaPolicy: getSmokeMediaPolicy(options),
		relationPolicy: getSmokeRelationPolicy()
	});
	const deleteResult = await module.deleteCrossPostPost(options.userId, options.postId, {
		accountData: {id: connected.account.id}
	});
	return {
		skipped: false,
		created: getRecordReport(createResult),
		idempotency: {
			alreadyExists: idempotencyResult.alreadyExists,
			record: idempotencyResult.record
		},
		updated: {
			updated: updateResult.updated,
			record: updateResult.record,
			previousRecord: updateResult.previousRecord
		},
		deleted: {
			record: deleteResult.record,
			deleteRecord: deleteResult.deleteRecord
		},
		localPost: getLocalPostReport(harness.getPost()),
		mediaFallback: getMediaFallbackReport(options)
	};
}

function createSmokeHarness(options) {
	const accounts = createSocNetAccountModule();
	const sourceState = createSourceImportState(options);
	const models = {
		BlueskySourceSubscription: createBlueskySourceSubscriptionModel()
	};
	let post = getSmokePost(options);
	let contents = getSmokePostContents(options, getSmokePostText(options, 'initial'));
	const app = {
		config: {
			domain: options.domain,
			blueskyConfig: {
				authApiOrigin: options.authOrigin,
				publicApiOrigin: options.publicOrigin,
				authApiTimeoutMs: options.timeoutMs,
				publicApiTimeoutMs: options.timeoutMs,
				publicUrl: options.publicUrl
			},
			activityPubConfig: {
				publicUrl: options.activityPubPublicUrl
			}
		},
		ms: {
			socNetAccount: accounts,
			socNetImport: createSmokeSocNetImportModule(options, sourceState),
			asyncOperation: createSmokeAsyncOperationModule(sourceState),
			content: createSmokeContentModule(sourceState),
			storage: {
				getFileData: async () => Buffer.from('not-an-image')
			},
			group: {
				getPost: async (userId, postId) => {
					assertSmokePostAccess(options, userId, postId);
					return post;
				},
				canEditPostInGroup: async (userId, groupId, postId) => {
					return userId === options.userId && groupId === options.groupId && postId === options.postId;
				},
				getPostContentData: async () => contents,
				updatePost: async (userId, postId, postData) => {
					assertSmokePostAccess(options, userId, postId);
					post = {...post, ...postData};
					return post;
				},
				getGroupPostRefs: async (groupId, filters, listParams) => {
					return getSmokeGroupPostRefs(sourceState, groupId, filters, listParams);
				},
				deletePosts: async (_userId, postIds) => {
					sourceState.deletedPostIds.push(...postIds.map(id => Number(id)).filter(Number.isFinite));
					sourceState.importedPosts = sourceState.importedPosts.filter(postRef => !sourceState.deletedPostIds.includes(postRef.id));
				}
			}
		},
		checkModules: () => {},
		checkUserCan: async (userId, permission) => {
			if (userId !== options.userId || permission !== CorePermissionName.UserGroupManagement) {
				throw new Error('bluesky_credentialed_smoke_permission_check_unexpected');
			}
		}
	};
	return {
		app: app as any,
		models,
		getPost: () => post,
		getImportedPosts: () => [...sourceState.importedPosts],
		getSourceState: () => sourceState,
		waitForImportClose: () => waitForImportClose(sourceState, options.timeoutMs),
		setPostContents: (nextContents) => {
			contents = nextContents;
		}
	};
}

function getSmokeOptions() {
	return {
		identifier: normalizeOptionalBlueskyActor(process.env.BLUESKY_CREDENTIAL_SMOKE_IDENTIFIER),
		appPassword: process.env.BLUESKY_CREDENTIAL_SMOKE_APP_PASSWORD || '',
		readActor: normalizeOptionalBlueskyActor(process.env.BLUESKY_CREDENTIAL_SMOKE_HANDLE),
		authOrigin: process.env.BLUESKY_CREDENTIAL_SMOKE_AUTH_ORIGIN || process.env.BLUESKY_AUTH_API_ORIGIN || defaultBlueskyAuthApiOrigin,
		publicOrigin: process.env.BLUESKY_CREDENTIAL_SMOKE_PUBLIC_ORIGIN || process.env.BLUESKY_PUBLIC_API_ORIGIN || defaultBlueskyPublicApiOrigin,
		publicUrl: process.env.BLUESKY_CREDENTIAL_SMOKE_PUBLIC_URL || process.env.BLUESKY_PUBLIC_URL || '',
		activityPubPublicUrl: process.env.ACTIVITYPUB_PUBLIC_URL || '',
		domain: process.env.BLUESKY_CREDENTIAL_SMOKE_DOMAIN || process.env.DOMAIN || '',
		timeoutMs: parsePositiveInteger(process.env.BLUESKY_CREDENTIAL_SMOKE_TIMEOUT_MS, 15000),
		feedLimit: parseBoundedPositiveInteger(process.env.BLUESKY_CREDENTIAL_SMOKE_FEED_LIMIT, 3, 100),
		sourceLimit: parseBoundedPositiveInteger(process.env.BLUESKY_CREDENTIAL_SMOKE_SOURCE_LIMIT || process.env.BLUESKY_CREDENTIAL_SMOKE_FEED_LIMIT, 2, 25),
		sourceFilter: getOptionalString(process.env.BLUESKY_CREDENTIAL_SMOKE_SOURCE_FILTER),
		sourceGroupName: getOptionalString(process.env.BLUESKY_CREDENTIAL_SMOKE_SOURCE_GROUP_NAME) || 'bluesky-credentialed-smoke',
		sourceGroupId: parsePositiveInteger(process.env.BLUESKY_CREDENTIAL_SMOKE_SOURCE_GROUP_ID, 13),
		sourceUserApiKeyId: parseNullablePositiveInteger(process.env.BLUESKY_CREDENTIAL_SMOKE_SOURCE_USER_API_KEY_ID),
		sourceImportEnabled: parseBoolean(process.env.BLUESKY_CREDENTIAL_SMOKE_SOURCE_IMPORT, true),
		sourceSyncRequired: parseBoolean(process.env.BLUESKY_CREDENTIAL_SMOKE_SOURCE_SYNC_REQUIRED, false),
		userId: parsePositiveInteger(process.env.BLUESKY_CREDENTIAL_SMOKE_USER_ID, 7),
		groupId: parsePositiveInteger(process.env.BLUESKY_CREDENTIAL_SMOKE_GROUP_ID, 1),
		postId: parsePositiveInteger(process.env.BLUESKY_CREDENTIAL_SMOKE_POST_ID, 1),
		writeEnabled: parseBoolean(process.env.BLUESKY_CREDENTIAL_SMOKE_WRITE, false),
		mediaFallbackEnabled: parseBoolean(process.env.BLUESKY_CREDENTIAL_SMOKE_MEDIA_FALLBACK, false),
		mediaStorageId: process.env.BLUESKY_CREDENTIAL_SMOKE_IMAGE_STORAGE_ID || '',
		textPrefix: process.env.BLUESKY_CREDENTIAL_SMOKE_TEXT_PREFIX || 'GeeSome credentialed Bluesky smoke',
		langs: getOptionalStringList(process.env.BLUESKY_CREDENTIAL_SMOKE_LANGS, ['en'])
	};
}

function getSkippedCredentialsReport(options) {
	return {
		ok: true,
		skipped: true,
		reason: 'bluesky_credentialed_smoke_credentials_missing',
		requiredEnv: credentialEnvNames,
		authOrigin: options.authOrigin,
		publicOrigin: options.publicOrigin,
		sourceImportRunsWithCredentials: options.sourceImportEnabled,
		writeRequiresEnv: 'BLUESKY_CREDENTIAL_SMOKE_WRITE=1'
	};
}

function getReadActor(options, verified): string {
	return options.readActor || normalizeOptionalBlueskyActor(verified.handle) || normalizeOptionalBlueskyActor(verified.did) || defaultBlueskyOfficialHandle;
}

function getSourceImportInput(options, connected, actor: string) {
	const input: any = {
		actor,
		limit: options.sourceLimit,
		accountId: connected.account.id,
		groupName: options.sourceGroupName,
		force: true,
		mediaPolicy: getSmokeImportMediaPolicy(),
		relationPolicy: getSmokeImportRelationPolicy()
	};
	if (options.sourceFilter) {
		input.filter = options.sourceFilter;
	}
	return input;
}

function getSourceSubscriptionInput(options, connected, actor: string) {
	const input = getSourceImportInput(options, connected, actor);
	return {
		actor: input.actor,
		filter: input.filter,
		groupName: input.groupName,
		accountId: input.accountId,
		importLimit: input.limit,
		mediaPolicy: input.mediaPolicy,
		relationPolicy: input.relationPolicy
	};
}

function getSourceRefreshInput(options) {
	const input: any = {
		limit: options.sourceLimit,
		force: true,
		mediaPolicy: getSmokeImportMediaPolicy(),
		relationPolicy: getSmokeImportRelationPolicy()
	};
	if (options.sourceFilter) {
		input.filter = options.sourceFilter;
	}
	return input;
}

function getSourcePreviewReport(feedPreview) {
	return {
		actor: feedPreview.actor,
		cursor: feedPreview.cursor,
		count: feedPreview.list.length,
		checked: feedPreview.list.map(projection => getBlueskyProjectionPreview(projection))
	};
}

function getPublicImportReport(publicImport, publicImportClose) {
	return {
		actor: publicImport.actor,
		cursor: publicImport.cursor,
		projectedPostsCount: publicImport.projectedPostsCount,
		dbChannel: publicImport.dbChannel,
		asyncOperation: publicImport.asyncOperation,
		closed: publicImportClose ? {
			asyncOperationId: publicImportClose.asyncOperation?.id,
			error: publicImportClose.error
		} : null
	};
}

function getSourceRefreshReport(refresh) {
	return {
		actor: refresh.actor,
		cursor: refresh.cursor,
		fetched: refresh.fetched,
		imported: refresh.imported,
		dbChannel: refresh.dbChannel,
		source: {
			id: refresh.source.id,
			actor: refresh.source.actor,
			accountId: refresh.source.accountId,
			dbChannelId: refresh.source.dbChannelId,
			lastCursor: refresh.source.lastCursor,
			lastError: refresh.source.lastError,
			hasLastImportedAt: !!refresh.source.lastImportedAt
		},
		moderation: refresh.moderation
	};
}

function getSourceSyncReport(result, harness) {
	return {
		skipped: false,
		checked: result.checked,
		updated: result.updated,
		deleted: result.deleted,
		skippedPosts: result.skipped,
		failed: result.failed,
		errors: result.errors,
		nextCursor: result.nextCursor || null,
		dbChannel: result.dbChannel,
		moderation: result.moderation,
		deletedPostIds: harness.getSourceState().deletedPostIds
	};
}

function getRecordReport(result) {
	return {
		alreadyExists: result.alreadyExists,
		record: result.record,
		post: result.post,
		did: result.did,
		handle: result.handle
	};
}

function getLocalPostReport(post) {
	const properties = parseJsonObject(post.propertiesJson);
	const crossPosts = properties.bluesky?.crossPosts || {};
	return {
		id: post.id,
		groupId: post.groupId,
		status: post.status,
		crossPostCount: Object.keys(crossPosts).length
	};
}

function getMediaFallbackReport(options) {
	if (!options.mediaFallbackEnabled) {
		return {
			skipped: true,
			reason: 'bluesky_credentialed_smoke_media_fallback_not_enabled',
			requiredEnv: 'BLUESKY_CREDENTIAL_SMOKE_MEDIA_FALLBACK=1'
		};
	}
	return {
		skipped: false,
		imageStorageId: options.mediaStorageId,
		publicUrl: getSmokePublicUrl(options),
		expectedLink: `${getSmokePublicUrl(options)}/ipfs/${options.mediaStorageId}`,
		uploadFailurePolicy: 'link'
	};
}

function getSmokePost(options) {
	return {
		id: options.postId,
		groupId: options.groupId,
		userId: options.userId,
		status: PostStatus.Published,
		isDeleted: false,
		isEncrypted: false,
		isRemote: false,
		source: null,
		propertiesJson: null,
		group: {
			id: options.groupId,
			isPublic: true,
			isEncrypted: false
		}
	};
}

function getSmokePostContents(options, text: string) {
	const contents: any[] = [{
		id: 1,
		type: 'text',
		view: ContentView.Contents,
		mimeType: 'text/plain',
		text
	}];
	if (options.mediaFallbackEnabled) {
		assertMediaFallbackOptions(options);
		contents.push({
			id: 2,
			type: 'image',
			view: ContentView.Media,
			mimeType: 'image/png',
			storageId: options.mediaStorageId,
			description: 'GeeSome smoke image fallback'
		});
	}
	return contents;
}

function getSmokePostText(options, phase: string): string {
	return `${options.textPrefix} ${phase} ${randomUUID()}`;
}

function getSmokeMediaPolicy(options) {
	if (!options.mediaFallbackEnabled) {
		return {
			images: 'reject',
			attachments: 'reject',
			linkPreviews: 'reject'
		};
	}
	return {
		images: 'upload',
		imageUploadFailure: 'link',
		attachments: 'reject',
		linkPreviews: 'reject'
	};
}

function getSmokeRelationPolicy() {
	return {
		replies: 'omit',
		quotes: 'omit'
	};
}

function getSmokeImportMediaPolicy() {
	return {
		images: 'ignore',
		linkPreviews: 'ignore',
		unsupportedEmbeds: 'ignore'
	};
}

function getSmokeImportRelationPolicy() {
	return {
		replies: 'omit',
		quotes: 'omit',
		reposts: 'omit'
	};
}

function assertMediaFallbackOptions(options): void {
	if (!options.mediaStorageId) {
		throw new Error('bluesky_credentialed_smoke_image_storage_id_required');
	}
	if (!getSmokePublicUrl(options)) {
		throw new Error('bluesky_credentialed_smoke_public_url_required');
	}
}

function getSmokePublicUrl(options): string {
	return normalizePublicUrl(options.publicUrl || options.activityPubPublicUrl || getPublicUrlFromDomain(options.domain));
}

function assertSmokePostAccess(options, userId, postId): void {
	if (userId !== options.userId || Number(postId) !== options.postId) {
		throw new Error('bluesky_credentialed_smoke_post_access_unexpected');
	}
}

function createSourceImportState(options) {
	return {
		options,
		channels: [] as any[],
		contentRows: [] as any[],
		importedPosts: [] as any[],
		importChannelPostCalls: [] as any[],
		asyncOperations: [] as any[],
		asyncUpdates: [] as any[],
		closedImportOperations: [] as any[],
		deletedPostIds: [] as number[],
		nextPostId: 1000
	};
}

function createSmokeSocNetImportModule(options, state) {
	return {
		importChannelMetadata: async (userId, socNet, accountId, metadata, updateData) => {
			if (userId !== options.userId || socNet !== blueskySocNet) {
				throw new Error('bluesky_credentialed_smoke_source_channel_unexpected');
			}
			const channel = getOrCreateSmokeDbChannel(options, state, accountId, metadata, updateData);
			return channel;
		},
		openImportAsyncOperation: async (userId, userApiKeyId, dbChannel) => {
			const asyncOperation = {
				id: state.asyncOperations.length + 1,
				userId,
				userApiKeyId,
				channel: `bluesky-credentialed-smoke:${dbChannel.channelId}`,
				inProcess: true
			};
			state.asyncOperations.push(asyncOperation);
			return asyncOperation;
		},
		importChannelPosts: async (client) => {
			state.importChannelPostCalls.push({
				channelId: client.dbChannel.channelId,
				count: client.messages.list.length,
				force: client.advancedSettings.force
			});
			for (const message of client.messages.list) {
				const postRef = getOrCreateImportedBlueskyPost(state, client.dbChannel, message);
				await client.onRemotePostProcess?.(message, client.dbChannel, postRef, 'post');
			}
		},
		getDbChannel: async (userId, where) => {
			if (userId !== options.userId) {
				return null;
			}
			return state.channels.find(channel => Number(channel.id) === Number(where?.id)) || null;
		},
		storeContentMessage: async () => {}
	};
}

function createSmokeAsyncOperationModule(state) {
	return {
		handleOperationCancel: async (userId, asyncOperationId) => {
			state.asyncUpdates.push({method: 'handleOperationCancel', userId, asyncOperationId});
		},
		updateAsyncOperation: async (userId, asyncOperationId, percent) => {
			state.asyncUpdates.push({method: 'updateAsyncOperation', userId, asyncOperationId, percent});
		},
		closeImportAsyncOperation: async (userId, asyncOperation, error) => {
			const closedOperation = {
				userId,
				asyncOperation,
				error: getErrorMessage(error)
			};
			state.closedImportOperations.push(closedOperation);
			if (asyncOperation) {
				asyncOperation.inProcess = false;
			}
		}
	};
}

function createSmokeContentModule(state) {
	return {
		saveData: async (userId, data, fileName, options) => {
			const content = {
				id: state.contentRows.length + 1,
				userId,
				data,
				fileName,
				...options
			};
			state.contentRows.push(content);
			return content;
		}
	};
}

function getOrCreateSmokeDbChannel(options, state, accountId, metadata, updateData) {
	const existingChannel = state.channels.find(channel => channel.channelId === metadata.id);
	if (existingChannel) {
		Object.assign(existingChannel, getSmokeDbChannelUpdate(options, accountId, metadata, updateData));
		return existingChannel;
	}
	const channel = {
		id: state.channels.length + 1,
		userId: options.userId,
		groupId: options.sourceGroupId,
		accountId: accountId || null,
		channelId: metadata.id,
		socNet: blueskySocNet,
		title: metadata.title || metadata.username || metadata.id,
		username: metadata.username || metadata.id,
		groupName: updateData?.name || options.sourceGroupName
	};
	state.channels.push(channel);
	return channel;
}

function getSmokeDbChannelUpdate(options, accountId, metadata, updateData) {
	return {
		accountId: accountId || null,
		title: metadata.title || metadata.username || metadata.id,
		username: metadata.username || metadata.id,
		groupName: updateData?.name || options.sourceGroupName
	};
}

function getOrCreateImportedBlueskyPost(state, dbChannel, message) {
	const existingPost = state.importedPosts.find(postRef => postRef.sourcePostId === message.sourceIdentity.sourcePostId);
	const publishedAt = getMessagePublishedAt(message);
	const propertiesJson = JSON.stringify({
		bluesky: {
			uri: message.uri,
			cid: message.cid || null,
			sourceIdentity: message.sourceIdentity,
			author: message.author,
			createdAt: message.createdAt,
			indexedAt: message.indexedAt
		}
	});
	if (existingPost) {
		Object.assign(existingPost, {
			publishedAt,
			propertiesJson
		});
		return existingPost;
	}
	const postRef = {
		id: state.nextPostId,
		groupId: dbChannel.groupId,
		status: PostStatus.Published,
		isDeleted: false,
		isEncrypted: false,
		publishedAt,
		source: blueskyPostSource,
		sourceChannelId: message.sourceIdentity.sourceChannelId,
		sourcePostId: message.sourceIdentity.sourcePostId,
		propertiesJson,
		group: {
			id: dbChannel.groupId,
			isPublic: true,
			isEncrypted: false
		}
	};
	state.nextPostId += 1;
	state.importedPosts.push(postRef);
	return postRef;
}

function getMessagePublishedAt(message): Date {
	const value = message.createdAt || message.indexedAt;
	const parsed = value ? new Date(value) : null;
	if (parsed && !Number.isNaN(parsed.getTime())) {
		return parsed;
	}
	return new Date();
}

function getSmokeGroupPostRefs(state, groupId, filters, listParams) {
	const limit = parsePositiveInteger(listParams?.limit, state.importedPosts.length || 1);
	return state.importedPosts
		.filter(postRef => postRef.groupId === Number(groupId))
		.filter(postRef => !filters?.source || postRef.source === filters.source)
		.filter(postRef => !filters?.sourceChannelId || postRef.sourceChannelId === filters.sourceChannelId)
		.filter(postRef => !filters?.sourcePostIdNe || !!postRef.sourcePostId)
		.sort(compareImportedPostRefsDesc)
		.slice(0, limit);
}

function compareImportedPostRefsDesc(a, b): number {
	const dateDiff = b.publishedAt.getTime() - a.publishedAt.getTime();
	if (dateDiff !== 0) {
		return dateDiff;
	}
	return b.id - a.id;
}

async function waitForImportClose(state, timeoutMs: number) {
	const startedAt = Date.now();
	while (Date.now() - startedAt < timeoutMs) {
		const closedOperation = state.closedImportOperations[state.closedImportOperations.length - 1];
		if (closedOperation) {
			return closedOperation;
		}
		await delay(25);
	}
	return null;
}

function delay(ms: number) {
	return new Promise(resolve => setTimeout(resolve, ms));
}

function createBlueskySourceSubscriptionModel() {
	return createMemoryModel((id, data) => new FakeBlueskySourceSubscription(id, data));
}

function createMemoryModel(createRow) {
	const rows: any[] = [];
	return {
		rows,
		async create(data) {
			const row = createRow(rows.length + 1, data);
			rows.push(row);
			return row;
		},
		async findOne(options) {
			return rows.find(row => matchesWhere(row, options?.where || {})) || null;
		},
		async findAndCountAll(options) {
			const list = rows
				.filter(row => matchesWhere(row, options?.where || {}))
				.sort((a, b) => compareRowsByOrder(a, b, options?.order || []));
			const limit = parsePositiveInteger(options?.limit, list.length || 1);
			const offset = Number(options?.offset || 0);
			return {
				count: list.length,
				rows: list.slice(offset, offset + limit)
			};
		},
		async findAll(options) {
			const list = rows
				.filter(row => matchesWhere(row, options?.where || {}))
				.sort((a, b) => compareRowsByOrder(a, b, options?.order || []));
			const limit = options?.limit === undefined ? list.length : parsePositiveInteger(options.limit, list.length || 1);
			return list.slice(0, limit);
		}
	};
}

class FakeBlueskySourceSubscription {
	constructor(id: number, data: any) {
		Object.assign(this, {
			id,
			filter: null,
			displayName: null,
			status: BlueskySourceSubscriptionStatus.Active,
			groupName: null,
			accountId: null,
			importLimit: null,
			moderationMode: null,
			moderationRulesJson: null,
			importMediaPolicyJson: null,
			importRelationPolicyJson: null,
			dbChannelId: null,
			lastCursor: null,
			lastRefreshRequestedAt: null,
			lastImportedAt: null,
			lastError: null,
			createdAt: new Date(),
			updatedAt: new Date(),
			...data
		});
	}

	async update(data) {
		Object.assign(this, data, {updatedAt: new Date()});
		return this;
	}
}

function matchesWhere(row, where): boolean {
	return Object.keys(where || {}).every((key) => matchesWhereValue(row[key], where[key]));
}

function matchesWhereValue(value, condition): boolean {
	if (condition && typeof condition === 'object' && !Array.isArray(condition)) {
		if (Object.prototype.hasOwnProperty.call(condition, Op.notIn)) {
			return !condition[Op.notIn].includes(value);
		}
		if (Object.prototype.hasOwnProperty.call(condition, Op.in)) {
			return condition[Op.in].includes(value);
		}
	}
	return value === condition;
}

function compareRowsByOrder(a, b, order): number {
	const firstOrder = Array.isArray(order) ? order[0] : null;
	const field = firstOrder?.[0] || 'id';
	const direction = String(firstOrder?.[1] || 'ASC').toUpperCase();
	const valueA = getComparableValue(a[field]);
	const valueB = getComparableValue(b[field]);
	if (valueA === valueB) {
		return 0;
	}
	if (direction === 'DESC') {
		return valueA > valueB ? -1 : 1;
	}
	return valueA > valueB ? 1 : -1;
}

function getComparableValue(value) {
	if (value instanceof Date) {
		return value.getTime();
	}
	return value ?? 0;
}

function createSocNetAccountModule() {
	const rows: any[] = [];
	return {
		rows,
		async getAccount(userId, socNet, accountData) {
			return rows.find(row => matchesAccount(row, {userId, socNet, ...accountData})) || null;
		},
		async createOrUpdateAccount(userId, accountData) {
			const where = getAccountLookupWhere(userId, accountData);
			const existingAccount = rows.find(row => matchesAccount(row, where));
			if (existingAccount) {
				Object.assign(existingAccount, accountData);
				return existingAccount;
			}
			const account = createAccount(rows.length + 1, {...accountData, userId});
			rows.push(account);
			return account;
		}
	};
}

function createAccount(id: number, data: any) {
	const account = {
		accountId: null,
		username: null,
		fullName: null,
		apiKey: null,
		accessToken: null,
		sessionKey: null,
		isEncrypted: false,
		...data,
		id,
		async update(updateData) {
			Object.assign(this, updateData);
			return this;
		},
		toJSON() {
			return {...this};
		}
	};
	return account;
}

function getAccountLookupWhere(userId, accountData) {
	if (accountData.id) {
		return {userId, id: accountData.id};
	}
	if (accountData.socNet && accountData.accountId) {
		return {userId, socNet: accountData.socNet, accountId: accountData.accountId};
	}
	if (accountData.socNet && accountData.username) {
		return {userId, socNet: accountData.socNet, username: accountData.username};
	}
	return {userId, socNet: blueskySocNet, id: null};
}

function matchesAccount(row, where): boolean {
	return Object.keys(where || {}).every((key) => {
		if (key === 'id' || key === 'userId') {
			return Number(row[key]) === Number(where[key]);
		}
		return row[key] === where[key];
	});
}

function normalizeOptionalBlueskyActor(value: any): string {
	const rawValue = String(value || '').trim();
	if (!rawValue) {
		return '';
	}
	return normalizeBlueskyActor(rawValue);
}

function getOptionalString(value: any): string {
	const text = String(value || '').trim();
	if (!text) {
		return '';
	}
	return text;
}

function getOptionalStringList(value: any, fallback: string[]): string[] {
	const list = String(value || '')
		.split(',')
		.map(item => item.trim())
		.filter(Boolean);
	if (list.length === 0) {
		return fallback;
	}
	return list;
}

function parseBoolean(value: any, fallback: boolean): boolean {
	const normalizedValue = String(value || '').trim().toLowerCase();
	if (!normalizedValue) {
		return fallback;
	}
	if (['1', 'true', 'yes', 'on'].includes(normalizedValue)) {
		return true;
	}
	if (['0', 'false', 'no', 'off'].includes(normalizedValue)) {
		return false;
	}
	return fallback;
}

function parsePositiveInteger(value: any, fallback: number): number {
	const parsed = Number.parseInt(String(value || ''), 10);
	if (Number.isFinite(parsed) && parsed > 0) {
		return parsed;
	}
	return fallback;
}

function parseNullablePositiveInteger(value: any): number | null {
	const parsed = Number.parseInt(String(value || ''), 10);
	if (Number.isFinite(parsed) && parsed > 0) {
		return parsed;
	}
	return null;
}

function parseBoundedPositiveInteger(value: any, fallback: number, max: number): number {
	return Math.min(parsePositiveInteger(value, fallback), max);
}

function getErrorMessage(error): string | null {
	if (!error) {
		return null;
	}
	return error?.message || String(error);
}

function parseJsonObject(value: any) {
	try {
		const parsed = JSON.parse(String(value || '{}'));
		if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
			return parsed;
		}
	} catch (e) {
		return {};
	}
	return {};
}

function getPublicUrlFromDomain(domain: any): string {
	const rawDomain = String(domain || '').trim().replace(/^@/, '');
	if (!rawDomain) {
		return '';
	}
	if (rawDomain.includes('://')) {
		return normalizePublicUrl(rawDomain);
	}
	const cleanDomain = rawDomain.replace(/^\/+/, '').split('/')[0];
	if (!cleanDomain) {
		return '';
	}
	return `https://${cleanDomain}`;
}

function normalizePublicUrl(value: any): string {
	const rawValue = String(value || '').trim();
	if (!rawValue) {
		return '';
	}
	const parsedUrl = new URL(rawValue);
	if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
		throw new Error('bluesky_credentialed_smoke_public_url_invalid');
	}
	parsedUrl.search = '';
	parsedUrl.hash = '';
	const path = parsedUrl.pathname === '/' ? '' : parsedUrl.pathname.replace(/\/+$/, '');
	return `${parsedUrl.origin}${path}`;
}

function printSmokeReport(report): void {
	writeSmokeReport(report, smokeReportPathEnvName);
}

function printUsage(): void {
	console.log(`Usage:
  npm run bluesky:credentialed-smoke
  BLUESKY_CREDENTIAL_SMOKE_IDENTIFIER=alice.bsky.social BLUESKY_CREDENTIAL_SMOKE_APP_PASSWORD=xxxx npm run bluesky:credentialed-smoke
  BLUESKY_CREDENTIAL_SMOKE_WRITE=1 BLUESKY_CREDENTIAL_SMOKE_IDENTIFIER=alice.bsky.social BLUESKY_CREDENTIAL_SMOKE_APP_PASSWORD=xxxx npm run bluesky:credentialed-smoke

Credentialed native Bluesky smoke for operator-run interop checks. Without
credentials it prints a skipped report. With credentials it verifies login,
stored socNetAccount lookup, public source preview, local source import,
source subscription refresh, and best-effort imported-post sync. Writes require
BLUESKY_CREDENTIAL_SMOKE_WRITE=1 and create/update/delete a temporary
app.bsky.feed.post record.

Environment:
  BLUESKY_CREDENTIAL_SMOKE_IDENTIFIER        Bluesky handle, email, or DID
  BLUESKY_CREDENTIAL_SMOKE_APP_PASSWORD      Bluesky app password or password
  BLUESKY_CREDENTIAL_SMOKE_WRITE             Set to 1 to create/update/delete a temporary remote post
  BLUESKY_CREDENTIAL_SMOKE_HANDLE            Public feed actor to preview, defaults to verified account
  BLUESKY_CREDENTIAL_SMOKE_AUTH_ORIGIN       Auth XRPC origin, default https://bsky.social
  BLUESKY_CREDENTIAL_SMOKE_PUBLIC_ORIGIN     Public XRPC origin, default https://public.api.bsky.app
  BLUESKY_CREDENTIAL_SMOKE_TIMEOUT_MS        Fetch timeout, default 15000
  BLUESKY_CREDENTIAL_SMOKE_FEED_LIMIT        Public feed preview limit, default 3
  BLUESKY_CREDENTIAL_SMOKE_SOURCE_IMPORT     Set to 0 to skip local source import/refresh checks
  BLUESKY_CREDENTIAL_SMOKE_SOURCE_LIMIT      Source import/refresh/sync limit, default 2
  BLUESKY_CREDENTIAL_SMOKE_SOURCE_FILTER     Optional author feed filter for source checks
  BLUESKY_CREDENTIAL_SMOKE_SOURCE_GROUP_NAME Local GeeSome group name used by source import harness
  BLUESKY_CREDENTIAL_SMOKE_SOURCE_SYNC_REQUIRED
                                             Set to 1 to fail if live getRecord sync is unavailable
  BLUESKY_CREDENTIAL_SMOKE_TEXT_PREFIX       Temporary post text prefix
  BLUESKY_CREDENTIAL_SMOKE_MEDIA_FALLBACK    Set to 1 to exercise image-upload-failure link fallback
  BLUESKY_CREDENTIAL_SMOKE_IMAGE_STORAGE_ID  Storage id used for media fallback link
  BLUESKY_PUBLIC_URL / ACTIVITYPUB_PUBLIC_URL / DOMAIN
                                             Public GeeSome URL fallback for media links
  ${getSmokeReportPathEnvDescription(smokeReportPathEnvName)}`);
}

run().catch((e) => {
	console.error(e);
	process.exit(1);
});
