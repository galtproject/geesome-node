import assert from 'node:assert';
import crypto from 'node:crypto';
import activityPubModule from '../app/modules/activityPub/index.js';
import registerActivityPubApi from '../app/modules/activityPub/api.js';
import {generateActivityPubRsaKeyPair, signActivityPubRequestWithKey} from '../app/modules/activityPub/signatureHelpers.js';
import {ActivityPubDeliveryState, ActivityPubFollowDirection, ActivityPubFollowState} from '../app/modules/activityPub/interface.js';
import {ContentMimeType} from '../app/modules/database/interface.js';
import {GroupType, GroupView, PostStatus} from '../app/modules/group/interface.js';

describe('activityPub module', () => {
	it('resolves WebFinger, actor, outbox, and post Note payloads for public groups', async () => {
		const {module, calls, models} = await createActivityPubHarness();

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

		const following = await module.getGroupFollowing('test-channel');
		assert.deepEqual(following, {
			'@context': 'https://www.w3.org/ns/activitystreams',
			id: 'https://social.example/ap/groups/test-channel/following',
			type: 'OrderedCollection',
			totalItems: 0,
			orderedItems: []
		});
		assert.equal(models.ActivityPubActor.rows.length, 0);

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
		assert.equal(models.ActivityPubObject.rows.length, 1);
		assert.equal(models.ActivityPubObject.rows[0].localActorId, models.ActivityPubActor.rows[0].id);
		assert.equal(models.ActivityPubObject.rows[0].localPostId, 11);
		assert.equal(models.ActivityPubObject.rows[0].activityId, 'https://social.example/ap/groups/test-channel/posts/7/activity/create');
		assert.equal(models.ActivityPubObject.rows[0].objectId, 'https://social.example/ap/groups/test-channel/posts/7');
		assert.equal(models.ActivityPubObject.rows[0].objectType, 'Note');
		assert.equal(models.ActivityPubObject.rows[0].origin, 'local');
		assert.equal(models.ActivityPubObject.rows[0].visibility, 'public');
		assert.equal(models.ActivityPubObject.rows[0].publishedAt.toISOString(), '2026-06-01T12:00:00.000Z');
		assert.equal(JSON.parse(models.ActivityPubObject.rows[0].rawJson).content, 'Hello fediverse');
		assert.deepEqual(calls.getGroupPosts[0].filters, {
			status: PostStatus.Published,
			isDeleted: false
		});
		assert.equal(calls.getGroupPosts[0].listParams.includeTotal, false);

		const note = await module.getGroupPostNote('test-channel', 7);
		assert.equal(note.id, 'https://social.example/ap/groups/test-channel/posts/7');
		assert.equal(note.attachment[0].url, 'https://social.example/ipfs/image-storage');
		assert.equal(models.ActivityPubObject.rows.length, 1);
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

	it('verifies signed group and shared inbox requests before activity handling', async () => {
		const remoteActorKey = getRemoteActorKey();
		const resolverCalls: any[] = [];
		const {module} = await createActivityPubHarness({
			resolveRemoteActorKey: async (input) => {
				resolverCalls.push(input);
				return {
					keyId: remoteActorKey.keyId,
					actorUrl: remoteActorKey.actorUrl,
					publicKeyPem: remoteActorKey.publicKeyPem
				};
			}
		});
		const activity = {
			type: 'Follow',
			actor: remoteActorKey.actorUrl,
			object: 'https://social.example/ap/groups/test-channel'
		};
		const request = getSignedInboxRequest(remoteActorKey, '/ap/groups/test-channel/inbox', activity);
		const verified = await module.verifyGroupInboxRequest('test-channel', request);
		const sharedVerified = await module.verifySharedInboxRequest({
			...getSignedInboxRequest(remoteActorKey, '/ap/shared-inbox', activity),
			url: '/ap/shared-inbox'
		});

		assert.equal(verified.keyId, remoteActorKey.keyId);
		assert.equal(verified.localActorUrl, 'https://social.example/ap/groups/test-channel');
		assert.equal(verified.activityType, 'Follow');
		assert.equal(verified.actor, remoteActorKey.actorUrl);
		assert.equal(sharedVerified.keyId, remoteActorKey.keyId);
		assert.equal(resolverCalls.length, 2);
		assert.deepEqual(resolverCalls[0], {
			keyId: remoteActorKey.keyId,
			actor: remoteActorKey.actorUrl,
			activity
		});
		await assert.rejects(() => module.verifyGroupInboxRequest('test-channel', {
			...request,
			rawBody: Buffer.from(JSON.stringify({...activity, type: 'Undo'}))
		}), /activitypub_digest_mismatch/);
	});

	it('fetches and caches remote actor keys for signed inbox requests', async () => {
		const remoteActorKey = getRemoteActorKey();
		const fetchCalls: string[] = [];
		const {module, models} = await createActivityPubHarness({
			fetchRemoteActor: async (actorUrl) => {
				fetchCalls.push(actorUrl);
				return getRemoteActorDocument(remoteActorKey);
			}
		});
		const activity = {
			type: 'Follow',
			actor: remoteActorKey.actorUrl,
			object: 'https://social.example/ap/groups/test-channel'
		};
		const firstRequest = getSignedInboxRequest(remoteActorKey, '/ap/groups/test-channel/inbox', activity);
		const secondRequest = getSignedInboxRequest(remoteActorKey, '/ap/shared-inbox', activity);
		const firstVerified = await module.verifyGroupInboxRequest('test-channel', firstRequest);
		const secondVerified = await module.verifySharedInboxRequest(secondRequest);
		const remoteActor = models.ActivityPubRemoteActor.rows[0];

		assert.equal(firstVerified.keyId, remoteActorKey.keyId);
		assert.equal(secondVerified.keyId, remoteActorKey.keyId);
		assert.deepEqual(fetchCalls, [remoteActorKey.actorUrl]);
		assert.equal(models.ActivityPubRemoteActor.rows.length, 1);
		assert.equal(remoteActor.actorUrl, remoteActorKey.actorUrl);
		assert.equal(remoteActor.publicKeyId, remoteActorKey.keyId);
		assert.equal(remoteActor.preferredUsername, 'alice');
		assert.equal(remoteActor.domain, 'remote.example');
		assert.equal(remoteActor.inboxUrl, 'https://remote.example/users/alice/inbox');
		assert.equal(remoteActor.sharedInboxUrl, 'https://remote.example/inbox');
		assert.equal(JSON.parse(remoteActor.rawJson).id, remoteActorKey.actorUrl);
	});

	it('records signed Follow activities for group inboxes idempotently', async () => {
		const remoteActorKey = getRemoteActorKey();
		const {module, models} = await createActivityPubHarness({
			fetchRemoteActor: async () => getRemoteActorDocument(remoteActorKey)
		});
		const activity = {
			id: 'https://remote.example/activities/follow-1',
			type: 'Follow',
			actor: remoteActorKey.actorUrl,
			object: 'https://social.example/ap/groups/test-channel'
		};
		const request = getSignedInboxRequest(remoteActorKey, '/ap/groups/test-channel/inbox', activity);
		const firstResult = await module.handleGroupInboxRequest('test-channel', request);
		const secondResult = await module.handleGroupInboxRequest('test-channel', request);
		const follow = models.ActivityPubFollow.rows[0];
		const delivery = models.ActivityPubDelivery.rows[0];
		const deliveryBody = JSON.parse(delivery.bodyJson);

		assert.equal(firstResult.ok, true);
		assert.equal(firstResult.accepted, true);
		assert.equal(firstResult.message, 'activitypub_follow_accepted');
		assert.equal(firstResult.activityType, 'Follow');
		assert.equal(firstResult.actor, remoteActorKey.actorUrl);
		assert.equal(firstResult.followState, ActivityPubFollowState.Accepted);
		assert.equal(secondResult.followId, firstResult.followId);
		assert.equal(secondResult.deliveryId, firstResult.deliveryId);
		assert.equal(models.ActivityPubFollow.rows.length, 1);
		assert.equal(models.ActivityPubDelivery.rows.length, 1);
		assert.equal(follow.localActorId, models.ActivityPubActor.rows[0].id);
		assert.equal(follow.remoteActorId, models.ActivityPubRemoteActor.rows[0].id);
		assert.equal(follow.direction, ActivityPubFollowDirection.Inbound);
		assert.equal(follow.state, ActivityPubFollowState.Accepted);
		assert.equal(follow.remoteActivityId, activity.id);
		assert.equal(follow.acceptedAt.toISOString(), '2026-06-01T12:00:00.000Z');
		assert.equal(JSON.parse(follow.rawActivityJson).id, activity.id);
		assert.equal(delivery.localActorId, models.ActivityPubActor.rows[0].id);
		assert.equal(delivery.remoteActorId, models.ActivityPubRemoteActor.rows[0].id);
		assert.equal(delivery.followId, follow.id);
		assert.equal(delivery.activityType, 'Accept');
		assert.equal(delivery.activityId, 'https://social.example/ap/groups/test-channel/activities/follows/1/accept');
		assert.equal(delivery.inboxUrl, 'https://remote.example/inbox');
		assert.equal(delivery.state, 'pending');
		assert.equal(delivery.nextAttemptAt.toISOString(), '2026-06-01T12:00:00.000Z');
		assert.equal(deliveryBody.type, 'Accept');
		assert.equal(deliveryBody.actor, 'https://social.example/ap/groups/test-channel');
		assert.deepEqual(deliveryBody.object, activity);
	});

	it('records signed Undo(Follow) activities and stops future post delivery', async () => {
		const remoteActorKey = getRemoteActorKey();
		const {module, models} = await createActivityPubHarness({
			fetchRemoteActor: async () => getRemoteActorDocument(remoteActorKey)
		});
		const followActivity = {
			id: 'https://remote.example/activities/follow-undo-1',
			type: 'Follow',
			actor: remoteActorKey.actorUrl,
			object: 'https://social.example/ap/groups/test-channel'
		};
		const undoActivity = {
			id: 'https://remote.example/activities/undo-follow-1',
			type: 'Undo',
			actor: remoteActorKey.actorUrl,
			object: followActivity
		};

		await module.handleGroupInboxRequest(
			'test-channel',
			getSignedInboxRequest(remoteActorKey, '/ap/groups/test-channel/inbox', followActivity)
		);
		const firstUndoResult = await module.handleGroupInboxRequest(
			'test-channel',
			getSignedInboxRequest(remoteActorKey, '/ap/groups/test-channel/inbox', undoActivity)
		);
		const secondUndoResult = await module.handleGroupInboxRequest(
			'test-channel',
			getSignedInboxRequest(remoteActorKey, '/ap/groups/test-channel/inbox', undoActivity)
		);
		const followers = await module.getGroupFollowers('test-channel', {limit: 10});
		const postDeliveryResult = await module.afterPostManifestUpdate(1, 11);
		const follow = models.ActivityPubFollow.rows[0];

		assert.equal(firstUndoResult.ok, true);
		assert.equal(firstUndoResult.accepted, false);
		assert.equal(firstUndoResult.message, 'activitypub_follow_cancelled');
		assert.equal(firstUndoResult.activityType, 'Undo');
		assert.equal(firstUndoResult.actor, remoteActorKey.actorUrl);
		assert.equal(firstUndoResult.followState, ActivityPubFollowState.Cancelled);
		assert.equal(secondUndoResult.followId, firstUndoResult.followId);
		assert.equal(secondUndoResult.followState, ActivityPubFollowState.Cancelled);
		assert.equal(models.ActivityPubFollow.rows.length, 1);
		assert.equal(models.ActivityPubDelivery.rows.length, 1);
		assert.equal(follow.state, ActivityPubFollowState.Cancelled);
		assert.equal(follow.remoteActivityId, followActivity.id);
		assert.equal(follow.acceptedAt, null);
		assert.equal(follow.rejectedAt.toISOString(), '2026-06-01T12:00:00.000Z');
		assert.equal(JSON.parse(follow.rawActivityJson).id, undoActivity.id);
		assert.equal(followers.totalItems, 0);
		assert.deepEqual(followers.orderedItems, []);
		assert.equal(postDeliveryResult.queued, 0);
		assert.deepEqual(postDeliveryResult.deliveryIds, []);
		assert.equal(models.ActivityPubDelivery.rows.length, 1);
	});

	it('records signed Block activities and stops future post delivery', async () => {
		const remoteActorKey = getRemoteActorKey();
		const {module, models} = await createActivityPubHarness({
			fetchRemoteActor: async () => getRemoteActorDocument(remoteActorKey)
		});
		const followActivity = {
			id: 'https://remote.example/activities/follow-block-1',
			type: 'Follow',
			actor: remoteActorKey.actorUrl,
			object: 'https://social.example/ap/groups/test-channel'
		};
		const blockActivity = {
			id: 'https://remote.example/activities/block-group-1',
			type: 'Block',
			actor: remoteActorKey.actorUrl,
			object: 'https://social.example/ap/groups/test-channel'
		};

		await module.handleGroupInboxRequest(
			'test-channel',
			getSignedInboxRequest(remoteActorKey, '/ap/groups/test-channel/inbox', followActivity)
		);
		const firstBlockResult = await module.handleGroupInboxRequest(
			'test-channel',
			getSignedInboxRequest(remoteActorKey, '/ap/groups/test-channel/inbox', blockActivity)
		);
		const secondBlockResult = await module.handleGroupInboxRequest(
			'test-channel',
			getSignedInboxRequest(remoteActorKey, '/ap/groups/test-channel/inbox', blockActivity)
		);
		const followers = await module.getGroupFollowers('test-channel', {limit: 10});
		const postDeliveryResult = await module.afterPostManifestUpdate(1, 11);
		const follow = models.ActivityPubFollow.rows[0];

		assert.equal(firstBlockResult.ok, true);
		assert.equal(firstBlockResult.accepted, true);
		assert.equal(firstBlockResult.message, 'activitypub_block_accepted');
		assert.equal(firstBlockResult.activityType, 'Block');
		assert.equal(firstBlockResult.actor, remoteActorKey.actorUrl);
		assert.equal(firstBlockResult.followState, ActivityPubFollowState.Cancelled);
		assert.equal(secondBlockResult.followId, firstBlockResult.followId);
		assert.equal(secondBlockResult.followState, ActivityPubFollowState.Cancelled);
		assert.equal(models.ActivityPubFollow.rows.length, 1);
		assert.equal(models.ActivityPubDelivery.rows.length, 1);
		assert.equal(follow.state, ActivityPubFollowState.Cancelled);
		assert.equal(follow.remoteActivityId, blockActivity.id);
		assert.equal(follow.acceptedAt, null);
		assert.equal(follow.rejectedAt.toISOString(), '2026-06-01T12:00:00.000Z');
		assert.equal(JSON.parse(follow.rawActivityJson).id, blockActivity.id);
		assert.equal(followers.totalItems, 0);
		assert.deepEqual(followers.orderedItems, []);
		assert.equal(postDeliveryResult.queued, 0);
		assert.deepEqual(postDeliveryResult.deliveryIds, []);
		assert.equal(models.ActivityPubDelivery.rows.length, 1);
	});

	it('rejects signed Block activities for a different local actor object', async () => {
		const remoteActorKey = getRemoteActorKey();
		const {module, models} = await createActivityPubHarness({
			fetchRemoteActor: async () => getRemoteActorDocument(remoteActorKey)
		});
		const activity = {
			id: 'https://remote.example/activities/block-group-2',
			type: 'Block',
			actor: remoteActorKey.actorUrl,
			object: 'https://social.example/ap/groups/other-channel'
		};

		await assert.rejects(() => module.handleGroupInboxRequest(
			'test-channel',
			getSignedInboxRequest(remoteActorKey, '/ap/groups/test-channel/inbox', activity)
		), /activitypub_block_object_mismatch/);
		assert.equal(models.ActivityPubFollow.rows.length, 0);
	});

	it('rejects signed Undo(Follow) activities for a different remote actor', async () => {
		const remoteActorKey = getRemoteActorKey();
		const {module, models} = await createActivityPubHarness({
			fetchRemoteActor: async () => getRemoteActorDocument(remoteActorKey)
		});
		const activity = {
			id: 'https://remote.example/activities/undo-follow-2',
			type: 'Undo',
			actor: remoteActorKey.actorUrl,
			object: {
				id: 'https://remote.example/activities/follow-undo-2',
				type: 'Follow',
				actor: 'https://remote.example/users/bob',
				object: 'https://social.example/ap/groups/test-channel'
			}
		};

		await assert.rejects(() => module.handleGroupInboxRequest(
			'test-channel',
			getSignedInboxRequest(remoteActorKey, '/ap/groups/test-channel/inbox', activity)
		), /activitypub_undo_follow_actor_mismatch/);
		assert.equal(models.ActivityPubFollow.rows.length, 0);
		assert.equal(models.ActivityPubActor.rows.length, 0);
	});

	it('rejects signed Follow activities for a different local actor object', async () => {
		const remoteActorKey = getRemoteActorKey();
		const {module, models} = await createActivityPubHarness({
			fetchRemoteActor: async () => getRemoteActorDocument(remoteActorKey)
		});
		const activity = {
			id: 'https://remote.example/activities/follow-2',
			type: 'Follow',
			actor: remoteActorKey.actorUrl,
			object: 'https://social.example/ap/groups/other-channel'
		};

		await assert.rejects(() => module.handleGroupInboxRequest(
			'test-channel',
			getSignedInboxRequest(remoteActorKey, '/ap/groups/test-channel/inbox', activity)
		), /activitypub_follow_object_mismatch/);
		assert.equal(models.ActivityPubFollow.rows.length, 0);
	});

	it('lists accepted inbound followers for a group actor', async () => {
		const remoteActorKey = getRemoteActorKey();
		const {module, models} = await createActivityPubHarness({
			fetchRemoteActor: async () => getRemoteActorDocument(remoteActorKey)
		});
		const activity = {
			id: 'https://remote.example/activities/follow-3',
			type: 'Follow',
			actor: remoteActorKey.actorUrl,
			object: 'https://social.example/ap/groups/test-channel'
		};

		await module.handleGroupInboxRequest(
			'test-channel',
			getSignedInboxRequest(remoteActorKey, '/ap/groups/test-channel/inbox', activity)
		);
		models.ActivityPubRemoteActor.rows.push(getActivityPubRemoteActorRow({
			id: 99,
			actorUrl: 'https://remote.example/users/pending'
		}));
		models.ActivityPubFollow.rows.push(getActivityPubFollowRow({
			id: 99,
			localActorId: models.ActivityPubActor.rows[0].id,
			remoteActorId: 99,
			state: ActivityPubFollowState.Pending
		}));

		const followers = await module.getGroupFollowers('test-channel', {limit: 10});

		assert.equal(followers.id, 'https://social.example/ap/groups/test-channel/followers');
		assert.equal(followers.type, 'OrderedCollection');
		assert.equal(followers.totalItems, 1);
		assert.deepEqual(followers.orderedItems, [remoteActorKey.actorUrl]);
	});

	it('processes due delivery rows and marks successful sends delivered', async () => {
		const remoteActorKey = getRemoteActorKey();
		const deliveryRequests: any[] = [];
		const {module, models} = await createActivityPubHarness({
			fetchRemoteActor: async () => getRemoteActorDocument(remoteActorKey),
			deliverActivityPubRequest: async (request) => {
				deliveryRequests.push(request);
				return {ok: true, status: 202};
			}
		});
		const activity = {
			id: 'https://remote.example/activities/follow-4',
			type: 'Follow',
			actor: remoteActorKey.actorUrl,
			object: 'https://social.example/ap/groups/test-channel'
		};

		await module.handleGroupInboxRequest(
			'test-channel',
			getSignedInboxRequest(remoteActorKey, '/ap/groups/test-channel/inbox', activity)
		);
		const result = await module.processDeliveryQueue({now: new Date('2026-06-01T12:00:00Z')});
		const delivery = models.ActivityPubDelivery.rows[0];
		const sentRequest = deliveryRequests[0];

		assert.deepEqual(result, {processed: 1, delivered: 1, failed: 0});
		assert.equal(deliveryRequests.length, 1);
		assert.equal(sentRequest.method, 'POST');
		assert.equal(sentRequest.url, 'https://remote.example/inbox');
		assert.match(sentRequest.headers.Signature, /keyId="https:\/\/social\.example\/ap\/groups\/test-channel#main-key"/);
		assert.equal(sentRequest.headers['Content-Type'], 'application/activity+json; charset=utf-8');
		assert.match(sentRequest.headers.Digest, /^SHA-256=/);
		assert.equal(JSON.parse(sentRequest.body).type, 'Accept');
		assert.equal(delivery.state, 'delivered');
		assert.equal(delivery.attempts, 1);
		assert.equal(delivery.deliveredAt.toISOString(), '2026-06-01T12:00:00.000Z');
		assert.equal(delivery.lastError, null);
	});

	it('reschedules failed deliveries with retry metadata', async () => {
		const remoteActorKey = getRemoteActorKey();
		const {module, models} = await createActivityPubHarness({
			fetchRemoteActor: async () => getRemoteActorDocument(remoteActorKey),
			deliverActivityPubRequest: async () => ({ok: false, status: 503})
		});
		const activity = {
			id: 'https://remote.example/activities/follow-5',
			type: 'Follow',
			actor: remoteActorKey.actorUrl,
			object: 'https://social.example/ap/groups/test-channel'
		};

		await module.handleGroupInboxRequest(
			'test-channel',
			getSignedInboxRequest(remoteActorKey, '/ap/groups/test-channel/inbox', activity)
		);
		const result = await module.processDeliveryQueue({
			now: new Date('2026-06-01T12:00:00Z'),
			retryDelayMs: 1000,
			maxAttempts: 2
		});
		const delivery = models.ActivityPubDelivery.rows[0];

		assert.deepEqual(result, {processed: 1, delivered: 0, failed: 1});
		assert.equal(delivery.state, 'pending');
		assert.equal(delivery.attempts, 1);
		assert.equal(delivery.nextAttemptAt.toISOString(), '2026-06-01T12:00:01.000Z');
		assert.equal(delivery.deliveredAt, null);
		assert.match(delivery.lastError, /activitypub_delivery_request_failed:503/);
	});

	it('marks delivery rows failed after max attempts', async () => {
		const remoteActorKey = getRemoteActorKey();
		const {module, models} = await createActivityPubHarness({
			fetchRemoteActor: async () => getRemoteActorDocument(remoteActorKey),
			deliverActivityPubRequest: async () => {
				throw new Error('remote inbox unavailable');
			}
		});
		const activity = {
			id: 'https://remote.example/activities/follow-6',
			type: 'Follow',
			actor: remoteActorKey.actorUrl,
			object: 'https://social.example/ap/groups/test-channel'
		};

		await module.handleGroupInboxRequest(
			'test-channel',
			getSignedInboxRequest(remoteActorKey, '/ap/groups/test-channel/inbox', activity)
		);
		const result = await module.processDeliveryQueue({
			now: new Date('2026-06-01T12:00:00Z'),
			maxAttempts: 1
		});
		const delivery = models.ActivityPubDelivery.rows[0];

		assert.deepEqual(result, {processed: 1, delivered: 0, failed: 1});
		assert.equal(delivery.state, 'failed');
		assert.equal(delivery.attempts, 1);
		assert.equal(delivery.nextAttemptAt.toISOString(), '2026-06-01T12:00:00.000Z');
		assert.equal(delivery.deliveredAt, null);
		assert.match(delivery.lastError, /remote inbox unavailable/);
	});

	it('claims due delivery rows before sending when claim columns are available', async () => {
		const remoteActorKey = getRemoteActorKey();
		const deliveryRequests: any[] = [];
		const {module, models} = await createActivityPubHarness({
			deliveryClaimsSupported: true,
			fetchRemoteActor: async () => getRemoteActorDocument(remoteActorKey),
			deliverActivityPubRequest: async (request) => {
				deliveryRequests.push(request);
				assert.equal(request.delivery.deliveryClaimedAt.toISOString(), '2026-06-01T12:00:00.000Z');
				assert.equal(request.delivery.deliveryClaimExpiresAt.toISOString(), '2026-06-01T12:00:02.000Z');
				return {ok: true, status: 202};
			}
		});
		const activity = {
			id: 'https://remote.example/activities/follow-7',
			type: 'Follow',
			actor: remoteActorKey.actorUrl,
			object: 'https://social.example/ap/groups/test-channel'
		};

		await module.handleGroupInboxRequest(
			'test-channel',
			getSignedInboxRequest(remoteActorKey, '/ap/groups/test-channel/inbox', activity)
		);
		const result = await module.processDeliveryQueue({
			now: new Date('2026-06-01T12:00:00Z'),
			claimTtlMs: 2000
		});
		const delivery = models.ActivityPubDelivery.rows[0];

		assert.deepEqual(result, {processed: 1, delivered: 1, failed: 0});
		assert.equal(deliveryRequests.length, 1);
		assert.equal(delivery.deliveryClaimedAt, null);
		assert.equal(delivery.deliveryClaimExpiresAt, null);
		assert.equal(delivery.state, ActivityPubDeliveryState.Delivered);
	});

	it('queues outbound Create delivery for accepted followers after post manifest updates', async () => {
		const remoteActorKey = getRemoteActorKey();
		const {module, models} = await createActivityPubHarness({
			fetchRemoteActor: async () => getRemoteActorDocument(remoteActorKey)
		});
		const followActivity = {
			id: 'https://remote.example/activities/follow-8',
			type: 'Follow',
			actor: remoteActorKey.actorUrl,
			object: 'https://social.example/ap/groups/test-channel'
		};

		await module.handleGroupInboxRequest(
			'test-channel',
			getSignedInboxRequest(remoteActorKey, '/ap/groups/test-channel/inbox', followActivity)
		);
		const firstResult = await module.afterPostManifestUpdate(1, 11);
		const secondResult = await module.afterPostManifestUpdate(1, 11);
		const createDelivery = models.ActivityPubDelivery.rows.find((delivery) => delivery.activityType === 'Create');
		const deliveryBody = JSON.parse(createDelivery.bodyJson);

		assert.equal(firstResult.queued, 1);
		assert.deepEqual(secondResult.deliveryIds, firstResult.deliveryIds);
		assert.equal(models.ActivityPubObject.rows.length, 1);
		assert.equal(models.ActivityPubDelivery.rows.length, 2);
		assert.equal(createDelivery.localActorId, models.ActivityPubActor.rows[0].id);
		assert.equal(createDelivery.remoteActorId, models.ActivityPubRemoteActor.rows[0].id);
		assert.equal(createDelivery.followId, models.ActivityPubFollow.rows[0].id);
		assert.equal(createDelivery.activityId, 'https://social.example/ap/groups/test-channel/posts/7/activity/create');
		assert.equal(createDelivery.inboxUrl, 'https://remote.example/inbox');
		assert.equal(createDelivery.state, ActivityPubDeliveryState.Pending);
		assert.equal(deliveryBody.type, 'Create');
		assert.equal(deliveryBody.actor, 'https://social.example/ap/groups/test-channel');
		assert.equal(deliveryBody.object.id, 'https://social.example/ap/groups/test-channel/posts/7');
		assert.equal(deliveryBody.object.content, 'Hello fediverse');
	});

	it('records signed shared-inbox Create replies to known local objects idempotently', async () => {
		const remoteActorKey = getRemoteActorKey();
		const {module, models} = await createActivityPubHarness({
			fetchRemoteActor: async () => getRemoteActorDocument(remoteActorKey)
		});

		await module.getGroupPostNote('test-channel', 7);
		const activity = {
			id: 'https://remote.example/activities/create-reply-1',
			type: 'Create',
			actor: remoteActorKey.actorUrl,
			to: ['https://www.w3.org/ns/activitystreams#Public'],
			object: {
				id: 'https://remote.example/objects/reply-1',
				type: 'Note',
				attributedTo: remoteActorKey.actorUrl,
				inReplyTo: 'https://social.example/ap/groups/test-channel/posts/7',
				to: ['https://www.w3.org/ns/activitystreams#Public'],
				content: 'Remote reply',
				published: '2026-06-01T12:05:00Z'
			}
		};
		const firstResult = await module.handleSharedInboxRequest(
			getSignedInboxRequest(remoteActorKey, '/ap/shared-inbox', activity)
		);
		const secondResult = await module.handleSharedInboxRequest(
			getSignedInboxRequest(remoteActorKey, '/ap/shared-inbox', activity)
		);
		const remoteObject = models.ActivityPubObject.rows.find((row) => row.origin === 'remote');

		assert.equal(firstResult.ok, true);
		assert.equal(firstResult.accepted, true);
		assert.equal(firstResult.message, 'activitypub_create_object_recorded');
		assert.equal(firstResult.activityType, 'Create');
		assert.equal(firstResult.actor, remoteActorKey.actorUrl);
		assert.equal(firstResult.objectId, 'https://remote.example/objects/reply-1');
		assert.equal(firstResult.inReplyTo, 'https://social.example/ap/groups/test-channel/posts/7');
		assert.equal(secondResult.activityPubObjectId, firstResult.activityPubObjectId);
		assert.equal(models.ActivityPubObject.rows.length, 2);
		assert.equal(remoteObject.localActorId, models.ActivityPubObject.rows[0].localActorId);
		assert.equal(remoteObject.localPostId, null);
		assert.equal(remoteObject.remoteActorId, models.ActivityPubRemoteActor.rows[0].id);
		assert.equal(remoteObject.remoteObjectUrl, 'https://remote.example/objects/reply-1');
		assert.equal(remoteObject.activityId, activity.id);
		assert.equal(remoteObject.objectId, activity.object.id);
		assert.equal(remoteObject.objectType, 'Note');
		assert.equal(remoteObject.visibility, 'public');
		assert.equal(remoteObject.publishedAt.toISOString(), '2026-06-01T12:05:00.000Z');
		assert.equal(JSON.parse(remoteObject.rawJson).content, 'Remote reply');
	});

	it('tombstones signed shared-inbox Delete for cached remote objects idempotently', async () => {
		const remoteActorKey = getRemoteActorKey();
		const {module, models} = await createActivityPubHarness({
			fetchRemoteActor: async () => getRemoteActorDocument(remoteActorKey)
		});

		await module.getGroupPostNote('test-channel', 7);
		const createActivity = {
			id: 'https://remote.example/activities/create-reply-delete-1',
			type: 'Create',
			actor: remoteActorKey.actorUrl,
			to: ['https://www.w3.org/ns/activitystreams#Public'],
			object: {
				id: 'https://remote.example/objects/reply-delete-1',
				type: 'Note',
				attributedTo: remoteActorKey.actorUrl,
				inReplyTo: 'https://social.example/ap/groups/test-channel/posts/7',
				to: ['https://www.w3.org/ns/activitystreams#Public'],
				content: 'Remote reply to delete',
				published: '2026-06-01T12:05:00Z'
			}
		};
		const deleteActivity = {
			id: 'https://remote.example/activities/delete-reply-1',
			type: 'Delete',
			actor: remoteActorKey.actorUrl,
			object: createActivity.object.id
		};

		await module.handleSharedInboxRequest(
			getSignedInboxRequest(remoteActorKey, '/ap/shared-inbox', createActivity)
		);
		const firstDeleteResult = await module.handleSharedInboxRequest(
			getSignedInboxRequest(remoteActorKey, '/ap/shared-inbox', deleteActivity)
		);
		const secondDeleteResult = await module.handleSharedInboxRequest(
			getSignedInboxRequest(remoteActorKey, '/ap/shared-inbox', deleteActivity)
		);
		const remoteObject = models.ActivityPubObject.rows.find((row) => row.origin === 'remote');

		assert.equal(firstDeleteResult.ok, true);
		assert.equal(firstDeleteResult.accepted, true);
		assert.equal(firstDeleteResult.message, 'activitypub_delete_object_tombstoned');
		assert.equal(firstDeleteResult.activityType, 'Delete');
		assert.equal(firstDeleteResult.actor, remoteActorKey.actorUrl);
		assert.equal(firstDeleteResult.objectId, createActivity.object.id);
		assert.equal(secondDeleteResult.activityPubObjectId, firstDeleteResult.activityPubObjectId);
		assert.equal(models.ActivityPubObject.rows.length, 2);
		assert.equal(remoteObject.objectId, createActivity.object.id);
		assert.equal(remoteObject.remoteObjectUrl, createActivity.object.id);
		assert.equal(remoteObject.objectType, 'Tombstone');
		assert.equal(remoteObject.activityId, deleteActivity.id);
		assert.equal(JSON.parse(remoteObject.rawJson).id, deleteActivity.id);
		await assert.rejects(() => module.handleSharedInboxRequest(
			getSignedInboxRequest(remoteActorKey, '/ap/shared-inbox', createActivity)
		), /activitypub_object_tombstoned/);
	});

	it('rejects shared-inbox Delete for another remote actor object', async () => {
		const remoteActorKey = getRemoteActorKey();
		const otherRemoteActorKey = {
			...getRemoteActorKey(),
			actorUrl: 'https://remote.example/users/bob',
			keyId: 'https://remote.example/users/bob#main-key'
		};
		const {module, models} = await createActivityPubHarness({
			fetchRemoteActor: async (actorUrl) => {
				if (actorUrl === otherRemoteActorKey.actorUrl) {
					return getRemoteActorDocument(otherRemoteActorKey);
				}
				return getRemoteActorDocument(remoteActorKey);
			}
		});

		await module.getGroupPostNote('test-channel', 7);
		const createActivity = {
			id: 'https://remote.example/activities/create-reply-delete-2',
			type: 'Create',
			actor: remoteActorKey.actorUrl,
			object: {
				id: 'https://remote.example/objects/reply-delete-2',
				type: 'Note',
				attributedTo: remoteActorKey.actorUrl,
				inReplyTo: 'https://social.example/ap/groups/test-channel/posts/7',
				content: 'Remote reply'
			}
		};
		const deleteActivity = {
			id: 'https://remote.example/activities/delete-reply-2',
			type: 'Delete',
			actor: otherRemoteActorKey.actorUrl,
			object: createActivity.object.id
		};

		await module.handleSharedInboxRequest(
			getSignedInboxRequest(remoteActorKey, '/ap/shared-inbox', createActivity)
		);
		await assert.rejects(() => module.handleSharedInboxRequest(
			getSignedInboxRequest(otherRemoteActorKey, '/ap/shared-inbox', deleteActivity)
		), /activitypub_delete_object_actor_mismatch/);
		assert.equal(models.ActivityPubObject.rows.find((row) => row.origin === 'remote').objectType, 'Note');
	});

	it('tombstones signed shared-inbox Undo(Create) for cached remote objects idempotently', async () => {
		const remoteActorKey = getRemoteActorKey();
		const {module, models} = await createActivityPubHarness({
			fetchRemoteActor: async () => getRemoteActorDocument(remoteActorKey)
		});

		await module.getGroupPostNote('test-channel', 7);
		const createActivity = {
			id: 'https://remote.example/activities/create-reply-undo-1',
			type: 'Create',
			actor: remoteActorKey.actorUrl,
			object: {
				id: 'https://remote.example/objects/reply-undo-1',
				type: 'Note',
				attributedTo: remoteActorKey.actorUrl,
				inReplyTo: 'https://social.example/ap/groups/test-channel/posts/7',
				content: 'Remote reply to undo'
			}
		};
		const undoActivity = {
			id: 'https://remote.example/activities/undo-create-reply-1',
			type: 'Undo',
			actor: remoteActorKey.actorUrl,
			object: createActivity
		};

		await module.handleSharedInboxRequest(
			getSignedInboxRequest(remoteActorKey, '/ap/shared-inbox', createActivity)
		);
		const firstUndoResult = await module.handleSharedInboxRequest(
			getSignedInboxRequest(remoteActorKey, '/ap/shared-inbox', undoActivity)
		);
		const secondUndoResult = await module.handleSharedInboxRequest(
			getSignedInboxRequest(remoteActorKey, '/ap/shared-inbox', undoActivity)
		);
		const remoteObject = models.ActivityPubObject.rows.find((row) => row.origin === 'remote');

		assert.equal(firstUndoResult.ok, true);
		assert.equal(firstUndoResult.accepted, true);
		assert.equal(firstUndoResult.message, 'activitypub_undo_create_object_tombstoned');
		assert.equal(firstUndoResult.activityType, 'Undo');
		assert.equal(firstUndoResult.actor, remoteActorKey.actorUrl);
		assert.equal(firstUndoResult.objectId, createActivity.object.id);
		assert.equal(secondUndoResult.activityPubObjectId, firstUndoResult.activityPubObjectId);
		assert.equal(models.ActivityPubObject.rows.length, 2);
		assert.equal(remoteObject.objectId, createActivity.object.id);
		assert.equal(remoteObject.objectType, 'Tombstone');
		assert.equal(remoteObject.activityId, undoActivity.id);
		assert.equal(JSON.parse(remoteObject.rawJson).id, undoActivity.id);
		await assert.rejects(() => module.handleSharedInboxRequest(
			getSignedInboxRequest(remoteActorKey, '/ap/shared-inbox', createActivity)
		), /activitypub_object_tombstoned/);
	});

	it('rejects shared-inbox Undo(Create) for another remote actor object', async () => {
		const remoteActorKey = getRemoteActorKey();
		const otherRemoteActorKey = {
			...getRemoteActorKey(),
			actorUrl: 'https://remote.example/users/bob',
			keyId: 'https://remote.example/users/bob#main-key'
		};
		const {module, models} = await createActivityPubHarness({
			fetchRemoteActor: async (actorUrl) => {
				if (actorUrl === otherRemoteActorKey.actorUrl) {
					return getRemoteActorDocument(otherRemoteActorKey);
				}
				return getRemoteActorDocument(remoteActorKey);
			}
		});

		await module.getGroupPostNote('test-channel', 7);
		const createActivity = {
			id: 'https://remote.example/activities/create-reply-undo-2',
			type: 'Create',
			actor: remoteActorKey.actorUrl,
			object: {
				id: 'https://remote.example/objects/reply-undo-2',
				type: 'Note',
				attributedTo: remoteActorKey.actorUrl,
				inReplyTo: 'https://social.example/ap/groups/test-channel/posts/7',
				content: 'Remote reply'
			}
		};
		const undoActivity = {
			id: 'https://remote.example/activities/undo-create-reply-2',
			type: 'Undo',
			actor: otherRemoteActorKey.actorUrl,
			object: createActivity
		};

		await module.handleSharedInboxRequest(
			getSignedInboxRequest(remoteActorKey, '/ap/shared-inbox', createActivity)
		);
		await assert.rejects(() => module.handleSharedInboxRequest(
			getSignedInboxRequest(otherRemoteActorKey, '/ap/shared-inbox', undoActivity)
		), /activitypub_undo_create_actor_mismatch/);
		assert.equal(models.ActivityPubObject.rows.find((row) => row.origin === 'remote').objectType, 'Note');
	});
});

describe('activityPub API', () => {
	it('registers public unversioned routes with protocol content types', async () => {
		const routes = {};
		registerActivityPubApi({
			ms: {
				api: getApiStub(routes)
			}
		} as any, {
			getWebFingerResponse: async () => ({subject: 'acct:test-channel@example.com'}),
			getGroupActor: async () => ({id: 'https://social.example/ap/groups/test-channel'}),
			getGroupOutbox: async () => ({id: 'https://social.example/ap/groups/test-channel/outbox'}),
			getGroupFollowers: async () => ({id: 'https://social.example/ap/groups/test-channel/followers'}),
			getGroupFollowing: async () => ({id: 'https://social.example/ap/groups/test-channel/following'}),
			getGroupPostNote: async () => ({id: 'https://social.example/ap/groups/test-channel/posts/7'}),
			handleGroupInboxRequest: async () => ({
				ok: true,
				accepted: true,
				message: 'activitypub_follow_accepted',
				activityType: 'Follow',
				followState: ActivityPubFollowState.Accepted
			}),
			verifyGroupInboxRequest: async () => ({keyId: 'https://remote.example/users/alice#main-key'}),
			verifySharedInboxRequest: async () => ({keyId: 'https://remote.example/users/alice#main-key'}),
			handleSharedInboxRequest: async () => ({
				ok: true,
				accepted: true,
				message: 'activitypub_create_object_recorded',
				activityType: 'Create'
			})
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
		const followers = await callRoute(routes, 'GET ap/groups/:groupName/followers', {
			params: {groupName: 'test-channel'}
		});
		assert.equal(followers.headers['Content-Type'], 'application/activity+json; charset=utf-8');
		assert.deepEqual(followers.body, {id: 'https://social.example/ap/groups/test-channel/followers'});

		const following = await callRoute(routes, 'GET ap/groups/:groupName/following', {
			params: {groupName: 'test-channel'}
		});
		assert.equal(following.headers['Content-Type'], 'application/activity+json; charset=utf-8');
		assert.deepEqual(following.body, {id: 'https://social.example/ap/groups/test-channel/following'});

		assert.ok(routes['GET ap/groups/:groupName/posts/:localId']);

		const groupInbox = await callRoute(routes, 'POST ap/groups/:groupName/inbox', {
			params: {groupName: 'test-channel'},
			headers: {},
			body: {type: 'Follow'},
			rawBody: Buffer.from('{"type":"Follow"}')
		});
		assert.equal(groupInbox.headers['Content-Type'], 'application/activity+json; charset=utf-8');
		assert.equal(groupInbox.status, 202);
		assert.deepEqual(groupInbox.body, {
			ok: true,
			accepted: true,
			message: 'activitypub_follow_accepted',
			activityType: 'Follow',
			followState: ActivityPubFollowState.Accepted
		});

		const sharedInbox = await callRoute(routes, 'POST ap/shared-inbox', {
			headers: {},
			body: {type: 'Create'},
			rawBody: Buffer.from('{"type":"Create"}')
		});
		assert.equal(sharedInbox.status, 202);
		assert.deepEqual(sharedInbox.body, {
			ok: true,
			accepted: true,
			message: 'activitypub_create_object_recorded',
			activityType: 'Create'
		});

		const routesWithError = {};
		registerActivityPubApi({
			ms: {
				api: getApiStub(routesWithError)
			}
		} as any, {
			handleGroupInboxRequest: async () => {
				const error = new Error('activitypub_signature_required') as Error & {code?: number};
				error.code = 401;
				throw error;
			},
			verifySharedInboxRequest: async () => ({}),
			handleSharedInboxRequest: async () => ({})
		} as any);
		const rejectedInbox = await callRoute(routesWithError, 'POST ap/groups/:groupName/inbox', {
			params: {groupName: 'test-channel'},
			headers: {},
			body: {type: 'Follow'},
			rawBody: Buffer.from('{"type":"Follow"}')
		});
		assert.equal(rejectedInbox.status, 401);
		assert.deepEqual(rejectedInbox.body, {
			ok: false,
			accepted: false,
			message: 'activitypub_signature_required'
		});
	});
});

async function createActivityPubHarness(overrides: any = {}) {
	const routes = {};
	const models = getModelsStub();
	if (overrides.deliveryClaimsSupported) {
		setupActivityPubDeliveryClaims(models);
	}
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
				domain: 'example.com',
				deliveryWorker: false
			}
		},
		checkModules(modules) {
			assert.deepEqual(modules, ['api', 'group', 'database']);
		},
		encryptTextWithAppPass: async (value) => `encrypted:${Buffer.from(value).toString('base64')}`,
		decryptTextWithAppPass: async (value) => Buffer.from(value.replace(/^encrypted:/, ''), 'base64').toString(),
		ms: {
			api: getApiStub(routes),
			database: {
				setDefaultListParamsValues(listParams, defaults = {}) {
					listParams.limit = Number(listParams.limit || defaults.limit || 20);
					listParams.offset = Number(listParams.offset || defaults.offset || 0);
					listParams.sortBy = listParams.sortBy || defaults.sortBy || 'createdAt';
					listParams.sortDir = listParams.sortDir || defaults.sortDir || 'DESC';
				}
			},
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
				async getPostPure(postId) {
					if (Number(postId) !== publishedPost.id) {
						return null;
					}
					return {
						...publishedPost,
						group
					};
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
		module: await activityPubModule(app as any, {
			models,
			resolveRemoteActorKey: overrides.resolveRemoteActorKey,
			fetchRemoteActor: overrides.fetchRemoteActor,
			remoteActorCacheMaxAgeMs: overrides.remoteActorCacheMaxAgeMs,
			deliverActivityPubRequest: overrides.deliverActivityPubRequest
		}),
		routes,
		calls,
		models
	};
}

function getApiStub(routes) {
	return {
		onUnversionGet(path, handler) {
			routes[`GET ${path}`] = handler;
		},
		onUnversionPost(path, handler) {
			routes[`POST ${path}`] = handler;
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
	const models = {
		ActivityPubActor: getModelStub(),
		ActivityPubRemoteActor: getModelStub(),
		ActivityPubFollow: getModelStub(),
		ActivityPubObject: getModelStub(),
		ActivityPubDelivery: getModelStub()
	};

	return models;
}

function setupActivityPubDeliveryClaims(models) {
	models.activityPubDeliveryClaimsSupported = true;
	models.ActivityPubDelivery.claimDueForDelivery = async ({now, claimExpiresAt, limit}) => {
		const claimedDeliveries = [];
		const dueDeliveries = [...models.ActivityPubDelivery.rows]
			.filter((delivery) => isDeliveryClaimable(delivery, now))
			.sort(compareDeliveryClaimOrder);

		for (const delivery of dueDeliveries) {
			if (claimedDeliveries.length >= limit) {
				break;
			}
			delivery.deliveryClaimedAt = now;
			delivery.deliveryClaimExpiresAt = claimExpiresAt;
			claimedDeliveries.push(delivery);
		}

		return claimedDeliveries;
	};
}

function isDeliveryClaimable(delivery, now: Date): boolean {
	if (delivery.state !== ActivityPubDeliveryState.Pending) {
		return false;
	}
	if (compareValues(delivery.nextAttemptAt, now) > 0) {
		return false;
	}
	if (!delivery.deliveryClaimExpiresAt) {
		return true;
	}
	return compareValues(delivery.deliveryClaimExpiresAt, now) <= 0;
}

function compareDeliveryClaimOrder(left, right): number {
	const nextAttemptDiff = compareValues(left.nextAttemptAt, right.nextAttemptAt);
	if (nextAttemptDiff !== 0) {
		return nextAttemptDiff;
	}
	return Number(left.id) - Number(right.id);
}

function getModelStub() {
	const rows: any[] = [];
	return {
		rows,
		async findOne({where}) {
			return rows.find((row) => {
				return rowMatchesWhere(row, where);
			}) || null;
		},
		async findAll({where} = {}) {
			return rows.filter((row) => rowMatchesWhere(row, where || {}));
		},
		async findAndCountAll({where, limit, offset} = {}) {
			const matchingRows = rows.filter((row) => rowMatchesWhere(row, where || {}));
			return {
				rows: matchingRows.slice(offset || 0, (offset || 0) + (limit || matchingRows.length)),
				count: matchingRows.length
			};
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
	};
}

function rowMatchesWhere(row, where) {
	return Reflect.ownKeys(where).every((key) => {
		return valueMatchesWhere(row[key as any], where[key as any]);
	});
}

function valueMatchesWhere(value, condition) {
	if (isInCondition(condition)) {
		const key = Reflect.ownKeys(condition)[0];
		return condition[key as any].includes(value);
	}
	if (isLteCondition(condition)) {
		const key = Reflect.ownKeys(condition)[0];
		return compareValues(value, condition[key as any]) <= 0;
	}
	return value === condition;
}

function isInCondition(condition): boolean {
	if (!condition || typeof condition !== 'object') {
		return false;
	}
	const keys = Reflect.ownKeys(condition);
	if (keys.length !== 1) {
		return false;
	}
	return Array.isArray(condition[keys[0] as any]);
}

function isLteCondition(condition): boolean {
	if (!condition || typeof condition !== 'object') {
		return false;
	}
	const keys = Reflect.ownKeys(condition);
	if (keys.length !== 1) {
		return false;
	}
	return String(keys[0]).includes('lte');
}

function compareValues(left, right): number {
	const leftTime = toComparableTime(left);
	const rightTime = toComparableTime(right);
	if (leftTime !== null && rightTime !== null) {
		return leftTime - rightTime;
	}
	return Number(left) - Number(right);
}

function toComparableTime(value): number | null {
	const time = new Date(value).getTime();
	if (Number.isNaN(time)) {
		return null;
	}
	return time;
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

function getActivityPubRemoteActorRow(overrides: any = {}) {
	return {
		id: 1,
		actorUrl: 'https://remote.example/users/alice',
		publicKeyId: 'https://remote.example/users/alice#main-key',
		preferredUsername: 'alice',
		domain: 'remote.example',
		inboxUrl: 'https://remote.example/users/alice/inbox',
		sharedInboxUrl: 'https://remote.example/inbox',
		publicKeyPem: 'public-key',
		lastFetchedAt: new Date('2026-06-01T12:00:00Z'),
		rawJson: '{}',
		...overrides
	};
}

function getActivityPubFollowRow(overrides: any = {}) {
	return {
		id: 1,
		localActorId: 1,
		remoteActorId: 1,
		direction: ActivityPubFollowDirection.Inbound,
		state: ActivityPubFollowState.Accepted,
		remoteActivityId: 'https://remote.example/activities/follow',
		acceptedAt: new Date('2026-06-01T12:00:00Z'),
		rejectedAt: null,
		rawActivityJson: '{}',
		...overrides
	};
}

function getRemoteActorKey() {
	const keyPair = generateActivityPubRsaKeyPair();

	return {
		keyId: 'https://remote.example/users/alice#main-key',
		actorUrl: 'https://remote.example/users/alice',
		publicKeyPem: keyPair.publicKeyPem,
		privateKeyPem: keyPair.privateKeyPem
	};
}

function getRemoteActorDocument(actorKey) {
	return {
		'@context': 'https://www.w3.org/ns/activitystreams',
		id: actorKey.actorUrl,
		type: 'Person',
		preferredUsername: 'alice',
		inbox: 'https://remote.example/users/alice/inbox',
		endpoints: {
			sharedInbox: 'https://remote.example/inbox'
		},
		publicKey: {
			id: actorKey.keyId,
			owner: actorKey.actorUrl,
			publicKeyPem: actorKey.publicKeyPem
		}
	};
}

function getSignedInboxRequest(actorKey, path: string, activity: any) {
	const body = JSON.stringify(activity);
	const date = new Date('2026-06-01T12:00:00Z');
	const signedRequest = signActivityPubRequestWithKey(actorKey, {
		method: 'POST',
		url: `https://social.example${path}`,
		body,
		date
	});

	return {
		method: 'POST',
		url: path,
		headers: signedRequest.headers,
		body: activity,
		rawBody: Buffer.from(body),
		now: date
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
