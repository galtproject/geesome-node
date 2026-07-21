import assert from 'node:assert';
import registerImageCompositionApi from '../app/modules/imageComposition/api.js';
import {
  buildResolvedImageComposition,
  canViewImageCompositionGroup,
  doesStoredCompositionMatchCreate,
  ImageCompositionApiError,
  normalizeImageCompositionCreateInput,
  normalizeImageCompositionUpdateInput,
} from '../app/modules/imageComposition/helpers.js';
import {IMAGE_COMPOSITION_POST_TYPE} from '../app/modules/imageComposition/contract.js';

const sticker = {
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
};

describe('image composition contract integration', function () {
  it('normalizes valid create/update input and rejects unsafe geometry', function () {
    const create = normalizeImageCompositionCreateInput({
      groupId: 4,
      idempotencyKey: 'create-key',
      compositionId: 'composition-id',
      baseContentManifestId: 'base-manifest',
      output: {width: 1200, height: 800},
      stickers: [sticker],
    });
    assert.equal(create.stickers[0].text, 'Hello');
    assert.deepEqual(normalizeImageCompositionUpdateInput({
      idempotencyKey: 'update-key',
      expectedRevision: 1,
      output: create.output,
      stickers: [],
    }).stickers, []);
    assert.throws(() => normalizeImageCompositionCreateInput({
      ...create,
      stickers: [{...sticker, x: 0.9, width: 0.3}],
    }), (error: ImageCompositionApiError) => error.errorCode === 'composition_invalid');
  });

  it('retains oversized natural dimensions for fallback export and rejects unsafe dimensions', function () {
    const oversized = normalizeImageCompositionCreateInput({
      groupId: 4,
      idempotencyKey: 'oversized-create-key',
      compositionId: 'oversized-composition-id',
      baseContentManifestId: 'oversized-base-manifest',
      output: {width: 20_000, height: 20_000},
      stickers: [sticker],
    });
    assert.deepEqual(oversized.output, {width: 20_000, height: 20_000});

    for (const output of [
      {width: 0, height: 800},
      {width: Number.POSITIVE_INFINITY, height: 800},
      {width: Number.MAX_SAFE_INTEGER + 1, height: 800},
    ]) {
      assert.throws(() => normalizeImageCompositionCreateInput({
        ...oversized,
        output,
      }), (error: ImageCompositionApiError) => error.errorCode === 'composition_invalid');
    }
  });

  it('builds a resolved projection only from attached portable manifest ids', function () {
    const composition: any = {
      version: 1,
      compositionId: 'composition-id',
      revision: 2,
      baseContentManifestId: 'base-manifest',
      output: {width: 1200, height: 800},
      stickers: [{
        ...sticker,
        templateVersion: 1,
        contentManifestId: 'sticker-manifest',
        semanticHash: `sha256:${'a'.repeat(64)}`,
      }],
    };
    const resolved = buildResolvedImageComposition({
      id: 9,
      type: IMAGE_COMPOSITION_POST_TYPE,
      propertiesJson: JSON.stringify({imageComposition: composition}),
      updatedAt: new Date('2026-07-20T12:00:00Z'),
      contents: [
        {manifestStorageId: 'base-manifest', storageId: 'base-cid', mediumPreviewStorageId: 'preview-cid'},
        {manifestStorageId: 'sticker-manifest', storageId: 'sticker-cid'},
      ],
    } as any);
    assert.equal(resolved.base.url, '/ipfs/base-cid');
    assert.equal(resolved.base.previewUrl, '/ipfs/preview-cid');
    assert.equal(resolved.stickers[0].url, '/ipfs/sticker-cid');
    assert.equal(resolved.revision, 2);
  });

  it('only recovers an existing create when the complete composition input matches', function () {
	const input: any = normalizeImageCompositionCreateInput({
	  groupId: 4,
	  idempotencyKey: 'new-request-key',
	  compositionId: 'composition-id',
	  baseContentManifestId: 'base-manifest',
	  output: {width: 1200, height: 800},
	  stickers: [sticker],
	});
	const stored: any = {
	  version: 1,
	  compositionId: input.compositionId,
	  revision: 1,
	  baseContentManifestId: input.baseContentManifestId,
	  output: input.output,
	  stickers: [{
		...input.stickers[0],
		templateVersion: 1,
		contentManifestId: 'sticker-manifest',
		semanticHash: `sha256:${'a'.repeat(64)}`,
	  }],
	};
	assert.equal(doesStoredCompositionMatchCreate(stored, input), true);
	assert.equal(doesStoredCompositionMatchCreate(stored, {
	  ...input,
	  stickers: [{...input.stickers[0], text: 'Different'}],
	}), false);
	assert.equal(doesStoredCompositionMatchCreate(stored, {
	  ...input,
	  baseContentManifestId: 'other-base',
	}), false);
  });

  it('allows public composition reads and restricts private reads to group participants', function () {
	assert.equal(canViewImageCompositionGroup({isPublic: true}, false, false), true);
	assert.equal(canViewImageCompositionGroup({isPublic: false}, true, false), true);
	assert.equal(canViewImageCompositionGroup({isPublic: false}, false, true), true);
	assert.equal(canViewImageCompositionGroup({isPublic: false}, false, false), false);
	assert.equal(canViewImageCompositionGroup(null, true, true), false);
  });

  it('registers dedicated authorized routes and preserves structured conflicts', async function () {
    const routes = new Map<string, Function>();
    const app: any = {ms: {api: {
      onAuthorizedPost: (path, handler) => routes.set(`POST ${path}`, handler),
      onAuthorizedGet: (path, handler) => routes.set(`GET ${path}`, handler),
      onPost: (path, handler) => routes.set(`PUBLIC_POST ${path}`, handler),
      onGet: (path, handler) => routes.set(`PUBLIC_GET ${path}`, handler),
    }}};
    const groupModule: any = {
      updateImageComposition: async () => {
        throw new ImageCompositionApiError('composition_revision_conflict', 409, {currentRevision: 5});
      },
    };
    registerImageCompositionApi(app, groupModule);
    assert(routes.has('POST user/group/create-image-composition'));
    assert(routes.has('GET user/group/:groupId/image-compositions'));
    const sent: any[] = [];
    await routes.get('POST user/group/update-image-composition/:postId')!({
      user: {id: 3}, params: {postId: 9}, body: {}, query: {},
    }, {send: (...args) => sent.push(args)});
    assert.deepEqual(sent, [[{
      message: 'composition_revision_conflict',
      errorCode: 'composition_revision_conflict',
      details: {currentRevision: 5},
    }, 409]]);
  });
});
