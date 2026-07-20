import assert from 'node:assert';
import {randomUUID} from 'node:crypto';
import {ContentView, CorePermissionName} from '../app/modules/database/interface.js';
import {ImageCompositionApiError} from '../app/modules/imageComposition/helpers.js';
import {IMAGE_COMPOSITION_POST_TYPE} from '../app/modules/imageComposition/contract.js';
import {PostStatus} from '../app/modules/group/interface.js';
import {IGeesomeApp} from '../app/interface.js';

const tinyPng = Buffer.from(
	'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
	'base64',
);

describe('image composition persistence and authorization', function () {
	this.timeout(60000);

	let app: IGeesomeApp;
	let owner;
	let outsider;
	let group;
	let baseContent;

	beforeEach(async () => {
		const appConfig: any = (await import('../app/config.js')).default;
		appConfig.storageConfig.jsNode.pass = 'test test test test test test test test test test';
		app = await (await import('../app/index.js')).default({storageConfig: appConfig.storageConfig, port: 7782});
		await app.flushDatabase();
		await app.setup({email: 'admin@admin.com', name: 'admin', password: 'admin'});
		owner = await app.registerUser({
			email: 'composition-owner@example.com',
			name: 'composition-owner',
			password: 'owner',
			permissions: [CorePermissionName.UserAll],
		});
		outsider = await app.registerUser({
			email: 'composition-outsider@example.com',
			name: 'composition-outsider',
			password: 'outsider',
			permissions: [CorePermissionName.UserAll],
		});
		group = await app.ms.group.createGroup(owner.id, {
			name: `composition_${randomUUID().replace(/-/g, '').slice(0, 12)}`,
			title: 'Private compositions',
			isPublic: false,
			isOpen: false,
		});
		baseContent = await app.ms.content.saveData(owner.id, tinyPng, 'base.png', {
			mimeType: 'image/png',
			view: ContentView.Media,
		});
	});

	afterEach(async () => {
		await app.stop();
	});

	function createInput(overrides: any = {}) {
		return {
			groupId: group.id,
			idempotencyKey: `create-${randomUUID()}`,
			compositionId: `composition-${randomUUID()}`,
			baseContentManifestId: baseContent.manifestStorageId,
			output: {width: 1200, height: 800},
			stickers: [{
				id: 'bubble-1',
				kind: 'text-bubble',
				template: 'speech-v1',
				text: 'Hello',
				x: 0.1,
				y: 0.2,
				width: 0.3,
				height: 0.2,
				rotationDeg: 0,
				zIndex: 1,
			}],
			...overrides,
		};
	}

	it('creates, replays, lists, and updates compositions without affecting ordinary posts', async () => {
		const input = createInput();
		const created = await app.ms.imageComposition.createImageComposition(owner.id, input);
		const replayed = await app.ms.imageComposition.createImageComposition(owner.id, input);
		assert.deepEqual(replayed, created);
		assert.equal(created.revision, 1);
		assert.equal(created.stickers.length, 1);
		const compositionPost = await app.ms.group.getPostPure(created.postId);
		assert.equal(compositionPost.type, 'image-composition');
		assert.equal((compositionPost as any).entityId, input.compositionId);
		assert.equal(compositionPost.source, null);
		assert.equal(compositionPost.sourceChannelId, null);
		assert.equal(compositionPost.sourcePostId, null);
		const compositionManifest = await app.ms.storage.getObject(compositionPost.manifestStorageId);
		assert.equal(compositionManifest.entityId, input.compositionId);
		assert.equal(compositionManifest.source, undefined);

		const ordinary = await app.ms.group.createPost(owner.id, {
			groupId: group.id,
			status: PostStatus.Published,
			name: 'ordinary post',
		});
		const listed = await app.ms.imageComposition.getImageCompositions(owner.id, group.id, {}, {limit: 10});
		assert.deepEqual(listed.list.map(item => item.postId), [created.postId]);
		assert.equal((await app.ms.group.getPostPure(ordinary.id)).type, null);

		const update = {
			idempotencyKey: `update-${randomUUID()}`,
			expectedRevision: 1,
			output: input.output,
			stickers: [{...input.stickers[0], text: 'Edited'}],
		};
		const updated = await app.ms.imageComposition.updateImageComposition(owner.id, created.postId, update);
		assert.equal(updated.revision, 2);
		assert.equal(updated.stickers[0].text, 'Edited');
		assert.deepEqual(await app.ms.imageComposition.updateImageComposition(owner.id, created.postId, update), updated);

		const updatedOrdinary = await app.ms.group.updatePost(owner.id, ordinary.id, {name: 'ordinary post edited'});
		assert.equal(updatedOrdinary.name, 'ordinary post edited');
		assert.notEqual(updatedOrdinary.type, IMAGE_COMPOSITION_POST_TYPE);
	});

	it('returns a cursor on the first full page and continues in stable timeline order', async () => {
		const created = [];
		for (let index = 0; index < 3; index += 1) {
			created.push(await app.ms.imageComposition.createImageComposition(owner.id, createInput()));
		}

		const first = await app.ms.imageComposition.getImageCompositions(owner.id, group.id, {}, {limit: 2});
		assert.equal(first.list.length, 2);
		assert(first.nextCursor);
		assert(first.nextCursor.publishedAt);
		assert(Number.isSafeInteger(Number(first.nextCursor.id)));

		const second = await app.ms.imageComposition.getImageCompositions(owner.id, group.id, {
			cursorPublishedAt: first.nextCursor.publishedAt,
			cursorId: first.nextCursor.id,
		}, {limit: 2});
		assert.equal(second.list.length, 1);
		assert.equal(second.nextCursor, null);

		const listedIds = [...first.list, ...second.list].map(item => item.postId);
		assert.equal(new Set(listedIds).size, 3);
		assert.deepEqual(listedIds, created.map(item => item.postId).reverse());
	});

	it('rejects reused identities with mismatched payloads and stale revisions', async () => {
		const input = createInput();
		const created = await app.ms.imageComposition.createImageComposition(owner.id, input);
		await assert.rejects(
			() => app.ms.imageComposition.createImageComposition(owner.id, {
				...input,
				stickers: [{...input.stickers[0], text: 'Changed under the same key'}],
			}),
			(error: ImageCompositionApiError) => error.errorCode === 'composition_idempotency_conflict',
		);
		await assert.rejects(
			() => app.ms.imageComposition.createImageComposition(owner.id, {
				...input,
				idempotencyKey: `new-key-${randomUUID()}`,
				stickers: [{...input.stickers[0], text: 'Changed under a new key'}],
			}),
			(error: ImageCompositionApiError) => error.errorCode === 'composition_idempotency_conflict',
		);

		await app.ms.imageComposition.updateImageComposition(owner.id, created.postId, {
			idempotencyKey: `update-${randomUUID()}`,
			expectedRevision: 1,
			output: input.output,
			stickers: [],
		});
		await assert.rejects(
			() => app.ms.imageComposition.updateImageComposition(owner.id, created.postId, {
				idempotencyKey: `stale-${randomUUID()}`,
				expectedRevision: 1,
				output: input.output,
				stickers: [],
			}),
			(error: ImageCompositionApiError) => {
				return error.errorCode === 'composition_revision_conflict' && error.details?.currentRevision === 2;
			},
		);
	});

	it('recovers matching concurrent creates and returns a structured conflict for mismatched payloads', async () => {
		const matchingInput = createInput();
		const matchingResults = await Promise.all([
			app.ms.imageComposition.createImageComposition(owner.id, matchingInput),
			app.ms.imageComposition.createImageComposition(owner.id, {
				...matchingInput,
				idempotencyKey: `concurrent-${randomUUID()}`,
			}),
		]);
		assert.equal(matchingResults[0].postId, matchingResults[1].postId);
		assert.equal(await app.ms.database.models.Post.count({where: {
			groupId: group.id,
			type: IMAGE_COMPOSITION_POST_TYPE,
			entityId: matchingInput.compositionId,
		}}), 1);

		const mismatchedInput = createInput();
		const mismatchedResults = await Promise.allSettled([
			app.ms.imageComposition.createImageComposition(owner.id, mismatchedInput),
			app.ms.imageComposition.createImageComposition(owner.id, {
				...mismatchedInput,
				idempotencyKey: `concurrent-${randomUUID()}`,
				stickers: [{...mismatchedInput.stickers[0], text: 'Different concurrent payload'}],
			}),
		]);
		assert.equal(mismatchedResults.filter(result => result.status === 'fulfilled').length, 1);
		const rejected = mismatchedResults.find(result => result.status === 'rejected') as PromiseRejectedResult;
		assert(rejected);
		assert.equal(rejected.reason.name, 'ImageCompositionApiError');
		assert.equal(rejected.reason.errorCode, 'composition_idempotency_conflict');
		assert.equal(rejected.reason.statusCode, 409);
		assert.equal(await app.ms.database.models.Post.count({where: {
			groupId: group.id,
			type: IMAGE_COMPOSITION_POST_TYPE,
			entityId: mismatchedInput.compositionId,
		}}), 1);
	});

	it('returns a structured conflict when a deleted post retains its native composition identity', async () => {
		const input = createInput();
		const created = await app.ms.imageComposition.createImageComposition(owner.id, input);
		await app.ms.database.models.Post.update({isDeleted: true}, {where: {id: created.postId}});

		await assert.rejects(
			() => app.ms.imageComposition.createImageComposition(owner.id, {
				...input,
				idempotencyKey: `deleted-${randomUUID()}`,
			}),
			(error: ImageCompositionApiError) => {
				return error.errorCode === 'composition_idempotency_conflict' && error.statusCode === 409;
			},
		);
	});

	it('prevents outsiders from reading or creating in private composition groups', async () => {
		const input = createInput();
		const created = await app.ms.imageComposition.createImageComposition(owner.id, input);
		await assert.rejects(
			() => app.ms.imageComposition.getImageComposition(outsider.id, created.postId),
			(error: ImageCompositionApiError) => error.errorCode === 'composition_not_permitted',
		);
		await assert.rejects(
			() => app.ms.imageComposition.getImageCompositions(outsider.id, group.id, {}, {limit: 10}),
			(error: ImageCompositionApiError) => error.errorCode === 'composition_not_permitted',
		);
		await assert.rejects(
			() => app.ms.imageComposition.createImageComposition(outsider.id, {
				...input,
				idempotencyKey: `outsider-${randomUUID()}`,
				compositionId: `outsider-${randomUUID()}`,
			}),
			(error: ImageCompositionApiError) => error.errorCode === 'composition_not_permitted',
		);
	});
});
