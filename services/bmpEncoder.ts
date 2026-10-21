// Strict 16-color RGB palette corresponding to standard TVC 256k IRGB 0..15 (08.bmp structure)
export const IRGB_PALETTE_RGB = [
  { r: 0x00, g: 0x00, b: 0x00 }, // 0: 0000 - 1. fekete
  { r: 0x00, g: 0x00, b: 0x7F }, // 1: 0001 - sötétkék (B)
  { r: 0x00, g: 0x7F, b: 0x00 }, // 2: 0010 - sötétzöld (G)
  { r: 0x00, g: 0x7F, b: 0x7F }, // 3: 0011 - sötét kékeszöld (G+B)
  { r: 0x7F, g: 0x00, b: 0x00 }, // 4: 0100 - sötétvörös (R)
  { r: 0x7F, g: 0x00, b: 0x7F }, // 5: 0101 - sötétlila (R+B)
  { r: 0x7F, g: 0x7F, b: 0x00 }, // 6: 0110 - sötétsárga (R+G)
  { r: 0x7F, g: 0x7F, b: 0x7F }, // 7: 0111 - szürke (R+G+B)
  { r: 0x02, g: 0x02, b: 0x02 }, // 8: 1000 - 9. fekete [ÁTLÁTSZÓ / MASZK] (I)
  { r: 0x00, g: 0x00, b: 0xFF }, // 9: 1001 - világoskék (I+B)
  { r: 0x00, g: 0xFF, b: 0x00 }, // 10: 1010 - világoszöld (I+G)
  { r: 0x00, g: 0xFF, b: 0xFF }, // 11: 1011 - világos kékeszöld (I+G+B)
  { r: 0xFF, g: 0x00, b: 0x00 }, // 12: 1100 - világosvörös (I+R)
  { r: 0xFF, g: 0x00, b: 0xFF }, // 13: 1101 - világoslila (I+R+B)
  { r: 0xFF, g: 0xFF, b: 0x00 }, // 14: 1110 - világossárga (I+R+G)
  { r: 0xFF, g: 0xFF, b: 0xFF }  // 15: 1111 - fehér (I+R+G+B)
];

// Mapping from FIXED_PALETTE index (0..14) to standard IRGB index (0..15)
// 0: fekete -> 0000 (1. fekete); a 8 (1000) átlátszóságra van fenntartva.
export const TVC_PALETTE_MAP_256K = [
  0,  // 0: Black (#000000) -> 0 (0000)
  1,  // 1: Dark Blue (#000092) -> 1 (0001)
  4,  // 2: Dark Red (#920000) -> 4 (0100)
  5,  // 3: Dark Purple (#920092) -> 5 (0101)
  9,  // 4: Bright Blue (#0000FF) -> 9 (1001)
  12, // 5: Bright Red (#FF0000) -> 12 (1100)
  13, // 6: Bright Purple (#FF00FF) -> 13 (1101)
  2,  // 7: Dark Green (#009200) -> 2 (0010)
  3,  // 8: Dark Cyan (#009292) -> 3 (0011)
  6,  // 9: Dark Yellow (#929200) -> 6 (0110)
  7,  // 10: Grey (#929292) -> 7 (0111)
  10, // 11: Bright Green (#00FF00) -> 10 (1010)
  11, // 12: Bright Cyan (#00FFFF) -> 11 (1011)
  14, // 13: Bright Yellow (#FFFF00) -> 14 (1110)
  15  // 14: White (#FFFFFF) -> 15 (1111)
];

export const encodeBMP = (width: number, height: number, rgba: Uint8ClampedArray, pixelRatio: number = 1, mask?: Uint8Array | null): Blob => {
  const outWidth = width * pixelRatio;
  
  // BMP Header size (14) + DIB Header size (40 for BITMAPINFOHEADER)
  const headerSize = 54;
  
  // Rows in BMP are padded to be a multiple of 4 bytes
  const rowSize = Math.floor((24 * outWidth + 31) / 32) * 4;
  const pixelArraySize = rowSize * height;
  const fileSize = headerSize + pixelArraySize;
  
  const buffer = new ArrayBuffer(fileSize);
  const view = new DataView(buffer);
  
  // BMP Header
  view.setUint8(0, 0x42); // 'B'
  view.setUint8(1, 0x4D); // 'M'
  view.setUint32(2, fileSize, true); // File size
  view.setUint16(6, 0, true); // Reserved
  view.setUint16(8, 0, true); // Reserved
  view.setUint32(10, headerSize, true); // Offset to pixel array
  
  // DIB Header (BITMAPINFOHEADER)
  view.setUint32(14, 40, true); // Header size
  view.setInt32(18, outWidth, true); // Width
  view.setInt32(22, height, true); // Height (positive = bottom-up)
  view.setUint16(26, 1, true); // Planes
  view.setUint16(28, 24, true); // Bits per pixel (24 for RGB)
  view.setUint32(30, 0, true); // Compression (0 = BI_RGB)
  view.setUint32(34, pixelArraySize, true); // Image size
  view.setInt32(38, 2835, true); // X pixels per meter (approx 72 dpi)
  view.setInt32(42, 2835, true); // Y pixels per meter
  view.setUint32(46, 0, true); // Colors in palette
  view.setUint32(50, 0, true); // Important colors
  
  // Pixel Data
  const data = new Uint8Array(buffer, headerSize);
  
  // BMP stores rows bottom-to-top
  for (let y = 0; y < height; y++) {
    const srcRow = height - 1 - y;
    for (let x = 0; x < width; x++) {
      const srcIndex = (srcRow * width + x) * 4;
      const isMasked = mask ? (mask[srcRow * width + x] === 1) : false;
      
      for (let p = 0; p < pixelRatio; p++) {
        const dstIndex = y * rowSize + (x * pixelRatio + p) * 3;
        
        if (isMasked) {
          // Transparent color RGB (2, 2, 2)
          data[dstIndex] = 2;     // B
          data[dstIndex + 1] = 2; // G
          data[dstIndex + 2] = 2; // R
        } else {
          // RGBA to BGR
          data[dstIndex] = rgba[srcIndex + 2];     // B
          data[dstIndex + 1] = rgba[srcIndex + 1]; // G
          data[dstIndex + 2] = rgba[srcIndex];     // R
        }
      }
    }
  }
  
  return new Blob([buffer], { type: 'image/bmp' });
};

// 4-bit per pixel (16-color indexed) BMP Encoder - exactly 30,838 bytes for 256x240 (08.bmp standard)
export const encodeBMP4bpp = (width: number, height: number, indices: Uint8Array, mask?: Uint8Array | null): Blob => {
  const headerSize = 54; // 14 + 40
  const paletteSize = 16 * 4; // 64 bytes
  const offset = headerSize + paletteSize; // 118 bytes
  
  const rowSize = Math.floor((4 * width + 31) / 32) * 4; // 128 bytes for width 256
  const pixelArraySize = rowSize * height; // 30720 bytes for height 240
  const fileSize = offset + pixelArraySize; // 30838 bytes
  
  const buffer = new ArrayBuffer(fileSize);
  const view = new DataView(buffer);
  
  // BMP Header (14 bytes)
  view.setUint8(0, 0x42); // 'B'
  view.setUint8(1, 0x4D); // 'M'
  view.setUint32(2, fileSize, true); // File size: 30838
  view.setUint16(6, 0, true);
  view.setUint16(8, 0, true);
  view.setUint32(10, offset, true); // Offset to pixel array: 118 (0x76)
  
  // DIB Header (BITMAPINFOHEADER, 40 bytes)
  view.setUint32(14, 40, true); // Header size
  view.setInt32(18, width, true); // Width: 256
  view.setInt32(22, height, true); // Height: 240 (positive = bottom-up)
  view.setUint16(26, 1, true); // Planes
  view.setUint16(28, 4, true); // Bits per pixel: 4 (16 colors indexed)
  view.setUint32(30, 0, true); // Compression: BI_RGB (0)
  view.setUint32(34, pixelArraySize, true); // Image size: 30720
  view.setInt32(38, 2835, true); // ~72 dpi
  view.setInt32(42, 2835, true);
  view.setUint32(46, 16, true); // 16 colors in palette
  view.setUint32(50, 0, true); // Important colors: 0 (matching 08.bmp)
  
  // Palette Table (64 bytes: B, G, R, 0)
  // Index 8 is { r: 2, g: 2, b: 2 } (9. fekete / átlátszó)
  for (let i = 0; i < 16; i++) {
    const palEntry = IRGB_PALETTE_RGB[i];
    const palOffset = 54 + i * 4;
    view.setUint8(palOffset + 0, palEntry.b);
    view.setUint8(palOffset + 1, palEntry.g);
    view.setUint8(palOffset + 2, palEntry.r);
    view.setUint8(palOffset + 3, 0);
  }
  
  // Pixel Data (30,720 bytes)
  const data = new Uint8Array(buffer, offset);
  
  // BMP stores rows bottom-to-top
  for (let y = 0; y < height; y++) {
    const srcRow = height - 1 - y;
    const dstRowOffset = y * rowSize;
    
    for (let x = 0; x < width; x += 2) {
      const p1Idx = srcRow * width + x;
      const p2Idx = srcRow * width + x + 1;

      const isMasked1 = mask ? (mask[p1Idx] === 1) : false;
      const isMasked2 = mask ? (x + 1 < width && mask[p2Idx] === 1) : false;

      // Index 8 in IRGB table is 1000 (RGB: 2, 2, 2)
      const c1 = isMasked1 ? 8 : (TVC_PALETTE_MAP_256K[indices[p1Idx]] ?? 0);
      const c2 = isMasked2 ? 8 : ((x + 1 < width) ? (TVC_PALETTE_MAP_256K[indices[p2Idx]] ?? 0) : 0);
      
      // 1 point (x) upper 4 bits, 1 point (x+1) lower 4 bits
      data[dstRowOffset + (x >> 1)] = ((c1 & 0x0F) << 4) | (c2 & 0x0F);
    }
  }
  
  return new Blob([buffer], { type: 'image/bmp' });
};

// Mapping from FIXED_PALETTE index (0..14) to the tvc-16 bitplane IRGB nibble.
// NOTE: this differs from TVC_PALETTE_MAP_256K above - the tvc-16 video mode
// packs bits per-plane (I/G/R/B extracted and reassembled separately), which
// uses a different nibble bit-order convention than tvc256k's straight 4-bit
// index. Duplicated from App.tsx's local TVC_PALETTE_MAP (kept in sync) so
// this module has no dependency on the converter's component state.
export const TVC_PALETTE_MAP_16 = [
  0, 1, 2, 3, 9, 10, 11, 4, 5, 6, 7, 12, 13, 14, 15
];

// --- Decoders for the Pixel Editor's "Open" feature ---
// These are the inverse of encodeBMP/encodeBMP4bpp/encodeEditorBin above,
// used to load a previously-exported file back in for editing (no
// conversion/dithering - a direct byte-for-byte reconstruction).

const hexToRgbLocal = (hex: string) => {
  const h = hex.replace('#', '');
  return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
};

const buildReverseMap = (map: number[]): number[] => {
  const rev = new Array(16).fill(0);
  rev[8] = 15; // IRGB index 8 -> our "transparent" sentinel (see PixelEditor.tsx)
  for (let i = 0; i < map.length; i++) rev[map[i]] = i;
  return rev;
};
const REVERSE_MAP_256K = buildReverseMap(TVC_PALETTE_MAP_256K);
const REVERSE_MAP_16 = buildReverseMap(TVC_PALETTE_MAP_16);

export type TVCEditorMode = 'tvc-16' | 'tvc256k' | 'tvc-4' | 'tvc-2';

export interface DecodedTVCImage {
  width: number;
  height: number;
  pixelAspectX: number;
  mode: TVCEditorMode;
  indices: Uint8Array; // 0..14 = palette color, 15 = transparent (tvc-16/tvc256k only)
  activeColors?: number[]; // tvc-4/tvc-2 only: which FIXED_PALETTE indices are in use
}

// Sensible defaults when a raw .bin (which stores no color information,
// just 2-bit/1-bit local indices) is opened without any other context to
// infer the real colors from.
export const DEFAULT_ACTIVE_COLORS: Record<'tvc-4' | 'tvc-2', number[]> = {
  'tvc-4': [0, 10, 14, 5],  // black, grey, white, red
  'tvc-2': [0, 14]          // black, white
};

const sampleRGB24 = (data: Uint8Array, rowSize: number, height: number, topDown: boolean, x: number, y: number) => {
  const srcRow = topDown ? y : (height - 1 - y);
  const off = srcRow * rowSize + x * 3;
  return { b: data[off], g: data[off + 1], r: data[off + 2] };
};

const nearestPaletteIndex = (r: number, g: number, b: number, paletteRgb: { r: number; g: number; b: number }[]): number => {
  if (r === 2 && g === 2 && b === 2) return 15; // transparent marker (16-color modes only)
  let best = 0, bestDist = Infinity;
  for (let p = 0; p < paletteRgb.length; p++) {
    const pc = paletteRgb[p];
    const d = (r - pc.r) ** 2 + (g - pc.g) ** 2 + (b - pc.b) ** 2;
    if (d < bestDist) { bestDist = d; best = p; }
  }
  return best;
};

// Returns null if this isn't a BMP, or isn't one of this editor's four TVC
// formats (128x240/256x240/512x240 24bpp, or 256x240 4bpp). Resolution/mode
// is read from the file itself. A 256-wide 24bpp file is inherently
// ambiguous between "tvc-16, pre-doubled 2:1" and "tvc-4, native 1:1" (both
// produce the same file shape) - `modeHint` (typically the editor's current
// mode) resolves it when given; otherwise a heuristic checks whether
// adjacent column pairs are identical throughout (a hallmark of 2:1
// doubling) to guess.
export const decodeTVCBmp = (buffer: ArrayBuffer, palette: string[], modeHint?: TVCEditorMode): DecodedTVCImage | null => {
  if (buffer.byteLength < 54) return null;
  const view = new DataView(buffer);
  if (view.getUint8(0) !== 0x42 || view.getUint8(1) !== 0x4D) return null; // "BM"

  const pixelDataOffset = view.getUint32(10, true);
  const width = view.getInt32(18, true);
  const heightRaw = view.getInt32(22, true);
  const height = Math.abs(heightRaw);
  const topDown = heightRaw < 0;
  const bpp = view.getUint16(28, true);

  if (bpp === 4) {
    if (width !== 256 || height !== 240) return null;
    const rowSize = Math.floor((4 * width + 31) / 32) * 4;
    const data = new Uint8Array(buffer, pixelDataOffset);
    const indices = new Uint8Array(width * height);
    for (let y = 0; y < height; y++) {
      const srcRow = topDown ? y : (height - 1 - y);
      for (let x = 0; x < width; x += 2) {
        const byte = data[srcRow * rowSize + (x >> 1)];
        indices[y * width + x] = REVERSE_MAP_256K[(byte >> 4) & 0x0F] ?? 0;
        if (x + 1 < width) indices[y * width + x + 1] = REVERSE_MAP_256K[byte & 0x0F] ?? 0;
      }
    }
    return { width, height, pixelAspectX: 1, mode: 'tvc256k', indices };
  }

  if (bpp === 24) {
    if (height !== 240) return null;
    const rowSize = Math.floor((24 * width + 31) / 32) * 4;
    const data = new Uint8Array(buffer, pixelDataOffset);
    const paletteRgb = palette.map(hexToRgbLocal);

    if (width === 512) {
      const indices = new Uint8Array(512 * 240);
      for (let y = 0; y < 240; y++) {
        for (let x = 0; x < 512; x++) {
          const { r, g, b } = sampleRGB24(data, rowSize, 240, topDown, x, y);
          indices[y * 512 + x] = nearestPaletteIndex(r, g, b, paletteRgb);
        }
      }
      const activeColors = Array.from(new Set(indices)).sort((a, b) => a - b).slice(0, 2);
      while (activeColors.length < 2) activeColors.push(DEFAULT_ACTIVE_COLORS['tvc-2'][activeColors.length]);
      return { width: 512, height: 240, pixelAspectX: 1, mode: 'tvc-2', indices, activeColors };
    }

    if (width === 256) {
      let identicalPairs = 0, totalPairs = 0;
      for (let y = 0; y < 240; y += 4) {
        for (let x = 0; x < 256; x += 2) {
          const a = sampleRGB24(data, rowSize, 240, topDown, x, y);
          const b2 = sampleRGB24(data, rowSize, 240, topDown, x + 1, y);
          totalPairs++;
          if (a.r === b2.r && a.g === b2.g && a.b === b2.b) identicalPairs++;
        }
      }
      const looksDoubled = modeHint === 'tvc-16' ? true
        : modeHint === 'tvc-4' ? false
        : (totalPairs > 0 && identicalPairs / totalPairs > 0.98);

      if (looksDoubled) {
        const indices = new Uint8Array(128 * 240);
        for (let y = 0; y < 240; y++) {
          for (let lx = 0; lx < 128; lx++) {
            const { r, g, b } = sampleRGB24(data, rowSize, 240, topDown, lx * 2, y);
            indices[y * 128 + lx] = nearestPaletteIndex(r, g, b, paletteRgb);
          }
        }
        return { width: 128, height: 240, pixelAspectX: 2, mode: 'tvc-16', indices };
      } else {
        const indices = new Uint8Array(256 * 240);
        for (let y = 0; y < 240; y++) {
          for (let x = 0; x < 256; x++) {
            const { r, g, b } = sampleRGB24(data, rowSize, 240, topDown, x, y);
            indices[y * 256 + x] = nearestPaletteIndex(r, g, b, paletteRgb);
          }
        }
        const activeColors = Array.from(new Set(indices)).sort((a, b) => a - b).slice(0, 4);
        while (activeColors.length < 4) activeColors.push(DEFAULT_ACTIVE_COLORS['tvc-4'][activeColors.length]);
        return { width: 256, height: 240, pixelAspectX: 1, mode: 'tvc-4', indices, activeColors };
      }
    }

    if (width === 128) {
      const indices = new Uint8Array(128 * 240);
      for (let y = 0; y < 240; y++) {
        for (let x = 0; x < 128; x++) {
          const { r, g, b } = sampleRGB24(data, rowSize, 240, topDown, x, y);
          indices[y * 128 + x] = nearestPaletteIndex(r, g, b, paletteRgb);
        }
      }
      return { width: 128, height: 240, pixelAspectX: 2, mode: 'tvc-16', indices };
    }

    return null;
  }

  return null;
};

// Best-guess mode for a raw .bin of unknown/non-matching size. Note tvc-16,
// tvc-4, and tvc-2 all produce exactly 15360 bytes (they're all sized to
// the same TVC video RAM budget) - genuinely ambiguous by size alone, so
// `preferredMode` (the editor's current mode) is checked first and wins
// whenever it's actually a valid match.
export const guessBinMode = (byteLength: number, preferredMode?: TVCEditorMode): TVCEditorMode => {
  if (preferredMode && BIN_SIZES[preferredMode] === byteLength) return preferredMode;
  const d15360 = Math.abs(byteLength - 15360);
  const d30720 = Math.abs(byteLength - 30720);
  return d15360 <= d30720 ? 'tvc-16' : 'tvc256k';
};

export const BIN_SIZES: Record<TVCEditorMode, number> = {
  'tvc-16': 15360,
  'tvc-4': 15360,
  'tvc-2': 15360,
  'tvc256k': 30720
};

export const decodeTVCBin = (buffer: ArrayBuffer, mode: TVCEditorMode, activeColors?: number[]): DecodedTVCImage => {
  const data = new Uint8Array(buffer);

  if (mode === 'tvc-4' || mode === 'tvc-2') {
    const width = mode === 'tvc-4' ? 256 : 512;
    const height = 240;
    const colors = (activeColors && activeColors.length === (mode === 'tvc-4' ? 4 : 2)) ? activeColors : DEFAULT_ACTIVE_COLORS[mode];
    const groupSize = mode === 'tvc-4' ? 4 : 8;
    const stride = Math.ceil(width / groupSize);
    const indices = new Uint8Array(width * height);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x += groupSize) {
        const byteIdx = y * stride + (x / groupSize);
        const byte = byteIdx < data.length ? data[byteIdx] : 0;
        if (mode === 'tvc-4') {
          const v1_c0 = (byte >> 7) & 1, v2_c0 = (byte >> 6) & 1, v3_c0 = (byte >> 5) & 1, v4_c0 = (byte >> 4) & 1;
          const v1_c1 = (byte >> 3) & 1, v2_c1 = (byte >> 2) & 1, v3_c1 = (byte >> 1) & 1, v4_c1 = byte & 1;
          const vals = [(v1_c1 << 1) | v1_c0, (v2_c1 << 1) | v2_c0, (v3_c1 << 1) | v3_c0, (v4_c1 << 1) | v4_c0];
          for (let k = 0; k < 4; k++) if (x + k < width) indices[y * width + x + k] = colors[vals[k]] ?? colors[0];
        } else {
          for (let k = 0; k < 8; k++) {
            if (x + k >= width) break;
            const bit = (byte >> (7 - k)) & 1;
            indices[y * width + x + k] = colors[bit] ?? colors[0];
          }
        }
      }
    }
    return { width, height, pixelAspectX: 1, mode, indices, activeColors: colors };
  }

  const width = mode === 'tvc256k' ? 256 : 128;
  const height = 240;
  const stride = Math.ceil(width / 2);
  const indices = new Uint8Array(width * height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x += 2) {
      const byteIdx = y * stride + (x >> 1);
      const byte = byteIdx < data.length ? data[byteIdx] : 0;
      if (mode === 'tvc256k') {
        indices[y * width + x] = REVERSE_MAP_256K[(byte >> 4) & 0x0F] ?? 0;
        if (x + 1 < width) indices[y * width + x + 1] = REVERSE_MAP_256K[byte & 0x0F] ?? 0;
      } else {
        const i1 = (byte >> 7) & 1, i2 = (byte >> 6) & 1, g1 = (byte >> 5) & 1, g2 = (byte >> 4) & 1;
        const r1 = (byte >> 3) & 1, r2 = (byte >> 2) & 1, b1 = (byte >> 1) & 1, b2 = byte & 1;
        const c1 = (i1 << 3) | (g1 << 2) | (r1 << 1) | b1;
        const c2 = (i2 << 3) | (g2 << 2) | (r2 << 1) | b2;
        indices[y * width + x] = REVERSE_MAP_16[c1] ?? 0;
        if (x + 1 < width) indices[y * width + x + 1] = REVERSE_MAP_16[c2] ?? 0;
      }
    }
  }
  return { width, height, pixelAspectX: mode === 'tvc256k' ? 1 : 2, mode, indices };
};
// Self-contained raw .bin exporter for the Pixel Editor, covering all four
// TVC video modes. Unlike App.tsx's getBinData, this takes everything as
// explicit parameters instead of reading converter component state, so the
// editor can use it independently of any in-progress conversion.
export const encodeEditorBin = (
  width: number,
  height: number,
  indices: Uint8Array,
  mask: Uint8Array | null,
  mode: TVCEditorMode,
  activeColors?: number[]
): Uint8Array => {
  if (mode === 'tvc-4' || mode === 'tvc-2') {
    const colors = (activeColors && activeColors.length > 0) ? activeColors : DEFAULT_ACTIVE_COLORS[mode];
    const getLocal = (globalIdx: number): number => {
      const li = colors.indexOf(globalIdx);
      return li === -1 ? 0 : li;
    };
    const groupSize = mode === 'tvc-4' ? 4 : 8;
    const stride = Math.ceil(width / groupSize);
    const buffer = new Uint8Array(stride * height);
    let bufIdx = 0;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x += groupSize) {
        if (mode === 'tvc-4') {
          const v1 = x < width ? getLocal(indices[y * width + x]) : 0;
          const v2 = x + 1 < width ? getLocal(indices[y * width + x + 1]) : 0;
          const v3 = x + 2 < width ? getLocal(indices[y * width + x + 2]) : 0;
          const v4 = x + 3 < width ? getLocal(indices[y * width + x + 3]) : 0;
          const v1_c0 = v1 & 1, v1_c1 = (v1 >> 1) & 1;
          const v2_c0 = v2 & 1, v2_c1 = (v2 >> 1) & 1;
          const v3_c0 = v3 & 1, v3_c1 = (v3 >> 1) & 1;
          const v4_c0 = v4 & 1, v4_c1 = (v4 >> 1) & 1;
          buffer[bufIdx++] = (v1_c0 << 7) | (v2_c0 << 6) | (v3_c0 << 5) | (v4_c0 << 4) | (v1_c1 << 3) | (v2_c1 << 2) | (v3_c1 << 1) | (v4_c1 << 0);
        } else {
          let byte = 0;
          for (let k = 0; k < 8; k++) {
            const bit = (x + k < width) ? (getLocal(indices[y * width + x + k]) & 1) : 0;
            byte |= bit << (7 - k);
          }
          buffer[bufIdx++] = byte;
        }
      }
    }
    return buffer;
  }

  const stride = Math.ceil(width / 2);
  const buffer = new Uint8Array(stride * height);
  let bufIdx = 0;

  for (let y = 0; y < height; y++) {
    if (mode === 'tvc256k') {
      for (let x = 0; x < width; x += 2) {
        const p1Idx = y * width + x;
        const p2Idx = y * width + x + 1;
        const isMasked1 = mask ? mask[p1Idx] === 1 : false;
        const isMasked2 = mask ? (x + 1 < width && mask[p2Idx] === 1) : false;
        const c1 = isMasked1 ? 8 : (TVC_PALETTE_MAP_256K[indices[p1Idx]] ?? 0);
        const c2 = isMasked2 ? 8 : ((x + 1 < width) ? (TVC_PALETTE_MAP_256K[indices[p2Idx]] ?? 0) : 0);
        buffer[bufIdx++] = ((c1 & 0x0F) << 4) | (c2 & 0x0F);
      }
    } else {
      for (let x = 0; x < width; x += 2) {
        const p1Idx = y * width + x;
        const p2Idx = y * width + x + 1;
        const isMasked1 = mask ? mask[p1Idx] === 1 : false;
        const isMasked2 = mask ? (x + 1 < width && mask[p2Idx] === 1) : false;
        const c1 = isMasked1 ? 8 : (TVC_PALETTE_MAP_16[indices[p1Idx]] ?? 0);
        const c2 = isMasked2 ? 8 : ((x + 1 < width) ? (TVC_PALETTE_MAP_16[indices[p2Idx]] ?? 0) : 0);

        const i1 = (c1 >> 3) & 1, g1 = (c1 >> 2) & 1, r1 = (c1 >> 1) & 1, b1 = c1 & 1;
        const i2 = (c2 >> 3) & 1, g2 = (c2 >> 2) & 1, r2 = (c2 >> 1) & 1, b2 = c2 & 1;

        buffer[bufIdx++] = (i1 << 7) | (i2 << 6) | (g1 << 5) | (g2 << 4) | (r1 << 3) | (r2 << 2) | (b1 << 1) | (b2 << 0);
      }
    }
  }

  return buffer;
};