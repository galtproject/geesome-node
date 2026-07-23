export const IMAGE_COMPOSITION_CONTRACT = 'image-composition-v1';
export const IMAGE_COMPOSITION_VERSION = 1;
export const IMAGE_COMPOSITION_TYPE = 'image-composition';
export const IMAGE_COMPOSITION_RENDERER = Object.freeze({
  name: 'geesome-image-composition',
  version: 1,
});

export const IMAGE_COMPOSITION_LIMITS = Object.freeze({
  maxStickers: 64,
  maxExportPixels: 64_000_000,
  maxExportDimension: 16_384,
  maxDecodedBytes: 256_000_000,
  maxInputBytes: 100_000_000,
  maxStickerSvgBytes: 256_000,
  maxTotalStickerSvgBytes: 4_000_000,
  maxStickerEditorDataBytes: 16_000,
  sharpTimeoutSeconds: 10,
});

export type ImageCompositionErrorCode =
  | 'composition_invalid'
  | 'composition_not_found'
  | 'composition_not_permitted'
  | 'composition_content_not_found'
  | 'composition_content_not_permitted'
  | 'composition_version_unknown'
  | 'composition_idempotency_conflict'
  | 'composition_revision_conflict'
  | 'composition_dependency_not_found'
  | 'composition_dependency_not_permitted'
  | 'composition_renderer_unknown'
  | 'composition_render_limit'
  | 'composition_render_failed'
  | 'composition_preview_generation_failed'
  | 'composition_storage_failed';

export interface ImageCompositionOutput {
  width: number;
  height: number;
}

export interface ImageCompositionStickerInput {
  id: string;
  svg: string;
  editorData?: Record<string, unknown>;
  x: number;
  y: number;
  width: number;
  height: number;
  rotationDeg: number;
  zIndex: number;
}

export interface ImageCompositionContentCreateInput {
  idempotencyKey: string;
  compositionId: string;
  originalContentManifestId: string;
  folderId?: number;
  render?: {maxDimension: number};
  stickers: ImageCompositionStickerInput[];
}

export interface ImageCompositionUpdateInput {
  idempotencyKey: string;
  expectedRevision: number;
  stickers: ImageCompositionStickerInput[];
}

export interface StoredImageCompositionSticker extends Omit<ImageCompositionStickerInput, 'svg'> {
  contentManifestId: string;
  svgHash: string;
}

export interface StoredImageComposition {
  type: 'image-composition';
  version: number;
  compositionId: string;
  revision: number;
  previousCompositeContentManifestId?: string;
  originalContentManifestId: string;
  render?: {maxDimension: number};
  source: ImageCompositionOutput;
  output: ImageCompositionOutput;
  renderer: typeof IMAGE_COMPOSITION_RENDERER;
  recipeHash: string;
  stickers: StoredImageCompositionSticker[];
}

export interface ResolvedImageCompositionSticker extends StoredImageCompositionSticker {
  url: string;
}

export interface ResolvedImageComposition {
  fileCatalogItemId?: number;
  type: 'image-composition';
  version: number;
  compositionId: string;
  revision: number;
  updatedAt: string;
  composite: {
    contentManifestId: string;
    url: string;
    previewUrl: string;
    mimeType: 'image/png';
    width: number;
    height: number;
  };
  original: {
    contentManifestId: string;
    url: string;
    previewUrl?: string;
    width: number;
    height: number;
  };
  stickers: ResolvedImageCompositionSticker[];
}

export interface ImageCompositionCatalogSummary {
  fileCatalogItemId: number;
  name: string;
  parentItemId?: number | null;
  position?: number;
  type: 'image-composition';
  version: number | null;
  compositionId: string | null;
  revision: number | null;
  updatedAt: string;
  recipeStatus: 'ready' | 'malformed' | 'unknown-version' | 'missing-dependencies';
  editable: boolean;
  composite: ResolvedImageComposition['composite'];
}
