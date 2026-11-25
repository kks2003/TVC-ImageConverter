import React, { useEffect, useRef } from 'react';
import { paintMask } from '../services/convert';

interface RegionPaintOverlayProps {
  mask: Uint8Array;      // edited in place, w * h (the result's raw pixels)
  w: number;
  h: number;
  pixelAspectX: number;  // 2 in the 16-colour mode
  brush: number;         // radius, in TVC pixel rows
  version: number;       // bump to force a redraw after external changes
  onStrokeEnd: () => void;
  title: string;
}

// Paints the "region" mask on top of the converted preview: left button
// paints, right button erases. Swallows presses so the composition isn't
// dragged at the same time; the wheel still zooms.
const RegionPaintOverlay: React.FC<RegionPaintOverlayProps> = ({ mask, w, h, pixelAspectX, brush, version, onStrokeEnd, title }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stroke = useRef<{ value: 0 | 1; x: number; y: number } | null>(null);

  const draw = () => {
    const c = canvasRef.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    const img = ctx.createImageData(w, h);
    for (let i = 0; i < mask.length; i++) {
      if (!mask[i]) continue;
      img.data[i * 4] = 236; img.data[i * 4 + 1] = 72; img.data[i * 4 + 2] = 153; img.data[i * 4 + 3] = 120;
    }
    ctx.putImageData(img, 0, 0);
  };
  useEffect(draw); // cheap (<= 512x240) and keeps the view in sync with `version`

  const toPixel = (e: React.PointerEvent) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * w, y: ((e.clientY - r.top) / r.height) * h };
  };

  const paintTo = (x: number, y: number) => {
    const s = stroke.current;
    if (!s) return;
    // Interpolate so fast strokes leave no gaps.
    const steps = Math.max(1, Math.ceil(Math.hypot((x - s.x) * pixelAspectX, y - s.y) / Math.max(1, brush / 2)));
    for (let k = 1; k <= steps; k++) {
      paintMask(mask, w, h, s.x + ((x - s.x) * k) / steps, s.y + ((y - s.y) * k) / steps, brush, s.value, pixelAspectX);
    }
    s.x = x; s.y = y;
    draw();
  };

  const stop = (e: React.SyntheticEvent) => e.stopPropagation();

  return (
    <canvas
      ref={canvasRef}
      width={w}
      height={h}
      title={title}
      data-testid="region-overlay"
      data-version={version}
      className="absolute inset-0 w-full h-full pixelated cursor-crosshair touch-none"
      onMouseDown={stop}
      onTouchStart={stop}
      onContextMenu={(e) => e.preventDefault()}
      onPointerDown={(e) => {
        if (e.button !== 0 && e.button !== 2) return;
        e.stopPropagation();
        e.currentTarget.setPointerCapture(e.pointerId);
        const p = toPixel(e);
        stroke.current = { value: e.button === 2 ? 0 : 1, x: p.x, y: p.y };
        paintMask(mask, w, h, p.x, p.y, brush, stroke.current.value, pixelAspectX);
        draw();
      }}
      onPointerMove={(e) => { if (stroke.current) { const p = toPixel(e); paintTo(p.x, p.y); } }}
      onPointerUp={(e) => {
        if (!stroke.current) return;
        stroke.current = null;
        e.currentTarget.releasePointerCapture(e.pointerId);
        onStrokeEnd();
      }}
      onPointerCancel={() => { if (stroke.current) { stroke.current = null; onStrokeEnd(); } }}
    />
  );
};

export default RegionPaintOverlay;
