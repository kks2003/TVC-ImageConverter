export type TextFont = 'mono' | 'sans';

const FONT_FAMILY: Record<TextFont, string> = {
  mono: "'JetBrains Mono', ui-monospace, monospace",
  sans: "Inter, system-ui, sans-serif",
};

export interface RasterText {
  w: number;
  h: number;
  opaque: Uint8Array; // 1 = glyph pixel, w*h
}

// Renders `text` with a browser font and thresholds it onto the TVC pixel
// grid. `pixelAspectX` is the width of one TVC pixel in square pixels (2 in
// the 16-colour mode), so letters keep their shape on screen instead of
// coming out twice as wide. Returns null for empty/blank text.
export const rasterizeText = (
  text: string, sizePx: number, font: TextFont, bold: boolean, pixelAspectX = 1,
): RasterText | null => {
  if (!text.trim()) return null;
  const fontSpec = `${bold ? 700 : 400} ${sizePx}px ${FONT_FAMILY[font]}`;
  const probe = document.createElement('canvas').getContext('2d');
  if (!probe) return null;
  probe.font = fontSpec;
  const lines = text.split('\n');
  // Measure real ink extents so accents above capitals (Á, Ő...) and
  // descenders are never clipped.
  const metrics = lines.map((l) => probe.measureText(l || ' '));
  const ascent = Math.ceil(Math.max(sizePx * 0.8, ...metrics.map((m) => m.actualBoundingBoxAscent || 0)));
  const descent = Math.ceil(Math.max(sizePx * 0.2, ...metrics.map((m) => m.actualBoundingBoxDescent || 0)));
  const lineH = ascent + descent + 1;
  const sqW = Math.ceil(Math.max(...metrics.map((m) => Math.max(m.width, (m.actualBoundingBoxRight || 0) + (m.actualBoundingBoxLeft || 0))))) + 4;
  // Draw at square-pixel resolution, then merge each run of `pixelAspectX`
  // square pixels into one TVC pixel (lit if any part is inked), so thin
  // strokes and accents survive the 2:1 pixels of the 16-colour mode.
  const sw = sqW + (sqW % pixelAspectX ? pixelAspectX - (sqW % pixelAspectX) : 0);
  const w = Math.max(1, sw / pixelAspectX);
  const h = lineH * lines.length + 2;

  const canvas = document.createElement('canvas');
  canvas.width = sw;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.font = fontSpec;
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#fff';
  lines.forEach((line, i) => ctx.fillText(line, 2, 1 + ascent + i * lineH));
  const sq = ctx.getImageData(0, 0, sw, h).data;
  const alpha = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let a = 0;
    for (let k = 0; k < pixelAspectX; k++) a = Math.max(a, sq[(y * sw + x * pixelAspectX + k) * 4 + 3]);
    alpha[(y * w + x) * 4 + 3] = a;
  }

  // Threshold, then trim empty borders.
  let minX = w, minY = h, maxX = -1, maxY = -1;
  const full = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (alpha[(y * w + x) * 4 + 3] >= 128) {
      full[y * w + x] = 1;
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return null;
  const tw = maxX - minX + 1, th = maxY - minY + 1;
  const opaque = new Uint8Array(tw * th);
  for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) opaque[y * tw + x] = full[(y + minY) * w + (x + minX)];
  return { w: tw, h: th, opaque };
};
