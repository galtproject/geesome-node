import assert from 'node:assert';
import crypto from 'node:crypto';
import activityPubModule from '../app/modules/activityPub/index.js';
import registerActivityPubApi from '../app/modules/activityPub/api.js';
import {ContentMimeType} from '../app/modules/database/interface.js';
import {GroupType, GroupView, PostStatus} from '../app/modules/group/interface.js';

describe('activityPub module', () => {
	it('resolves WebFinger, actor, outbox, and post Note payloads for public groups', async () => {
		const {module, calls} = await createActivityPubHarness();

		assert.equal(module.isEnabled(), true);
		assert.deepEqual(await module.getWebFingerResponse('acct:test-channel@example.com'), {
			subject: 'acct:test-channel@example.com',
			aliases: ['https://social.example/ap/groups/test-channel'],
			links: [
				{
					rel: 'self',
					type: 'application/activity+json',
					href: 'https://social.example/ap/groups/test-channel'
				}
			]
		});

		const actor = await module.getGroupActor('test-channel');
		assert.equal(actor.id, 'https://social.example/ap/groups/test-channel');
		assert.equal(actor.publicKey.id, 'https://social.example/ap/groups/test-channel#main-key');
		assert.equal(actor.publicKey.owner, 'https://social.example/ap/groups/test-channel');
		assert.match(actor.publicKey.publicKeyPem, /^-----BEGIN PUBLIC KEY-----/);
		assert.deepEqual(actor.icon, {
			type: 'Image',
			mediaType: ContentMimeType.ImagePng,
			url: 'https://social.example/ipfs/avatar-storage'
		});

		const outbox = await module.getGroupOutbox('test-channel', {limit: 5});
		assert.equal(outbox.id, 'https://social.example/ap/groups/test-channel/outbox');
		assert.equal(outbox.orderedItems.length, 1);
		assert.equal(outbox.orderedItems[0].object.content, 'Hello fediverse');
		assert.deepEqual(calls.getGroupPosts[0].filters, {
			status: PostStatus.Published,
			isDeleted: false
		});
		assert.equal(calls.getGroupPosts[0].listParams.includeTotal, false);

		const note = await module.getGroupPostNote('test-channel', 7);
		assert.equal(note.id, 'https://social.example/ap/groups/test-channel/posts/7');
		assert.equal(note.attachment[0].url, 'https://social.example/ipfs/image-storage');
	});

	it('keeps a stable encrypted actor key and signs outbound requests', async () => {
		const {module, models} = await createActivityPubHarness();

		const firstActor = await module.getGroupActor('test-channel');
		const secondActor = await module.getGroupActor('test-channel');
		assert.equal(firstActor.publicKey.publicKeyPem, secondActor.publicKey.publicKeyPem);
		assert.equal(models.ActivityPubActor.rows.length, 1);
		assert.notEqual(models.ActivityPubActor.rows[0].privateKeyPemEncrypted, (await module.getGroupActorKey('test-channel')).privateKeyPem);
		assert.match(models.ActivityPubActor.rows[0].privateKeyPemEncrypted, /^encrypted:/);

		const body = JSON.stringify({type: 'Follow'});
		const signedRequest = await module.signGroupRequest('test-channel', {
			method: 'POST',
			url: 'https://remote.example/inbox?x=1',
			body,
			date: new Date('2026-06-01T12:00:00Z')
		});
		const signature = parseSignatureHeader(signedRequest.headers.Signature);
		const verified = crypto
			.createVerify('RSA-SHA256')
			.update(signedRequest.signingString)
			.end()
			.verify(firstActor.publicKey.publicKeyPem, signature.signature, 'base64');

		assert.equal(verified, true);
		assert.equal(signature.keyId, 'https://social.example/ap/groups/test-channel#main-key');
		assert.deepEqual(signedRequest.signedHeaders, ['(request-target)', 'host', 'date', 'digest']);
		assert.equal(signedRequest.headers.Host, 'remote.example');
		assert.equal(signedRequest.headers.Date, 'Mon, 01 Jun 2026 12:00:00 GMT');
		assert.match(signedRequest.headers.Digest, /^SHA-256=/);
		await assert.rejects(() => module.signGroupRequest('test-channel', {
			method: 'GET',
			url: 'https://remote.example/inbox',
			date: 'invalid-date'
		}), /activitypub_signature_date_invalid/);
	});

	it('returns not found for disabled, mismatched, private, and invalid resources', async () => {
		const {module} = await createActivityPubHarness();

		await assert.rejects(() => module.getWebFingerResponse('acct:test-channel@other.example'), hasNotFoundCode);
		await assert.rejects(() => module.getGroupActor('private-channel'), hasNotFoundCode);
		await assert.rejects(() => module.getGroupPostNote('test-channel', 0), hasNotFoundCode);

		const disabledActor = await createActivityPubHarness();
		disabledActor.models.ActivityPubActor.rows.push(getActivityPubActorRow({isEnabled: false}));
		await assert.rejects(() => disabledActor.module.getGroupActor('test-channel'), hasNotFoundCode);

		const disabled = await createActivityPubHarness({
			config: {
				activityPubConfig: {
					enabled: false,
					publicUrl: '',
					domain: ''
				}
			}
		});
		await assert.rejects(() => disabled.module.getGroupActor('test-channel'), hasNotFoundCode);
	});
});

describe('activityPub API', () => {
	it('registers read-only unversioned routes with protocol content types', async () => {
		const routes = {};
		registerActivityPubApi({
			ms: {
				api: getApiStub(routes)
			}
		} as any, {
			getWebFingerResponse: async () => ({subject: 'acct:test-channel@example.com'}),
			getGroupActor: async () => ({id: 'https://social.example/ap/groups/test-channel'}),
			getGroupOutbox: async () => ({id: 'https://social.example/ap/groups/test-channel/outbox'}),
			getGroupPostNote: async () => ({id: 'https://social.example/ap/groups/test-channel/posts/7'})
		} as any);

		const webFinger = await callRoute(routes, 'GET .well-known/webfinger', {
			query: {resource: 'acct:test-channel@example.com'}
		});
		assert.equal(webFinger.headers['Content-Type'], 'application/jrd+json; charset=utf-8');
		assert.deepEqual(webFinger.body, {subject: 'acct:test-channel@example.com'});

		const actor = await callRoute(routes, 'GET ap/groups/:groupName', {
			params: {groupName: 'test-channel'}
		});
		assert.equal(actor.headers['Content-Type'], 'application/activity+json; charset=utf-8');
		assert.deepEqual(actor.body, {id: 'https://social.example/ap/groups/test-channel'});

		assert.ok(routes['GET ap/groups/:groupName/outbox']);
		assert.ok(routes['GET ap/groups/:groupName/posts/:localId']);
	});
});

async function createActivityPubHarness(overrides: any = {}) {
	const routes = {};
	const models = getModelsStub();
	const calls: any = {
		getGroupByParams: [],
		getGroupPosts: []
	};
	const group = getGroup();
	const publishedPost = getPublishedPost();
	const app = {
		config: overrides.config || {
			activityPubConfig: {
				enabled: true,
				publicUrl: 'https://social.example',
				domain: 'example.com'
			}
		},
		checkModules(modules) {
			assert.deepEqual(modules, ['api', 'group', 'database']);
		},
		encryptTextWithAppPass: async (value) => `encrypted:${Buffer.from(value).toString('base64')}`,
		decryptTextWithAppPass: async (value) => Buffer.from(value.replace(/^encrypted:/, ''), 'base64').toString(),
		ms: {
			api: getApiStub(routes),
			database: {},
			group: {
				async getGroupByParams(params) {
					calls.getGroupByParams.push(params);
					if (params.name === 'private-channel') {
						return {...group, name: 'private-channel', isPublic: false};
					}
					if (params.name !== group.name) {
						return null;
					}
					return group;
				},
				async getGroupPosts(groupId, filters, listParams) {
					calls.getGroupPosts.push({groupId, filters, listParams});
					return {
						list: [publishedPost],
						total: null
					};
				},
				async getGroupPostRefsByLocalIds(groupId, localIds) {
					if (Number(groupId) !== group.id || !localIds.includes('7')) {
						return [];
					}
					return [publishedPost];
				},
				async getPostContentDataWithUrl(_post, baseStorageUri) {
					return getContents(baseStorageUri);
				},
				async prepareContentDataWithUrl(content, baseStorageUri) {
					return {
						...content,
						type: content.mimeType.includes('image') ? 'image' : 'document',
						url: baseStorageUri + content.storageId
					};
				}
			}
		}
	};

	return {
		module: await activityPubModule(app as any, {models}),
		routes,
		calls,
		models
	};
}

function getApiStub(routes) {
	return {
		onUnversionGet(path, handler) {
			routes[`GET ${path}`] = handler;
		}
	};
}

async function callRoute(routes, key: string, req: any) {
	const headers = {};
	let body;
	let status;
	assert.ok(routes[key], `${key} route should be registered`);
	await routes[key]({
		params: {},
		query: {},
		...req
	}, {
		setHeader(name, value) {
			headers[name] = value;
		},
		send(responseBody, responseStatus) {
			body = responseBody;
			status = responseStatus;
		}
	});
	return {headers, body, status};
}

function hasNotFoundCode(error) {
	return error?.code === 404 && error?.message === 'activitypub_resource_not_found';
}

function getModelsStub() {
	const rows: any[] = [];
	return {
		ActivityPubActor: {
			rows,
			async findOne({where}) {
				return rows.find((row) => {
					return Object.keys(where).every((key) => row[key] === where[key]);
				}) || null;
			},
			async create(data) {
				const row = {
					...data,
					id: rows.length + 1,
					async update(updateData) {
						Object.assign(this, updateData);
						return this;
					}
				};
				rows.push(row);
				return row;
			},
			async destroy() {
				rows.length = 0;
			}
		}
	};
}

function getActivityPubActorRow(overrides: any = {}) {
	return {
		id: 1,
		entityType: 'group',
		entityId: 3,
		preferredUsername: 'test-channel',
		actorUrl: 'https://social.example/ap/groups/test-channel',
		inboxUrl: 'https://social.example/ap/groups/test-channel/inbox',
		outboxUrl: 'https://social.example/ap/groups/test-channel/outbox',
		followersUrl: 'https://social.example/ap/groups/test-channel/followers',
		followingUrl: 'https://social.example/ap/groups/test-channel/following',
		publicKeyPem: 'public-key',
		privateKeyPemEncrypted: 'encrypted:private-key',
		isEnabled: true,
		async update(updateData) {
			Object.assign(this, updateData);
			return this;
		},
		...overrides
	};
}

function parseSignatureHeader(value: string) {
	return value.split(',').reduce((result, item) => {
		const separatorIndex = item.indexOf('=');
		const rawKey = item.slice(0, separatorIndex);
		const rawValue = item.slice(separatorIndex + 1);
		result[rawKey] = rawValue.replace(/^"|"$/g, '');
		return result;
	}, {});
}

function getGroup() {
	return {
		id: 3,
		name: 'test-channel',
		title: 'Test Channel',
		description: 'A public test channel',
		homePage: 'https://social.example/groups/test-channel',
		type: GroupType.Channel,
		view: GroupView.TelegramLike,
		theme: 'default',
		isPublic: true,
		isOpen: true,
		isRemote: false,
		isReplyForbidden: false,
		creatorId: 1,
		avatarImage: {
			id: 21,
			storageId: 'avatar-storage',
			mimeType: ContentMimeType.ImagePng
		},
		storageUpdatedAt: new Date('2026-06-01T00:00:00Z'),
		staticStorageUpdatedAt: new Date('2026-06-01T00:00:00Z')
	} as any;
}

function getPublishedPost() {
	return {
		id: 11,
		status: PostStatus.Published,
		groupId: 3,
		userId: 1,
		localId: 7,
		publishedAt: new Date('2026-06-01T12:00:00Z'),
		isDeleted: false,
		isEncrypted: false,
		createdAt: new Date('2026-06-01T11:00:00Z'),
		updatedAt: new Date('2026-06-01T12:00:00Z')
	} as any;
}

function getContents(baseStorageUri: string) {
	return [
		{
			id: 101,
			type: 'text',
			text: 'Hello fediverse',
			storageId: 'text-storage',
			mimeType: ContentMimeType.Text,
			url: baseStorageUri + 'text-storage'
		},
		{
			id: 102,
			type: 'image',
			storageId: 'image-storage',
			mimeType: ContentMimeType.ImagePng,
			url: baseStorageUri + 'image-storage'
		}
	] as any[];
}
