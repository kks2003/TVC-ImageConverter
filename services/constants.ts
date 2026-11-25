import type { DitherMethod, ImageAdjustments } from '../types';

export const TVC_MODES = {
  MODE_16: 'tvc-16' as const,
  MODE_4: 'tvc-4' as const,
  MODE_2: 'tvc-2' as const,
};

// Dither methods where the "Error Diffusion Amount" slider actually has an
// effect (see services/imageProcessor.ts - only the true error-diffusion
// family propagates quantization error, scaled by ditherAmount). Ordered,
// pattern-tvc, threshold and "none" ignore that setting entirely.
export const ERROR_DIFFUSION_METHODS: DitherMethod[] = [
  'floyd-steinberg', 'atkinson', 'sierra-lite', 'stucki', 'burkes', 'jarvis', 'pattern-tvc-diffusion', 'ostromoukhov'
];


export const DEFAULT_ADJUSTMENTS: ImageAdjustments = {
  brightness: 0,
  contrast: 0,
  saturation: 100,
  gamma: 1.0,
  ditherAmount: 50,
  noiseLevel: 50,
  solidSnap: 50,
  denoise: 0,
  unsharpMask: 0,
  toneMapping: 0
};
