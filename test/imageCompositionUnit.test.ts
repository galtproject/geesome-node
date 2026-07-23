import assert from 'node:assert';
import registerImageCompositionApi from '../app/modules/imageComposition/api.js';
import {
	buildResolvedImageComposition,
	doesRecipeMatchCreate,
	getImageCompositionRecipeHash,
	ImageCompositionApiError,
	normalizeImageCompositionContentCreateInput,
	normalizeImageCompositionUpdateInput,
} from '../app/modules/imageComposition/helpers.js';
import {
	IMAGE_COMPOSITION_LIMITS,
	IMAGE_COMPOSITION_RENDERER,
	IMAGE_COMPOSITION_TYPE,
} from '../app/modules/imageComposition/contract.js';
import {validateAndNormalizeImageCompositionStickerSvg} from '../app/modules/imageComposition/svg.js';

const sticker = {
	id: 'bubble-1',
	svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><text x="1" y="5">Hello</text></svg>',
	editorData: {kind: 'text-bubble', text: 'Hello'},
	x: 0.1, y: 0.2, width: 0.3, height: 0.2, rotationDeg: 0, zIndex: 1,
};

function storedRecipe(overrides: any = {}) {
	const recipe: any = {
		type: IMAGE_COMPOSITION_TYPE,
		version: 1,
		compositionId: 'composition-id',
		revision: 1,
		originalContentManifestId: 'original-manifest',
		source: {width: 1200, height: 800},
		output: {width: 1200, height: 800},
		renderer: IMAGE_COMPOSITION_RENDERER,
		stickers: [{
			...(({svg: _svg, ...value}) => value)(sticker),
			contentManifestId: 'sticker-manifest',
			svgHash: validateAndNormalizeImageCompositionStickerSvg(sticker.svg).svgHash,
		}],
		...overrides,
	};
	return {...recipe, recipeHash: getImageCompositionRecipeHash(recipe)};
}

describe('image composition contract integration', function () {
	it('normalizes content inputs, allows empty stickers, and rejects client output geometry', function () {
		const contentCreate = normalizeImageCompositionContentCreateInput({
			idempotencyKey: 'create-key',
			compositionId: 'composition-id',
			originalContentManifestId: 'original-manifest',
			render: {maxDimension: 2048},
			stickers: [],
			folderId: 42,
		});
		assert.deepEqual(contentCreate.stickers, []);
		assert.deepEqual(contentCreate.render, {maxDimension: 2048});
		assert.equal(contentCreate.folderId, 42);
		assert.equal(normalizeImageCompositionContentCreateInput({...contentCreate, folderId: undefined}).folderId, undefined);
		assert.deepEqual(normalizeImageCompositionUpdateInput({
			idempotencyKey: 'update-key', expectedRevision: 1, stickers: [],
		}).stickers, []);
		assert.throws(() => normalizeImageCompositionContentCreateInput({
			...contentCreate,
			output: {width: 1, height: 1},
		}), (error: ImageCompositionApiError) => error.errorCode === 'composition_invalid');
	});

	it('returns a valid standalone composition without catalog identity', function () {
		const resolved = buildResolvedImageComposition(
			{
				manifestStorageId: 'composite-manifest', storageId: 'composite-cid',
				mediumPreviewStorageId: 'composite-preview-cid', mimeType: 'image/png',
				updatedAt: new Date('2026-07-20T12:00:00Z'),
			} as any,
			storedRecipe() as any,
			{manifestStorageId: 'original-manifest', storageId: 'original-cid'} as any,
			[{manifestStorageId: 'sticker-manifest', storageId: 'sticker-cid'}] as any,
		);
		assert.equal(resolved.fileCatalogItemId, undefined);
		assert.equal(resolved.updatedAt, '2026-07-20T12:00:00.000Z');
	});

	it('accepts only a bounded optional maxDimension render hint', function () {
		for (const maxDimension of [0, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER]) {
			assert.throws(() => normalizeImageCompositionContentCreateInput({
				idempotencyKey: 'key', compositionId: 'composition-id',
				originalContentManifestId: 'original-manifest', render: {maxDimension}, stickers: [],
			}), (error: ImageCompositionApiError) => error.errorCode === 'composition_invalid');
		}
	});

	it('rejects aggregate client SVG bytes before storing any sticker content', function () {
		const body = 'x'.repeat(IMAGE_COMPOSITION_LIMITS.maxStickerSvgBytes - 200);
		const stickers = Array.from({
			length: Math.ceil(IMAGE_COMPOSITION_LIMITS.maxTotalStickerSvgBytes / body.length) + 1,
		}, (_, index) => ({
			...sticker,
			id: `sticker-${index}`,
			zIndex: index + 1,
			svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><desc>${body}</desc></svg>`,
		}));
		assert.throws(() => normalizeImageCompositionContentCreateInput({
			idempotencyKey: 'key',
			compositionId: 'composition-id',
			originalContentManifestId: 'original-manifest',
			stickers,
		}), (error: ImageCompositionApiError) => error.errorCode === 'composition_invalid'
			&& error.details?.field === 'stickers');
	});

	it('returns catalog identity and authorized recipe children', function () {
		const resolved = buildResolvedImageComposition(
			{
				manifestStorageId: 'composite-manifest', storageId: 'composite-cid',
				mediumPreviewStorageId: 'composite-preview-cid', mimeType: 'image/png',
				updatedAt: new Date('2026-07-20T12:00:00Z'),
			} as any,
			storedRecipe() as any,
			{manifestStorageId: 'original-manifest', storageId: 'original-cid'} as any,
			[{manifestStorageId: 'sticker-manifest', storageId: 'sticker-cid'}] as any,
			{id: 42, updatedAt: new Date('2026-07-21T12:00:00Z')},
		);
		assert.equal(resolved.fileCatalogItemId, 42);
		assert.equal((resolved as any).postId, undefined);
		assert.equal(resolved.composite.url, '/ipfs/composite-cid');
		assert.equal(resolved.original.url, '/ipfs/original-cid');
		assert.equal(resolved.stickers[0].url, '/ipfs/sticker-cid');
	});

	it('only recovers an existing create when complete semantic input matches', function () {
		const input: any = normalizeImageCompositionContentCreateInput({
			idempotencyKey: 'new-request-key', compositionId: 'composition-id',
			originalContentManifestId: 'original-manifest', stickers: [sticker],
		});
		const recipe: any = storedRecipe();
		assert.equal(doesRecipeMatchCreate(recipe, input), true);
		assert.equal(doesRecipeMatchCreate(recipe, {
			...input, stickers: [{
				...input.stickers[0],
				svg: input.stickers[0].svg.replace('Hello', 'Different'),
				editorData: {kind: 'text-bubble', text: 'Different'},
			}],
		}), false);
	});

	it('registers only catalog/content routes and preserves structured failures', async function () {
		const routes = new Map<string, Function>();
		const app: any = {ms: {api: {
			onAuthorizedPost: (path, handler) => routes.set(`POST ${path}`, handler),
			onAuthorizedGet: (path, handler) => routes.set(`GET ${path}`, handler),
		}}};
		const module: any = {
			createImageCompositionContent: async () => { throw new Error('ipfs unavailable'); },
		};
		registerImageCompositionApi(app, module);
		assert(routes.has('POST user/image-compositions'));
		assert(routes.has('GET user/image-compositions'));
		assert(routes.has('GET user/image-compositions/:contentManifestId'));
		assert(routes.has('POST user/image-compositions/:contentManifestId/revisions'));
		assert.equal([...routes.keys()].some(route => route.includes('user/group')), false);
		const sent: any[] = [];
		await routes.get('POST user/image-compositions')!({
			user: {id: 3}, params: {}, body: {}, query: {},
		}, {send: (...args) => sent.push(args)});
		assert.deepEqual(sent[0], [{
			message: 'composition_storage_failed', errorCode: 'composition_storage_failed',
		}, 500]);
	});
});
