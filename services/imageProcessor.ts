
import { ImageAdjustments, DitherMethod } from '../types';

export const TARGET_WIDTH = 128;
export const TARGET_HEIGHT = 240;

interface RGB {
  r: number;
  g: number;
  b: number;
}

const hexToRgb = (hex: string): RGB => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : { r: 0, g: 0, b: 0 };
};

const rgbToHex = (c: RGB): string => {
  const toHex = (n: number) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, '0').toUpperCase();
  return `#${toHex(c.r)}${toHex(c.g)}${toHex(c.b)}`;
};

// Canonical key for a color pair, independent of argument order - used to
// look up entries in ProcessingSettings.disabledPatternPairs.
export const pairKey = (hexA: string, hexB: string): string =>
  [hexA.toUpperCase(), hexB.toUpperCase()].sort().join('|');

// Redmean color distance - perceptually better than Euclidean RGB
const getRedmeanDistance = (c1: RGB, c2: RGB) => {
  const rmean = (c1.r + c2.r) / 2;
  const r = c1.r - c2.r;
  const g = c1.g - c2.g;
  const b = c1.b - c2.b;
  return Math.sqrt(
    (2 + rmean / 256) * r * r +
    4 * g * g +
    (2 + (255 - rmean) / 256) * b * b
  );
};

// Simple Euclidean distance
const getEuclideanDistance = (c1: RGB, c2: RGB) => {
  return Math.sqrt(
    Math.pow(c1.r - c2.r, 2) +
    Math.pow(c1.g - c2.g, 2) +
    Math.pow(c1.b - c2.b, 2)
  );
};

const findNearestColor = (pixel: RGB, palette: RGB[], usePerceptual: boolean = true): { color: RGB, index: number } => {
  let minDistance = Infinity;
  let nearest = palette[0];
  let nearestIndex = 0;

  for (let i = 0; i < palette.length; i++) {
    const color = palette[i];
    const dist = usePerceptual ? getRedmeanDistance(pixel, color) : getEuclideanDistance(pixel, color);
    if (dist < minDistance) {
      minDistance = dist;
      nearest = color;
      nearestIndex = i;
    }
  }
  return { color: nearest, index: nearestIndex };
};

// Precompute color pairs for Pattern TVC via a quantized lookup table.
//
// Building a fresh best-pair search for every pixel (O(width*height*pairs))
// was the main performance cost of pattern-tvc / pattern-tvc-diffusion on
// large canvases. This mirrors the approach already used by the auto-tuner
// (services/autoTuner.ts buildPaletteLUT): quantize RGB to 5 bits/channel
// (32^3 = 32768 buckets) and resolve the best pair once per bucket, then do
// a single array lookup per pixel. The quantization step (~8 levels per
// channel) is the same one the auto-tuner's internal simulation already
// uses, so this also makes the live render match what auto-tune previewed.
//
// This now also respects `usePerceptual` (previously pattern-tvc always used
// plain Euclidean distance regardless of the "Perceptual Weighting" toggle -
// that inconsistency is fixed here).
//
// `pairs` is built as a flat list up front specifically so that a future
// "disable this color pair" feature can filter it before the LUT scan,
// without touching the scanning/lookup logic below.
const LUT_BITS = 5;
const LUT_SIZE = 1 << LUT_BITS; // 32 levels per channel -> 32768 buckets
const getLutIndex = (r: number, g: number, b: number): number => {
  const r5 = Math.max(0, Math.min(LUT_SIZE - 1, Math.round(r) >> (8 - LUT_BITS)));
  const g5 = Math.max(0, Math.min(LUT_SIZE - 1, Math.round(g) >> (8 - LUT_BITS)));
  const b5 = Math.max(0, Math.min(LUT_SIZE - 1, Math.round(b) >> (8 - LUT_BITS)));
  return (r5 << (LUT_BITS * 2)) | (g5 << LUT_BITS) | b5;
};

interface PaletteColor { color: RGB; index: number; }
interface PatternPair { c1: PaletteColor; c2: PaletteColor; }

const buildPatternPairs = (palette: RGB[], disabledPairs: Set<string>): (PatternPair & { avg: RGB })[] => {
  const pairs: (PatternPair & { avg: RGB })[] = [];
  for (let i = 0; i < palette.length; i++) {
    for (let j = i; j < palette.length; j++) {
      // A color's SELF pair (i===i) is the single source of truth for
      // "this color is excluded entirely": if it's set, the color is
      // dropped from solid use AND from every mixed pair. Mixed pairs are
      // otherwise independent, so toggling one never changes whether some
      // other color counts as excluded.
      // Every entry here is explicit: excluding a whole color writes out
      // all of its pairs, so a single combination can still be switched
      // back on individually without the color-level state overriding it.
      if (disabledPairs.has(pairKey(rgbToHex(palette[i]), rgbToHex(palette[j])))) continue;
      const c1 = palette[i];
      const c2 = palette[j];
      pairs.push({
        c1: { color: c1, index: i },
        c2: { color: c2, index: j },
        avg: { r: (c1.r + c2.r) / 2, g: (c1.g + c2.g) / 2, b: (c1.b + c2.b) / 2 }
      });
    }
  }
  // Safety net: if the user has somehow disabled every single combination
  // (e.g. excluded every color in the active palette), fall back to the
  // unfiltered list rather than leaving pattern-tvc with nothing to render.
  return pairs.length > 0 ? pairs : buildPatternPairs(palette, new Set());
};

const buildPatternPairLUT = (palette: RGB[], usePerceptual: boolean, disabledPairs: Set<string> = new Set()): PatternPair[] => {
  const pairs = buildPatternPairs(palette, disabledPairs);
  const lut = new Array<PatternPair>(LUT_SIZE * LUT_SIZE * LUT_SIZE);

  for (let r5 = 0; r5 < LUT_SIZE; r5++) {
    const r = (r5 * 255) / (LUT_SIZE - 1);
    for (let g5 = 0; g5 < LUT_SIZE; g5++) {
      const g = (g5 * 255) / (LUT_SIZE - 1);
      for (let b5 = 0; b5 < LUT_SIZE; b5++) {
        const b = (b5 * 255) / (LUT_SIZE - 1);
        const idx = (r5 << (LUT_BITS * 2)) | (g5 << LUT_BITS) | b5;

        let minDist = Infinity;
        let best = pairs[0];
        for (let i = 0; i < pairs.length; i++) {
          const p = pairs[i];
          const dist = usePerceptual
            ? getRedmeanDistance({ r, g, b }, p.avg)
            : getEuclideanDistance({ r, g, b }, p.avg);
          if (dist < minDist) {
            minDist = dist;
            best = p;
          }
        }
        lut[idx] = { c1: best.c1, c2: best.c2 };
      }
    }
  }

  return lut;
};

const lookupPatternPair = (lut: PatternPair[], pixel: RGB): PatternPair =>
  lut[getLutIndex(pixel.r, pixel.g, pixel.b)];

// --- Yliluoma's arbitrary-palette positional dithering (algorithm 2) ---
// https://bisqwit.iki.fi/story/howto/dither/jy/ - the classic technique for
// dithering to small, irregularly-spaced palettes like a retro computer's
// fixed hardware colors. Pattern-tvc is a special case of this idea limited
// to exactly 2 colors mixed 50/50; this generalizes it to up to
// YLILUOMA_CANDIDATES colors in arbitrary proportions, selected greedily per
// color bucket and then indexed by the (already-verified-valid) 8x8 Bayer
// matrix at render time.
const YLILUOMA_CANDIDATES = 8;
const YLILUOMA_GAMMA = 2.2;

const srgbToLinear = (v: number): number => Math.pow(Math.max(0, v) / 255, YLILUOMA_GAMMA);
const linearToSrgb = (v: number): number => Math.pow(Math.max(0, v), 1 / YLILUOMA_GAMMA) * 255;

const luma601 = (c: RGB): number => c.r * 0.299 + c.g * 0.587 + c.b * 0.114;

// Yliluoma's ColorCompare: luma-weighted squared distance plus a separate
// luma term, so brightness mismatches are penalized more than the raw RGB
// distance alone would - this is what gives the algorithm's output better
// perceived tonal accuracy than plain Euclidean/ordered dithering.
const yliluomaColorCompare = (input: RGB, test: RGB): number => {
  const luma1 = luma601(input) / 255;
  const luma2 = luma601(test) / 255;
  const lumaDiff = luma1 - luma2;
  const dr = (input.r - test.r) / 255;
  const dg = (input.g - test.g) / 255;
  const db = (input.b - test.b) / 255;
  return (dr * dr * 0.299 + dg * dg * 0.587 + db * db * 0.114) * 0.75 + lumaDiff * lumaDiff;
};

// Greedily builds a length-`limit` list of palette indices (sorted by
// luminance) whose average best approximates `input`, mixing in linear
// light for gamma-correct averaging. Uses the doubling-growth trick from
// the original algorithm so it needs O(log(limit)) rounds instead of
// O(limit) - cheap enough to run once per LUT bucket.
const buildYliluomaPlan = (input: RGB, palette: RGB[], paletteLinear: RGB[], limit: number, allowedIndices: number[]): number[] => {
  const result: number[] = [];
  const soFar = { r: 0, g: 0, b: 0 };

  while (result.length < limit) {
    const maxTestCount = Math.max(1, result.length);
    let leastPenalty = -1;
    let chosenIndex = allowedIndices[0];
    let chosenAmount = 1;

    for (let ai = 0; ai < allowedIndices.length; ai++) {
      const index = allowedIndices[ai];
      const addColor = paletteLinear[index];
      let sum = { ...soFar };
      let add = { ...addColor };
      for (let p = 1; p <= maxTestCount; p *= 2) {
        sum = { r: sum.r + add.r, g: sum.g + add.g, b: sum.b + add.b };
        add = { r: add.r + add.r, g: add.g + add.g, b: add.b + add.b };
        const t = result.length + p;
        const testLinear = { r: sum.r / t, g: sum.g / t, b: sum.b / t };
        const test = { r: linearToSrgb(testLinear.r), g: linearToSrgb(testLinear.g), b: linearToSrgb(testLinear.b) };
        const penalty = yliluomaColorCompare(input, test);
        if (leastPenalty < 0 || penalty < leastPenalty) {
          leastPenalty = penalty;
          chosenIndex = index;
          chosenAmount = p;
        }
      }
    }

    const addCount = Math.min(chosenAmount, limit - result.length);
    for (let k = 0; k < addCount; k++) result.push(chosenIndex);
    soFar.r += paletteLinear[chosenIndex].r * addCount;
    soFar.g += paletteLinear[chosenIndex].g * addCount;
    soFar.b += paletteLinear[chosenIndex].b * addCount;
  }

  result.sort((a, b) => luma601(palette[a]) - luma601(palette[b]));
  return result;
};

// Flat Uint8Array of length LUT_SIZE^3 * limit: for each quantized RGB
// bucket, `limit` palette indices forming that bucket's mixing plan.
const buildYliluomaLUT = (palette: RGB[], limit: number = YLILUOMA_CANDIDATES, disabledColors: Set<number> = new Set()): Uint8Array => {
  const paletteLinear = palette.map(c => ({ r: srgbToLinear(c.r), g: srgbToLinear(c.g), b: srgbToLinear(c.b) }));
  let allowedIndices = palette.map((_, i) => i).filter(i => !disabledColors.has(i));
  // Safety net: if every color got excluded, fall back to the full palette
  // rather than leaving Yliluoma with nothing to mix.
  if (allowedIndices.length === 0) allowedIndices = palette.map((_, i) => i);

  const lut = new Uint8Array(LUT_SIZE * LUT_SIZE * LUT_SIZE * limit);

  for (let r5 = 0; r5 < LUT_SIZE; r5++) {
    const r = (r5 * 255) / (LUT_SIZE - 1);
    for (let g5 = 0; g5 < LUT_SIZE; g5++) {
      const g = (g5 * 255) / (LUT_SIZE - 1);
      for (let b5 = 0; b5 < LUT_SIZE; b5++) {
        const b = (b5 * 255) / (LUT_SIZE - 1);
        const idx = (r5 << (LUT_BITS * 2)) | (g5 << LUT_BITS) | b5;
        const plan = buildYliluomaPlan({ r, g, b }, palette, paletteLinear, limit, allowedIndices);
        lut.set(plan, idx * limit);
      }
    }
  }

  return lut;
};

// For pattern-tvc-diffusion's solid-snap check: like findNearestColor, but
// skips any color the user fully excluded (its self-pair is in
// disabledPairs - see the pattern-pair blocklist panel). Without this, a
// pixel that solid-snaps (see below) could still pick an "excluded" color
// directly, bypassing the blocklist entirely for flat/solid image regions.
const findNearestAllowedSolidColor = (
  pixel: RGB,
  palette: RGB[],
  usePerceptual: boolean,
  disabledPairs: Set<string>
): { color: RGB, index: number } => {
  let minDist = Infinity;
  let bestIndex = -1;
  for (let i = 0; i < palette.length; i++) {
    const hex = rgbToHex(palette[i]);
    if (disabledPairs.has(pairKey(hex, hex))) continue;
    const d = usePerceptual ? getRedmeanDistance(pixel, palette[i]) : getEuclideanDistance(pixel, palette[i]);
    if (d < minDist) { minDist = d; bestIndex = i; }
  }
  // Safety net: if every color was excluded, fall back to the unfiltered
  // palette rather than leaving nothing to solid-snap to.
  if (bestIndex === -1) return findNearestColor(pixel, palette, usePerceptual);
  return { color: palette[bestIndex], index: bestIndex };
};

const applyAdjustments = (data: Uint8ClampedArray, adj: ImageAdjustments) => {
  const brightness = adj.brightness / 100;
  const contrast = (adj.contrast + 100) / 100;
  const saturation = adj.saturation / 100;
  const gamma = 1 / adj.gamma;
  const toneMapping = adj.toneMapping / 100;

  for (let i = 0; i < data.length; i += 4) {
    let r = data[i] / 255;
    let g = data[i + 1] / 255;
    let b = data[i + 2] / 255;

    // Tone Mapping (Simple Reinhard-like or log-based for shadows)
    if (toneMapping > 0) {
      const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      const mappedLuma = luma / (1 + luma * (1 - toneMapping));
      const scale = luma > 0 ? mappedLuma / luma : 0;
      r *= scale;
      g *= scale;
      b *= scale;
    }

    // Brightness
    r += brightness;
    g += brightness;
    b += brightness;

    // Contrast
    r = (r - 0.5) * contrast + 0.5;
    g = (g - 0.5) * contrast + 0.5;
    b = (b - 0.5) * contrast + 0.5;

    // Gamma
    if (gamma !== 1) {
        r = Math.pow(Math.max(0, r), gamma);
        g = Math.pow(Math.max(0, g), gamma);
        b = Math.pow(Math.max(0, b), gamma);
    }

    // Saturation
    const gray = 0.299 * r + 0.587 * g + 0.114 * b;
    r = gray + (r - gray) * saturation;
    g = gray + (g - gray) * saturation;
    b = gray + (b - gray) * saturation;

    data[i] = Math.max(0, Math.min(255, r * 255));
    data[i + 1] = Math.max(0, Math.min(255, g * 255));
    data[i + 2] = Math.max(0, Math.min(255, b * 255));
  }
};

const applyDenoise = (data: Uint8ClampedArray, width: number, height: number, amount: number) => {
  if (amount <= 0) return;
  const copy = new Uint8ClampedArray(data);
  const radius = amount > 50 ? 2 : 1;
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      let r = 0, g = 0, b = 0, count = 0;
      
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
            const nidx = (ny * width + nx) * 4;
            r += copy[nidx];
            g += copy[nidx + 1];
            b += copy[nidx + 2];
            count++;
          }
        }
      }
      
      data[idx] = r / count;
      data[idx + 1] = g / count;
      data[idx + 2] = b / count;
    }
  }
};

const applyUnsharpMask = (data: Uint8ClampedArray, width: number, height: number, amount: number) => {
  if (amount <= 0) return;
  const copy = new Uint8ClampedArray(data);
  const strength = amount / 50;
  
  // Simple Laplacian-like sharpening kernel
  const kernel = [
    0, -1, 0,
    -1, 5, -1,
    0, -1, 0
  ];
  
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = (y * width + x) * 4;
      let r = 0, g = 0, b = 0;
      
      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          const nidx = ((y + ky) * width + (x + kx)) * 4;
          const weight = kernel[(ky + 1) * 3 + (kx + 1)];
          r += copy[nidx] * weight;
          g += copy[nidx + 1] * weight;
          b += copy[nidx + 2] * weight;
        }
      }
      
      data[idx] = Math.max(0, Math.min(255, copy[idx] + (r - copy[idx]) * strength));
      data[idx + 1] = Math.max(0, Math.min(255, copy[idx + 1] + (g - copy[idx + 1]) * strength));
      data[idx + 2] = Math.max(0, Math.min(255, copy[idx + 2] + (b - copy[idx + 2]) * strength));
    }
  }
};

const cleanPixelArt = (indices: Uint8Array, width: number, height: number) => {
  const copy = new Uint8Array(indices);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      const color = copy[idx];
      
      // Check neighbors
      let sameCount = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          if (copy[(y + dy) * width + (x + dx)] === color) {
            sameCount++;
          }
        }
      }
      
      // If isolated (0 or 1 neighbor of same color), replace with most common neighbor
      if (sameCount <= 1) {
        const counts: { [key: number]: number } = {};
        let maxCount = 0;
        let bestColor = color;
        
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const c = copy[(y + dy) * width + (x + dx)];
            counts[c] = (counts[c] || 0) + 1;
            if (counts[c] > maxCount) {
              maxCount = counts[c];
              bestColor = c;
            }
          }
        }
        indices[idx] = bestColor;
      }
    }
  }
};

// --- CIELAB color distance (for the "precise" Auto Color option) ---
// Used only by findBestKMeansPalette below, which runs once per conversion
// (not per-pixel), so the extra cost of Lab conversion here is negligible.
// Redmean/Euclidean (used everywhere else, including per-pixel dithering)
// stay as they are - this is an additive, opt-in upgrade specifically for
// picking the best 4/2 colors to represent an image, not a replacement.
const rgbToLab = (c: RGB): { l: number; a: number; b: number } => {
  let r = c.r / 255, g = c.g / 255, b = c.b / 255;
  r = r > 0.04045 ? Math.pow((r + 0.055) / 1.055, 2.4) : r / 12.92;
  g = g > 0.04045 ? Math.pow((g + 0.055) / 1.055, 2.4) : g / 12.92;
  b = b > 0.04045 ? Math.pow((b + 0.055) / 1.055, 2.4) : b / 12.92;
  r *= 100; g *= 100; b *= 100;

  let x = r * 0.4124 + g * 0.3576 + b * 0.1805;
  let y = r * 0.2126 + g * 0.7152 + b * 0.0722;
  let z = r * 0.0193 + g * 0.1192 + b * 0.9505;

  x /= 95.047; y /= 100; z /= 108.883;
  x = x > 0.008856 ? Math.pow(x, 1 / 3) : (7.787 * x) + 16 / 116;
  y = y > 0.008856 ? Math.pow(y, 1 / 3) : (7.787 * y) + 16 / 116;
  z = z > 0.008856 ? Math.pow(z, 1 / 3) : (7.787 * z) + 16 / 116;

  return { l: (116 * y) - 16, a: 500 * (x - y), b: 200 * (y - z) };
};

const getLabDistanceSq = (c1: RGB, c2: RGB): number => {
  const lab1 = rgbToLab(c1);
  const lab2 = rgbToLab(c2);
  const dl = lab1.l - lab2.l, da = lab1.a - lab2.a, db = lab1.b - lab2.b;
  return dl * dl + da * da + db * db;
};

const findBestKMeansPalette = (data: Uint8ClampedArray, fullPalette: RGB[], k: number, usePerceptual: boolean, useLab: boolean = false): RGB[] => {
  // Simplified K-Means: find k colors from fullPalette that best represent the image
  // 1. Sample pixels
  const samples: RGB[] = [];
  const step = Math.max(1, Math.floor(data.length / 4 / 1000));
  for (let i = 0; i < data.length; i += 4 * step) {
    samples.push({ r: data[i], g: data[i + 1], b: data[i + 2] });
  }
  
  // 2. For each possible combination? No, too many.
  // Let's use a greedy approach: pick the color that reduces the total error most
  const selected: RGB[] = [];
  const remaining = [...fullPalette];
  
  // Pick first color: average pixel
  let avgR = 0, avgG = 0, avgB = 0;
  samples.forEach(s => { avgR += s.r; avgG += s.g; avgB += s.b; });
  const avg = { r: avgR / samples.length, g: avgG / samples.length, b: avgB / samples.length };
  
  let first: { color: RGB; index: number };
  if (useLab) {
    let bestI = 0, bestD = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const d = getLabDistanceSq(avg, remaining[i]);
      if (d < bestD) { bestD = d; bestI = i; }
    }
    first = { color: remaining[bestI], index: bestI };
  } else {
    first = findNearestColor(avg, remaining, usePerceptual);
  }
  selected.push(first.color);
  remaining.splice(first.index, 1);
  
  while (selected.length < k && remaining.length > 0) {
    let bestIdx = 0;
    let minTotalDist = Infinity;
    
    for (let i = 0; i < remaining.length; i++) {
      const testPalette = [...selected, remaining[i]];
      let totalDist = 0;
      for (const s of samples) {
        let minDist = Infinity;
        for (const c of testPalette) {
          const d = useLab ? getLabDistanceSq(s, c) : (usePerceptual ? getRedmeanDistance(s, c) : getEuclideanDistance(s, c));
          if (d < minDist) minDist = d;
        }
        totalDist += minDist;
      }
      
      if (totalDist < minTotalDist) {
        minTotalDist = totalDist;
        bestIdx = i;
      }
    }
    
    selected.push(remaining[bestIdx]);
    remaining.splice(bestIdx, 1);
  }
  
  return selected;
};

const BAYER_2x2 = [[0, 2], [3, 1]];
const BAYER_4x4 = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
const BAYER_8x8 = [
  [0, 32, 8, 40, 2, 34, 10, 42],
  [48, 16, 56, 24, 50, 18, 58, 26],
  [12, 44, 4, 36, 14, 46, 6, 38],
  [60, 28, 52, 20, 62, 30, 54, 22],
  [3, 35, 11, 43, 1, 33, 9, 41],
  [51, 19, 59, 27, 49, 17, 57, 25],
  [15, 47, 7, 39, 13, 45, 5, 37],
  [63, 31, 55, 23, 61, 29, 53, 21]
];

const generateBayer = (size: number): number[][] => {
  if (size === 2) return BAYER_2x2;
  const halfSize = size / 2;
  const half = size === 4 ? BAYER_2x2 : size === 8 ? BAYER_4x4 : BAYER_8x8;
  const result: number[][] = Array(size).fill(0).map(() => Array(size).fill(0));
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const hY = y % halfSize;
      const hX = x % halfSize;
      const val = half[hY][hX] * 4;
      if (y < halfSize && x < halfSize) result[y][x] = val;
      else if (y < halfSize && x >= halfSize) result[y][x] = val + 2;
      else if (y >= halfSize && x < halfSize) result[y][x] = val + 3;
      else result[y][x] = val + 1;
    }
  }
  return result;
};

const BAYER_16x16 = generateBayer(16);
// Cluster Dot 8x8 (Spiral / diagonal clustered-dot screen)
// NOTE: fixed 2026-09 - the previous matrix was not a valid 0..63 permutation
// (32 and 33 were missing, 62 and 63 were each duplicated), which caused a
// slight banding/unevenness in mid-tones. Values below match the canonical
// "ClusteredDotDiagonal8x8" screen (caca.zoy.org / libcaca halftoning study).
const CLUSTER_DOT_8x8 = [
  [24, 10, 12, 26, 35, 47, 49, 37],
  [ 8,  0,  2, 14, 45, 59, 61, 51],
  [22,  6,  4, 16, 43, 57, 63, 53],
  [30, 20, 18, 28, 33, 41, 55, 39],
  [34, 46, 48, 36, 25, 11, 13, 27],
  [44, 58, 60, 50,  9,  1,  3, 15],
  [42, 56, 62, 52, 23,  7,  5, 17],
  [32, 40, 54, 38, 31, 21, 19, 29]
];

// Blue Noise 8x8
// NOTE: fixed 2026-09 - the previous matrix was not a valid 0..63 permutation
// (22,23,40,41,46 were missing; 11,14,52,53,56 were duplicated), causing
// several tone levels to be skipped or over-represented. Regenerated with a
// void-and-cluster style algorithm (toroidal Gaussian energy, sigma=1.5) so
// every threshold 0..63 is used exactly once and low-frequency clumping is
// minimized.
const BLUE_NOISE_8x8 = [
  [3, 34, 19, 60, 9, 1, 32, 41],
  [28, 47, 14, 39, 29, 58, 16, 51],
  [11, 59, 5, 53, 22, 43, 7, 37],
  [21, 44, 26, 35, 12, 49, 25, 62],
  [0, 55, 17, 46, 2, 57, 18, 33],
  [38, 30, 8, 63, 31, 40, 6, 52],
  [15, 50, 42, 23, 13, 27, 45, 10],
  [24, 56, 4, 36, 48, 54, 20, 61]
];

// Larger (16x16), void-and-cluster generated blue noise tile. The 8x8 one
// above repeats every 8 pixels, which is visible as a faint periodic
// pattern on a 128-240px canvas; this 256-level tile repeats far less
// often and has a smoother, less structured look. Kept as a separate
// option alongside the 8x8 one rather than replacing it, since some users
// may already be relying on the tighter, more compact 8x8 texture.
const BLUE_NOISE_16x16 = [
  [184, 50, 7, 23, 188, 39, 155, 194, 125, 146, 109, 16, 44, 245, 212, 29],
  [253, 171, 229, 209, 81, 99, 15, 227, 59, 251, 37, 222, 150, 63, 111, 134],
  [34, 121, 62, 157, 136, 247, 175, 90, 28, 181, 74, 100, 173, 91, 195, 73],
  [220, 93, 107, 198, 43, 219, 70, 117, 160, 215, 133, 240, 24, 208, 12, 162],
  [189, 4, 242, 27, 126, 8, 204, 144, 46, 197, 2, 56, 124, 232, 142, 52],
  [130, 149, 77, 182, 165, 57, 102, 237, 18, 113, 87, 154, 186, 41, 84, 249],
  [19, 211, 45, 234, 88, 190, 35, 224, 80, 168, 254, 218, 105, 69, 178, 115],
  [97, 170, 67, 143, 110, 250, 153, 131, 179, 64, 14, 202, 31, 164, 10, 201],
  [246, 36, 228, 122, 1, 17, 72, 210, 26, 118, 145, 49, 135, 236, 221, 55],
  [132, 159, 25, 193, 207, 174, 51, 98, 230, 191, 243, 96, 75, 116, 148, 89],
  [79, 183, 104, 60, 82, 226, 161, 140, 40, 83, 3, 176, 214, 22, 192, 6],
  [48, 216, 255, 152, 38, 127, 114, 248, 61, 203, 163, 128, 42, 65, 158, 238],
  [120, 20, 137, 95, 231, 199, 9, 185, 21, 151, 103, 225, 252, 180, 108, 205],
  [169, 71, 11, 177, 53, 30, 76, 92, 217, 119, 32, 54, 13, 94, 141, 33],
  [223, 196, 241, 112, 213, 166, 139, 235, 172, 68, 239, 138, 200, 78, 233, 58],
  [101, 86, 147, 129, 66, 244, 106, 47, 5, 206, 85, 187, 167, 123, 0, 156]
];

// Anisotropic blue noise, generated specifically for the 2:1 pixel aspect of
// the 16-color TVC mode. In that mode one logical pixel is 2 screen units
// wide but only 1 tall, so a normal (isotropic) tile indexed as
// matrix[y%size][x%size] ends up stretched 2x horizontally on the real
// display - the dither grain looks smeared sideways rather than neutral.
// This tile was produced with a void-and-cluster generator whose energy
// function counts horizontal distance double, so the resulting pattern is
// blue-noise *in screen space* on a 2:1 display. Naively resampling a
// normal tile instead (e.g. matrix[y%8][(x*2)%8]) does NOT work - it only
// ever reads half the matrix columns and collapses into hard horizontal
// stripes. Use this only for 2:1 modes; on square-pixel modes (tvc256k,
// tvc-4, tvc-2) the regular BLUE_NOISE_16x16 is the correct choice.
const BLUE_NOISE_16x16_ANISO = [
  [160,211,45,6,171,131,66,95,31,238,179,90,196,70,27,105],
  [35,78,143,72,85,21,246,197,117,158,2,214,33,240,173,191],
  [230,175,233,186,239,104,151,7,181,83,63,145,118,152,52,128],
  [1,98,23,123,36,206,44,223,57,228,127,252,81,8,205,73],
  [139,200,58,213,148,178,121,86,141,20,201,24,187,231,92,217],
  [250,116,164,93,65,17,234,169,209,100,170,103,50,110,146,40],
  [60,29,227,12,251,99,71,28,48,247,42,156,212,176,19,163],
  [183,84,136,190,159,132,188,135,112,149,77,235,68,34,242,102],
  [129,236,47,111,41,216,0,244,193,14,184,5,137,125,76,195],
  [15,157,202,79,232,59,162,94,67,220,122,97,222,180,208,49],
  [215,69,4,167,22,114,203,32,174,55,241,154,26,91,3,153],
  [101,120,243,130,185,150,80,226,142,108,38,207,61,253,119,237],
  [37,172,54,219,96,249,43,124,9,199,168,75,189,161,56,82],
  [224,198,87,30,64,10,106,182,254,88,18,134,107,39,144,177],
  [133,16,155,192,140,194,221,25,74,147,218,245,11,225,204,13],
  [62,109,255,115,229,51,165,138,210,46,113,53,166,126,89,248]
];


// --- Gamma-correct area-average resize ("smooth" resizeQuality option) ---
// The default resize ("sharp") uses the canvas's nearest-neighbor drawImage
// (imageSmoothingEnabled=false), which just picks one source pixel per
// destination pixel - fast, and its aliasing noise often reads as pleasing
// texture once dithered, but it can look harsh on photographic sources.
// This alternative averages each destination pixel's full source footprint
// in linear light (same gamma as the Yliluoma dither's color mixing) for a
// cleaner, properly-downsampled result.
const SRGB_TO_LINEAR_LUT = (() => {
  const lut = new Float32Array(256);
  for (let i = 0; i < 256; i++) lut[i] = srgbToLinear(i);
  return lut;
})();

const drawImageGammaCorrect = (
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  destX: number, destY: number, destW: number, destH: number,
  canvasWidth: number, canvasHeight: number
) => {
  const srcCanvas = document.createElement('canvas');
  srcCanvas.width = img.width;
  srcCanvas.height = img.height;
  const srcCtx = srcCanvas.getContext('2d');
  if (!srcCtx) return;
  srcCtx.drawImage(img, 0, 0);
  const srcData = srcCtx.getImageData(0, 0, img.width, img.height).data;
  const sw = img.width, sh = img.height;

  const outData = ctx.getImageData(0, 0, canvasWidth, canvasHeight);
  const out = outData.data;

  const scaleX = destW / sw;
  const scaleY = destH / sh;
  if (scaleX <= 0 || scaleY <= 0) return;

  for (let oy = 0; oy < canvasHeight; oy++) {
    const srcYStart = (oy - destY) / scaleY;
    const srcYEnd = (oy + 1 - destY) / scaleY;
    const sy0 = Math.max(0, Math.floor(srcYStart));
    const sy1 = Math.min(sh, Math.ceil(srcYEnd));
    if (sy1 <= sy0) continue; // this row falls entirely outside the source - leave background as-is

    for (let ox = 0; ox < canvasWidth; ox++) {
      const srcXStart = (ox - destX) / scaleX;
      const srcXEnd = (ox + 1 - destX) / scaleX;
      const sx0 = Math.max(0, Math.floor(srcXStart));
      const sx1 = Math.min(sw, Math.ceil(srcXEnd));
      if (sx1 <= sx0) continue;

      let rSum = 0, gSum = 0, bSum = 0, aSum = 0, count = 0;
      for (let sy = sy0; sy < sy1; sy++) {
        const rowOff = sy * sw * 4;
        for (let sx = sx0; sx < sx1; sx++) {
          const idx = rowOff + sx * 4;
          rSum += SRGB_TO_LINEAR_LUT[srcData[idx]];
          gSum += SRGB_TO_LINEAR_LUT[srcData[idx + 1]];
          bSum += SRGB_TO_LINEAR_LUT[srcData[idx + 2]];
          aSum += srcData[idx + 3];
          count++;
        }
      }
      if (count === 0) continue;
      const outIdx = (oy * canvasWidth + ox) * 4;
      out[outIdx] = linearToSrgb(rSum / count);
      out[outIdx + 1] = linearToSrgb(gSum / count);
      out[outIdx + 2] = linearToSrgb(bSum / count);
      out[outIdx + 3] = aSum / count;
    }
  }
  ctx.putImageData(outData, 0, 0);
};

// Ostromoukhov's variable-coefficient error diffusion (SIGGRAPH 2001):
// 256 (d1, d2, d3, divisor) coefficient sets, one per input intensity
// level, distributing error to the right (d1), below-left (d2), and below
// (d3) neighbors, each as a fraction of divisor. Unlike fixed-weight
// methods (Floyd-Steinberg etc.), this reduces "worm" artifacts and
// approaches a blue-noise spectrum at every tone level. Source: the
// published dithr Rust crate's OSTROMOUKHOV_COEFFS table (itself derived
// from Ostromoukhov's paper) - verified symmetric around levels 127/128
// and that each row's first three values sum to its divisor.
const OSTROMOUKHOV_COEFFS: [number, number, number, number][] = [
  [13,0,5,18],[13,0,5,18],[21,0,10,31],[7,0,4,11],[8,0,5,13],[47,3,28,78],[23,3,13,39],[15,3,8,26],
  [22,6,11,39],[43,15,20,78],[7,3,3,13],[501,224,211,936],[249,116,103,468],[165,80,67,312],[123,62,49,234],[489,256,191,936],
  [81,44,31,156],[483,272,181,936],[60,35,22,117],[53,32,19,104],[237,148,83,468],[471,304,161,936],[3,2,1,6],[481,314,185,980],
  [354,226,155,735],[1389,866,685,2940],[227,138,125,490],[267,158,163,588],[327,188,220,735],[61,34,45,140],[627,338,505,1470],[1227,638,1075,2940],
  [20,10,19,49],[1937,1000,1767,4704],[977,520,855,2352],[657,360,551,1568],[71,40,57,168],[2005,1160,1539,4704],[337,200,247,784],[2039,1240,1425,4704],
  [257,160,171,588],[691,440,437,1568],[1045,680,627,2352],[301,200,171,672],[177,120,95,392],[2141,1480,1083,4704],[1079,760,513,2352],[725,520,323,1568],
  [137,100,57,294],[2209,1640,855,4704],[53,40,19,112],[2243,1720,741,4704],[565,440,171,1176],[759,600,209,1568],[1147,920,285,2352],[2311,1880,513,4704],
  [97,80,19,196],[335,280,57,672],[1181,1000,171,2352],[793,680,95,1568],[599,520,57,1176],[2413,2120,171,4704],[405,360,19,784],[2447,2200,57,4704],
  [11,10,0,21],[158,151,3,312],[178,179,7,364],[1030,1091,63,2184],[248,277,21,546],[318,375,35,728],[458,571,63,1092],[878,1159,147,2184],
  [5,7,1,13],[172,181,37,390],[97,76,22,195],[72,41,17,130],[119,47,29,195],[4,1,1,6],[4,1,1,6],[4,1,1,6],
  [4,1,1,6],[4,1,1,6],[4,1,1,6],[4,1,1,6],[4,1,1,6],[4,1,1,6],[65,18,17,100],[95,29,26,150],
  [185,62,53,300],[30,11,9,50],[35,14,11,60],[85,37,28,150],[55,26,19,100],[80,41,29,150],[155,86,59,300],[5,3,2,10],
  [5,3,2,10],[5,3,2,10],[5,3,2,10],[5,3,2,10],[5,3,2,10],[5,3,2,10],[5,3,2,10],[5,3,2,10],
  [5,3,2,10],[5,3,2,10],[5,3,2,10],[5,3,2,10],[305,176,119,600],[155,86,59,300],[105,56,39,200],[80,41,29,150],
  [65,32,23,120],[55,26,19,100],[335,152,113,600],[85,37,28,150],[115,48,37,200],[35,14,11,60],[355,136,109,600],[30,11,9,50],
  [365,128,107,600],[185,62,53,300],[25,8,7,40],[95,29,26,150],[385,112,103,600],[65,18,17,100],[395,104,101,600],[4,1,1,6],
  [4,1,1,6],[395,104,101,600],[65,18,17,100],[385,112,103,600],[95,29,26,150],[25,8,7,40],[185,62,53,300],[365,128,107,600],
  [30,11,9,50],[355,136,109,600],[35,14,11,60],[115,48,37,200],[85,37,28,150],[335,152,113,600],[55,26,19,100],[65,32,23,120],
  [80,41,29,150],[105,56,39,200],[155,86,59,300],[305,176,119,600],[5,3,2,10],[5,3,2,10],[5,3,2,10],[5,3,2,10],
  [5,3,2,10],[5,3,2,10],[5,3,2,10],[5,3,2,10],[5,3,2,10],[5,3,2,10],[5,3,2,10],[5,3,2,10],
  [5,3,2,10],[155,86,59,300],[80,41,29,150],[55,26,19,100],[85,37,28,150],[35,14,11,60],[30,11,9,50],[185,62,53,300],
  [95,29,26,150],[65,18,17,100],[4,1,1,6],[4,1,1,6],[4,1,1,6],[4,1,1,6],[4,1,1,6],[4,1,1,6],
  [4,1,1,6],[4,1,1,6],[4,1,1,6],[119,47,29,195],[72,41,17,130],[97,76,22,195],[172,181,37,390],[5,7,1,13],
  [878,1159,147,2184],[458,571,63,1092],[318,375,35,728],[248,277,21,546],[1030,1091,63,2184],[178,179,7,364],[158,151,3,312],[11,10,0,21],
  [2447,2200,57,4704],[405,360,19,784],[2413,2120,171,4704],[599,520,57,1176],[793,680,95,1568],[1181,1000,171,2352],[335,280,57,672],[97,80,19,196],
  [2311,1880,513,4704],[1147,920,285,2352],[759,600,209,1568],[565,440,171,1176],[2243,1720,741,4704],[53,40,19,112],[2209,1640,855,4704],[137,100,57,294],
  [725,520,323,1568],[1079,760,513,2352],[2141,1480,1083,4704],[177,120,95,392],[301,200,171,672],[1045,680,627,2352],[691,440,437,1568],[257,160,171,588],
  [2039,1240,1425,4704],[337,200,247,784],[2005,1160,1539,4704],[71,40,57,168],[657,360,551,1568],[977,520,855,2352],[1937,1000,1767,4704],[20,10,19,49],
  [1227,638,1075,2940],[627,338,505,1470],[61,34,45,140],[327,188,220,735],[267,158,163,588],[227,138,125,490],[1389,866,685,2940],[354,226,155,735],
  [481,314,185,980],[3,2,1,6],[471,304,161,936],[237,148,83,468],[53,32,19,104],[60,35,22,117],[483,272,181,936],[81,44,31,156],
  [489,256,191,936],[123,62,49,234],[165,80,67,312],[249,116,103,468],[501,224,211,936],[7,3,3,13],[43,15,20,78],[22,6,11,39],
  [15,3,8,26],[23,3,13,39],[47,3,28,78],[8,0,5,13],[7,0,4,11],[21,0,10,31],[13,0,5,18],[13,0,5,18]
];

export const processImage = async (
  img: HTMLImageElement,
  paletteHex: string[],
  fitMode: 'cover' | 'contain' | 'stretch',
  ditherMethod: DitherMethod,
  adjustments: ImageAdjustments,
  positionX: number = 50,
  positionY: number = 50,
  zoom: number = 1.0,
  backgroundColor: string = '#000000',
  outputMode: 'tvc-16' | 'tvc-4' | 'tvc-2' = 'tvc-16',
  resolutionMode: 'tvc' | 'original' | 'tvc256k' = 'tvc',
  invertColors: boolean = false,
  customOffset?: { x: number; y: number; scale: number },
  serpentine: boolean = true,
  perceptualWeighting: boolean = true,
  pixelArtCleaning: boolean = false,
  autoColorSelection: boolean = false,
  disabledPatternPairs: string[] = [],
  resizeQuality: 'sharp' | 'smooth' = 'sharp',
  preciseAutoColor: boolean = false,
  patternMixMode: 'checker' | 'scanline' = 'checker'
): Promise<{ url: string; indices: Uint8Array; rgba: Uint8ClampedArray }> => {
  const isTVC16 = outputMode === 'tvc-16';
  const isTVC4 = outputMode === 'tvc-4';
  const isTVC2 = outputMode === 'tvc-2';
  
  let canvasWidth = Math.ceil(img.width / (isTVC16 ? 2 : 1));
  let canvasHeight = img.height;
  let pixelAspectX = (isTVC16 && resolutionMode !== 'tvc256k') ? 2 : 1;

  if (resolutionMode === 'tvc256k') {
    canvasWidth = 256;
    canvasHeight = 240;
    pixelAspectX = 1;
  } else if (resolutionMode === 'tvc') {
    if (isTVC16) {
      canvasWidth = 128;
      canvasHeight = 240;
    } else if (isTVC4) {
      canvasWidth = 256;
      canvasHeight = 240;
    } else if (isTVC2) {
      canvasWidth = 512;
      canvasHeight = 240;
    }
  }

  const canvas = document.createElement('canvas');
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error("Could not get canvas context");

  ctx.imageSmoothingEnabled = false;

  // Logical dimensions represent the "Visual" size (where 1 pixel unit = 1 square visual unit)
  const logicalWidth = canvasWidth * pixelAspectX;
  const logicalHeight = canvasHeight;

  let drawWidth = logicalWidth;
  let drawHeight = logicalHeight;

  if (fitMode === 'stretch' && !customOffset) {
    drawWidth = logicalWidth;
    drawHeight = logicalHeight;
  } else {
    const imageAspect = img.width / img.height;
    const targetAspect = logicalWidth / logicalHeight;

    if (fitMode === 'cover') {
      if (imageAspect > targetAspect) {
        drawHeight = logicalHeight;
        drawWidth = logicalHeight * imageAspect;
      } else {
        drawWidth = logicalWidth;
        drawHeight = logicalWidth / imageAspect;
      }
    } else { // contain
      if (imageAspect > targetAspect) {
        drawWidth = logicalWidth;
        drawHeight = logicalWidth / imageAspect;
      } else {
        drawHeight = logicalHeight;
        drawWidth = logicalHeight * imageAspect;
      }
    }
    
    const effectiveZoom = customOffset ? customOffset.scale : zoom;
    drawWidth *= effectiveZoom;
    drawHeight *= effectiveZoom;
  }

  let offsetX, offsetY;
  if (customOffset) {
    // Custom offset is relative to the center of the logical canvas
    offsetX = (logicalWidth - drawWidth) / 2 + customOffset.x;
    offsetY = (logicalHeight - drawHeight) / 2 + customOffset.y;
  } else {
    offsetX = (logicalWidth - drawWidth) * (positionX / 100);
    offsetY = (logicalHeight - drawHeight) * (positionY / 100);
  }

  let paletteRGB = paletteHex.map(hexToRgb);
  
  // Map background color to the nearest palette color to avoid checkered background
  const bgRgb = hexToRgb(backgroundColor);
  let bestBgDist = Infinity;
  let bestBgHex = backgroundColor;
  for (let i = 0; i < paletteRGB.length; i++) {
    const dist = getEuclideanDistance(bgRgb, paletteRGB[i]);
    if (dist < bestBgDist) {
      bestBgDist = dist;
      bestBgHex = paletteHex[i];
    }
  }

  ctx.fillStyle = bestBgHex;
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);
  
  // Draw with horizontal scaling simulation reverse (Squash)
  if (resizeQuality === 'smooth') {
    drawImageGammaCorrect(ctx, img, offsetX / pixelAspectX, offsetY, drawWidth / pixelAspectX, drawHeight, canvasWidth, canvasHeight);
  } else {
    ctx.drawImage(img, offsetX / pixelAspectX, offsetY, drawWidth / pixelAspectX, drawHeight);
  }

  const imageData = ctx.getImageData(0, 0, canvasWidth, canvasHeight);
  const data = imageData.data;
  const indices = new Uint8Array(canvasWidth * canvasHeight);

  // Apply Pre-processing
  if (adjustments.denoise > 0) applyDenoise(data, canvasWidth, canvasHeight, adjustments.denoise);
  if (adjustments.unsharpMask > 0) applyUnsharpMask(data, canvasWidth, canvasHeight, adjustments.unsharpMask);
  
  applyAdjustments(data, adjustments);

  // Auto Color Selection (K-Means)
  if (autoColorSelection && (isTVC4 || isTVC2)) {
    paletteRGB = findBestKMeansPalette(data, paletteRGB, isTVC4 ? 4 : 2, perceptualWeighting, preciseAutoColor);
  }

  // Built lazily: only pattern-tvc / pattern-tvc-diffusion need this, and it
  // must be rebuilt whenever paletteRGB (above) or perceptualWeighting changes.
  const disabledPairSet = new Set(disabledPatternPairs);
  const patternPairLUT = (ditherMethod === 'pattern-tvc' || ditherMethod === 'pattern-tvc-diffusion')
    ? buildPatternPairLUT(paletteRGB, perceptualWeighting, disabledPairSet)
    : null;

  // PATTERN TVC: Checkerboard mixing of two colors
  if (ditherMethod === 'pattern-tvc') {
    for (let y = 0; y < canvasHeight; y++) {
      for (let x = 0; x < canvasWidth; x++) {
        const i = (y * canvasWidth + x) * 4;
        const pixel = { r: data[i], g: data[i + 1], b: data[i + 2] };
        
        const bestPair = lookupPatternPair(patternPairLUT!, pixel);
        
        const isChecker = patternMixMode === 'scanline' ? (y % 2 === 0) : ((x + y) % 2 === 0);
        let final = isChecker ? bestPair.c1 : bestPair.c2;
        
        if (invertColors && paletteRGB.length === 2) {
          final = { color: paletteRGB[1 - final.index], index: 1 - final.index };
        }
        
        data[i] = final.color.r;
        data[i + 1] = final.color.g;
        data[i + 2] = final.color.b;
        indices[y * canvasWidth + x] = final.index;
      }
    }
    ctx.putImageData(imageData, 0, 0);
    return { url: canvas.toDataURL('image/png'), indices, rgba: data };
  }

  if (ditherMethod === 'yliluoma') {
    const disabledColorIndices = new Set<number>();
    for (let i = 0; i < paletteRGB.length; i++) {
      const hex = rgbToHex(paletteRGB[i]);
      if (disabledPairSet.has(pairKey(hex, hex))) disabledColorIndices.add(i);
    }
    const yliluomaLUT = buildYliluomaLUT(paletteRGB, YLILUOMA_CANDIDATES, disabledColorIndices);
    const solidSnapY = adjustments.solidSnap ?? 24;
    for (let y = 0; y < canvasHeight; y++) {
      for (let x = 0; x < canvasWidth; x++) {
        const i = (y * canvasWidth + x) * 4;
        const pixel = { r: data[i], g: data[i + 1], b: data[i + 2] };

        // Flat areas (e.g. a solid black background) shouldn't get dithered
        // just because the algorithm can mix colors - snap to the single
        // nearest color first, same threshold/logic as the diffusion loop's
        // solidSnap below. Uses the exclusion-aware search so a solid-snapped
        // pixel can't bypass a fully-excluded color either.
        const nearestSolid = findNearestAllowedSolidColor(pixel, paletteRGB, perceptualWeighting, disabledPairSet);
        const distToSolid = perceptualWeighting
          ? getRedmeanDistance(pixel, nearestSolid.color)
          : getEuclideanDistance(pixel, nearestSolid.color);

        let paletteIndex: number;
        if (distToSolid < solidSnapY) {
          paletteIndex = nearestSolid.index;
        } else {
          const lutIdx = getLutIndex(pixel.r, pixel.g, pixel.b);
          // BAYER_8x8 is a verified 0..63 permutation (see comments above its
          // definition) - map its 64 positions onto the candidate list.
          const matrixValue = BAYER_8x8[y % 8][x % 8];
          const slot = Math.floor((matrixValue * YLILUOMA_CANDIDATES) / 64);
          paletteIndex = yliluomaLUT[lutIdx * YLILUOMA_CANDIDATES + slot];
        }

        let finalIndex = paletteIndex;
        if (invertColors && paletteRGB.length === 2) {
          finalIndex = 1 - paletteIndex;
        }
        const color = paletteRGB[finalIndex];

        data[i] = color.r;
        data[i + 1] = color.g;
        data[i + 2] = color.b;
        indices[y * canvasWidth + x] = finalIndex;
      }
    }
    ctx.putImageData(imageData, 0, 0);
    return { url: canvas.toDataURL('image/png'), indices, rgba: data };
  }

  const ditherAmount = (adjustments.ditherAmount ?? 100) / 100;
  const noiseLevel = (adjustments.noiseLevel ?? 0) / 100;
  const solidSnap = adjustments.solidSnap ?? 24;

  const isOrdered = ditherMethod.startsWith('ordered-') || 
                    ditherMethod === 'bayer-16x16' ||
                    ditherMethod === 'cluster-dot-8x8' ||
                    ditherMethod === 'blue-noise' || 
                    ditherMethod === 'blue-noise-16x16' ||
                    ditherMethod === 'blue-noise-16x16-aniso' ||
                    ditherMethod === 'threshold';

  if (isOrdered) {
    let matrix: number[][] = [];
    let size = 1;
    let div = 1;

    if (ditherMethod === 'ordered-2x2') { matrix = BAYER_2x2; size = 2; div = 4; }
    else if (ditherMethod === 'ordered-4x4') { matrix = BAYER_4x4; size = 4; div = 16; }
    else if (ditherMethod === 'ordered-8x8') { matrix = BAYER_8x8; size = 8; div = 64; }
    else if (ditherMethod === 'bayer-16x16') { matrix = BAYER_16x16; size = 16; div = 256; }
    else if (ditherMethod === 'cluster-dot-8x8') { matrix = CLUSTER_DOT_8x8; size = 8; div = 64; }
    else if (ditherMethod === 'blue-noise') { matrix = BLUE_NOISE_8x8; size = 8; div = 64; }
    else if (ditherMethod === 'blue-noise-16x16') { matrix = BLUE_NOISE_16x16; size = 16; div = 256; }
    else if (ditherMethod === 'blue-noise-16x16-aniso') { matrix = BLUE_NOISE_16x16_ANISO; size = 16; div = 256; }

    for (let y = 0; y < canvasHeight; y++) {
      for (let x = 0; x < canvasWidth; x++) {
        const i = (y * canvasWidth + x) * 4;
        
        if (ditherMethod === 'threshold') {
          // NOTE: amplitude unified to match ordered/diffusion modes (was *64,
          // twice as strong as every other mode for the same Noise % value).
          const micro = noiseLevel > 0 ? (Math.random() - 0.5) * 2 * noiseLevel * 32 : 0;
          const r = Math.max(0, Math.min(255, data[i] + micro));
          const g = Math.max(0, Math.min(255, data[i + 1] + micro));
          const b = Math.max(0, Math.min(255, data[i + 2] + micro));
          const pixel = { r, g, b };
          let nearest = findNearestColor(pixel, paletteRGB, perceptualWeighting);
          if (invertColors && paletteRGB.length === 2) {
            nearest = { color: paletteRGB[1 - nearest.index], index: 1 - nearest.index };
          }
          data[i] = nearest.color.r;
          data[i + 1] = nearest.color.g;
          data[i + 2] = nearest.color.b;
          indices[y * canvasWidth + x] = nearest.index;
        } else {
          // Standard ordered dithering
          const threshold = matrix[y % size][x % size] / div;
          // Spread factor for a sparse palette (like the 15-color TVC palette)
          const bias = (threshold - 0.5) * 128;
          const micro = noiseLevel > 0 ? (Math.random() - 0.5) * 2 * noiseLevel * 32 : 0;
          
          const r = Math.max(0, Math.min(255, data[i] + bias + micro));
          const g = Math.max(0, Math.min(255, data[i + 1] + bias + micro));
          const b = Math.max(0, Math.min(255, data[i + 2] + bias + micro));
          
          let nearest = findNearestColor({ r, g, b }, paletteRGB, perceptualWeighting);
          if (invertColors && paletteRGB.length === 2) {
            nearest = { color: paletteRGB[1 - nearest.index], index: 1 - nearest.index };
          }
          
          data[i] = nearest.color.r;
          data[i + 1] = nearest.color.g;
          data[i + 2] = nearest.color.b;
          indices[y * canvasWidth + x] = nearest.index;
        }
      }
    }
  } else if (ditherMethod === 'none') {
    for (let i = 0; i < data.length; i += 4) {
      // NOTE: amplitude unified to match ordered/diffusion modes (was *64).
      const micro = noiseLevel > 0 ? (Math.random() - 0.5) * 2 * noiseLevel * 32 : 0;
      const r = Math.max(0, Math.min(255, data[i] + micro));
      const g = Math.max(0, Math.min(255, data[i + 1] + micro));
      const b = Math.max(0, Math.min(255, data[i + 2] + micro));
      let nearest = findNearestColor({ r, g, b }, paletteRGB, perceptualWeighting);
      if (invertColors && paletteRGB.length === 2) {
        nearest = { color: paletteRGB[1 - nearest.index], index: 1 - nearest.index };
      }
      data[i] = nearest.color.r;
      data[i + 1] = nearest.color.g;
      data[i + 2] = nearest.color.b;
      indices[i / 4] = nearest.index;
    }
  } else {
    // Error Diffusion
    const ds = new Float32Array(data);
    const width = canvasWidth;
    
    for (let y = 0; y < canvasHeight; y++) {
      const reverse = serpentine && (y % 2 === 1);
      
      const startX = reverse ? canvasWidth - 1 : 0;
      const endX = reverse ? -1 : canvasWidth;
      const stepX = reverse ? -1 : 1;

      for (let x = startX; x !== endX; x += stepX) {
        const i = (y * width + x) * 4;
        let oldR = ds[i];
        let oldG = ds[i + 1];
        let oldB = ds[i + 2];

        const origR = data[i];
        const origG = data[i + 1];
        const origB = data[i + 2];

        // Add slight noise to break banding limit cycles, especially for simple methods
        // Micro-noise for standard diffusion to prevent worms
        if (noiseLevel > 0) {
          const micro = (Math.random() - 0.5) * 2 * noiseLevel * 32;
          oldR += micro;
          oldG += micro;
          oldB += micro;
        } else if (ditherMethod !== 'pattern-tvc-diffusion') {
          const micro = (Math.random() - 0.5) * 2;
          oldR += micro;
          oldG += micro;
          oldB += micro;
        }

        const clampedR = Math.max(0, Math.min(255, oldR));
        const clampedG = Math.max(0, Math.min(255, oldG));
        const clampedB = Math.max(0, Math.min(255, oldB));

        let finalColor;
        let finalIndex;
        let isSolidMatch = false;

        // Check if the original pixel is very close to a solid palette color
        const nearestOrig = ditherMethod === 'pattern-tvc-diffusion'
          ? findNearestAllowedSolidColor({ r: origR, g: origG, b: origB }, paletteRGB, perceptualWeighting, disabledPairSet)
          : findNearestColor({ r: origR, g: origG, b: origB }, paletteRGB, perceptualWeighting);
        const distToSolid = perceptualWeighting 
          ? getRedmeanDistance({ r: origR, g: origG, b: origB }, nearestOrig.color)
          : getEuclideanDistance({ r: origR, g: origG, b: origB }, nearestOrig.color);
        
        // If it's a very solid area (e.g. black background), snap to it and don't dither
        // This prevents noise/dots from accumulating in flat areas
        if (distToSolid < solidSnap) { 
          finalColor = nearestOrig.color;
          finalIndex = nearestOrig.index;
          isSolidMatch = true;
        } else if (ditherMethod === 'pattern-tvc-diffusion') {
          const bestPair = lookupPatternPair(patternPairLUT!, { r: clampedR, g: clampedG, b: clampedB });
          const isChecker = patternMixMode === 'scanline' ? (y % 2 === 0) : ((x + y) % 2 === 0);
          const final = isChecker ? bestPair.c1 : bestPair.c2;
          finalColor = final.color;
          finalIndex = final.index;
        } else {
          const nearest = findNearestColor({ r: clampedR, g: clampedG, b: clampedB }, paletteRGB, perceptualWeighting);
          finalColor = nearest.color;
          finalIndex = nearest.index;
        }

        // If it's a solid match, we discard the error to prevent noise accumulation in flat areas
        const errR = isSolidMatch ? 0 : oldR - finalColor.r;
        const errG = isSolidMatch ? 0 : oldG - finalColor.g;
        const errB = isSolidMatch ? 0 : oldB - finalColor.b;

        let outColor = finalColor;
        let outIndex = finalIndex;
        if (invertColors && paletteRGB.length === 2) {
          outIndex = 1 - finalIndex;
          outColor = paletteRGB[outIndex];
        }

        data[i] = outColor.r;
        data[i + 1] = outColor.g;
        data[i + 2] = outColor.b;
        indices[y * width + x] = outIndex;

        const distribute = (dx: number, dy: number, weight: number) => {
          const nx = x + (reverse ? -dx : dx); 
          const ny = y + dy;

          if (nx >= 0 && nx < width && ny >= 0 && ny < canvasHeight) {
            const ni = (ny * width + nx) * 4;
            ds[ni] += errR * weight * ditherAmount;
            ds[ni + 1] += errG * weight * ditherAmount;
            ds[ni + 2] += errB * weight * ditherAmount;
          }
        };

        if (ditherMethod === 'floyd-steinberg' || ditherMethod === 'pattern-tvc-diffusion') {
          distribute(1, 0, 7 / 16);
          distribute(-1, 1, 3 / 16);
          distribute(0, 1, 5 / 16);
          distribute(1, 1, 1 / 16);
        } else if (ditherMethod === 'atkinson') {
          distribute(1, 0, 1 / 8);
          distribute(2, 0, 1 / 8);
          distribute(-1, 1, 1 / 8);
          distribute(0, 1, 1 / 8);
          distribute(1, 1, 1 / 8);
          distribute(0, 2, 1 / 8);
        } else if (ditherMethod === 'sierra-lite') {
          distribute(1, 0, 2 / 4);
          distribute(-1, 1, 1 / 4);
          distribute(0, 1, 1 / 4);
        } else if (ditherMethod === 'stucki') {
          distribute(1, 0, 8 / 42);
          distribute(2, 0, 4 / 42);
          distribute(-2, 1, 2 / 42);
          distribute(-1, 1, 4 / 42);
          distribute(0, 1, 8 / 42);
          distribute(1, 1, 4 / 42);
          distribute(2, 1, 2 / 42);
          distribute(-2, 2, 1 / 42);
          distribute(-1, 2, 2 / 42);
          distribute(0, 2, 4 / 42);
          distribute(1, 2, 2 / 42);
          distribute(2, 2, 1 / 42);
        } else if (ditherMethod === 'burkes') {
          distribute(1, 0, 8 / 32);
          distribute(2, 0, 4 / 32);
          distribute(-2, 1, 2 / 32);
          distribute(-1, 1, 4 / 32);
          distribute(0, 1, 8 / 32);
          distribute(1, 1, 4 / 32);
          distribute(2, 1, 2 / 32);
        } else if (ditherMethod === 'jarvis') {
          distribute(1, 0, 7 / 48);
          distribute(2, 0, 5 / 48);
          distribute(-2, 1, 3 / 48);
          distribute(-1, 1, 5 / 48);
          distribute(0, 1, 7 / 48);
          distribute(1, 1, 5 / 48);
          distribute(2, 1, 3 / 48);
          distribute(-2, 2, 1 / 48);
          distribute(-1, 2, 3 / 48);
          distribute(0, 2, 5 / 48);
          distribute(1, 2, 3 / 48);
          distribute(2, 2, 1 / 48);
        } else if (ditherMethod === 'ostromoukhov') {
          const level = Math.max(0, Math.min(255, Math.round(luma601({ r: origR, g: origG, b: origB }))));
          const [d1, d2, d3, divisor] = OSTROMOUKHOV_COEFFS[level];
          distribute(1, 0, d1 / divisor);
          distribute(-1, 1, d2 / divisor);
          distribute(0, 1, d3 / divisor);
        }
      }
    }
  }

  // Post-processing
  if (pixelArtCleaning) {
    cleanPixelArt(indices, canvasWidth, canvasHeight);
    // Update data array for preview
    for (let i = 0; i < indices.length; i++) {
      const color = paletteRGB[indices[i]];
      data[i * 4] = color.r;
      data[i * 4 + 1] = color.g;
      data[i * 4 + 2] = color.b;
    }
  }

  ctx.putImageData(imageData, 0, 0);
  return { url: canvas.toDataURL('image/png'), indices, rgba: data };
};

export const trimSolidBorder = (img: HTMLImageElement | HTMLCanvasElement, tolerance: number = 18): Promise<HTMLImageElement> => {
  return new Promise((resolve) => {
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx || img.width === 0 || img.height === 0) {
      const fallback = new Image();
      fallback.onload = () => resolve(fallback);
      fallback.src = (img instanceof HTMLCanvasElement) ? img.toDataURL('image/png') : img.src;
      return;
    }
    
    ctx.drawImage(img, 0, 0);
    const imageData = ctx.getImageData(0, 0, img.width, img.height);
    const data = imageData.data;
    const width = img.width;
    const height = img.height;

    // Top-left pixel RGB
    const bgR = data[0];
    const bgG = data[1];
    const bgB = data[2];

    const isColorMatch = (idx: number) => {
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const dist = Math.sqrt((r - bgR) ** 2 + (g - bgG) ** 2 + (b - bgB) ** 2);
      return dist <= tolerance;
    };

    let top = 0;
    let bottom = height - 1;
    let left = 0;
    let right = width - 1;

    // Scan Top
    while (top < height) {
      let allMatch = true;
      for (let x = 0; x < width; x++) {
        if (!isColorMatch((top * width + x) * 4)) {
          allMatch = false;
          break;
        }
      }
      if (!allMatch) break;
      top++;
    }

    // If entire image matches bg color, don't crop everything
    if (top >= height) {
      const fallback = new Image();
      fallback.onload = () => resolve(fallback);
      fallback.src = (img instanceof HTMLCanvasElement) ? img.toDataURL('image/png') : img.src;
      return;
    }

    // Scan Bottom
    while (bottom > top) {
      let allMatch = true;
      for (let x = 0; x < width; x++) {
        if (!isColorMatch((bottom * width + x) * 4)) {
          allMatch = false;
          break;
        }
      }
      if (!allMatch) break;
      bottom--;
    }

    // Scan Left
    while (left < width) {
      let allMatch = true;
      for (let y = top; y <= bottom; y++) {
        if (!isColorMatch((y * width + left) * 4)) {
          allMatch = false;
          break;
        }
      }
      if (!allMatch) break;
      left++;
    }

    // Scan Right
    while (right > left) {
      let allMatch = true;
      for (let y = top; y <= bottom; y++) {
        if (!isColorMatch((y * width + right) * 4)) {
          allMatch = false;
          break;
        }
      }
      if (!allMatch) break;
      right--;
    }

    const croppedWidth = Math.max(1, right - left + 1);
    const croppedHeight = Math.max(1, bottom - top + 1);

    // If no border was found at all, return original
    if (left === 0 && top === 0 && right === width - 1 && bottom === height - 1) {
      const fallback = new Image();
      fallback.onload = () => resolve(fallback);
      fallback.src = (img instanceof HTMLCanvasElement) ? img.toDataURL('image/png') : img.src;
      return;
    }

    const croppedCanvas = document.createElement('canvas');
    croppedCanvas.width = croppedWidth;
    croppedCanvas.height = croppedHeight;
    const croppedCtx = croppedCanvas.getContext('2d');
    if (croppedCtx) {
      croppedCtx.drawImage(canvas, left, top, croppedWidth, croppedHeight, 0, 0, croppedWidth, croppedHeight);
    }

    const resultImage = new Image();
    resultImage.onload = () => resolve(resultImage);
    resultImage.src = croppedCanvas.toDataURL('image/png');
  });
};

/**
 * Computes a transparency mask (Uint8Array of length width*height, 1 = transparent, 0 = keep)
 * by flood-filling the background starting from all 4 outer edges.
 */
export function generateTransparencyMask(
  width: number,
  height: number,
  indices: Uint8Array,
  forcedBgIndex?: number
): Uint8Array {
  const mask = new Uint8Array(width * height);
  if (width <= 0 || height <= 0 || indices.length !== width * height) {
    return mask;
  }

  const corners = [
    indices[0],
    indices[width - 1],
    indices[(height - 1) * width],
    indices[(height - 1) * width + width - 1]
  ];

  let bgColor = forcedBgIndex;
  if (bgColor === undefined) {
    const counts: Record<number, number> = {};
    for (const c of corners) {
      counts[c] = (counts[c] || 0) + 1;
    }
    let maxCount = 0;
    bgColor = corners[0];
    for (const [col, count] of Object.entries(counts)) {
      if (count > maxCount) {
        maxCount = count;
        bgColor = Number(col);
      }
    }
  }

  // Queue of [x, y] coordinates
  const queueX: number[] = [];
  const queueY: number[] = [];

  // Top and bottom borders
  for (let x = 0; x < width; x++) {
    const topIdx = x;
    if (indices[topIdx] === bgColor && mask[topIdx] === 0) {
      mask[topIdx] = 1;
      queueX.push(x);
      queueY.push(0);
    }
    const btmIdx = (height - 1) * width + x;
    if (indices[btmIdx] === bgColor && mask[btmIdx] === 0) {
      mask[btmIdx] = 1;
      queueX.push(x);
      queueY.push(height - 1);
    }
  }

  // Left and right borders
  for (let y = 0; y < height; y++) {
    const leftIdx = y * width;
    if (indices[leftIdx] === bgColor && mask[leftIdx] === 0) {
      mask[leftIdx] = 1;
      queueX.push(0);
      queueY.push(y);
    }
    const rightIdx = y * width + width - 1;
    if (indices[rightIdx] === bgColor && mask[rightIdx] === 0) {
      mask[rightIdx] = 1;
      queueX.push(width - 1);
      queueY.push(y);
    }
  }

  let head = 0;
  while (head < queueX.length) {
    const cx = queueX[head];
    const cy = queueY[head];
    head++;

    // 4-connected neighbors
    const neighbors = [
      [cx + 1, cy],
      [cx - 1, cy],
      [cx, cy + 1],
      [cx, cy - 1]
    ];

    for (let i = 0; i < 4; i++) {
      const nx = neighbors[i][0];
      const ny = neighbors[i][1];
      if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
        const nIdx = ny * width + nx;
        if (mask[nIdx] === 0 && indices[nIdx] === bgColor) {
          mask[nIdx] = 1;
          queueX.push(nx);
          queueY.push(ny);
        }
      }
    }
  }

  return mask;
}

/**
 * Creates a data URL showing the masked transparent pixels in a distinctive, high-contrast
 * transparency pattern (Neon Magenta / Dark Violet checkerboard) not present in TVC.
 */
export function createMaskedPreviewUrl(
  width: number,
  height: number,
  rgba: Uint8ClampedArray,
  mask: Uint8Array
): string {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  const imgData = ctx.createImageData(width, height);
  const outData = imgData.data;

  // Copy original RGBA and replace masked pixels with high-visibility transparency checkerboard
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const mIdx = y * width + x;

      if (mask[mIdx] === 1) {
        // Distinctive 4x4 neon magenta / violet checkerboard (never in TVC)
        const isCheck = ((Math.floor(x / 4) + Math.floor(y / 4)) % 2 === 0);
        outData[idx] = isCheck ? 255 : 55;     // R: #FF007F vs #370845
        outData[idx + 1] = isCheck ? 0 : 8;     // G
        outData[idx + 2] = isCheck ? 127 : 69;  // B
        outData[idx + 3] = 255;                // A
      } else {
        outData[idx] = rgba[idx];
        outData[idx + 1] = rgba[idx + 1];
        outData[idx + 2] = rgba[idx + 2];
        outData[idx + 3] = rgba[idx + 3];
      }
    }
  }

  ctx.putImageData(imgData, 0, 0);
  return canvas.toDataURL('image/png');
}
