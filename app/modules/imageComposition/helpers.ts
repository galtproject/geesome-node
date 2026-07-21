import {
  IMAGE_COMPOSITION_LIMITS,
  IMAGE_COMPOSITION_POST_TYPE,
  IMAGE_COMPOSITION_TEMPLATE,
  IMAGE_COMPOSITION_VERSION,
  ImageCompositionCreateInput,
  ImageCompositionOutput,
  ImageCompositionStickerInput,
  ImageCompositionUpdateInput,
  ResolvedImageComposition,
  StoredImageComposition,
} from './contract.js';
import {validateImageCompositionStickerSemanticInput} from './svg.js';
import type {IContent} from '../database/interface.js';
import type {IPost} from '../group/interface.js';

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

export function normalizeImageCompositionCreateInput(input: unknown): ImageCompositionCreateInput {
  const value = requireObject(input);
  const stickers = normalizeStickers(value.stickers, false);
  return {
    groupId: requirePositiveInteger(value.groupId, 'groupId'),
    idempotencyKey: requireIdentifier(value.idempotencyKey, 'idempotencyKey'),
    compositionId: requireIdentifier(value.compositionId, 'compositionId'),
    baseContentManifestId: requireIdentifier(value.baseContentManifestId, 'baseContentManifestId'),
    output: normalizeOutput(value.output),
    stickers,
  };
}

export function normalizeImageCompositionUpdateInput(input: unknown): ImageCompositionUpdateInput {
  const value = requireObject(input);
  return {
    idempotencyKey: requireIdentifier(value.idempotencyKey, 'idempotencyKey'),
    expectedRevision: requirePositiveInteger(value.expectedRevision, 'expectedRevision'),
    output: normalizeOutput(value.output),
    stickers: normalizeStickers(value.stickers, true),
  };
}

export function parseStoredImageComposition(post: IPost): StoredImageComposition {
  if (!post || post.type !== IMAGE_COMPOSITION_POST_TYPE) {
    throw new ImageCompositionApiError('composition_not_found', 404);
  }
  let properties: any;
  try {
    properties = post.propertiesJson ? JSON.parse(post.propertiesJson) : null;
  } catch (_error) {
    throw new ImageCompositionApiError('composition_invalid', 422);
  }
  const composition = properties?.imageComposition;
  if (!composition || composition.version !== IMAGE_COMPOSITION_VERSION) {
    throw new ImageCompositionApiError(
      composition ? 'composition_version_unknown' : 'composition_invalid',
      422,
      composition?.version === undefined ? undefined : {version: composition.version},
    );
  }
  if (!Array.isArray(composition.stickers)) {
    throw new ImageCompositionApiError('composition_invalid', 422);
  }
  return composition as StoredImageComposition;
}

export function getImageCompositionProperties(composition: StoredImageComposition): string {
  return JSON.stringify({imageComposition: composition});
}

export function doesStoredCompositionMatchCreate(
  composition: StoredImageComposition,
  input: ImageCompositionCreateInput,
): boolean {
  if (composition.compositionId !== input.compositionId
    || composition.baseContentManifestId !== input.baseContentManifestId
    || composition.output.width !== input.output.width
    || composition.output.height !== input.output.height
    || composition.stickers.length !== input.stickers.length) {
    return false;
  }
  const inputFields = ['id', 'kind', 'template', 'text', 'x', 'y', 'width', 'height', 'rotationDeg', 'zIndex'];
  return input.stickers.every((sticker, index) => {
    const stored = composition.stickers[index];
    return inputFields.every(field => stored?.[field] === sticker[field]);
  });
}

export function canViewImageCompositionGroup(group: {isPublic?: boolean} | null, isMember: boolean, isAdmin: boolean) {
  return Boolean(group && (group.isPublic || isMember || isAdmin));
}

export function buildResolvedImageComposition(post: IPost, composition = parseStoredImageComposition(post)): ResolvedImageComposition {
  const contentsByManifest = new Map<string, IContent>();
  for (const content of post.contents || []) {
    if (content.manifestStorageId) {
      contentsByManifest.set(content.manifestStorageId, content);
    }
  }
  const base = requireAttachedContent(contentsByManifest, composition.baseContentManifestId);
  return {
    postId: Number(post.id),
    type: 'image-composition',
    version: composition.version,
    compositionId: composition.compositionId,
    revision: composition.revision,
    updatedAt: new Date(post.updatedAt).toISOString(),
    base: {
      contentManifestId: composition.baseContentManifestId,
      url: contentUrl(base.storageId),
      ...(base.mediumPreviewStorageId ? {previewUrl: contentUrl(base.mediumPreviewStorageId)} : {}),
      width: composition.output.width,
      height: composition.output.height,
    },
    stickers: composition.stickers.map(sticker => {
      const content = requireAttachedContent(contentsByManifest, sticker.contentManifestId);
      return {...sticker, url: contentUrl(content.storageId)};
    }),
  };
}

export function assertRasterBaseContent(content: IContent | null): asserts content is IContent {
  if (!content) {
    throw new ImageCompositionApiError('composition_content_not_found', 404);
  }
  const mimeType = String(content.mimeType || '').toLowerCase();
  if (!mimeType.startsWith('image/') || mimeType === 'image/svg+xml') {
    throw new ImageCompositionApiError('composition_invalid', 422, {field: 'baseContentManifestId'});
  }
}

function normalizeStickers(input: unknown, allowEmpty: boolean): ImageCompositionStickerInput[] {
  if (!Array.isArray(input) || (!allowEmpty && input.length === 0) || input.length > IMAGE_COMPOSITION_LIMITS.maxStickers) {
    throw invalid('stickers');
  }
  const ids = new Set<string>();
  const zIndexes = new Set<number>();
  const stickers = input.map((raw, index) => {
    const value = requireObject(raw);
    const id = requireIdentifier(value.id, `stickers[${index}].id`);
    if (ids.has(id)) {
      throw invalid(`stickers[${index}].id`);
    }
    ids.add(id);
    const sticker: ImageCompositionStickerInput = {
      id,
      kind: value.kind as any,
      template: value.template as any,
      text: typeof value.text === 'string' ? value.text : '',
      x: requireUnitNumber(value.x, `stickers[${index}].x`),
      y: requireUnitNumber(value.y, `stickers[${index}].y`),
      width: requireUnitNumber(value.width, `stickers[${index}].width`, false),
      height: requireUnitNumber(value.height, `stickers[${index}].height`, false),
      rotationDeg: requireFiniteNumber(value.rotationDeg, `stickers[${index}].rotationDeg`),
      zIndex: requirePositiveInteger(value.zIndex, `stickers[${index}].zIndex`),
    };
    if (sticker.rotationDeg !== 0 || sticker.x + sticker.width > 1 || sticker.y + sticker.height > 1 || zIndexes.has(sticker.zIndex)) {
      throw invalid(`stickers[${index}]`);
    }
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

function normalizeOutput(input: unknown): ImageCompositionOutput {
  const value = requireObject(input);
  const width = requirePositiveInteger(value.width, 'output.width');
  const height = requirePositiveInteger(value.height, 'output.height');
  return {width, height};
}

function requireObject(value: unknown): Record<string, any> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw invalid();
  }
  return value as Record<string, any>;
}

function requireIdentifier(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 200) {
    throw invalid(field);
  }
  return value;
}

function requirePositiveInteger(value: unknown, field: string): number {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1) {
    throw invalid(field);
  }
  return number;
}

function requireFiniteNumber(value: unknown, field: string): number {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw invalid(field);
  }
  return number;
}

function requireUnitNumber(value: unknown, field: string, allowZero = true): number {
  const number = requireFiniteNumber(value, field);
  if (number < 0 || number > 1 || (!allowZero && number === 0)) {
    throw invalid(field);
  }
  return number;
}

function requireAttachedContent(contents: Map<string, IContent>, manifestId: string): IContent {
  const content = contents.get(manifestId);
  if (!content) {
    throw new ImageCompositionApiError('composition_content_not_found', 404, {contentManifestId: manifestId});
  }
  return content;
}

function contentUrl(storageId?: string): string {
  if (!storageId) {
    throw new ImageCompositionApiError('composition_content_not_found', 404);
  }
  return `/ipfs/${storageId}`;
}

function invalid(field?: string): ImageCompositionApiError {
  return new ImageCompositionApiError('composition_invalid', 422, field ? {field} : undefined);
}
