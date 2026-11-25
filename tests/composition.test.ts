import { describe, expect, it } from 'vitest';
import { compositionRect, logicalCanvasSize } from '../services/composition';

describe('compositionRect', () => {
  it('cover: wide image fills height and is centred', () => {
    // 400x200 into 256x240 -> height 240, width 480, centred
    expect(compositionRect(400, 200, 256, 240, 'cover', 1, 50, 50)).toEqual({ x: -112, y: 0, w: 480, h: 240 });
  });
  it('contain: wide image fits width (letterbox)', () => {
    expect(compositionRect(400, 200, 256, 240, 'contain', 1, 50, 50)).toEqual({ x: 0, y: 56, w: 256, h: 128 });
  });
  it('stretch ignores zoom and position', () => {
    expect(compositionRect(400, 200, 256, 240, 'stretch', 3, 0, 100)).toEqual({ x: 0, y: 0, w: 256, h: 240 });
  });
  it('zoom and position move the frame', () => {
    expect(compositionRect(256, 240, 256, 240, 'cover', 2, 0, 100)).toEqual({ x: 0, y: -240, w: 512, h: 480 });
  });
});

describe('logicalCanvasSize', () => {
  it('matches the TVC modes', () => {
    expect(logicalCanvasSize({ outputMode: 'tvc-16', resolutionMode: 'tvc' })).toEqual({ w: 256, h: 240 });
    expect(logicalCanvasSize({ outputMode: 'tvc-2', resolutionMode: 'tvc' })).toEqual({ w: 512, h: 240 });
    expect(logicalCanvasSize({ outputMode: 'tvc-16', resolutionMode: 'tvc256k' })).toEqual({ w: 256, h: 240 });
    expect(logicalCanvasSize({ outputMode: 'tvc-16', resolutionMode: 'original' })).toBeNull();
  });
});
