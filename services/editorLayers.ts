// Layer model for the Pixel Editor. Layer 0 is the opaque base image; upper
// layers start empty (EMPTY_PIXEL = see-through). Values are palette indices
// as in the editor's buffer (0..14 colours, 15 = transparent-mask colour).

export const EMPTY_PIXEL = 254;

export interface Layer {
  id: number;
  name: string;
  visible: boolean;
  buffer: Uint8Array;
}

export interface LayerSnapshot {
  layers: Layer[]; // deep copies
  active: number;
}

export const newEmptyLayer = (id: number, name: string, size: number): Layer =>
  ({ id, name, visible: true, buffer: new Uint8Array(size).fill(EMPTY_PIXEL) });

// What the image looks like: for every pixel the topmost visible non-empty
// value. `fallback` is used where nothing visible covers a pixel (only when
// the base layer is hidden).
export const compositeLayers = (layers: Layer[], size: number, fallback = 0): Uint8Array => {
  const out = new Uint8Array(size).fill(fallback);
  const visible = layers.filter((l) => l.visible);
  if (visible.length === 1 && visible[0] === layers[0]) return new Uint8Array(layers[0].buffer);
  const filled = new Uint8Array(size);
  for (let li = visible.length - 1; li >= 0; li--) {
    const b = visible[li].buffer;
    for (let i = 0; i < size; i++) {
      if (!filled[i] && b[i] !== EMPTY_PIXEL) { out[i] = b[i]; filled[i] = 1; }
    }
  }
  return out;
};

// Paints layer `index` onto the one below it and removes it.
export const mergeDown = (layers: Layer[], index: number): Layer[] => {
  if (index <= 0 || index >= layers.length) return layers;
  const upper = layers[index], lower = layers[index - 1];
  const merged = new Uint8Array(lower.buffer);
  for (let i = 0; i < merged.length; i++) if (upper.buffer[i] !== EMPTY_PIXEL) merged[i] = upper.buffer[i];
  const next = layers.slice();
  next.splice(index - 1, 2, { ...lower, buffer: merged });
  return next;
};

export const snapshotLayers = (layers: Layer[], active: number, activeOverride?: Uint8Array): LayerSnapshot => ({
  layers: layers.map((l, i) => ({ ...l, buffer: new Uint8Array(i === active && activeOverride ? activeOverride : l.buffer) })),
  active,
});

export const restoreLayers = (snap: LayerSnapshot): LayerSnapshot => ({
  layers: snap.layers.map((l) => ({ ...l, buffer: new Uint8Array(l.buffer) })),
  active: snap.active,
});
