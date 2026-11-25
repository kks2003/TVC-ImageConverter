import { describe, expect, it } from 'vitest';
import { compositeByMask, paintMask } from '../services/convert';

describe('region dithering helpers', () => {
  it('compositeByMask takes b where the mask is set', () => {
    const a = { indices: Uint8Array.from([1, 1, 1]), rgba: new Uint8ClampedArray([1, 1, 1, 255, 1, 1, 1, 255, 1, 1, 1, 255]) };
    const b = { indices: Uint8Array.from([2, 2, 2]), rgba: new Uint8ClampedArray([2, 2, 2, 255, 2, 2, 2, 255, 2, 2, 2, 255]) };
    const r = compositeByMask(a, b, Uint8Array.from([0, 1, 0]));
    expect(Array.from(r.indices)).toEqual([1, 2, 1]);
    expect(Array.from(r.rgba.slice(4, 8))).toEqual([2, 2, 2, 255]);
    expect(Array.from(a.indices)).toEqual([1, 1, 1]); // inputs untouched
  });

  it('paintMask paints a round brush and erases', () => {
    const w = 11, h = 11, m = new Uint8Array(w * h);
    paintMask(m, w, h, 5, 5, 3, 1);
    expect(m[5 * w + 5]).toBe(1);
    expect(m[5 * w + 8]).toBe(1);   // on the radius
    expect(m[2 * w + 2]).toBe(0);   // corner outside the circle
    paintMask(m, w, h, 5, 5, 1, 0);
    expect(m[5 * w + 5]).toBe(0);
    expect(m[5 * w + 8]).toBe(1);
  });

  it('paintMask squeezes the brush horizontally for 2:1 pixels and clips at edges', () => {
    const w = 20, h = 20, m = new Uint8Array(w * h);
    paintMask(m, w, h, 10, 10, 4, 1, 2);
    expect(m[10 * w + 12]).toBe(1);
    expect(m[10 * w + 13]).toBe(0);  // rx = 2
    expect(m[14 * w + 10]).toBe(1);  // ry = 4
    paintMask(m, w, h, 0, 0, 5, 1);  // must not throw at the border
    expect(m[0]).toBe(1);
  });
});
