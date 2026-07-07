import {randomUUID} from 'node:crypto';
import {getModule as getBlueskyModule} from '../app/modules/bluesky/index.js';
import {
	blueskySocNet,
	defaultBlueskyAuthApiOrigin,
	defaultBlueskyOfficialHandle,
	defaultBlueskyPublicApiOrigin,
	getBlueskyProjectionPreview,
	normalizeBlueskyActor
} from '../app/modules/bluesky/helpers.js';
import {ContentView, CorePermissionName} from '../app/modules/database/interface.js';
import {PostStatus} from '../app/modules/group/interface.js';

const credentialEnvNames = [
	'BLUESKY_CREDENTIAL_SMOKE_IDENTIFIER',
	'BLUESKY_CREDENTIAL_SMOKE_APP_PASSWORD'
];

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
	const module = getBlueskyModule(harness.app);
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
		write: writeResult,
		boundaries: {
			writeOptInRequired: true,
			remoteImportedPostsRejectedByModulePolicy: true,
			activityPubSignatureAndModerationRemainOnActivityPubPaths: true
		}
	});
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
		getPost: () => post,
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
		writeRequiresEnv: 'BLUESKY_CREDENTIAL_SMOKE_WRITE=1'
	};
}

function getReadActor(options, verified): string {
	return options.readActor || normalizeOptionalBlueskyActor(verified.handle) || normalizeOptionalBlueskyActor(verified.did) || defaultBlueskyOfficialHandle;
}

function getSourcePreviewReport(feedPreview) {
	return {
		actor: feedPreview.actor,
		cursor: feedPreview.cursor,
		count: feedPreview.list.length,
		checked: feedPreview.list.map(projection => getBlueskyProjectionPreview(projection))
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

function parseBoundedPositiveInteger(value: any, fallback: number, max: number): number {
	return Math.min(parsePositiveInteger(value, fallback), max);
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
	process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

function printUsage(): void {
	console.log(`Usage:
  npm run bluesky:credentialed-smoke
  BLUESKY_CREDENTIAL_SMOKE_IDENTIFIER=alice.bsky.social BLUESKY_CREDENTIAL_SMOKE_APP_PASSWORD=xxxx npm run bluesky:credentialed-smoke
  BLUESKY_CREDENTIAL_SMOKE_WRITE=1 BLUESKY_CREDENTIAL_SMOKE_IDENTIFIER=alice.bsky.social BLUESKY_CREDENTIAL_SMOKE_APP_PASSWORD=xxxx npm run bluesky:credentialed-smoke

Credentialed native Bluesky smoke for operator-run interop checks. Without
credentials it prints a skipped report. With credentials it verifies login,
stored socNetAccount lookup, and public source preview. Writes require
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
  BLUESKY_CREDENTIAL_SMOKE_TEXT_PREFIX       Temporary post text prefix
  BLUESKY_CREDENTIAL_SMOKE_MEDIA_FALLBACK    Set to 1 to exercise image-upload-failure link fallback
  BLUESKY_CREDENTIAL_SMOKE_IMAGE_STORAGE_ID  Storage id used for media fallback link
  BLUESKY_PUBLIC_URL / ACTIVITYPUB_PUBLIC_URL / DOMAIN
                                             Public GeeSome URL fallback for media links`);
}

run().catch((e) => {
	console.error(e);
	process.exit(1);
});
