import { processImage } from './imageProcessor';
import { FIXED_PALETTE } from './palette';
import type { ProcessingSettings } from '../types';

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
