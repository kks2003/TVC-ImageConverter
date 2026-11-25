import type { ProcessingSettings } from '../types';

export interface Rect { x: number; y: number; w: number; h: number }

// Where the source image lands on the logical (square-pixel) TVC canvas for a
// given fit mode / zoom / position. Same arithmetic as processImage() in
// imageProcessor.ts (non-custom-offset path), so a preview drawn with it lines
// up exactly with the converted result.
export const compositionRect = (
  imgW: number, imgH: number, logicalW: number, logicalH: number,
  fitMode: ProcessingSettings['fitMode'], zoom: number, positionX: number, positionY: number,
): Rect => {
  let w = logicalW;
  let h = logicalH;
  if (fitMode !== 'stretch') {
    const imageAspect = imgW / imgH;
    const targetAspect = logicalW / logicalH;
    if (fitMode === 'cover') {
      if (imageAspect > targetAspect) { h = logicalH; w = logicalH * imageAspect; }
      else { w = logicalW; h = logicalW / imageAspect; }
    } else {
      if (imageAspect > targetAspect) { w = logicalW; h = logicalW / imageAspect; }
      else { h = logicalH; w = logicalH * imageAspect; }
    }
    w *= zoom;
    h *= zoom;
  }
  return { x: (logicalW - w) * (positionX / 100), y: (logicalH - h) * (positionY / 100), w, h };
};

// Logical canvas size (square pixels) of the TVC output for these settings,
// or null for "original size" mode, which has no fixed frame.
export const logicalCanvasSize = (settings: Pick<ProcessingSettings, 'outputMode' | 'resolutionMode'>): { w: number; h: number } | null => {
  if (settings.resolutionMode === 'original') return null;
  if (settings.resolutionMode === 'tvc256k') return { w: 256, h: 240 };
  return { w: settings.outputMode === 'tvc-2' ? 512 : 256, h: 240 };
};

// Renders the untouched source image framed exactly like the conversion, at
// `scale` x the logical size, and resolves to an object URL (caller revokes).
export const renderCompositionPreview = (
  img: HTMLImageElement, settings: ProcessingSettings, scale = 3,
): Promise<string | null> => {
  const size = logicalCanvasSize(settings);
  if (!size) return Promise.resolve(null);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(size.w * scale);
  canvas.height = Math.round(size.h * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) return Promise.resolve(null);
  const r = compositionRect(img.width, img.height, size.w, size.h, settings.fitMode, settings.zoom, settings.positionX, settings.positionY);
  ctx.fillStyle = settings.backgroundColor;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, r.x * scale, r.y * scale, r.w * scale, r.h * scale);
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b ? URL.createObjectURL(b) : null), 'image/png'));
};
