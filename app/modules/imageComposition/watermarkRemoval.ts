import {watermarkIdentity} from '../drivers/convert/imageWatermarkHelpers.js';
import {ImageCompositionApiError} from './helpers.js';
import type {ImageCompositionRender} from './contract.js';

// The watermark driver extends the canvas; only that exact recipe is reversible.
export function watermarkOriginalHeight(width: number, height: number, driver, properties): number {
  if (properties?.imageWatermark?.version !== 1
    || properties.imageWatermark.identity !== watermarkIdentity(driver)) {
    throw new ImageCompositionApiError('composition_invalid', 422, {field: 'render.removeWatermark', reason: 'watermark_identity_mismatch'});
  }
  let low = 1;
  let high = height - 1;
  while (low <= high) {
    const originalHeight = Math.floor((low + high) / 2);
    const bandHeight = 2 * Math.max(1, Math.round(Math.max(width, originalHeight) * driver.params.sizeRatio));
    const totalHeight = originalHeight + bandHeight;
    if (totalHeight === height) {
      return originalHeight;
    }
    if (totalHeight < height) {
      low = originalHeight + 1;
    } else {
      high = originalHeight - 1;
    }
  }
  throw new ImageCompositionApiError('composition_invalid', 422, {field: 'render.removeWatermark', reason: 'watermark_geometry_mismatch'});
}

export function compositionSourceHeight(width: number, height: number, render?: ImageCompositionRender, properties?) {
  if (!render?.removeWatermark) {
    return height;
  }
  if (typeof properties === 'string') {
    try {
      properties = JSON.parse(properties);
    } catch (_error) {
      throw new ImageCompositionApiError('composition_invalid', 422, {field: 'render.removeWatermark', reason: 'watermark_identity_mismatch'});
    }
  }
  return watermarkOriginalHeight(width, height, render.removeWatermark, properties);
}
