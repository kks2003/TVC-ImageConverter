
export interface PixelData {
  originalUrl: string;
  processedUrl: string;
  indices: Uint8Array;
  rgba: Uint8ClampedArray; // Added for BMP generation
  palette: string[];
  width: number;
  height: number;
}

export enum ProcessingState {
  IDLE = 'IDLE',
  UPLOADING = 'UPLOADING',
  ANALYZING = 'ANALYZING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  ERROR = 'ERROR'
}

export type DitherMethod = 
  | 'pattern-tvc'
  | 'pattern-tvc-diffusion'
  | 'none' 
  | 'threshold'
  | 'ordered-2x2'
  | 'ordered-4x4'
  | 'ordered-8x8'
  | 'bayer-16x16'
  | 'cluster-dot-8x8'
  | 'floyd-steinberg' 
  | 'atkinson' 
  | 'sierra-lite'
  | 'stucki'
  | 'burkes'
  | 'jarvis'
  | 'ostromoukhov'
  | 'blue-noise'
  | 'blue-noise-16x16'
  | 'blue-noise-16x16-aniso'
  | 'yliluoma';

export interface ImageAdjustments {
  brightness: number; // -100 to 100
  contrast: number;   // -100 to 200
  saturation: number; // 0 to 400
  gamma: number;      // 0.1 to 6.0
  ditherAmount: number; // 0 to 100
  noiseLevel: number;   // 0 to 100
  solidSnap: number;    // 0 to 100
  denoise: number;      // 0 to 100
  unsharpMask: number;  // 0 to 100
  toneMapping: number;  // 0 to 100
}

export interface ProcessingSettings {
  ditherMethod: DitherMethod;
  fitMode: 'cover' | 'contain' | 'stretch';
  adjustments: ImageAdjustments;
  positionX: number; // 0 to 100 (percentage)
  positionY: number; // 0 to 100 (percentage)
  zoom: number;      // 1.0 to 4.0
  backgroundColor: string;
  outputMode: 'tvc-16' | 'tvc-4' | 'tvc-2';
  resolutionMode: 'tvc' | 'original' | 'tvc256k';
  saveOriginalSize: boolean;
  selectedColors?: number[]; // Indices of the 15 TVC colors (0-14)
  invertColors?: boolean;
  serpentine: boolean;
  perceptualWeighting: boolean;
  pixelArtCleaning: boolean;
  autoColorSelection: boolean;
  // Pairs of the 15 fixed TVC colors that pattern-tvc / pattern-tvc-diffusion
  // must never combine into a checkerboard. Each entry is a canonical key
  // "#HEXA|#HEXB" (the two hex colors, sorted) - see services/imageProcessor.ts
  // pairKey(). Keyed by color, not palette index, so it stays correct across
  // tvc-4/tvc-2 auto color selection (which can reorder/subset the palette).
  disabledPatternPairs?: string[];
  // How the source image is downscaled onto the TVC canvas before dithering.
  // 'sharp' (default, legacy behavior): nearest-neighbor - picks one source
  // pixel per destination pixel. Preserves fine noise/texture from the
  // source, which can look "hand-crafted" once dithered, but aliases on
  // photographic sources. 'smooth': gamma-correct area averaging (mixes in
  // linear light, like the Yliluoma dither's color mixing) - cleaner, less
  // aliased, closer to a properly downsampled photo.
  resizeQuality?: 'sharp' | 'smooth';
  // Uses CIELAB (perceptually uniform) distance instead of redmean/Euclidean
  // when the "Auto Color" K-means-style palette picker chooses the best
  // 4/2 colors for a tvc-4/tvc-2 conversion. Only affects that one-time
  // selection step, not per-pixel dithering.
  preciseAutoColor?: boolean;
  // How pattern-TVC blends its two colors. 'checker' (default) alternates
  // per-pixel like a checkerboard; 'scanline' alternates whole rows, which
  // on the 16-color mode's 2:1 pixels often blends more smoothly on a real
  // CRT (and matches how the era's artists commonly dithered by hand).
  patternMixMode?: 'checker' | 'scanline';
}
