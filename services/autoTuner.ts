import { ImageAdjustments, DitherMethod } from '../types';

// Strict 15-color palette
const FIXED_PALETTE_HEX = [
  "#000000", "#000092", "#920000", "#920092", 
  "#0000FF", "#FF0000", "#FF00FF", "#009200", 
  "#009292", "#929200", "#929292", "#00FF00", 
  "#00FFFF", "#FFFF00", "#FFFFFF"
];

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

const PALETTE_RGB: RGB[] = FIXED_PALETTE_HEX.map(hexToRgb);

// Matrices for simulation
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
const BAYER_16x16 = (() => {
  const size = 16;
  const halfSize = 8;
  const half = BAYER_8x8;
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
})();
// NOTE: fixed 2026-09 - kept in sync with services/imageProcessor.ts.
// The previous matrix was not a valid 0..63 permutation (32,33 missing;
// 62,63 duplicated). Now matches the canonical "ClusteredDotDiagonal8x8"
// screen (caca.zoy.org / libcaca halftoning study).
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
// NOTE: fixed 2026-09 - kept in sync with services/imageProcessor.ts.
// The previous matrix was not a valid 0..63 permutation (22,23,40,41,46
// missing; 11,14,52,53,56 duplicated). Regenerated with a void-and-cluster
// style algorithm so every threshold 0..63 is used exactly once.
const BLUE_NOISE_8x8 = [
  [3, 34, 19, 60, 9, 1, 32, 41], [28, 47, 14, 39, 29, 58, 16, 51],
  [11, 59, 5, 53, 22, 43, 7, 37], [21, 44, 26, 35, 12, 49, 25, 62],
  [0, 55, 17, 46, 2, 57, 18, 33], [38, 30, 8, 63, 31, 40, 6, 52],
  [15, 50, 42, 23, 13, 27, 45, 10], [24, 56, 4, 36, 48, 54, 20, 61]
];

// Kept in sync with imageProcessor.ts's BLUE_NOISE_16x16.
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

// Redmean color distance (squared)
const getDistanceSq = (r1: number, g1: number, b1: number, r2: number, g2: number, b2: number, usePerceptual: boolean = false) => {
  if (usePerceptual) {
    const rmean = (r1 + r2) / 2;
    const r = r1 - r2;
    const g = g1 - g2;
    const b = b1 - b2;
    const weightR = 2 + rmean / 256;
    const weightG = 4.0;
    const weightB = 2 + (255 - rmean) / 256;
    return weightR * r * r + weightG * g * g + weightB * b * b;
  }
  const r = r1 - r2;
  const g = g1 - g2;
  const b = b1 - b2;
  return r * r + g * g + b * b;
};

// Fast 5-bit lookup table index
const getLutIdx = (r: number, g: number, b: number) => {
  const r5 = Math.max(0, Math.min(31, Math.round(r) >> 3));
  const g5 = Math.max(0, Math.min(31, Math.round(g) >> 3));
  const b5 = Math.max(0, Math.min(31, Math.round(b) >> 3));
  return (r5 << 10) | (g5 << 5) | b5;
};

interface PaletteLUT {
  nearest: RGB[];
  patternPairs: { c1: RGB; c2: RGB }[];
  yliluoma: Uint8Array;
}

const rgbToHex = (c: RGB): string => {
  const toHex = (n: number) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, '0').toUpperCase();
  return `#${toHex(c.r)}${toHex(c.g)}${toHex(c.b)}`;
};
const pairKey = (hexA: string, hexB: string): string => [hexA.toUpperCase(), hexB.toUpperCase()].sort().join('|');

// --- Yliluoma's arbitrary-palette positional dithering (algorithm 2) ---
// Kept in sync with services/imageProcessor.ts - see the comments there for
// the full rationale. Duplicated rather than imported to match this file's
// existing style (it already duplicates rgbToHex/hexToRgb etc. rather than
// importing from imageProcessor.ts).
export const YLILUOMA_CANDIDATES = 8;
const YLILUOMA_GAMMA = 2.2;
const srgbToLinear = (v: number): number => Math.pow(Math.max(0, v) / 255, YLILUOMA_GAMMA);
const linearToSrgb = (v: number): number => Math.pow(Math.max(0, v), 1 / YLILUOMA_GAMMA) * 255;
const luma601 = (c: RGB): number => c.r * 0.299 + c.g * 0.587 + c.b * 0.114;

// Windowed (block-based) SSIM between two blurred RGB buffers (w*h*3,
// interleaved), computed on luminance. Used by tuningStrategy 'precision'
// (A4) as a genuine structural-similarity score, in place of A1-A3's
// hand-tuned per-method bias multipliers - this should generalize better
// across image types instead of encoding assumptions about which method
// "usually" looks best for a given content type.
const computeSSIM = (target: Float32Array, dither: Float32Array, w: number, h: number): number => {
  const n = w * h;
  const lumaT = new Float32Array(n);
  const lumaD = new Float32Array(n);
  for (let i = 0, j = 0; j < n; i += 3, j++) {
    lumaT[j] = target[i] * 0.299 + target[i + 1] * 0.587 + target[i + 2] * 0.114;
    lumaD[j] = dither[i] * 0.299 + dither[i + 1] * 0.587 + dither[i + 2] * 0.114;
  }
  const C1 = (0.01 * 255) ** 2;
  const C2 = (0.03 * 255) ** 2;
  const blockSize = 8;
  let totalSSIM = 0, blockCount = 0;

  for (let by = 0; by < h; by += blockSize) {
    for (let bx = 0; bx < w; bx += blockSize) {
      const bw = Math.min(blockSize, w - bx), bh = Math.min(blockSize, h - by);
      let sumT = 0, sumD = 0, count = 0;
      for (let y = by; y < by + bh; y++) {
        for (let x = bx; x < bx + bw; x++) {
          const idx = y * w + x;
          sumT += lumaT[idx]; sumD += lumaD[idx]; count++;
        }
      }
      if (count === 0) continue;
      const muT = sumT / count, muD = sumD / count;
      let varT = 0, varD = 0, covar = 0;
      for (let y = by; y < by + bh; y++) {
        for (let x = bx; x < bx + bw; x++) {
          const idx = y * w + x;
          const dt = lumaT[idx] - muT, dd = lumaD[idx] - muD;
          varT += dt * dt; varD += dd * dd; covar += dt * dd;
        }
      }
      varT /= count; varD /= count; covar /= count;
      const ssim = ((2 * muT * muD + C1) * (2 * covar + C2)) / ((muT * muT + muD * muD + C1) * (varT + varD + C2));
      totalSSIM += ssim;
      blockCount++;
    }
  }
  return blockCount > 0 ? totalSSIM / blockCount : 1;
};
// Kept in sync with imageProcessor.ts's OSTROMOUKHOV_COEFFS - see there for
// provenance/verification notes.
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

const yliluomaColorCompare = (input: RGB, test: RGB): number => {
  const lumaDiff = luma601(input) / 255 - luma601(test) / 255;
  const dr = (input.r - test.r) / 255;
  const dg = (input.g - test.g) / 255;
  const db = (input.b - test.b) / 255;
  return (dr * dr * 0.299 + dg * dg * 0.587 + db * db * 0.114) * 0.75 + lumaDiff * lumaDiff;
};
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
      let sum = { ...soFar };
      let add = { ...paletteLinear[index] };
      for (let p = 1; p <= maxTestCount; p *= 2) {
        sum = { r: sum.r + add.r, g: sum.g + add.g, b: sum.b + add.b };
        add = { r: add.r + add.r, g: add.g + add.g, b: add.b + add.b };
        const t = result.length + p;
        const test = { r: linearToSrgb(sum.r / t), g: linearToSrgb(sum.g / t), b: linearToSrgb(sum.b / t) };
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

const buildColorPairs = (paletteRGB: RGB[], disabledPairs: Set<string>): { c1: RGB; c2: RGB; avgr: number; avgg: number; avgb: number }[] => {
  const pairs: { c1: RGB; c2: RGB; avgr: number; avgg: number; avgb: number }[] = [];
  for (let i = 0; i < paletteRGB.length; i++) {
    for (let j = i; j < paletteRGB.length; j++) {
      const p1 = paletteRGB[i];
      const p2 = paletteRGB[j];
      // Mirrors imageProcessor.ts: a color's SELF pair means "excluded
      // entirely" (solid and mixed); mixed pairs are independent.
      // Mirrors imageProcessor.ts: pair exclusions are explicit entries.
      if (disabledPairs.has(pairKey(rgbToHex(p1), rgbToHex(p2)))) continue;
      pairs.push({
        c1: p1,
        c2: p2,
        avgr: (p1.r + p2.r) / 2,
        avgg: (p1.g + p2.g) / 2,
        avgb: (p1.b + p2.b) / 2
      });
    }
  }
  // Safety net: never leave pattern-tvc with zero candidate pairs (e.g. if
  // every color in the palette was excluded) - fall back to unfiltered.
  return pairs.length > 0 ? pairs : buildColorPairs(paletteRGB, new Set());
};

// Computed separately from buildPaletteLUT because it doesn't depend on
// usePerceptual (Yliluoma's ColorCompare is fixed) - so it only needs to be
// built once per palette and shared between the perceptual/standard LUT
// variants, instead of being computed twice. Also skipped entirely by the
// caller when 'yliluoma' isn't a candidate for the current tuning strategy,
// since it's the most expensive part of building a palette's LUT.
const buildYliluomaOnly = (paletteRGB: RGB[], limit: number = YLILUOMA_CANDIDATES, disabledPairs: Set<string> = new Set()): Uint8Array => {
  const size = 32;
  const lut = new Uint8Array(size * size * size * limit);
  const paletteLinear = paletteRGB.map(c => ({ r: srgbToLinear(c.r), g: srgbToLinear(c.g), b: srgbToLinear(c.b) }));
  let allowedIndices = paletteRGB.map((_, i) => i).filter(i => !disabledPairs.has(pairKey(rgbToHex(paletteRGB[i]), rgbToHex(paletteRGB[i]))));
  if (allowedIndices.length === 0) allowedIndices = paletteRGB.map((_, i) => i);

  for (let r5 = 0; r5 < size; r5++) {
    const r = (r5 * 255) / 31;
    for (let g5 = 0; g5 < size; g5++) {
      const g = (g5 * 255) / 31;
      for (let b5 = 0; b5 < size; b5++) {
        const b = (b5 * 255) / 31;
        const idx = (r5 << 10) | (g5 << 5) | b5;
        const plan = buildYliluomaPlan({ r, g, b }, paletteRGB, paletteLinear, limit, allowedIndices);
        lut.set(plan, idx * limit);
      }
    }
  }
  return lut;
};

const buildPaletteLUT = (paletteRGB: RGB[], usePerceptual: boolean, disabledPairs: Set<string> = new Set(), yliluomaLUT?: Uint8Array): PaletteLUT => {
  const size = 32;
  const nearest = new Array<RGB>(size * size * size);
  const patternPairs = new Array<{ c1: RGB; c2: RGB }>(size * size * size);

  const pairs = buildColorPairs(paletteRGB, disabledPairs);

  for (let r5 = 0; r5 < size; r5++) {
    const r = (r5 * 255) / 31;
    for (let g5 = 0; g5 < size; g5++) {
      const g = (g5 * 255) / 31;
      for (let b5 = 0; b5 < size; b5++) {
        const b = (b5 * 255) / 31;
        const idx = (r5 << 10) | (g5 << 5) | b5;

        // 1. Nearest single color
        let minD = Infinity;
        let bestColor = paletteRGB[0];
        for (let i = 0; i < paletteRGB.length; i++) {
          const p = paletteRGB[i];
          const d = getDistanceSq(r, g, b, p.r, p.g, p.b, usePerceptual);
          if (d < minD) {
            minD = d;
            bestColor = p;
          }
        }
        nearest[idx] = bestColor;

        // 2. Best pattern pair
        let minPairD = Infinity;
        let bestPair = pairs[0];
        for (let i = 0; i < pairs.length; i++) {
          const pair = pairs[i];
          const d = getDistanceSq(r, g, b, pair.avgr, pair.avgg, pair.avgb, usePerceptual);
          if (d < minPairD) {
            minPairD = d;
            bestPair = pair;
          }
        }
        patternPairs[idx] = { c1: bestPair.c1, c2: bestPair.c2 };
      }
    }
  }

  return { nearest, patternPairs, yliluoma: yliluomaLUT ?? new Uint8Array(0) };
};

// Separable Box Blur for perceptual comparison
const separableBlur = (data: Float32Array | Uint8ClampedArray, width: number, height: number, radius: number, isRgba: boolean): Float32Array => {
  const temp = new Float32Array(width * height * 3);
  const result = new Float32Array(width * height * 3);
  const channels = isRgba ? 4 : 3;

  // Horizontal pass
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let r = 0, g = 0, b = 0, count = 0;
      for (let dx = -radius; dx <= radius; dx++) {
        const nx = x + dx;
        if (nx >= 0 && nx < width) {
          const i = (y * width + nx) * channels;
          r += data[i];
          g += data[i + 1];
          b += data[i + 2];
          count++;
        }
      }
      const outIdx = (y * width + x) * 3;
      temp[outIdx] = r / count;
      temp[outIdx + 1] = g / count;
      temp[outIdx + 2] = b / count;
    }
  }

  // Vertical pass
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let r = 0, g = 0, b = 0, count = 0;
      for (let dy = -radius; dy <= radius; dy++) {
        const ny = y + dy;
        if (ny >= 0 && ny < height) {
          const i = (ny * width + x) * 3;
          r += temp[i];
          g += temp[i + 1];
          b += temp[i + 2];
          count++;
        }
      }
      const outIdx = (y * width + x) * 3;
      result[outIdx] = r / count;
      result[outIdx + 1] = g / count;
      result[outIdx + 2] = b / count;
    }
  }
  return result;
};

export const findBestColors = (img: HTMLImageElement, count: number): number[] => {
  const w = 64;
  const h = Math.max(1, Math.round(w * (img.height / (img.width || 1))));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    return Array.from({ length: count }, (_, i) => i);
  }

  ctx.drawImage(img, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h).data;
  const colorCounts = new Array(15).fill(0);

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    
    let minDist = Infinity;
    let bestIdx = 0;
    for (let c = 0; c < 15; c++) {
      const p = PALETTE_RGB[c];
      const dist = getDistanceSq(r, g, b, p.r, p.g, p.b);
      if (dist < minDist) {
        minDist = dist;
        bestIdx = c;
      }
    }
    colorCounts[bestIdx]++;
  }

  const sortedIndices = Array.from({ length: 15 }, (_, i) => i)
    .sort((a, b) => colorCounts[b] - colorCounts[a]);

  return sortedIndices.slice(0, count);
};

export interface CompositionSettings {
  zoom?: number;
  positionX?: number;
  positionY?: number;
  fitMode?: 'cover' | 'contain' | 'stretch';
  backgroundColor?: string;
}

export const findBestSettings = async (
  img: HTMLImageElement,
  outputMode: 'tvc-16' | 'tvc-4' | 'tvc-2' = 'tvc-16',
  currentSelectedColors: number[] = [],
  onProgress?: (progress: number) => void,
  signal?: AbortSignal,
  tuningStrategy: 'artistic' | 'fidelity' | 'flat' | 'precision' = 'artistic',
  composition?: CompositionSettings,
  disabledPatternPairs: string[] = []
): Promise<{ adjustments: ImageAdjustments, ditherMethod: DitherMethod, selectedColors?: number[], perceptualWeighting: boolean }> => {
  // Fast analysis canvas (64x120 provides identical ranking with 4x speedup)
  const w = 64; 
  const h = 120;
  
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  
  if (!ctx) {
    return { 
      adjustments: { brightness: 0, contrast: 0, saturation: 100, gamma: 1.0, ditherAmount: 50, noiseLevel: 50, solidSnap: 50, denoise: 0, unsharpMask: 0, toneMapping: 0 },
      ditherMethod: 'pattern-tvc',
      perceptualWeighting: true
    };
  }

  if (composition) {
    const zoom = composition.zoom ?? 1;
    const posX = (composition.positionX ?? 50) / 100;
    const posY = (composition.positionY ?? 50) / 100;
    const fitMode = composition.fitMode ?? 'cover';

    let drawW = w;
    let drawH = h;
    let offX = 0;
    let offY = 0;

    const imgAspect = (img.width || 1) / (img.height || 1);
    const targetAspect = w / h;

    if (fitMode === 'stretch') {
      drawW = w * zoom;
      drawH = h * zoom;
      offX = (w - drawW) * posX;
      offY = (h - drawH) * posY;
    } else if (fitMode === 'contain') {
      if (imgAspect > targetAspect) {
        drawW = w * zoom;
        drawH = (w / imgAspect) * zoom;
      } else {
        drawH = h * zoom;
        drawW = (h * imgAspect) * zoom;
      }
      offX = (w - drawW) * posX;
      offY = (h - drawH) * posY;
    } else { // cover
      if (imgAspect > targetAspect) {
        drawH = h * zoom;
        drawW = (h * imgAspect) * zoom;
      } else {
        drawW = w * zoom;
        drawH = (w / imgAspect) * zoom;
      }
      offX = (w - drawW) * posX;
      offY = (h - drawH) * posY;
    }

    ctx.fillStyle = composition.backgroundColor || '#000000';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, offX, offY, drawW, drawH);
  } else {
    ctx.drawImage(img, 0, 0, w, h);
  }

  const imageData = ctx.getImageData(0, 0, w, h);
  const data = imageData.data;

  // --- ANALYSIS PHASE ---
  const lumas: number[] = [];
  const pixelCount = data.length / 4;
  let totalSat = 0;
  const uniqueColors = new Set<number>();
  let totalEdgeEnergy = 0;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];

      const qr = r >> 3;
      const qg = g >> 3;
      const qb = b >> 3;
      uniqueColors.add((qr << 10) | (qg << 5) | qb);

      const luma = 0.299 * r + 0.587 * g + 0.114 * b;
      lumas.push(luma);

      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const sat = max === 0 ? 0 : (max - min) / max;
      totalSat += sat;

      let hDiff = 0;
      let vDiff = 0;
      if (x < w - 1) {
        const i2 = (y * w + (x + 1)) * 4;
        const luma2 = 0.299 * data[i2] + 0.587 * data[i2 + 1] + 0.114 * data[i2 + 2];
        hDiff = Math.abs(luma - luma2);
      }
      if (y < h - 1) {
        const i3 = ((y + 1) * w + x) * 4;
        const luma3 = 0.299 * data[i3] + 0.587 * data[i3 + 1] + 0.114 * data[i3 + 2];
        vDiff = Math.abs(luma - luma3);
      }
      totalEdgeEnergy += (hDiff + vDiff);
    }
  }

  lumas.sort((a, b) => a - b);
  const p5 = lumas[Math.floor(pixelCount * 0.05)] ?? 0; 
  const p50 = lumas[Math.floor(pixelCount * 0.50)] ?? 128;
  const p95 = lumas[Math.floor(pixelCount * 0.95)] ?? 255;
  const avgSat = totalSat / pixelCount;
  const avgEdge = totalEdgeEnergy / pixelCount;

  const isGraphic = uniqueColors.size < 500 || avgEdge < 14;

  let baseBrightness = 0;
  let baseContrast = 0;
  let baseSaturation = 100;
  let baseGamma = 1.0;

  const range = p95 - p5;
  if (range < 150) {
    baseContrast = Math.min(60, Math.round((200 - range) * 0.5));
  } else if (range < 220) {
    baseContrast = 15;
  }

  if (tuningStrategy === 'fidelity') {
    baseBrightness = 5;
    baseContrast = isGraphic ? 30 : Math.min(20, Math.max(0, baseContrast));
    baseGamma = 1.0;
    baseSaturation = isGraphic ? 130 : ((avgSat < 0.2) ? 115 : 105);
  } else if (tuningStrategy === 'flat') {
    // Clean / hand-pixel-art look: unlike 'artistic', deliberately don't
    // apply the "dark image -> brighten it" photographic heuristic below.
    // A dark night scene in the source is very likely dark on purpose in
    // the artwork too, and a human pixel artist would keep it dark rather
    // than exposure-correct it. Brightness/gamma stay neutral; only the
    // generic range/saturation-based contrast boost (computed above and
    // below) still applies.
    baseBrightness = 0;
    baseGamma = 1.0;
  } else {
    const idealCenter = 125;
    if (p50 < 60) {
      baseGamma = 0.8;
      baseBrightness = 15;
      baseSaturation = 90;
    } else if (p50 > 190) {
      baseGamma = 1.2;
      baseBrightness = 0;
    } else {
      const shift = idealCenter - p50;
      baseBrightness = Math.round(shift * 0.4);
    }
    baseBrightness = Math.max(-20, Math.min(30, baseBrightness));
  }

  if (avgSat < 0.1) {
    baseSaturation = 105; 
    baseContrast += 10;
  } else if (avgSat < 0.25) {
    baseSaturation = 125;
  } else if (avgSat > 0.55) {
    baseSaturation = 90;
  } else {
    baseSaturation = 110; 
  }

  if (avgEdge < 10) {
    baseContrast += 10;
  }

  const colorVariations = (tuningStrategy === 'fidelity') ? (
    isGraphic ? [
      { b: 2, c: 140, s: 150, g: 1.0, tm: 0 },
      { b: 2, c: 120, s: 140, g: 1.0, tm: 0 },
      { b: 2, c: 160, s: 160, g: 1.0, tm: 0 },
      { b: 0, c: 130, s: 140, g: 1.0, tm: 0 },
      { b: 4, c: 150, s: 150, g: 1.0, tm: 0 }
    ] : [
      { b: 0, c: baseContrast, s: baseSaturation, g: 1.0, tm: 0 },
      { b: 5, c: baseContrast, s: baseSaturation, g: 1.0, tm: 0 },
      { b: -5, c: baseContrast, s: baseSaturation, g: 1.0, tm: 0 },
      { b: 0, c: baseContrast + 10, s: baseSaturation, g: 1.0, tm: 0 },
      { b: 0, c: Math.max(0, baseContrast - 5), s: baseSaturation, g: 1.0, tm: 0 },
      { b: 0, c: baseContrast, s: baseSaturation + 15, g: 1.0, tm: 0 },
      { b: 0, c: baseContrast, s: baseSaturation, g: 0.95, tm: 0 },
      { b: 0, c: baseContrast, s: baseSaturation, g: 1.05, tm: 0 },
    ]
  ) : [
    { b: baseBrightness, c: baseContrast, s: baseSaturation, g: baseGamma, tm: 0 },
    { b: baseBrightness + 10, c: baseContrast, s: baseSaturation, g: baseGamma, tm: 0 },
    { b: baseBrightness - 10, c: baseContrast, s: baseSaturation, g: baseGamma, tm: 0 },
    { b: baseBrightness, c: baseContrast + 15, s: baseSaturation, g: baseGamma, tm: 0 },
    { b: baseBrightness, c: baseContrast - 10, s: baseSaturation, g: baseGamma, tm: 0 },
    { b: baseBrightness, c: baseContrast, s: baseSaturation + 20, g: baseGamma, tm: 0 },
    { b: baseBrightness, c: baseContrast, s: baseSaturation - 15, g: baseGamma, tm: 0 },
    { b: baseBrightness, c: baseContrast, s: baseSaturation, g: baseGamma * 1.1, tm: 0 },
    { b: baseBrightness, c: baseContrast, s: baseSaturation, g: baseGamma * 0.9, tm: 0 },
    { b: baseBrightness, c: baseContrast, s: baseSaturation, g: baseGamma, tm: 50 },
  ];

  const ditherMethods: DitherMethod[] = (tuningStrategy === 'flat') ? [
    // Hand-pixel-art reference images are flat-shaded with crisp edges and
    // essentially no per-pixel noise. Error-diffusion (floyd-steinberg,
    // atkinson, sierra-lite, stucki, burkes, jarvis, pattern-tvc-diffusion)
    // and the noisiest ordered patterns (cluster-dot-8x8, blue-noise) were
    // measured to consistently score worse for this look, so they're
    // excluded outright here rather than just down-weighted.
    'none', 'threshold', 'pattern-tvc',
    'ordered-2x2', 'ordered-4x4', 'ordered-8x8', 'bayer-16x16'
  ] : [
    'none', 'threshold', 'pattern-tvc', 'pattern-tvc-diffusion', 'yliluoma',
    'ordered-2x2', 'ordered-4x4', 'ordered-8x8', 'bayer-16x16',
    'cluster-dot-8x8', 'blue-noise', 'blue-noise-16x16',
    'floyd-steinberg', 'atkinson', 'sierra-lite', 'stucki', 'burkes', 'jarvis', 'ostromoukhov'
  ];

  let paletteVariations: number[][] = [];
  if (outputMode === 'tvc-16') {
    paletteVariations = [Array.from({ length: 15 }, (_, i) => i)];
  } else if (outputMode === 'tvc-4') {
    const top4 = findBestColors(img, 4);
    paletteVariations = [
      currentSelectedColors.length === 4 ? currentSelectedColors : [0, 1, 2, 3],
      [0, 1, 2, 3],
      [0, 5, 11, 14],
      [0, 4, 12, 14],
      [0, 6, 13, 14],
      [0, 7, 9, 14],
      [0, 10, 12, 14],
      top4
    ];
  } else if (outputMode === 'tvc-2') {
    const top2 = findBestColors(img, 2);
    paletteVariations = [
      currentSelectedColors.length === 2 ? currentSelectedColors : [0, 14],
      [0, 14],
      [1, 14],
      [2, 14],
      [3, 14],
      [0, 11],
      [0, 12],
      [0, 13],
      top2
    ];
  }
  
  const uniquePalettes = new Set<string>();
  paletteVariations = paletteVariations.filter(p => {
    const key = p.slice().sort().join(',');
    if (uniquePalettes.has(key)) return false;
    uniquePalettes.add(key);
    return true;
  });

  if (paletteVariations.length === 0) {
    paletteVariations = [Array.from({ length: 15 }, (_, i) => i)];
  }

  // Pre-build Look-Up Tables for all palettes
  const disabledPairSet = new Set(disabledPatternPairs);
  const needsYliluoma = ditherMethods.includes('yliluoma');
  const lutCache = new Map<string, { perceptual: PaletteLUT; standard: PaletteLUT }>();
  for (const pal of paletteVariations) {
    const key = pal.join(',');
    const palRgb = pal.map(idx => PALETTE_RGB[idx]);
    const yliluomaLUT = needsYliluoma ? buildYliluomaOnly(palRgb, YLILUOMA_CANDIDATES, disabledPairSet) : undefined;
    lutCache.set(key, {
      perceptual: buildPaletteLUT(palRgb, true, disabledPairSet, yliluomaLUT),
      standard: buildPaletteLUT(palRgb, false, disabledPairSet, yliluomaLUT)
    });
  }

  const getSettingsVariations = (method: DitherMethod) => {
    if (tuningStrategy === 'fidelity' && isGraphic) {
      return [
        { amount: 20, noise: 0, snap: 80, perceptual: true },
        { amount: 15, noise: 0, snap: 85, perceptual: true },
        { amount: 0, noise: 0, snap: 100, perceptual: true }
      ];
    }
    if (method === 'none' || method === 'pattern-tvc') {
      return [
        { amount: 100, noise: 0, snap: 24, perceptual: true },
        { amount: 100, noise: 0, snap: 24, perceptual: false }
      ];
    }
    if (method === 'yliluoma') {
      return [
        { amount: 100, noise: 0, snap: 24, perceptual: true },
        { amount: 100, noise: 0, snap: 50, perceptual: true },
        { amount: 100, noise: 0, snap: 80, perceptual: true }
      ];
    }
    if (method === 'threshold' || method.startsWith('ordered-') || method === 'bayer-16x16' || method === 'cluster-dot-8x8' || method === 'blue-noise' || method === 'blue-noise-16x16') {
      return [
        { amount: 100, noise: 0, snap: 24, perceptual: true },
        { amount: 100, noise: 50, snap: 24, perceptual: true }
      ];
    }
    return [
      { amount: 50, noise: 0, snap: 0, perceptual: true },
      { amount: 100, noise: 0, snap: 0, perceptual: true },
      { amount: 100, noise: 0, snap: 50, perceptual: true },
      { amount: 100, noise: 0, snap: 80, perceptual: true }
    ];
  };

  let totalIterations = 0;
  for (let i = 0; i < colorVariations.length; i++) {
    for (let j = 0; j < paletteVariations.length; j++) {
      for (const method of ditherMethods) {
        totalIterations += getSettingsVariations(method).length;
      }
    }
  }

  let bestMethod: DitherMethod = 'pattern-tvc';
  let bestPalette: number[] = paletteVariations[0];
  let bestAdjustments: ImageAdjustments = {
    brightness: baseBrightness,
    contrast: baseContrast,
    saturation: baseSaturation,
    gamma: baseGamma,
    ditherAmount: 50,
    noiseLevel: 50,
    solidSnap: 50,
    denoise: 0,
    unsharpMask: 0,
    toneMapping: 0
  };
  let minError = Infinity;

  let currentIteration = 0;
  let lastYieldTime = performance.now();

  const blurredOriginalTarget = separableBlur(data, w, h, 2, true);

  for (const color of colorVariations) {
    const adjData = new Uint8ClampedArray(data);
    const b_val = color.b / 100;
    const c_val = (color.c + 100) / 100;
    const s_val = color.s / 100;
    const g_val = 1 / color.g;
    const tm_val = color.tm / 100;

    for (let i = 0; i < adjData.length; i += 4) {
      let r = adjData[i] / 255;
      let g = adjData[i + 1] / 255;
      let b = adjData[i + 2] / 255;

      r += b_val; g += b_val; b += b_val;
      r = (r - 0.5) * c_val + 0.5; g = (g - 0.5) * c_val + 0.5; b = (b - 0.5) * c_val + 0.5;
      if (color.g !== 1) { 
        r = Math.pow(Math.max(0, r), g_val); 
        g = Math.pow(Math.max(0, g), g_val); 
        b = Math.pow(Math.max(0, b), g_val); 
      }
      
      const gray = 0.299 * r + 0.587 * g + 0.114 * b;
      r = gray + (r - gray) * s_val; 
      g = gray + (g - gray) * s_val; 
      b = gray + (b - gray) * s_val;

      if (tm_val > 0) {
        const luma = 0.299 * r + 0.587 * g + 0.114 * b;
        const mappedLuma = luma / (1 + luma * tm_val);
        const ratio = luma > 0 ? mappedLuma / luma : 0;
        r *= ratio; g *= ratio; b *= ratio;
      }

      adjData[i] = Math.max(0, Math.min(255, r * 255));
      adjData[i + 1] = Math.max(0, Math.min(255, g * 255));
      adjData[i + 2] = Math.max(0, Math.min(255, b * 255));
    }

    const blurredTarget = (tuningStrategy === 'fidelity') ? blurredOriginalTarget : separableBlur(adjData, w, h, 2, true);

    for (const palette of paletteVariations) {
      const palKey = palette.join(',');
      const luts = lutCache.get(palKey)!;
      const palRgb = palette.map(idx => PALETTE_RGB[idx]);

      for (const method of ditherMethods) {
        const settingsVariations = getSettingsVariations(method);

        for (const settings of settingsVariations) {
          currentIteration++;
          
          if (performance.now() - lastYieldTime > 30) {
            if (onProgress) {
              onProgress(Math.min(1, currentIteration / (totalIterations || 1)));
            }
            await new Promise(r => setTimeout(r, 0));
            if (signal?.aborted) {
              throw new Error('Auto-tune aborted');
            }
            lastYieldTime = performance.now();
          }

          const activeLut = settings.perceptual ? luts.perceptual : luts.standard;
          const ditheredData = new Float32Array(w * h * 3);
          const simData = new Float32Array(adjData); 
          const noiseLevel = settings.noise / 100;
          const ditherAmount = settings.amount / 100;
          const solidSnap = settings.snap;

          for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
              const i = (y * w + x) * 4;
              const outIdx = (y * w + x) * 3;
              const r = simData[i];
              const g = simData[i + 1];
              const b = simData[i + 2];

              let fr = 0, fg = 0, fb = 0;

              if (method === 'pattern-tvc') {
                const lutIdx = getLutIdx(r, g, b);
                const pair = activeLut.patternPairs[lutIdx];
                const isChecker = (x + y) % 2 === 0;
                fr = isChecker ? pair.c1.r : pair.c2.r;
                fg = isChecker ? pair.c1.g : pair.c2.g;
                fb = isChecker ? pair.c1.b : pair.c2.b;
              }
              else if (method === 'yliluoma') {
                const lutIdx = getLutIdx(r, g, b);
                const nr = activeLut.nearest[lutIdx];
                const distToSolid = getDistanceSq(r, g, b, nr.r, nr.g, nr.b, settings.perceptual);
                if (distToSolid < solidSnap * solidSnap) {
                  fr = nr.r; fg = nr.g; fb = nr.b;
                } else {
                  const matrixValue = BAYER_8x8[y % 8][x % 8];
                  const slot = Math.floor((matrixValue * YLILUOMA_CANDIDATES) / 64);
                  const paletteIndex = activeLut.yliluoma[lutIdx * YLILUOMA_CANDIDATES + slot];
                  const c = palRgb[paletteIndex];
                  fr = c.r; fg = c.g; fb = c.b;
                }
              }
              else if (method === 'none' || method === 'threshold') {
                // NOTE: amplitude unified to match ordered/diffusion modes (was *64).
                const micro = noiseLevel > 0 ? (Math.random() - 0.5) * 2 * noiseLevel * 32 : 0;
                const lutIdx = getLutIdx(r + micro, g + micro, b + micro);
                const nr = activeLut.nearest[lutIdx];
                fr = nr.r; fg = nr.g; fb = nr.b;
              }
              else if (method.startsWith('ordered-') || method === 'bayer-16x16' || method === 'cluster-dot-8x8' || method === 'blue-noise' || method === 'blue-noise-16x16') {
                let map: number[][] = BAYER_4x4;
                let div = 16;
                let size = 4;

                if (method === 'blue-noise') { map = BLUE_NOISE_8x8; size = 8; div = 64; }
                else if (method === 'blue-noise-16x16') { map = BLUE_NOISE_16x16; size = 16; div = 256; }
                else if (method === 'ordered-8x8') { map = BAYER_8x8; size = 8; div = 64; }
                else if (method === 'ordered-4x4') { map = BAYER_4x4; size = 4; div = 16; }
                else if (method === 'ordered-2x2') { map = BAYER_2x2; size = 2; div = 4; }
                else if (method === 'bayer-16x16') { map = BAYER_16x16; size = 16; div = 256; }
                else if (method === 'cluster-dot-8x8') { map = CLUSTER_DOT_8x8; size = 8; div = 64; } 

                const threshold = map[y % size][x % size] / div;
                const bias = (threshold - 0.5) * 128;
                const micro = noiseLevel > 0 ? (Math.random() - 0.5) * 2 * noiseLevel * 32 : 0;
                
                const lutIdx = getLutIdx(r + bias + micro, g + bias + micro, b + bias + micro);
                const nr = activeLut.nearest[lutIdx];
                fr = nr.r; fg = nr.g; fb = nr.b;
              }
              else { 
                // Error Diffusion
                let isSolidMatch = false;
                let oldR = r;
                let oldG = g;
                let oldB = b;
                
                if (noiseLevel > 0) {
                  const micro = (Math.random() - 0.5) * 2 * noiseLevel * 32;
                  oldR += micro;
                  oldG += micro;
                  oldB += micro;
                } else if (method !== 'pattern-tvc-diffusion') {
                  const micro = (Math.random() - 0.5) * 2;
                  oldR += micro;
                  oldG += micro;
                  oldB += micro;
                }

                const origR = adjData[i];
                const origG = adjData[i + 1];
                const origB = adjData[i + 2];

                const origLutIdx = getLutIdx(origR, origG, origB);
                const nearestOrig = activeLut.nearest[origLutIdx];
                const distToSolid = getDistanceSq(origR, origG, origB, nearestOrig.r, nearestOrig.g, nearestOrig.b, settings.perceptual);
                
                if (distToSolid < solidSnap * solidSnap) {
                  fr = nearestOrig.r;
                  fg = nearestOrig.g;
                  fb = nearestOrig.b;
                  isSolidMatch = true;
                } else if (method === 'pattern-tvc-diffusion') {
                  const lutIdx = getLutIdx(oldR, oldG, oldB);
                  const pair = activeLut.patternPairs[lutIdx];
                  const isChecker = (x + y) % 2 === 0;
                  fr = isChecker ? pair.c1.r : pair.c2.r;
                  fg = isChecker ? pair.c1.g : pair.c2.g;
                  fb = isChecker ? pair.c1.b : pair.c2.b;
                } else {
                  const lutIdx = getLutIdx(oldR, oldG, oldB);
                  const nr = activeLut.nearest[lutIdx];
                  fr = nr.r; fg = nr.g; fb = nr.b;
                }
                
                const er = isSolidMatch ? 0 : oldR - fr;
                const eg = isSolidMatch ? 0 : oldG - fg;
                const eb = isSolidMatch ? 0 : oldB - fb;
                
                const distribute = (dx: number, dy: number, factor: number) => {
                  if (x + dx >= 0 && x + dx < w && y + dy >= 0 && y + dy < h) {
                    const ni = ((y + dy) * w + (x + dx)) * 4;
                    simData[ni] += er * factor * ditherAmount;
                    simData[ni + 1] += eg * factor * ditherAmount;
                    simData[ni + 2] += eb * factor * ditherAmount;
                  }
                };

                if (method === 'floyd-steinberg' || method === 'pattern-tvc-diffusion') {
                  distribute(1, 0, 7/16);
                  distribute(-1, 1, 3/16);
                  distribute(0, 1, 5/16);
                  distribute(1, 1, 1/16);
                } else if (method === 'atkinson') {
                  distribute(1, 0, 1/8);
                  distribute(2, 0, 1/8);
                  distribute(-1, 1, 1/8);
                  distribute(0, 1, 1/8);
                  distribute(1, 1, 1/8);
                  distribute(0, 2, 1/8);
                } else if (method === 'sierra-lite') {
                  distribute(1, 0, 2/4);
                  distribute(-1, 1, 1/4);
                  distribute(0, 1, 1/4);
                } else if (method === 'stucki') {
                  distribute(1, 0, 8/42); distribute(2, 0, 4/42);
                  distribute(-2, 1, 2/42); distribute(-1, 1, 4/42); distribute(0, 1, 8/42); distribute(1, 1, 4/42); distribute(2, 1, 2/42);
                  distribute(-2, 2, 1/42); distribute(-1, 2, 2/42); distribute(0, 2, 4/42); distribute(1, 2, 2/42); distribute(2, 2, 1/42);
                } else if (method === 'burkes') {
                  distribute(1, 0, 8/32); distribute(2, 0, 4/32);
                  distribute(-2, 1, 2/32); distribute(-1, 1, 4/32); distribute(0, 1, 8/32); distribute(1, 1, 4/32); distribute(2, 1, 2/32);
                } else if (method === 'jarvis') {
                  distribute(1, 0, 7/48); distribute(2, 0, 5/48);
                  distribute(-2, 1, 3/48); distribute(-1, 1, 5/48); distribute(0, 1, 7/48); distribute(1, 1, 5/48); distribute(2, 1, 3/48);
                  distribute(-2, 2, 1/48); distribute(-1, 2, 3/48); distribute(0, 2, 5/48); distribute(1, 2, 3/48); distribute(2, 2, 1/48);
                } else if (method === 'ostromoukhov') {
                  const level = Math.max(0, Math.min(255, Math.round(luma601({ r: adjData[i], g: adjData[i + 1], b: adjData[i + 2] }))));
                  const [d1, d2, d3, divisor] = OSTROMOUKHOV_COEFFS[level];
                  distribute(1, 0, d1 / divisor);
                  distribute(-1, 1, d2 / divisor);
                  distribute(0, 1, d3 / divisor);
                }
              }

              ditheredData[outIdx] = fr;
              ditheredData[outIdx + 1] = fg;
              ditheredData[outIdx + 2] = fb;
            }
          }

          const blurredDither = separableBlur(ditheredData, w, h, 2, false);

          let totalError = 0;
          for (let i = 0; i < w * h * 3; i += 3) {
            const r1 = blurredTarget[i], g1 = blurredTarget[i + 1], b1 = blurredTarget[i + 2];
            const r2 = blurredDither[i], g2 = blurredDither[i + 1], b2 = blurredDither[i + 2];
            totalError += getDistanceSq(r1, g1, b1, r2, g2, b2);
          }

          let finalScore = totalError;
          
          if (tuningStrategy === 'precision') {
            const ssim = computeSSIM(blurredTarget, blurredDither, w, h);
            // ssim is in roughly [-1, 1], 1 = structurally identical. Convert
            // to an error (lower = better) on a scale comparable to
            // totalError (summed squared RGB differences), then blend with
            // it so color accuracy still matters, not just structure.
            const structuralError = (1 - ssim) * w * h * 200;
            finalScore = totalError * 0.4 + structuralError * 0.6;
          } else if (tuningStrategy === 'fidelity') {
            finalScore = totalError;
            if (isGraphic) {
              if (['none', 'threshold', 'pattern-tvc', 'pattern-tvc-diffusion'].includes(method)) {
                finalScore *= 0.6;
              } else if (['floyd-steinberg', 'sierra-lite', 'atkinson'].includes(method)) {
                finalScore *= 0.85;
              }
            }
          } else if (tuningStrategy === 'flat') {
            // Measured on reference hand-pixel-art conversions: pattern-tvc
            // consistently outperformed the plain ordered/none methods here,
            // even before this bonus - this just tie-breaks in its favor.
            if (method === 'pattern-tvc') {
              finalScore *= 0.75;
            }
          } else {
            if (outputMode === 'tvc-2' || outputMode === 'tvc-4') {
              if (method === 'pattern-tvc') {
                finalScore *= 1.1; 
              } else if (method === 'pattern-tvc-diffusion') {
                finalScore *= 0.95;
              }
            } else {
              if (method === 'pattern-tvc') {
                finalScore *= 0.8; 
              } else if (method === 'pattern-tvc-diffusion') {
                finalScore *= 0.85;
              }
            }
          }

          if (finalScore < minError) {
            minError = finalScore;
            bestMethod = method;
            bestPalette = palette;
            bestAdjustments = {
              brightness: color.b,
              contrast: color.c,
              saturation: color.s,
              gamma: color.g,
              ditherAmount: settings.amount,
              noiseLevel: settings.noise,
              solidSnap: settings.snap,
              denoise: 0,
              unsharpMask: 0,
              toneMapping: color.tm
            };
          }
        }
      }
    }
  }

  if (onProgress) {
    onProgress(1);
  }

  return {
    adjustments: bestAdjustments,
    ditherMethod: bestMethod,
    selectedColors: bestPalette,
    perceptualWeighting: true
  };
};
