import {createHash} from 'node:crypto';
import type {IContent} from '../database/interface.js';
import {
  IMAGE_COMPOSITION_LIMITS,
  IMAGE_COMPOSITION_TYPE,
  IMAGE_COMPOSITION_RENDERER,
  IMAGE_COMPOSITION_TEMPLATE,
  IMAGE_COMPOSITION_VERSION,
  ImageCompositionContentCreateInput,
  ImageCompositionStickerInput,
  ImageCompositionUpdateInput,
  ResolvedImageComposition,
  StoredImageComposition,
} from './contract.js';
import {canonicalizeImageCompositionRequest} from './operationRepository.js';
import {getImageCompositionStickerSemanticHash, validateImageCompositionStickerSemanticInput} from './svg.js';

export class ImageCompositionApiError extends Error {
  readonly errorCode: string;
  readonly statusCode: number;
  readonly details?: Record<string, unknown>;

  constructor(errorCode: string, statusCode: number, details?: Record<string, unknown>) {
    super(errorCode);
    this.name = 'ImageCompositionApiError';
    this.errorCode = errorCode;
    this.statusCode = statusCode;
    this.details = details;
  }
}

export function normalizeImageCompositionContentCreateInput(input: unknown): ImageCompositionContentCreateInput {
  const value = requireObject(input);
  if (value.source !== undefined || value.output !== undefined || value.renderer !== undefined) {
    throw invalid('output');
  }
  return {
    idempotencyKey: requireIdentifier(value.idempotencyKey, 'idempotencyKey'),
    compositionId: requireIdentifier(value.compositionId, 'compositionId'),
    originalContentManifestId: requireIdentifier(value.originalContentManifestId, 'originalContentManifestId'),
    ...(value.render === undefined ? {} : {render: normalizeRender(value.render)}),
    stickers: normalizeStickers(value.stickers, true),
  };
}

export function normalizeImageCompositionUpdateInput(input: unknown): ImageCompositionUpdateInput {
  const value = requireObject(input);
  return {
    idempotencyKey: requireIdentifier(value.idempotencyKey, 'idempotencyKey'),
    expectedRevision: requirePositiveInteger(value.expectedRevision, 'expectedRevision'),
    stickers: normalizeStickers(value.stickers, true),
  };
}

export function parseImageCompositionContent(content: IContent): StoredImageComposition {
  if (!content || content.isDeleted || content.mimeType !== 'image/png') {
    throw new ImageCompositionApiError('composition_not_found', 404);
  }
  let properties: any;
  try {
    properties = content.propertiesJson ? JSON.parse(content.propertiesJson) : null;
  } catch (_error) {
    throw new ImageCompositionApiError('composition_invalid', 422);
  }
  const recipe = properties?.imageComposition;
  if (!recipe || recipe.type !== IMAGE_COMPOSITION_TYPE) {
    throw new ImageCompositionApiError('composition_invalid', 422);
  }
  if (recipe.version !== IMAGE_COMPOSITION_VERSION) {
    throw new ImageCompositionApiError('composition_version_unknown', 422, {version: recipe.version});
  }
  if (recipe.renderer?.name !== IMAGE_COMPOSITION_RENDERER.name
    || recipe.renderer?.version !== IMAGE_COMPOSITION_RENDERER.version) {
    throw new ImageCompositionApiError('composition_renderer_unknown', 422, {renderer: recipe.renderer});
  }
  if (!isIdentifier(recipe.compositionId) || !isPositiveInteger(recipe.revision)
    || (recipe.previousCompositeContentManifestId !== undefined && !isIdentifier(recipe.previousCompositeContentManifestId))
    || !isIdentifier(recipe.originalContentManifestId) || !isDimensions(recipe.source) || !isDimensions(recipe.output)
    || (recipe.render !== undefined && !isRender(recipe.render))
    || !Array.isArray(recipe.stickers) || recipe.stickers.length > IMAGE_COMPOSITION_LIMITS.maxStickers
    || !isSha256(recipe.recipeHash) || !isStoredStickerList(recipe.stickers)) {
    throw new ImageCompositionApiError('composition_invalid', 422);
  }
  if ((recipe.revision === 1 && recipe.previousCompositeContentManifestId !== undefined)
    || (recipe.revision > 1 && !isIdentifier(recipe.previousCompositeContentManifestId))
    || (recipe.render === undefined && (recipe.output.width !== recipe.source.width || recipe.output.height !== recipe.source.height))
    || (recipe.render && Math.max(recipe.output.width, recipe.output.height) > recipe.render.maxDimension)
    || recipe.output.width > recipe.source.width || recipe.output.height > recipe.source.height) {
    throw new ImageCompositionApiError('composition_invalid', 422);
  }
  const expectedHash = getImageCompositionRecipeHash({...recipe, recipeHash: undefined});
  if (recipe.recipeHash !== expectedHash) {
    throw new ImageCompositionApiError('composition_invalid', 422, {field: 'recipeHash'});
  }
  return recipe as StoredImageComposition;
}

export function getImageCompositionRecipeHash(recipe: Omit<StoredImageComposition, 'recipeHash'> | any) {
  const canonical = {...recipe};
  delete canonical.recipeHash;
  return `sha256:${createHash('sha256').update(canonicalizeImageCompositionRequest(canonical), 'utf8').digest('hex')}`;
}

export function doesRecipeMatchCreate(recipe: StoredImageComposition, input: ImageCompositionContentCreateInput) {
  return recipe.revision === 1
    && recipe.compositionId === input.compositionId
    && recipe.originalContentManifestId === input.originalContentManifestId
    && (recipe.render?.maxDimension ?? null) === (input.render?.maxDimension ?? null)
    && semanticStickersEqual(recipe.stickers, input.stickers);
}

export function doesRecipeMatchUpdate(recipe: StoredImageComposition, input: ImageCompositionUpdateInput) {
  return recipe.revision === input.expectedRevision + 1 && semanticStickersEqual(recipe.stickers, input.stickers);
}

export function buildResolvedImageComposition(
  composite: IContent,
  recipe: StoredImageComposition,
  original: IContent,
  stickerContents: IContent[],
  fileCatalogItem: any,
): ResolvedImageComposition {
  const stickersByManifest = new Map(stickerContents.map(content => [content.manifestStorageId, content]));
  return {
    fileCatalogItemId: Number(fileCatalogItem.id),
    type: IMAGE_COMPOSITION_TYPE,
    version: recipe.version,
    compositionId: recipe.compositionId,
    revision: recipe.revision,
    updatedAt: new Date(fileCatalogItem.updatedAt || composite.updatedAt).toISOString(),
    composite: contentProjection(composite, recipe.output, true),
    original: contentProjection(original, recipe.source, false),
    stickers: recipe.stickers.map(sticker => {
      const content = stickersByManifest.get(sticker.contentManifestId);
      if (!content) {
        throw new ImageCompositionApiError('composition_dependency_not_found', 422, {contentManifestId: sticker.contentManifestId});
      }
      return {...sticker, url: contentUrl(content.storageId)};
    }),
  };
}

export function buildImageCompositionCatalogSummary(item: any, dependenciesReady = true) {
  const composite = item?.content;
  if (!composite || composite.mimeType !== 'image/png' || !composite.manifestStorageId || !composite.storageId) {
    return null;
  }
  let recipe: StoredImageComposition | null = null;
  let recipeStatus: 'ready' | 'malformed' | 'unknown-version' | 'missing-dependencies' = 'malformed';
  try {
    recipe = parseImageCompositionContent(composite);
    recipeStatus = dependenciesReady ? 'ready' : 'missing-dependencies';
  } catch (error) {
    recipeStatus = error instanceof ImageCompositionApiError && error.errorCode === 'composition_version_unknown'
      ? 'unknown-version'
      : 'malformed';
  }
  const dimensions = getCompositeAssetDimensions(composite, recipe);
  return {
    fileCatalogItemId: Number(item.id),
    name: item.name,
    parentItemId: item.parentItemId == null ? null : Number(item.parentItemId),
    position: item.position == null ? undefined : Number(item.position),
    type: IMAGE_COMPOSITION_TYPE,
    updatedAt: new Date(item.updatedAt || composite.updatedAt).toISOString(),
    version: recipeStatus === 'ready' ? recipe.version : null,
    compositionId: recipeStatus === 'ready' ? recipe.compositionId : null,
    revision: recipeStatus === 'ready' ? recipe.revision : null,
    recipeStatus,
    editable: recipeStatus === 'ready',
    composite: {
      contentManifestId: composite.manifestStorageId,
      url: contentUrl(composite.storageId),
      previewUrl: contentUrl(composite.mediumPreviewStorageId || composite.storageId),
      mimeType: 'image/png',
      width: dimensions.width,
      height: dimensions.height,
    },
  };
}

export function assertRasterOriginalContent(content: IContent | null): asserts content is IContent {
  if (!content) {
    throw new ImageCompositionApiError('composition_content_not_found', 404);
  }
  const mimeType = String(content.mimeType || '').toLowerCase();
  if (!mimeType.startsWith('image/') || mimeType === 'image/svg+xml') {
    throw new ImageCompositionApiError('composition_invalid', 422, {field: 'originalContentManifestId'});
  }
}

function semanticStickersEqual(stored, input) {
  if (stored.length !== input.length) return false;
  const fields = ['id', 'kind', 'template', 'text', 'x', 'y', 'width', 'height', 'rotationDeg', 'zIndex'];
  return input.every((sticker, index) => fields.every(field => stored[index]?.[field] === sticker[field]));
}

function normalizeStickers(input: unknown, allowEmpty: boolean): ImageCompositionStickerInput[] {
  if (!Array.isArray(input) || (!allowEmpty && input.length === 0) || input.length > IMAGE_COMPOSITION_LIMITS.maxStickers) {
    throw invalid('stickers');
  }
  const ids = new Set<string>();
  const zIndexes = new Set<number>();
  const stickers = input.map((raw, index) => {
    const value = requireObject(raw);
    const sticker: ImageCompositionStickerInput = {
      id: requireIdentifier(value.id, `stickers[${index}].id`),
      kind: value.kind,
      template: value.template,
      text: typeof value.text === 'string' ? value.text : '',
      x: requireUnitNumber(value.x, `stickers[${index}].x`),
      y: requireUnitNumber(value.y, `stickers[${index}].y`),
      width: requireUnitNumber(value.width, `stickers[${index}].width`, false),
      height: requireUnitNumber(value.height, `stickers[${index}].height`, false),
      rotationDeg: requireFiniteNumber(value.rotationDeg, `stickers[${index}].rotationDeg`),
      zIndex: requirePositiveInteger(value.zIndex, `stickers[${index}].zIndex`),
    };
    if (ids.has(sticker.id) || zIndexes.has(sticker.zIndex) || sticker.rotationDeg !== 0
      || sticker.x + sticker.width > 1 || sticker.y + sticker.height > 1) {
      throw invalid(`stickers[${index}]`);
    }
    ids.add(sticker.id);
    zIndexes.add(sticker.zIndex);
    try {
      validateImageCompositionStickerSemanticInput(sticker);
    } catch (error) {
      if ((error as Error).message.includes('template')) {
        throw new ImageCompositionApiError('composition_template_unknown', 422);
      }
      throw invalid(`stickers[${index}]`);
    }
    return sticker;
  });
  return stickers.sort((left, right) => left.zIndex - right.zIndex || left.id.localeCompare(right.id));
}

function contentProjection(content: IContent, dimensions, composite: boolean): any {
  if (!content.manifestStorageId || !content.storageId) {
    throw new ImageCompositionApiError('composition_content_not_found', 404);
  }
  return {
    contentManifestId: content.manifestStorageId,
    url: contentUrl(content.storageId),
    ...(content.mediumPreviewStorageId ? {previewUrl: contentUrl(content.mediumPreviewStorageId)} : {}),
    ...(composite ? {mimeType: 'image/png'} : {}),
    width: dimensions.width,
    height: dimensions.height,
  };
}

function contentUrl(storageId: string) {
  return `/ipfs/${storageId}`;
}

function requireObject(value: unknown): Record<string, any> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid();
  return value as Record<string, any>;
}

function normalizeRender(value: unknown) {
  const render = requireObject(value);
  if (Object.keys(render).some(key => key !== 'maxDimension')) {
    throw invalid('render');
  }
  const maxDimension = requirePositiveInteger(render.maxDimension, 'render.maxDimension');
  if (maxDimension > IMAGE_COMPOSITION_LIMITS.maxExportDimension) throw invalid('render.maxDimension');
  return {maxDimension};
}

function requireIdentifier(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim() || value !== value.trim() || value.length > 200) throw invalid(field);
  return value;
}

function requirePositiveInteger(value: unknown, field: string): number {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1) throw invalid(field);
  return number;
}

function requireFiniteNumber(value: unknown, field: string): number {
  const number = Number(value);
  if (!Number.isFinite(number)) throw invalid(field);
  return number;
}

function requireUnitNumber(value: unknown, field: string, allowZero = true): number {
  const number = requireFiniteNumber(value, field);
  if (number < 0 || number > 1 || (!allowZero && number === 0)) throw invalid(field);
  return number;
}

function invalid(field?: string) {
  return new ImageCompositionApiError('composition_invalid', 422, field ? {field} : undefined);
}

function isIdentifier(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 200;
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) > 0;
}

function isDimensions(value: any): value is {width: number; height: number} {
  return value && isPositiveInteger(value.width) && isPositiveInteger(value.height)
    && value.width <= IMAGE_COMPOSITION_LIMITS.maxExportDimension
    && value.height <= IMAGE_COMPOSITION_LIMITS.maxExportDimension
    && value.width * value.height <= IMAGE_COMPOSITION_LIMITS.maxExportPixels;
}

function isRender(value: any): value is {maxDimension: number} {
  return value && isPositiveInteger(value.maxDimension)
    && value.maxDimension <= IMAGE_COMPOSITION_LIMITS.maxExportDimension
    && Object.keys(value).every(key => key === 'maxDimension');
}

function isSha256(value: unknown): value is string {
  return typeof value === 'string' && /^sha256:[a-f0-9]{64}$/.test(value);
}

function isStoredStickerList(stickers: any[]) {
  const ids = new Set<string>();
  const zIndexes = new Set<number>();
  return stickers.every((sticker, index) => {
    if (!sticker || !isIdentifier(sticker.contentManifestId) || !isSha256(sticker.semanticHash)
      || !isPositiveInteger(sticker.templateVersion) || sticker.templateVersion !== 1) return false;
    let normalized: ImageCompositionStickerInput;
    try {
      normalized = normalizeStickers([sticker], true)[0];
    } catch (_error) {
      return false;
    }
    if (getImageCompositionStickerSemanticHash(sticker) !== sticker.semanticHash) return false;
    if (ids.has(normalized.id) || zIndexes.has(normalized.zIndex)) return false;
    if (index > 0) {
      const previous = stickers[index - 1];
      if (Number(previous.zIndex) > normalized.zIndex
        || (Number(previous.zIndex) === normalized.zIndex && String(previous.id).localeCompare(normalized.id) > 0)) return false;
    }
    ids.add(normalized.id);
    zIndexes.add(normalized.zIndex);
    return true;
  });
}

function getCompositeAssetDimensions(composite: IContent, recipe: StoredImageComposition | null) {
  if (recipe && isDimensions(recipe.output)) return recipe.output;
  try {
    const properties = composite.propertiesJson ? JSON.parse(composite.propertiesJson) : null;
    if (isDimensions(properties?.imageCompositionAsset)) return properties.imageCompositionAsset;
    if (isDimensions(properties?.imageComposition?.output)) return properties.imageComposition.output;
  } catch (_error) {}
  // Corrupt metadata must not make the baked asset disappear from a list. The
  // actual raster remains the rendering source and is used by the browser.
  return {width: 1, height: 1};
}
