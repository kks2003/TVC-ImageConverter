import { describe, expect, it } from 'vitest';
import { compositeLayers, EMPTY_PIXEL, Layer, mergeDown, newEmptyLayer, restoreLayers, snapshotLayers } from '../services/editorLayers';

const base = (vals: number[]): Layer => ({ id: 0, name: 'base', visible: true, buffer: Uint8Array.from(vals) });
const layer = (id: number, vals: number[], visible = true): Layer => ({ id, name: 'L' + id, visible, buffer: Uint8Array.from(vals) });
const E = EMPTY_PIXEL;

describe('editor layers', () => {
  it('new layers are empty', () => {
    expect(Array.from(newEmptyLayer(1, 'x', 3).buffer)).toEqual([E, E, E]);
  });

  it('composite takes the topmost visible non-empty pixel', () => {
    const ls = [base([1, 1, 1, 1]), layer(1, [2, E, 2, E]), layer(2, [3, E, E, E])];
    expect(Array.from(compositeLayers(ls, 4))).toEqual([3, 1, 2, 1]);
  });

  it('hidden layers are ignored; hidden base falls back', () => {
    const ls = [base([1, 1]), layer(1, [2, E], false)];
    expect(Array.from(compositeLayers(ls, 2))).toEqual([1, 1]);
    ls[0].visible = false; ls[1].visible = true;
    expect(Array.from(compositeLayers(ls, 2, 0))).toEqual([2, 0]);
  });

  it('the transparent-mask colour (15) on an upper layer covers the base', () => {
    expect(Array.from(compositeLayers([base([1]), layer(1, [15])], 1))).toEqual([15]);
  });

  it('merge down paints the upper layer onto the lower and removes it', () => {
    const ls = [base([1, 1, 1]), layer(1, [2, E, 2]), layer(2, [E, 3, E])];
    const m = mergeDown(ls, 2);
    expect(m.length).toBe(2);
    expect(Array.from(m[1].buffer)).toEqual([2, 3, 2]);
    expect(Array.from(compositeLayers(m, 3))).toEqual(Array.from(compositeLayers(ls, 3)));
    expect(mergeDown(ls, 0)).toBe(ls);
  });

  it('snapshots are deep copies and can use an override for the active layer', () => {
    const ls = [base([1, 1]), layer(1, [2, 2])];
    const snap = snapshotLayers(ls, 1, Uint8Array.from([9, 9]));
    ls[0].buffer[0] = 7;
    expect(Array.from(snap.layers[0].buffer)).toEqual([1, 1]);
    expect(Array.from(snap.layers[1].buffer)).toEqual([9, 9]);
    const r = restoreLayers(snap);
    r.layers[1].buffer[0] = 0;
    expect(snap.layers[1].buffer[0]).toBe(9);
  });
});
