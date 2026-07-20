export const IMAGE_COMPOSITION_CONTRACT = 'image-composition-v1';
export const IMAGE_COMPOSITION_VERSION = 1;
export const IMAGE_COMPOSITION_POST_TYPE = 'image-composition';
export const IMAGE_COMPOSITION_VIEW = 'image-with-overlays';
export const IMAGE_COMPOSITION_TEMPLATE = 'speech-v1';

export const IMAGE_COMPOSITION_LIMITS = Object.freeze({
  maxStickers: 64,
  maxTextLength: 500,
  maxTextLines: 12,
  maxExportPixels: 64_000_000,
  maxExportDimension: 16_384,
  fallbackExportDimension: 4_096,
});

export type ImageCompositionErrorCode =
  | 'composition_invalid'
  | 'composition_not_found'
  | 'composition_not_permitted'
  | 'composition_content_not_found'
  | 'composition_content_not_permitted'
  | 'composition_template_unknown'
  | 'composition_version_unknown'
  | 'composition_idempotency_conflict'
  | 'composition_revision_conflict'
  | 'composition_svg_generation_failed'
  | 'composition_storage_failed';

export interface ImageCompositionOutput {
  width: number;
  height: number;
}

export interface ImageCompositionStickerInput {
  id: string;
  kind: 'text-bubble';
  template: 'speech-v1';
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotationDeg: number;
  zIndex: number;
}

export interface ImageCompositionCreateInput {
  groupId: number;
  idempotencyKey: string;
  compositionId: string;
  baseContentManifestId: string;
  output: ImageCompositionOutput;
  stickers: ImageCompositionStickerInput[];
}

export interface ImageCompositionUpdateInput {
  idempotencyKey: string;
  expectedRevision: number;
  output: ImageCompositionOutput;
  stickers: ImageCompositionStickerInput[];
}

export interface StoredImageCompositionSticker extends ImageCompositionStickerInput {
  templateVersion: number;
  contentManifestId: string;
  semanticHash: string;
}

export interface StoredImageComposition {
  version: number;
  compositionId: string;
  revision: number;
  baseContentManifestId: string;
  output: ImageCompositionOutput;
  stickers: StoredImageCompositionSticker[];
}

export interface ResolvedImageCompositionSticker extends StoredImageCompositionSticker {
  url: string;
}

export interface ResolvedImageComposition {
  postId: number;
  type: 'image-composition';
  version: number;
  compositionId: string;
  revision: number;
  updatedAt: string;
  base: {
    contentManifestId: string;
    url: string;
    previewUrl?: string;
    width: number;
    height: number;
  };
  stickers: ResolvedImageCompositionSticker[];
}

// Sticker SVG reuse hashes canonical UTF-8 JSON for these fields, in this order,
// with SHA-256 hex and a `sha256:` prefix. Geometry is excluded because it is
// applied by the composition renderer rather than embedded into the SVG.
export const IMAGE_COMPOSITION_SEMANTIC_HASH_FIELDS = [
  'kind',
  'template',
  'templateVersion',
  'text',
] as const;
