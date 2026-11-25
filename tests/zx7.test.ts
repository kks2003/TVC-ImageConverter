import { describe, expect, it } from 'vitest';
import { compressZX7, decompressZX7 } from '../services/zx7';

const hex = (a: Uint8Array) => Array.from(a, b => b.toString(16).padStart(2, '0')).join('');

// Deterministic PRNG so failures are reproducible.
const rng = (seed: number) => () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 2 ** 32;
};

describe('ZX7', () => {
  it('produces the standard ZX7 bitstream for a hand-computed vector', () => {
    // 'A' literal, match(len 3, offset 1), end marker (16 zero bits).
    expect(hex(compressZX7(new Uint8Array([65, 65, 65, 65])))).toBe('41a8000004');
  });

  it('handles empty and single-byte input', () => {
    expect(compressZX7(new Uint8Array(0)).length).toBe(0);
    expect(decompressZX7(new Uint8Array(0)).length).toBe(0);
    expect(Array.from(decompressZX7(compressZX7(new Uint8Array([7]))))).toEqual([7]);
  });

  const cases: Record<string, () => Uint8Array> = {
    zeros: () => new Uint8Array(15360),
    random: () => { const r = rng(1); return Uint8Array.from({ length: 4096 }, () => (r() * 256) | 0); },
    'screen-like': () => {
      // Repeating rows with small variations, like a dithered TVC screen.
      const r = rng(2);
      const a = new Uint8Array(15360);
      for (let i = 0; i < a.length; i++) a[i] = ((i >> 6) & 0x0f) * 0x11 ^ (r() < 0.05 ? 0xff : 0);
      return a;
    },
    'long-distance matches': () => {
      // Forces offsets > 128 (the extended offset encoding).
      const r = rng(3);
      const block = Uint8Array.from({ length: 1500 }, () => (r() * 256) | 0);
      const a = new Uint8Array(6000);
      for (let i = 0; i < 4; i++) a.set(block, i * 1500);
      return a;
    },
  };

  for (const [name, make] of Object.entries(cases)) {
    it(`round-trips: ${name}`, () => {
      const input = make();
      const packed = compressZX7(input);
      expect(Array.from(decompressZX7(packed))).toEqual(Array.from(input));
    });
  }

  it('actually compresses redundant data', () => {
    expect(compressZX7(new Uint8Array(15360)).length).toBeLessThan(100);
  });
});
