import { afterEach, describe, expect, it, vi } from 'vitest';
import { countBestColors, searchBestSettings, TuneInput } from '../services/autoTuner';

const W = 64, H = 120;

const makeInput = (paint: (x: number, y: number) => [number, number, number], over: Partial<TuneInput> = {}): TuneInput => {
  const data = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const [r, g, b] = paint(x, y);
    const i = (y * W + x) * 4;
    data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255;
  }
  return { data, w: W, h: H, outputMode: 'tvc-16', currentSelectedColors: [], topColors: null, tuningStrategy: 'flat', disabledPatternPairs: [], ...over };
};

const seedRandom = (seed: number) => {
  vi.spyOn(Math, 'random').mockImplementation(() => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  });
};

afterEach(() => vi.restoreAllMocks());

describe('countBestColors', () => {
  it('ranks palette colours by how many pixels they are nearest to', () => {
    const { data } = makeInput((x) => (x < 40 ? [255, 0, 0] : [0, 0, 255]));
    // 5 = bright red, 4 = bright blue
    expect(countBestColors(data, 2)).toEqual([5, 4]);
  });
});

describe('searchBestSettings', () => {
  const gradient = (x: number, y: number): [number, number, number] => [x * 4, y * 2, 255 - x * 4];

  it('returns a complete result', async () => {
    seedRandom(1);
    const res = await searchBestSettings(makeInput(gradient));
    expect(res.ditherMethod).toBeTruthy();
    expect(res.selectedColors).toHaveLength(15);
    expect(Object.keys(res.adjustments).sort()).toEqual(
      ['brightness', 'contrast', 'denoise', 'ditherAmount', 'gamma', 'noiseLevel', 'saturation', 'solidSnap', 'toneMapping', 'unsharpMask'],
    );
  });

  it('is deterministic for a given random sequence', async () => {
    seedRandom(7);
    const a = await searchBestSettings(makeInput(gradient, { tuningStrategy: 'artistic' }));
    seedRandom(7);
    const b = await searchBestSettings(makeInput(gradient, { tuningStrategy: 'artistic' }));
    expect(a).toEqual(b);
  });

  it('picks a 4-colour palette for tvc-4 and uses the supplied top colours as a candidate', async () => {
    seedRandom(3);
    const input = makeInput((x) => (x < 32 ? [255, 255, 0] : [0, 255, 255]), { outputMode: 'tvc-4', topColors: [13, 12, 0, 14] });
    const res = await searchBestSettings(input);
    expect(res.selectedColors).toHaveLength(4);
  });

  it('reports progress up to 1 and honours an abort signal', async () => {
    seedRandom(5);
    const seen: number[] = [];
    await searchBestSettings(makeInput(gradient), { onProgress: (p) => seen.push(p) });
    expect(seen.at(-1)).toBe(1);

    const ctrl = new AbortController();
    ctrl.abort();
    await expect(
      searchBestSettings(makeInput(gradient, { tuningStrategy: 'artistic' }), { signal: ctrl.signal, cooperative: true }),
    ).rejects.toThrow('Auto-tune aborted');
  });
});
