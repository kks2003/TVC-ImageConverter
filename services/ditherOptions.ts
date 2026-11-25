import type { DitherMethod } from '../types';
import type { Translation } from '../i18n';

export interface DitherOptionGroup {
  label: string | null; // null = top-level options without an <optgroup>
  items: { value: DitherMethod; label: string }[];
}

// The dither methods offered in the UI, grouped as in the selector.
export const ditherOptionGroups = (t: Translation): DitherOptionGroup[] => [
  { label: null, items: [
    { value: 'pattern-tvc', label: t.patternTVC },
    { value: 'pattern-tvc-diffusion', label: t.patternTVCDiffusion },
  ] },
  { label: t.catModernist, items: [
    { value: 'blue-noise', label: t.blueNoise },
    { value: 'blue-noise-16x16', label: t.blueNoise16 || 'Blue Noise 16x16' },
    { value: 'blue-noise-16x16-aniso', label: t.blueNoise16Aniso || 'Blue Noise 16x16 (2:1 optimized)' },
    { value: 'yliluoma', label: 'Yliluoma' },
  ] },
  { label: t.catOrdered, items: [
    { value: 'cluster-dot-8x8', label: t.clusterDot },
    { value: 'bayer-16x16', label: t.bayer16 },
    { value: 'ordered-8x8', label: t.ordered8 },
    { value: 'ordered-4x4', label: t.ordered4 },
    { value: 'ordered-2x2', label: t.ordered2 },
    { value: 'threshold', label: t.threshold },
    { value: 'none', label: t.none },
  ] },
  { label: t.catDiffusion, items: [
    { value: 'floyd-steinberg', label: 'Floyd-Steinberg' },
    { value: 'atkinson', label: 'Atkinson' },
    { value: 'sierra-lite', label: t.sierraLite },
    { value: 'stucki', label: t.stucki },
    { value: 'burkes', label: t.burkes },
    { value: 'jarvis', label: t.jarvis },
    { value: 'ostromoukhov', label: t.ostromoukhov || 'Ostromoukhov' },
  ] },
];
