import sharp from 'sharp';
import debug from 'debug';
import {IMAGE_COMPOSITION_LIMITS, ImageCompositionStickerInput} from './contract.js';
import {ImageCompositionApiError} from './helpers.js';

const log = debug('geesome:app:image-composition:raster');

export interface RasterSticker extends ImageCompositionStickerInput {
  svg: string | Buffer;
}

export interface BakedImageComposition {
  png: Buffer;
  previewPng: Buffer;
  source: {width: number; height: number};
  output: {width: number; height: number};
}

export async function bakeImageComposition(original: Buffer, stickers: RasterSticker[], render?: {maxDimension: number}): Promise<BakedImageComposition> {
  const release = await acquireRasterSlot();
  try {
    return await bakeImageCompositionInternal(original, stickers, render);
  } finally {
    release();
  }
}

async function bakeImageCompositionInternal(original: Buffer, stickers: RasterSticker[], render?: {maxDimension: number}): Promise<BakedImageComposition> {
  if (!Buffer.isBuffer(original) || original.length === 0 || original.length > IMAGE_COMPOSITION_LIMITS.maxInputBytes) {
    throw limitError('originalBytes');
  }
  if (stickers.length > IMAGE_COMPOSITION_LIMITS.maxStickers) {
    throw limitError('stickers');
  }

  try {
    const decoder = sharp(original, {
      failOn: 'warning',
      limitInputPixels: IMAGE_COMPOSITION_LIMITS.maxExportPixels,
      animated: false,
      sequentialRead: true,
    }).timeout({seconds: IMAGE_COMPOSITION_LIMITS.sharpTimeoutSeconds});
    const metadata = await decoder.metadata();
    if ((metadata.pages || 1) !== 1 || metadata.pageHeight || !['png', 'jpeg', 'webp'].includes(String(metadata.format))) {
      throw new ImageCompositionApiError('composition_invalid', 422, {field: 'originalContentManifestId'});
    }
    const normalized = await decoder.rotate().png({compressionLevel: 9, adaptiveFiltering: false, palette: false}).toBuffer({resolveWithObject: true});
    const sourceWidth = normalized.info.width;
    const sourceHeight = normalized.info.height;
    assertDimensions(sourceWidth, sourceHeight);
    const scale = render?.maxDimension && Math.max(sourceWidth, sourceHeight) > render.maxDimension
      ? render.maxDimension / Math.max(sourceWidth, sourceHeight)
      : 1;
    const width = Math.max(1, Math.round(sourceWidth * scale));
    const height = Math.max(1, Math.round(sourceHeight * scale));
    assertDimensions(width, height);
    const canvas = scale === 1
      ? normalized.data
      : await sharp(normalized.data).resize(width, height, {fit: 'fill'})
        .png({compressionLevel: 9, adaptiveFiltering: false, palette: false})
        .timeout({seconds: IMAGE_COMPOSITION_LIMITS.sharpTimeoutSeconds}).toBuffer();

    const overlays = [];
    let totalStickerSvgBytes = 0;
    for (const sticker of [...stickers].sort((left, right) => left.zIndex - right.zIndex || left.id.localeCompare(right.id))) {
      const svg = Buffer.isBuffer(sticker.svg) ? sticker.svg : Buffer.from(sticker.svg, 'utf8');
      totalStickerSvgBytes += svg.length;
      if (svg.length === 0 || svg.length > IMAGE_COMPOSITION_LIMITS.maxStickerSvgBytes
        || totalStickerSvgBytes > IMAGE_COMPOSITION_LIMITS.maxTotalStickerSvgBytes) {
        throw limitError('stickerSvgBytes');
      }
      const box = getPixelBox(sticker, width, height);
      const overlay = await sharp(svg, {
        density: 144,
        failOn: 'warning',
        limitInputPixels: IMAGE_COMPOSITION_LIMITS.maxExportPixels,
      }).resize(box.width, box.height, {fit: 'fill'}).png({compressionLevel: 9, adaptiveFiltering: false, palette: false})
        .timeout({seconds: IMAGE_COMPOSITION_LIMITS.sharpTimeoutSeconds}).toBuffer();
      overlays.push({input: overlay, left: box.left, top: box.top, blend: 'over' as const});
    }

    const png = await sharp(canvas, {
      limitInputPixels: IMAGE_COMPOSITION_LIMITS.maxExportPixels,
      sequentialRead: true,
    }).composite(overlays).png({compressionLevel: 9, adaptiveFiltering: false, palette: false})
      .timeout({seconds: IMAGE_COMPOSITION_LIMITS.sharpTimeoutSeconds}).toBuffer();
    const previewPng = await sharp(png, {
      limitInputPixels: IMAGE_COMPOSITION_LIMITS.maxExportPixels,
      sequentialRead: true,
    }).resize({width: 1024, withoutEnlargement: true})
      .png({compressionLevel: 9, adaptiveFiltering: false, palette: false})
      .timeout({seconds: IMAGE_COMPOSITION_LIMITS.sharpTimeoutSeconds}).toBuffer();
    return {png, previewPng, source: {width: sourceWidth, height: sourceHeight}, output: {width, height}};
  } catch (error) {
    if (error instanceof ImageCompositionApiError) {
      throw error;
    }
    log('composition raster failed: %s', String((error as Error)?.message || error));
    throw new ImageCompositionApiError('composition_render_failed', 422, {field: 'originalContentManifestId'});
  }
}

const MAX_CONCURRENT_RASTERS = 2;
const MAX_QUEUED_RASTERS = 16;
let activeRasters = 0;
const rasterWaiters: Array<() => void> = [];

async function acquireRasterSlot(): Promise<() => void> {
  if (activeRasters < MAX_CONCURRENT_RASTERS) {
    activeRasters += 1;
  } else {
    if (rasterWaiters.length >= MAX_QUEUED_RASTERS) {
      throw new ImageCompositionApiError('composition_render_limit', 429, {field: 'concurrency', retryable: true});
    }
    await new Promise<void>(resolve => rasterWaiters.push(resolve));
  }
  let released = false;
  return () => {
    if (released) {
      return;
    }
    released = true;
    const next = rasterWaiters.shift();
    if (next) {
      next();
    } else {
      activeRasters -= 1;
    }
  };
}

function getPixelBox(sticker: ImageCompositionStickerInput, canvasWidth: number, canvasHeight: number) {
  if (sticker.rotationDeg !== 0) {
    throw new ImageCompositionApiError('composition_invalid', 422, {field: `stickers.${sticker.id}.rotationDeg`});
  }
  const left = clamp(Math.round(sticker.x * canvasWidth), 0, canvasWidth - 1);
  const top = clamp(Math.round(sticker.y * canvasHeight), 0, canvasHeight - 1);
  const width = clamp(Math.round(sticker.width * canvasWidth), 1, canvasWidth - left);
  const height = clamp(Math.round(sticker.height * canvasHeight), 1, canvasHeight - top);
  if (width < 1 || height < 1) {
    throw new ImageCompositionApiError('composition_invalid', 422, {field: `stickers.${sticker.id}`});
  }
  return {left, top, width, height};
}

function assertDimensions(width: number, height: number) {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height)
    || width < 1 || height < 1
    || width > IMAGE_COMPOSITION_LIMITS.maxExportDimension
    || height > IMAGE_COMPOSITION_LIMITS.maxExportDimension
    || width * height > IMAGE_COMPOSITION_LIMITS.maxExportPixels
    || width * height * 4 > IMAGE_COMPOSITION_LIMITS.maxDecodedBytes) {
    throw limitError('originalDimensions');
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function limitError(field: string) {
  return new ImageCompositionApiError('composition_render_limit', 422, {field});
}
