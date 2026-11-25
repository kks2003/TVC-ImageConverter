import { describe, expect, it } from 'vitest';
import {
  encodeBMP, encodeBMP4bpp, encodeEditorBin, decodeTVCBin, decodeTVCBmp,
  BIN_SIZES, TVC_PALETTE_MAP_16, TVCEditorMode,
} from '../services/bmpEncoder';
import { FIXED_PALETTE } from '../services/palette';

const rng = (seed: number) => () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 2 ** 32;
};

const dims: Record<TVCEditorMode, [number, number]> = {
  'tvc-16': [128, 240], 'tvc256k': [256, 240], 'tvc-4': [256, 240], 'tvc-2': [512, 240],
};

const randomIndices = (mode: TVCEditorMode, colors: number[], seed = 1) => {
  const [w, h] = dims[mode];
  const r = rng(seed);
  return Uint8Array.from({ length: w * h }, () => colors[(r() * colors.length) | 0]);
};

const ALL15 = Array.from({ length: 15 }, (_, i) => i);

const toRgba = (w: number, h: number, idx: Uint8Array) => {
  const rgba = new Uint8ClampedArray(w * h * 4);
  idx.forEach((p, i) => {
    const hex = FIXED_PALETTE[p];
    rgba[i * 4] = parseInt(hex.slice(1, 3), 16);
    rgba[i * 4 + 1] = parseInt(hex.slice(3, 5), 16);
    rgba[i * 4 + 2] = parseInt(hex.slice(5, 7), 16);
    rgba[i * 4 + 3] = 255;
  });
  return rgba;
};

describe('BIN (TVC video RAM) encoding', () => {
  const activeFor: Record<TVCEditorMode, number[] | undefined> = {
    'tvc-16': undefined, 'tvc256k': undefined, 'tvc-4': [0, 4, 13, 14], 'tvc-2': [1, 13],
  };

  for (const mode of Object.keys(dims) as TVCEditorMode[]) {
    it(`${mode}: has the TVC memory size and round-trips`, () => {
      const [w, h] = dims[mode];
      const colors = activeFor[mode] ?? ALL15;
      const idx = randomIndices(mode, colors);
      const bin = encodeEditorBin(w, h, idx, null, mode, activeFor[mode]);
      expect(bin.length).toBe(BIN_SIZES[mode]);
      const back = decodeTVCBin(bin.buffer as ArrayBuffer, mode, activeFor[mode]);
      expect(back.width).toBe(w);
      expect(Array.from(back.indices)).toEqual(Array.from(idx));
    });
  }

  it('tvc-16 uses the TVC bit-plane layout I1 I2 G1 G2 R1 R2 B1 B2', () => {
    // Pixel 1 = bright red (FIXED 5), pixel 2 = dark green (FIXED 7)
    const idx = new Uint8Array(128 * 240);
    idx[0] = 5; idx[1] = 7;
    const bin = encodeEditorBin(128, 240, idx, null, 'tvc-16');
    // red  = I..R. = 1010 ; dark green = .G.. = 0100
    expect(TVC_PALETTE_MAP_16[5]).toBe(0b1010);
    expect(TVC_PALETTE_MAP_16[7]).toBe(0b0100);
    expect(bin[0]).toBe(0b10_01_10_00);
  });

  it('tvc-4 packs 4 pixels per byte with the low bit-plane in the high nibble', () => {
    const colors = [0, 4, 13, 14];
    const idx = new Uint8Array(256 * 240);
    idx[0] = colors[1]; idx[1] = colors[2]; idx[2] = colors[3]; idx[3] = colors[0];
    const bin = encodeEditorBin(256, 240, idx, null, 'tvc-4', colors);
    // local values 1,2,3,0 -> c0 bits 1,0,1,0 ; c1 bits 0,1,1,0
    expect(bin[0]).toBe(0b1010_0110);
  });

  it('writes masked pixels as the 9th black (IRGB 1000) in 16-colour modes', () => {
    const idx = new Uint8Array(128 * 240).fill(14);
    const mask = new Uint8Array(128 * 240);
    mask[0] = 1;
    const bin16 = encodeEditorBin(128, 240, idx, mask, 'tvc-16');
    // pixel1 = 1000 (I only), pixel2 = white 1111
    expect(bin16[0]).toBe(0b10_01_01_01 | 0b01_00_00_00);
    const idx256 = new Uint8Array(256 * 240).fill(14);
    const mask256 = new Uint8Array(256 * 240); mask256[1] = 1;
    expect(encodeEditorBin(256, 240, idx256, mask256, 'tvc256k', undefined)[0]).toBe(0xf8);
  });
});

describe('BMP encoding', () => {
  it('4bpp TVC256k BMP is exactly 30 838 bytes and round-trips', async () => {
    const idx = randomIndices('tvc256k', ALL15, 7);
    const blob = encodeBMP4bpp(256, 240, idx);
    const buf = await blob.arrayBuffer();
    expect(buf.byteLength).toBe(30838);
    const v = new DataView(buf);
    expect(v.getUint32(10, true)).toBe(118);
    expect(v.getUint16(28, true)).toBe(4);
    const back = decodeTVCBmp(buf, FIXED_PALETTE)!;
    expect(back.mode).toBe('tvc256k');
    expect(Array.from(back.indices)).toEqual(Array.from(idx));
  });

  it('24bpp 2:1 BMP of a 16-colour image round-trips', async () => {
    const idx = randomIndices('tvc-16', ALL15, 3);
    const buf = await encodeBMP(128, 240, toRgba(128, 240, idx), 2).arrayBuffer();
    expect(buf.byteLength).toBe(54 + 256 * 3 * 240);
    const back = decodeTVCBmp(buf, FIXED_PALETTE, 'tvc-16')!;
    expect(back.mode).toBe('tvc-16');
    expect(Array.from(back.indices)).toEqual(Array.from(idx));
  });

  it('24bpp BMP marks masked pixels as RGB(2,2,2)', async () => {
    const idx = new Uint8Array(128 * 240).fill(14);
    const mask = new Uint8Array(128 * 240); mask[128 * 239] = 1; // top-left in a bottom-up BMP is the last row
    const buf = new Uint8Array(await encodeBMP(128, 240, toRgba(128, 240, idx), 1, mask).arrayBuffer());
    expect(Array.from(buf.slice(54, 57))).toEqual([2, 2, 2]);
    expect(Array.from(buf.slice(57, 60))).toEqual([255, 255, 255]);
  });
});
