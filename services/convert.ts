import { processImage } from './imageProcessor';
import { FIXED_PALETTE } from './palette';
import type { DitherMethod, ProcessingSettings } from '../types';

export interface ConversionResult {
  url: string;           // PNG data URL of the converted image
  indices: Uint8Array;   // FIXED_PALETTE indices, rawWidth * rawHeight
  rgba: Uint8ClampedArray;
  rawWidth: number;
  rawHeight: number;
}

// Runs the converter for one set of settings. Shared by the main preview and
// the dither comparison grid, so both always render the same way.
export const convertImage = async (img: HTMLImageElement, currentSettings: ProcessingSettings): Promise<ConversionResult> => {
  // In Original Mode with saveOriginalSize=false, use 'tvc' resolution mode for composition
  const isSavingComposition = currentSettings.resolutionMode === 'original' && !currentSettings.saveOriginalSize;
  const effectiveResolutionMode = isSavingComposition ? 'tvc' : currentSettings.resolutionMode;
  const effectiveFitMode = (currentSettings.resolutionMode === 'original' && currentSettings.saveOriginalSize) ? 'stretch' : currentSettings.fitMode;

  let paletteToUse = currentSettings.selectedColors 
    ? currentSettings.selectedColors.map(i => FIXED_PALETTE[i])
    : FIXED_PALETTE;

  let selectedColorsToUse = currentSettings.selectedColors;

  const result = await processImage(
    img, 
    paletteToUse, 
    effectiveFitMode, 
    currentSettings.ditherMethod,
    currentSettings.adjustments,
    currentSettings.positionX,
    currentSettings.positionY,
    currentSettings.zoom,
    currentSettings.backgroundColor,
    currentSettings.outputMode,
    effectiveResolutionMode,
    currentSettings.invertColors,
    undefined,
    currentSettings.serpentine,
    currentSettings.perceptualWeighting,
    currentSettings.pixelArtCleaning,
    currentSettings.autoColorSelection,
    currentSettings.disabledPatternPairs ?? [],
    currentSettings.resizeQuality ?? 'sharp',
    currentSettings.preciseAutoColor ?? false,
    currentSettings.patternMixMode ?? 'checker'
  );

  // Map indices back to the full 15-color palette if a subset was used
  let finalIndices = result.indices;
  if (selectedColorsToUse) {
    finalIndices = new Uint8Array(result.indices.length);
    for (let i = 0; i < result.indices.length; i++) {
      finalIndices[i] = selectedColorsToUse[result.indices[i]];
    }
  }

  // Width/Height here are "raw" pixel dimensions
  let rawWidth = Math.ceil(img.width / (currentSettings.outputMode === 'tvc-16' ? 2 : 1));
  let rawHeight = img.height;
  
  if (effectiveResolutionMode === 'tvc256k') {
    rawWidth = 256;
    rawHeight = 240;
  } else if (effectiveResolutionMode === 'tvc') {
    if (currentSettings.outputMode === 'tvc-16') {
      rawWidth = 128;
      rawHeight = 240;
    } else if (currentSettings.outputMode === 'tvc-4') {
      rawWidth = 256;
      rawHeight = 240;
    } else if (currentSettings.outputMode === 'tvc-2') {
      rawWidth = 512;
      rawHeight = 240;
    }
  }

  return { url: result.url, indices: finalIndices, rgba: result.rgba, rawWidth, rawHeight };
};

// A painted area (mask over the result's raw pixels) that gets a different
// dither method than the rest of the image.
export interface RegionOverride {
  mask: Uint8Array; // 1 = use the region's method, rawWidth * rawHeight
  width: number;
  height: number;
  ditherMethod: DitherMethod;
}

// Per pixel: `b` where mask is set, otherwise `a`. Returns new arrays.
export const compositeByMask = (
  a: { indices: Uint8Array; rgba: Uint8ClampedArray },
  b: { indices: Uint8Array; rgba: Uint8ClampedArray },
  mask: Uint8Array,
): { indices: Uint8Array; rgba: Uint8ClampedArray } => {
  const indices = new Uint8Array(a.indices);
  const rgba = new Uint8ClampedArray(a.rgba);
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i]) continue;
    indices[i] = b.indices[i];
    rgba[i * 4] = b.rgba[i * 4];
    rgba[i * 4 + 1] = b.rgba[i * 4 + 1];
    rgba[i * 4 + 2] = b.rgba[i * 4 + 2];
    rgba[i * 4 + 3] = b.rgba[i * 4 + 3];
  }
  return { indices, rgba };
};

// convertImage(), plus the painted region converted with its own dither
// method and blended in. Falls back to the plain conversion when there is no
// region or it doesn't fit the current output size (e.g. after a mode change).
export const convertImageWithRegion = async (
  img: HTMLImageElement, settings: ProcessingSettings, region: RegionOverride | null,
): Promise<ConversionResult> => {
  const main = await convertImage(img, settings);
  if (!region || region.ditherMethod === settings.ditherMethod) return main;
  if (region.width !== main.rawWidth || region.height !== main.rawHeight) return main;
  const n = main.rawWidth * main.rawHeight;
  if (main.rgba.length !== n * 4 || !region.mask.some((v) => v)) return main;
  const alt = await convertImage(img, { ...settings, ditherMethod: region.ditherMethod });
  if (alt.rgba.length !== n * 4) return main;
  const mixed = compositeByMask(main, alt, region.mask);
  const canvas = document.createElement('canvas');
  canvas.width = main.rawWidth;
  canvas.height = main.rawHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) return main;
  const imageData = ctx.createImageData(main.rawWidth, main.rawHeight);
  imageData.data.set(mixed.rgba);
  ctx.putImageData(imageData, 0, 0);
  return { ...main, indices: mixed.indices, rgba: mixed.rgba, url: canvas.toDataURL('image/png') };
};

// Paints (value 1) or erases (0) an ellipse into a mask. `pixelAspectX` makes
// the brush round on screen for the 2:1 pixels of the 16-colour mode.
export const paintMask = (
  mask: Uint8Array, w: number, h: number, cx: number, cy: number, radius: number, value: 0 | 1, pixelAspectX = 1,
): void => {
  const rx = Math.max(0.5, radius / pixelAspectX), ry = Math.max(0.5, radius);
  for (let y = Math.max(0, Math.floor(cy - ry)); y <= Math.min(h - 1, Math.ceil(cy + ry)); y++) {
    for (let x = Math.max(0, Math.floor(cx - rx)); x <= Math.min(w - 1, Math.ceil(cx + rx)); x++) {
      const dx = (x - cx) / rx, dy = (y - cy) / ry;
      if (dx * dx + dy * dy <= 1) mask[y * w + x] = value;
    }
  }
};
