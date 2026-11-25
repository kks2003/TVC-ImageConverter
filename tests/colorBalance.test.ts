import { describe, expect, it } from 'vitest';
import { applyColorBalance, hueRotateMatrix } from '../services/imageProcessor';

const px = (r: number, g: number, b: number) => new Uint8ClampedArray([r, g, b, 255]);

describe('applyColorBalance', () => {
  it('is a no-op at hue 0 / temperature 0', () => {
    const d = px(12, 200, 99);
    applyColorBalance(d, 0, 0);
    expect(Array.from(d)).toEqual([12, 200, 99, 255]);
  });

  it('keeps greys grey under any hue rotation', () => {
    const d = px(128, 128, 128);
    applyColorBalance(d, 77, 0);
    expect(Array.from(d)).toEqual([128, 128, 128, 255]);
  });

  it('a full 360° turn is the identity', () => {
    const m = hueRotateMatrix(360);
    [1, 0, 0, 0, 1, 0, 0, 0, 1].forEach((v, i) => expect(m[i]).toBeCloseTo(v, 10));
  });

  it('rotating red by 120° moves it towards green', () => {
    const d = px(255, 0, 0);
    applyColorBalance(d, 120, 0);
    expect(d[1]).toBeGreaterThan(d[0]);
    expect(d[1]).toBeGreaterThan(d[2]);
  });

  it('warm raises red and lowers blue; cool does the opposite', () => {
    const warm = px(100, 100, 100); applyColorBalance(warm, 0, 100);
    expect(Array.from(warm.slice(0, 3))).toEqual([125, 105, 75]);
    const cool = px(100, 100, 100); applyColorBalance(cool, 0, -100);
    expect(Array.from(cool.slice(0, 3))).toEqual([75, 95, 125]);
  });
});
