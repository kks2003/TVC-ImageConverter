import React, { useRef, useEffect, useState, useCallback } from 'react';
import {
  ArrowLeft, Pencil, Minus, Square, Circle, PaintBucket,
  ZoomIn, ZoomOut, Download, FolderOpen, Grid3x3, LayoutGrid, Crop, RotateCcw, Undo2, Redo2, Eye, EyeOff, Languages,
  FlipHorizontal, FlipVertical, ArrowUp, ArrowDown, ArrowRight, Check, X as XIcon
} from 'lucide-react';
import { decodeTVCBmp, decodeTVCBin, guessBinMode, BIN_SIZES, DecodedTVCImage, TVCEditorMode } from './services/bmpEncoder';
import { decompressZX7 } from './services/zx7';

// --- Types -------------------------------------------------------------

export type EditorTool = 'pencil' | 'line' | 'rect' | 'rect-filled' | 'ellipse' | 'fill' | 'select';

export interface PixelEditorLabels {
  back?: string;
  tools?: string;
  pencil?: string;
  line?: string;
  rectangle?: string;
  rectangleFilled?: string;
  ellipse?: string;
  fill?: string;
  thickness?: string;
  colors?: string;
  primaryColor?: string;
  secondaryColor?: string;
  transparent?: string;
  zoom?: string;
  resetView?: string;
  grid?: string;
  transparencyToggle?: string;
  checkerFill?: string;
  select?: string;
  selectConfirm?: string;
  selectCancel?: string;
  selectHint?: string;
  flipHorizontal?: string;
  flipVertical?: string;
  scrollUp?: string;
  scrollDown?: string;
  scrollLeft?: string;
  scrollRight?: string;
  recolorSlot?: string;
  recolorHint?: string;
  preview?: string;
  save?: string;
  saveBmp11?: string;
  saveBmp21?: string;
  saveBin?: string;
  saveBinZx7?: string;
  open?: string;
  openHint?: string;
  panHint?: string;
  sizeMismatch?: string;
  unsavedChangesWarning?: string;
  cancel?: string;
  discardAndBack?: string;
  resetWarning?: string;
  resetConfirm?: string;
  unrecognizedFile?: string;
  openError?: string;
  binSizeMismatchTitle?: string;
  binSizeMismatchHint?: string;
  load?: string;
}

export interface PixelEditorProps {
  width: number;               // logical width, in TVC pixels (128/256/512 depending on mode)
  height: number;               // logical height (240)
  pixelAspectX: number;         // 2 for tvc-16 (2:1 hardware pixels), 1 for everything else
  palette: string[];            // 15 hex colors, FIXED_PALETTE order
  initialIndices: Uint8Array;   // values 0..14 = palette color, 15 = transparent marker (tvc-16/tvc256k only)
  mode: TVCEditorMode;
  activeColors?: number[];      // tvc-4/tvc-2 only: which FIXED_PALETTE indices (2 or 4) are selectable
  filenameBase: string;
  labels?: PixelEditorLabels;
  lang?: string;
  onLangChange?: (lang: string) => void;
  onBack: () => void;
  onSaveBMP: (ratio: number, indices: Uint8Array, mask: Uint8Array) => void;
  onSaveBIN: (indices: Uint8Array, mask: Uint8Array, activeColors?: number[]) => void;
  onSaveBINZX7: (indices: Uint8Array, mask: Uint8Array, activeColors?: number[]) => void;
  onImageLoaded: (decoded: DecodedTVCImage) => void;
}

// --- Constants -----------------------------------------------------------

const TRANSPARENT_INDEX = 15;
// Display-only marker checkerboard for the "transparent" slot - not part of
// the real TVC palette, so it never looks like a mixed-up real color while
// editing. The actual exported pixel is IRGB index 8 (near-black), handled
// by the mask, not by this color.
const TRANSPARENT_DISPLAY_A = { r: 255, g: 0, b: 170 };
const TRANSPARENT_DISPLAY_B = { r: 30, g: 30, b: 30 };

const ZOOM_LEVELS = [1, 2, 3, 4, 6, 8, 12, 16, 24, 32, 48, 64];

const LANGUAGE_OPTIONS = ['hu', 'en', 'pl', 'de', 'ru', 'uk', 'es', 'sk', 'ro'];

// Picks a starting zoom index based on the image's native (zoom=1) display
// width. Formats that are already wide enough on their own (currently just
// tvc-2, natively 512px wide) open at 1:1; the smaller ~256px-native
// formats (tvc-16/tvc256k/tvc-4) open pre-zoomed to a fixed, comfortably
// visible size instead of a cramped 1:1.
const getDefaultZoomIdx = (w: number, pixelAspectX: number): number => {
  const nativeDisplayWidth = w * pixelAspectX;
  return nativeDisplayWidth >= 400 ? 0 : 3; // ZOOM_LEVELS[0] = 1x, ZOOM_LEVELS[3] = 4x
};
const GRID_MIN_ZOOM = 8; // px per logical pixel before grid lines appear

const hexToRgb = (hex: string) => {
  const h = hex.replace('#', '');
  return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
};

const clampInt = (v: number, min: number, max: number) => Math.max(min, Math.min(max, Math.round(v)));

// --- Drawing primitives (operate directly on the index buffer) ---------

const setPx = (buf: Uint8Array, w: number, h: number, x: number, y: number, color: number) => {
  if (x < 0 || y < 0 || x >= w || y >= h) return;
  buf[y * w + x] = color;
};


// Checkerboard ("pepita") fill. Rather than teaching every drawing
// primitive about two colors, the shape is drawn once using a reserved
// index that can never be a real palette entry (valid indices are 0-15),
// then every pixel still holding that marker is resolved to one of the two
// colors by its parity. This keeps line/rect/ellipse/fill/pencil behaviour
// identical and automatically covers any tool added later.
const CHECKER_SENTINEL = 255;

const resolveChecker = (buf: Uint8Array, w: number, colorA: number, colorB: number) => {
  for (let i = 0; i < buf.length; i++) {
    if (buf[i] !== CHECKER_SENTINEL) continue;
    const x = i % w;
    const y = (i / w) | 0;
    buf[i] = ((x + y) % 2 === 0) ? colorA : colorB;
  }
};

const drawThickPixel = (buf: Uint8Array, w: number, h: number, x: number, y: number, color: number, thickness: number) => {
  const half = Math.floor((thickness - 1) / 2);
  for (let dy = 0; dy < thickness; dy++) {
    for (let dx = 0; dx < thickness; dx++) {
      setPx(buf, w, h, x - half + dx, y - half + dy, color);
    }
  }
};

const drawLine = (buf: Uint8Array, w: number, h: number, x0: number, y0: number, x1: number, y1: number, color: number, thickness: number) => {
  let cx = x0, cy = y0;
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  // Safety cap so a pathological input can never hang the tab.
  for (let i = 0; i < w * h + (Math.max(Math.abs(dx), Math.abs(dy)) + 4); i++) {
    drawThickPixel(buf, w, h, cx, cy, color, thickness);
    if (cx === x1 && cy === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; cx += sx; }
    if (e2 <= dx) { err += dx; cy += sy; }
  }
};

const drawRectOutline = (buf: Uint8Array, w: number, h: number, x0: number, y0: number, x1: number, y1: number, color: number, thickness: number) => {
  const left = Math.min(x0, x1), right = Math.max(x0, x1);
  const top = Math.min(y0, y1), bottom = Math.max(y0, y1);
  drawLine(buf, w, h, left, top, right, top, color, thickness);
  drawLine(buf, w, h, left, bottom, right, bottom, color, thickness);
  drawLine(buf, w, h, left, top, left, bottom, color, thickness);
  drawLine(buf, w, h, right, top, right, bottom, color, thickness);
};

const drawRectFilled = (buf: Uint8Array, w: number, h: number, x0: number, y0: number, x1: number, y1: number, color: number) => {
  const left = Math.min(x0, x1), right = Math.max(x0, x1);
  const top = Math.min(y0, y1), bottom = Math.max(y0, y1);
  for (let y = top; y <= bottom; y++) {
    for (let x = left; x <= right; x++) setPx(buf, w, h, x, y, color);
  }
};

const drawEllipseOutline = (buf: Uint8Array, w: number, h: number, x0: number, y0: number, x1: number, y1: number, color: number, thickness: number) => {
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const rx = Math.max(1, Math.abs(x1 - x0) / 2), ry = Math.max(1, Math.abs(y1 - y0) / 2);
  const steps = Math.max(24, Math.ceil(2 * Math.PI * Math.max(rx, ry)));
  let prevX = Math.round(cx + rx), prevY = Math.round(cy);
  for (let i = 1; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    const px = Math.round(cx + rx * Math.cos(a));
    const py = Math.round(cy + ry * Math.sin(a));
    drawLine(buf, w, h, prevX, prevY, px, py, color, thickness);
    prevX = px; prevY = py;
  }
};

const floodFill = (buf: Uint8Array, w: number, h: number, startX: number, startY: number, newColor: number) => {
  const startIdx = startY * w + startX;
  const target = buf[startIdx];
  if (target === newColor) return;
  const stack: number[] = [startIdx];
  const visited = new Uint8Array(w * h);
  while (stack.length > 0) {
    const idx = stack.pop()!;
    if (visited[idx]) continue;
    if (buf[idx] !== target) continue;
    visited[idx] = 1;
    buf[idx] = newColor;
    const x = idx % w, y = (idx / w) | 0;
    if (x > 0) stack.push(idx - 1);
    if (x < w - 1) stack.push(idx + 1);
    if (y > 0) stack.push(idx - w);
    if (y < h - 1) stack.push(idx + w);
  }
};

// --- Component -----------------------------------------------------------

const PixelEditor: React.FC<PixelEditorProps> = ({
  width, height, pixelAspectX, palette, initialIndices, mode, activeColors,
  labels = {}, lang = 'en', onLangChange, onBack, onSaveBMP, onSaveBIN, onSaveBINZX7, onImageLoaded
}) => {
  const l = labels;
  const supportsTransparency = mode === 'tvc-16' || mode === 'tvc256k';
  // The set of palette indices selectable in this session: all 15 for the
  // 16-color modes, or just the active subset for tvc-4/tvc-2. Mutable for
  // tvc-4/tvc-2 - see handleChangeActiveColor (lets the user reassign which
  // real color occupies each of the 2/4 slots).
  const [selectableColors, setSelectableColors] = useState<number[]>(() =>
    supportsTransparency
      ? palette.map((_, i) => i)
      : (activeColors && activeColors.length > 0 ? activeColors : palette.map((_, i) => i).slice(0, mode === 'tvc-4' ? 4 : 2))
  );
  const [recolorSlot, setRecolorSlot] = useState<number | null>(null);

  const bufferRef = useRef<Uint8Array>(new Uint8Array(initialIndices));
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const openFileInputRef = useRef<HTMLInputElement>(null);

  const [zoomIdx, setZoomIdx] = useState(() => getDefaultZoomIdx(width, pixelAspectX));
  const zoom = ZOOM_LEVELS[zoomIdx];
  const [tool, setTool] = useState<EditorTool>('pencil');
  const [thickness, setThickness] = useState(1);
  const [primaryColor, setPrimaryColor] = useState(selectableColors[0] ?? 0);   // left click
  const [secondaryColor, setSecondaryColor] = useState(supportsTransparency ? TRANSPARENT_INDEX : (selectableColors[1] ?? selectableColors[0] ?? 0)); // right click
  const [showGrid, setShowGrid] = useState(true);
  const [showTransparencyOverlay, setShowTransparencyOverlay] = useState(true);
  const [checkerFill, setCheckerFill] = useState(false);
  const [hoverPixel, setHoverPixel] = useState<{ x: number; y: number } | null>(null);
  const [showBackConfirm, setShowBackConfirm] = useState(false);
  const [, forceRender] = useState(0); // bump to re-render UI bits that read bufferRef (e.g. after undo-less edits, not the canvas itself)

  const snapshotBeforeLift = useRef<Uint8Array | null>(null);
  const drawState = useRef<{
    active: boolean;
    button: number;
    tool: EditorTool;
    startX: number;
    startY: number;
    lastX: number;
    lastY: number;
  } | null>(null);
  const panState = useRef<{ startClientX: number; startClientY: number; startScrollLeft: number; startScrollTop: number } | null>(null);

  // --- Undo / Redo (snapshot-based, capped history) ---
  const UNDO_LIMIT = 20;
  const undoStack = useRef<Uint8Array[]>([]);
  const redoStack = useRef<Uint8Array[]>([]);
  const [, setHistoryTick] = useState(0); // bumps to re-render undo/redo button enabled-state

  const pushUndo = useCallback(() => {
    undoStack.current.push(new Uint8Array(bufferRef.current));
    if (undoStack.current.length > UNDO_LIMIT) undoStack.current.shift();
    redoStack.current = [];
    setHistoryTick(t => t + 1);
  }, []);

  const isDirty = useCallback(() => undoStack.current.length > 0, []);

  const nativeW = width * pixelAspectX;
  const nativeH = height;

  const colorRgb = useCallback((idx: number) => {
    if (idx === TRANSPARENT_INDEX) return null; // handled specially (checkerboard)
    return hexToRgb(palette[idx]);
  }, [palette]);

  // --- Redraw main canvas from the index buffer ---
  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const imgData = ctx.createImageData(nativeW, nativeH);
    const data = imgData.data;
    const buf = bufferRef.current;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = buf[y * width + x];
        let r: number, g: number, b: number;
        if (idx === TRANSPARENT_INDEX) {
          if (showTransparencyOverlay) {
            const isA = (x + y) % 2 === 0;
            const c = isA ? TRANSPARENT_DISPLAY_A : TRANSPARENT_DISPLAY_B;
            r = c.r; g = c.g; b = c.b;
          } else {
            r = 0; g = 0; b = 0;
          }
        } else {
          const c = colorRgb(idx) ?? { r: 0, g: 0, b: 0 };
          r = c.r; g = c.g; b = c.b;
        }
        for (let ax = 0; ax < pixelAspectX; ax++) {
          const nx = x * pixelAspectX + ax;
          const di = (y * nativeW + nx) * 4;
          data[di] = r; data[di + 1] = g; data[di + 2] = b; data[di + 3] = 255;
        }
      }
    }
    ctx.putImageData(imgData, 0, 0);
  }, [width, height, pixelAspectX, nativeW, nativeH, colorRgb, showTransparencyOverlay]);

  const redrawPreview = useCallback(() => {
    const canvas = previewCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    // Reuse the already-rendered main canvas as the source for a cheap scaled copy.
    const src = canvasRef.current;
    if (!src) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(src, 0, 0, canvas.width, canvas.height);
  }, []);

  useEffect(() => {
    redraw();
    redrawPreview();
    // Defensive redundant redraw on the next frame - guards against any
    // first-paint timing glitch where the canvas context wasn't fully
    // ready at the moment of the synchronous draw above.
    const raf = requestAnimationFrame(() => { redraw(); redrawPreview(); });
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [redraw]);

  const commitRedraw = useCallback(() => {
    redraw();
    redrawPreview();
  }, [redraw, redrawPreview]);

  const handleUndo = useCallback(() => {
    if (undoStack.current.length === 0) return;
    redoStack.current.push(new Uint8Array(bufferRef.current));
    bufferRef.current = undoStack.current.pop()!;
    commitRedraw();
    setHistoryTick(t => t + 1);
  }, [commitRedraw]);

  const handleRedo = useCallback(() => {
    if (redoStack.current.length === 0) return;
    undoStack.current.push(new Uint8Array(bufferRef.current));
    bufferRef.current = redoStack.current.pop()!;
    commitRedraw();
    setHistoryTick(t => t + 1);
  }, [commitRedraw]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key === 'z' || e.key === 'Z') {
        e.preventDefault();
        if (e.shiftKey) handleRedo(); else handleUndo();
      } else if (e.key === 'y' || e.key === 'Y') {
        e.preventDefault();
        handleRedo();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleUndo, handleRedo]);

  // --- Coordinate mapping ---
  const clientToPixel = useCallback((e: { clientX: number; clientY: number }) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const cssX = e.clientX - rect.left;
    const cssY = e.clientY - rect.top;
    const x = Math.floor(cssX / zoom / pixelAspectX);
    const y = Math.floor(cssY / zoom);
    if (x < 0 || y < 0 || x >= width || y >= height) return null;
    return { x, y };
  }, [zoom, pixelAspectX, width, height]);

  // --- Overlay (live shape preview while dragging) ---
  const clearOverlay = useCallback(() => {
    const c = overlayCanvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    ctx?.clearRect(0, 0, c.width, c.height);
  }, []);

  const drawOverlayPreview = useCallback((x0: number, y0: number, x1: number, y1: number, rawColorIdx: number, currentTool: EditorTool, thick: number) => {
    const temp = new Uint8Array(bufferRef.current);
    const colorIdx = checkerFill ? CHECKER_SENTINEL : rawColorIdx;
    if (currentTool === 'line') drawLine(temp, width, height, x0, y0, x1, y1, colorIdx, thick);
    else if (currentTool === 'rect') drawRectOutline(temp, width, height, x0, y0, x1, y1, colorIdx, thick);
    else if (currentTool === 'rect-filled') drawRectFilled(temp, width, height, x0, y0, x1, y1, colorIdx);
    else if (currentTool === 'ellipse') drawEllipseOutline(temp, width, height, x0, y0, x1, y1, colorIdx, thick);
    if (checkerFill) resolveChecker(temp, width, primaryColor, secondaryColor);

    const c = overlayCanvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const imgData = ctx.createImageData(nativeW, nativeH);
    const data = imgData.data;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = y * width + x;
        if (temp[i] === bufferRef.current[i]) continue; // only paint changed pixels
        const idx = temp[i];
        let r: number, g: number, b: number;
        if (idx === TRANSPARENT_INDEX) {
          if (showTransparencyOverlay) {
            const isA = (x + y) % 2 === 0;
            const cc = isA ? TRANSPARENT_DISPLAY_A : TRANSPARENT_DISPLAY_B;
            r = cc.r; g = cc.g; b = cc.b;
          } else {
            r = 0; g = 0; b = 0;
          }
        } else {
          const cc = colorRgb(idx) ?? { r: 0, g: 0, b: 0 };
          r = cc.r; g = cc.g; b = cc.b;
        }
        for (let ax = 0; ax < pixelAspectX; ax++) {
          const nx = x * pixelAspectX + ax;
          const di = (y * nativeW + nx) * 4;
          data[di] = r; data[di + 1] = g; data[di + 2] = b; data[di + 3] = 255;
        }
      }
    }
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.putImageData(imgData, 0, 0);
  }, [width, height, pixelAspectX, nativeW, colorRgb, showTransparencyOverlay]);

  // --- Mouse handlers ---
  useEffect(() => {
    // Leaving the select tool with something still floating would strand it,
    // so place it down rather than silently discarding the move.
    if (tool !== 'select' && floatSel) commitFloat();
    clearOverlay();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool]);


  // --- Rectangular select / float / move ---
  // Lifting a selection copies the region into a "floating" layer and
  // blanks the source area. While floating you can re-grab and re-position
  // it any number of times; nothing is written back into the image until
  // you commit (Enter, the check button, or clicking outside it). Cancel
  // (Esc) puts it back where it came from. Only the commit pushes undo, so
  // one undo removes the whole cut-and-move as a single step.
  const [floatSel, setFloatSel] = useState<{ x: number; y: number; w: number; h: number; data: Uint8Array; origX: number; origY: number } | null>(null);
  const selDragRef = useRef<{ mode: 'marquee' | 'move'; startX: number; startY: number; curX: number; curY: number; grabDX: number; grabDY: number } | null>(null);
  const blankIdx = selectableColors[0] ?? 0;

  const drawSelOverlay = useCallback((fs: typeof floatSel, marquee?: { x0: number; y0: number; x1: number; y1: number }) => {
    const c = overlayCanvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, c.width, c.height);

    if (fs) {
      const imgData = ctx.createImageData(nativeW, nativeH);
      const d = imgData.data;
      for (let yy = 0; yy < fs.h; yy++) {
        const ty = fs.y + yy;
        if (ty < 0 || ty >= height) continue;
        for (let xx = 0; xx < fs.w; xx++) {
          const tx = fs.x + xx;
          if (tx < 0 || tx >= width) continue;
          const idx = fs.data[yy * fs.w + xx];
          let r: number, g: number, b: number;
          if (idx === TRANSPARENT_INDEX) {
            if (showTransparencyOverlay) {
              const cc = (tx + ty) % 2 === 0 ? TRANSPARENT_DISPLAY_A : TRANSPARENT_DISPLAY_B;
              r = cc.r; g = cc.g; b = cc.b;
            } else { r = 0; g = 0; b = 0; }
          } else {
            const cc = colorRgb(idx) || { r: 0, g: 0, b: 0 };
            r = cc.r; g = cc.g; b = cc.b;
          }
          for (let ax = 0; ax < pixelAspectX; ax++) {
            const di = (ty * nativeW + (tx * pixelAspectX + ax)) * 4;
            d[di] = r; d[di + 1] = g; d[di + 2] = b; d[di + 3] = 255;
          }
        }
      }
      ctx.putImageData(imgData, 0, 0);
    }

    const box = fs
      ? { x: fs.x, y: fs.y, w: fs.w, h: fs.h }
      : marquee
        ? { x: Math.min(marquee.x0, marquee.x1), y: Math.min(marquee.y0, marquee.y1), w: Math.abs(marquee.x1 - marquee.x0) + 1, h: Math.abs(marquee.y1 - marquee.y0) + 1 }
        : null;
    if (box) {
      ctx.save();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 3]);
      ctx.strokeRect(box.x * pixelAspectX + 0.5, box.y + 0.5, box.w * pixelAspectX - 1, box.h - 1);
      ctx.restore();
    }
  }, [nativeW, nativeH, width, height, pixelAspectX, colorRgb, showTransparencyOverlay]);

  const stampFloat = (fs: NonNullable<typeof floatSel>) => {
    const buf = bufferRef.current;
    for (let yy = 0; yy < fs.h; yy++) {
      const ty = fs.y + yy;
      if (ty < 0 || ty >= height) continue;
      for (let xx = 0; xx < fs.w; xx++) {
        const tx = fs.x + xx;
        if (tx < 0 || tx >= width) continue;
        buf[ty * width + tx] = fs.data[yy * fs.w + xx];
      }
    }
  };

  const commitFloat = useCallback(() => {
    setFloatSel(prev => {
      if (!prev) return null;
      // Undo snapshot taken here (not at lift time) so the entire
      // cut-and-move collapses into one undoable step.
      undoStack.current.push(snapshotBeforeLift.current ?? new Uint8Array(bufferRef.current));
      if (undoStack.current.length > UNDO_LIMIT) undoStack.current.shift();
      redoStack.current = [];
      snapshotBeforeLift.current = null;
      stampFloat(prev);
      commitRedraw();
      setHistoryTick(t => t + 1);
      return null;
    });
    clearOverlay();
  }, [commitRedraw, clearOverlay, width, height]);

  const cancelFloat = useCallback(() => {
    setFloatSel(prev => {
      if (!prev) return null;
      if (snapshotBeforeLift.current) {
        bufferRef.current = new Uint8Array(snapshotBeforeLift.current);
        snapshotBeforeLift.current = null;
      }
      commitRedraw();
      return null;
    });
    clearOverlay();
  }, [commitRedraw, clearOverlay]);

  useEffect(() => {
    if (!floatSel) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter') { e.preventDefault(); commitFloat(); }
      else if (e.key === 'Escape') { e.preventDefault(); cancelFloat(); }
      else if (e.key.startsWith('Arrow')) {
        e.preventDefault();
        const dx = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0;
        const dy = e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0;
        setFloatSel(prev => {
          if (!prev) return prev;
          const moved = { ...prev, x: prev.x + dx, y: prev.y + dy };
          drawSelOverlay(moved);
          return moved;
        });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [floatSel, commitFloat, cancelFloat, drawSelOverlay]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button === 1) {
      e.preventDefault();
      panState.current = {
        startClientX: e.clientX, startClientY: e.clientY,
        startScrollLeft: containerRef.current?.scrollLeft ?? 0,
        startScrollTop: containerRef.current?.scrollTop ?? 0
      };
      return;
    }
    if (e.button !== 0 && e.button !== 2) return;
    const px = clientToPixel(e);
    if (!px) return;
    const colorIdx = e.button === 0 ? primaryColor : secondaryColor;

    // Defensive: guarantee no leftover preview pixels from a previous,
    // possibly-interrupted stroke are still sitting on the overlay canvas.
    clearOverlay();

    if (tool === 'select') {
      if (floatSel) {
        const inside = px.x >= floatSel.x && px.x < floatSel.x + floatSel.w && px.y >= floatSel.y && px.y < floatSel.y + floatSel.h;
        if (inside) {
          selDragRef.current = { mode: 'move', startX: px.x, startY: px.y, curX: px.x, curY: px.y, grabDX: px.x - floatSel.x, grabDY: px.y - floatSel.y };
          return;
        }
        commitFloat();
        return; // this click only commits; drag a fresh marquee with the next one
      }
      selDragRef.current = { mode: 'marquee', startX: px.x, startY: px.y, curX: px.x, curY: px.y, grabDX: 0, grabDY: 0 };
      drawSelOverlay(null, { x0: px.x, y0: px.y, x1: px.x, y1: px.y });
      return;
    }

    // With checker fill on, the clicked button decides which color lands on
    // the even squares, so left/right click give mirrored patterns.
    const drawIdx = checkerFill ? CHECKER_SENTINEL : colorIdx;
    const ckA = e.button === 0 ? primaryColor : secondaryColor;
    const ckB = e.button === 0 ? secondaryColor : primaryColor;

    if (tool === 'fill') {
      pushUndo();
      floodFill(bufferRef.current, width, height, px.x, px.y, drawIdx);
      if (checkerFill) resolveChecker(bufferRef.current, width, ckA, ckB);
      commitRedraw();
      return;
    }
    if (tool === 'pencil') {
      pushUndo();
      drawThickPixel(bufferRef.current, width, height, px.x, px.y, drawIdx, thickness);
      if (checkerFill) resolveChecker(bufferRef.current, width, ckA, ckB);
      commitRedraw();
    }
    drawState.current = { active: true, button: e.button, tool, startX: px.x, startY: px.y, lastX: px.x, lastY: px.y };
  }, [clientToPixel, tool, primaryColor, secondaryColor, thickness, width, height, commitRedraw, pushUndo, clearOverlay, floatSel, commitFloat, drawSelOverlay, checkerFill]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (panState.current) {
      const dx = e.clientX - panState.current.startClientX;
      const dy = e.clientY - panState.current.startClientY;
      if (containerRef.current) {
        containerRef.current.scrollLeft = panState.current.startScrollLeft - dx;
        containerRef.current.scrollTop = panState.current.startScrollTop - dy;
      }
      return;
    }
    const px = clientToPixel(e);
    setHoverPixel(px);

    const sd = selDragRef.current;
    if (sd) {
      if (!px) return;
      if (sd.mode === 'marquee') {
        sd.curX = px.x; sd.curY = px.y;
        drawSelOverlay(null, { x0: sd.startX, y0: sd.startY, x1: px.x, y1: px.y });
      } else if (floatSel) {
        const nx = px.x - sd.grabDX, ny = px.y - sd.grabDY;
        if (nx !== floatSel.x || ny !== floatSel.y) {
          const moved = { ...floatSel, x: nx, y: ny };
          setFloatSel(moved);
          drawSelOverlay(moved);
        }
      }
      return;
    }

    const ds = drawState.current;
    if (!ds || !ds.active) return;
    if (!px) return;
    const colorIdx = ds.button === 0 ? primaryColor : secondaryColor;

    if (ds.tool === 'pencil') {
      if (px.x !== ds.lastX || px.y !== ds.lastY) {
        drawLine(bufferRef.current, width, height, ds.lastX, ds.lastY, px.x, px.y, checkerFill ? CHECKER_SENTINEL : colorIdx, thickness);
        if (checkerFill) resolveChecker(bufferRef.current, width, ds.button === 0 ? primaryColor : secondaryColor, ds.button === 0 ? secondaryColor : primaryColor);
        ds.lastX = px.x; ds.lastY = px.y;
        commitRedraw();
      }
    } else {
      drawOverlayPreview(ds.startX, ds.startY, px.x, px.y, colorIdx, ds.tool, thickness);
      ds.lastX = px.x; ds.lastY = px.y;
    }
  }, [clientToPixel, primaryColor, secondaryColor, thickness, width, height, commitRedraw, drawOverlayPreview, floatSel, drawSelOverlay, checkerFill]);

  const endDraw = useCallback(() => {
    panState.current = null;

    const sd = selDragRef.current;
    if (sd) {
      selDragRef.current = null;
      if (sd.mode === 'marquee') {
        const x0 = Math.min(sd.startX, sd.curX), y0 = Math.min(sd.startY, sd.curY);
        const w = Math.abs(sd.curX - sd.startX) + 1, h = Math.abs(sd.curY - sd.startY) + 1;
        if (w < 1 || h < 1) { clearOverlay(); return; }
        // Remember the pre-lift image so Esc can restore it and so commit
        // can record the whole operation as one undo step.
        snapshotBeforeLift.current = new Uint8Array(bufferRef.current);
        const data = new Uint8Array(w * h);
        const buf = bufferRef.current;
        for (let yy = 0; yy < h; yy++)
          for (let xx = 0; xx < w; xx++) {
            data[yy * w + xx] = buf[(y0 + yy) * width + (x0 + xx)];
            buf[(y0 + yy) * width + (x0 + xx)] = blankIdx;
          }
        const fs = { x: x0, y: y0, w, h, data, origX: x0, origY: y0 };
        setFloatSel(fs);
        commitRedraw();
        drawSelOverlay(fs);
      }
      return;
    }

    const ds = drawState.current;
    if (!ds || !ds.active) return;
    const colorIdx = ds.button === 0 ? primaryColor : secondaryColor;
    const drawIdx = checkerFill ? CHECKER_SENTINEL : colorIdx;
    if (ds.tool !== 'pencil') pushUndo();
    if (ds.tool === 'line') drawLine(bufferRef.current, width, height, ds.startX, ds.startY, ds.lastX, ds.lastY, drawIdx, thickness);
    else if (ds.tool === 'rect') drawRectOutline(bufferRef.current, width, height, ds.startX, ds.startY, ds.lastX, ds.lastY, drawIdx, thickness);
    else if (ds.tool === 'rect-filled') drawRectFilled(bufferRef.current, width, height, ds.startX, ds.startY, ds.lastX, ds.lastY, drawIdx);
    else if (ds.tool === 'ellipse') drawEllipseOutline(bufferRef.current, width, height, ds.startX, ds.startY, ds.lastX, ds.lastY, drawIdx, thickness);
    if (checkerFill) resolveChecker(bufferRef.current, width, ds.button === 0 ? primaryColor : secondaryColor, ds.button === 0 ? secondaryColor : primaryColor);
    drawState.current = null;
    clearOverlay();
    commitRedraw();
  }, [width, height, primaryColor, secondaryColor, thickness, clearOverlay, commitRedraw, pushUndo, drawSelOverlay, blankIdx, checkerFill]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const cursorX = e.clientX - rect.left + container.scrollLeft;
    const cursorY = e.clientY - rect.top + container.scrollTop;
    const oldZoom = zoom;

    setZoomIdx(prevIdx => {
      const newIdx = clampInt(prevIdx + (e.deltaY < 0 ? 1 : -1), 0, ZOOM_LEVELS.length - 1);
      const newZoom = ZOOM_LEVELS[newIdx];
      if (newZoom !== oldZoom) {
        requestAnimationFrame(() => {
          if (!containerRef.current) return;
          const ratio = newZoom / oldZoom;
          containerRef.current.scrollLeft = cursorX * ratio - (e.clientX - rect.left);
          containerRef.current.scrollTop = cursorY * ratio - (e.clientY - rect.top);
        });
      }
      return newIdx;
    });
  }, [zoom]);

  // --- Open (load a previously-exported BMP or BIN directly, no conversion) ---
  const [binPicker, setBinPicker] = useState<{ buffer: ArrayBuffer; selected: TVCEditorMode } | null>(null);

  const handleOpenClick = () => openFileInputRef.current?.click();
  const handleOpenFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (openFileInputRef.current) openFileInputRef.current.value = '';
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const buffer = reader.result as ArrayBuffer;
      const bytes = new Uint8Array(buffer);

      if (bytes[0] === 0x42 && bytes[1] === 0x4D) { // "BM" magic
        // Pass the current mode as a hint: a 256-wide 24bpp BMP is
        // inherently ambiguous between "tvc-16, pre-doubled" and "tvc-4,
        // native" - trust the session you're already in.
        const decoded = decodeTVCBmp(buffer, palette, mode);
        if (decoded) { onImageLoaded(decoded); return; }
        alert(l.unrecognizedFile || 'Unrecognized BMP - only this app\'s own exports (128x240/256x240/512x240 24bpp, or 256x240 4bpp) can be opened.');
        return;
      }

      // tvc-16, tvc-4, and tvc-2 all produce exactly the same 15360-byte
      // size - genuinely indistinguishable by size alone. Prefer the
      // editor's current mode/active colors when it matches (by far the
      // most common case: reloading your own work).
      if (buffer.byteLength === BIN_SIZES[mode]) { onImageLoaded(decodeTVCBin(buffer, mode, activeColors)); return; }
      if (mode !== 'tvc256k' && buffer.byteLength === BIN_SIZES['tvc256k']) { onImageLoaded(decodeTVCBin(buffer, 'tvc256k')); return; }

      // Doesn't match - it might be ZX7-compressed. Only trust the
      // decompression if it lands exactly on a known BIN size.
      try {
        const decompressed = decompressZX7(bytes);
        const db = decompressed.buffer as ArrayBuffer;
        if (decompressed.length === BIN_SIZES[mode]) { onImageLoaded(decodeTVCBin(db, mode, activeColors)); return; }
        if (mode !== 'tvc256k' && decompressed.length === BIN_SIZES['tvc256k']) { onImageLoaded(decodeTVCBin(db, 'tvc256k')); return; }
        if (decompressed.length === 15360 || decompressed.length === 30720) {
          setBinPicker({ buffer: db, selected: guessBinMode(decompressed.length, mode) });
          return;
        }
      } catch {
        // not valid ZX7 data - fall through
      }

      // Size doesn't match any known resolution exactly - ask, pre-selecting our best guess.
      setBinPicker({ buffer, selected: guessBinMode(buffer.byteLength, mode) });
    };
    reader.onerror = () => alert(l.openError || 'Could not read the file.');
    reader.readAsArrayBuffer(file);
  };

  const confirmBinPicker = () => {
    if (!binPicker) return;
    onImageLoaded(decodeTVCBin(binPicker.buffer, binPicker.selected, binPicker.selected === mode ? activeColors : undefined));
    setBinPicker(null);
  };

  const [showResetConfirm, setShowResetConfirm] = useState(false);

  // Reassigns which real palette color occupies a given tvc-4/tvc-2 slot.
  // Existing pixels drawn with the old color are remapped to the new one,
  // so the image keeps looking the same number of distinct colors.
  const handleChangeActiveColor = (slotIdx: number, newGlobalIdx: number) => {
    const oldGlobal = selectableColors[slotIdx];
    if (oldGlobal === newGlobalIdx) { setRecolorSlot(null); return; }
    pushUndo();
    const buf = bufferRef.current;
    for (let i = 0; i < buf.length; i++) {
      if (buf[i] === oldGlobal) buf[i] = newGlobalIdx;
    }
    setSelectableColors(prev => prev.map((c, i) => i === slotIdx ? newGlobalIdx : c));
    if (primaryColor === oldGlobal) setPrimaryColor(newGlobalIdx);
    if (secondaryColor === oldGlobal) setSecondaryColor(newGlobalIdx);
    commitRedraw();
    setRecolorSlot(null);
  };

  // --- Whole-image transforms (flip / wrap-around scroll) ---
  // Scrolling wraps: pixels pushed off one edge reappear on the opposite
  // side, so nothing is ever lost and you can nudge artwork into position
  // freely. All of these push an undo snapshot first.
  const applyTransform = (fn: (src: Uint8Array, dst: Uint8Array) => void) => {
    pushUndo();
    const src = bufferRef.current;
    const dst = new Uint8Array(src.length);
    fn(src, dst);
    bufferRef.current = dst;
    commitRedraw();
    forceRender(n => n + 1);
  };

  const flipHorizontal = () => applyTransform((src, dst) => {
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++)
        dst[y * width + x] = src[y * width + (width - 1 - x)];
  });

  const flipVertical = () => applyTransform((src, dst) => {
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++)
        dst[y * width + x] = src[(height - 1 - y) * width + x];
  });

  const scrollBy = (dx: number, dy: number) => applyTransform((src, dst) => {
    for (let y = 0; y < height; y++) {
      const sy = ((y - dy) % height + height) % height;
      for (let x = 0; x < width; x++) {
        const sx = ((x - dx) % width + width) % width;
        dst[y * width + x] = src[sy * width + sx];
      }
    }
  });

  const performReset = () => {
    pushUndo();
    bufferRef.current = new Uint8Array(initialIndices);
    commitRedraw();
    forceRender(n => n + 1);
    setShowResetConfirm(false);
  };

  // Derive export mask + indices (transparent marker -> mask=1, underlying index -> 0)
  const buildExportData = (): { indices: Uint8Array; mask: Uint8Array } => {
    const buf = bufferRef.current;
    const indices = new Uint8Array(buf.length);
    const mask = new Uint8Array(buf.length);
    for (let i = 0; i < buf.length; i++) {
      if (buf[i] === TRANSPARENT_INDEX) { indices[i] = 0; mask[i] = 1; }
      else { indices[i] = buf[i]; mask[i] = 0; }
    }
    return { indices, mask };
  };

  const cssW = nativeW * zoom;
  const cssH = nativeH * zoom;
  const gridCellW = pixelAspectX * zoom;
  const gridVisible = showGrid && zoom >= GRID_MIN_ZOOM / Math.max(1, pixelAspectX === 2 ? 1.4 : 1);

  return (
    <div className="h-screen bg-slate-950 text-slate-200 flex flex-col overflow-hidden">
      {/* Top toolbar */}
      <div className="border-b border-slate-800/60 bg-slate-900/70 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-[1600px] mx-auto px-3 h-14 flex items-center gap-3">
          <button onClick={() => { if (isDirty()) setShowBackConfirm(true); else onBack(); }} className="flex items-center space-x-1.5 text-sm font-medium text-slate-200 hover:text-white shrink-0">
            <ArrowLeft size={18} />
            <span>{l.back || 'Back to converter'}</span>
          </button>
          <div className="w-px h-7 bg-slate-800 shrink-0" />

          {/* Tools */}
          <div className="flex items-center gap-1.5 shrink-0">
            {([
              ['pencil', Pencil, l.pencil || 'Pencil'],
              ['line', Minus, l.line || 'Line'],
              ['rect', Square, l.rectangle || 'Rectangle'],
              ['rect-filled', Square, l.rectangleFilled || 'Filled rectangle'],
              ['ellipse', Circle, l.ellipse || 'Ellipse'],
              ['fill', PaintBucket, l.fill || 'Fill'],
              ['select', Crop, l.select || 'Select / move a rectangular area'],
            ] as [EditorTool, typeof Pencil, string][]).map(([id, Icon, title]) => (
              <button
                key={id}
                onClick={() => setTool(id)}
                title={title}
                className={`p-2.5 rounded-lg ${tool === id ? 'bg-blue-600 text-white' : 'bg-slate-800/60 text-slate-300 hover:text-white hover:bg-slate-800'} ${id === 'rect-filled' ? 'relative' : ''}`}
              >
                <Icon size={19} fill={id === 'rect-filled' ? 'currentColor' : 'none'} />
              </button>
            ))}
          </div>
          {floatSel && (
            <>
              <div className="w-px h-7 bg-slate-800 shrink-0" />
              <div className="flex items-center gap-1.5 shrink-0">
                <button onClick={commitFloat} title={l.selectConfirm || 'Place here (Enter)'} className="p-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white"><Check size={18} /></button>
                <button onClick={cancelFloat} title={l.selectCancel || 'Cancel move (Esc)'} className="p-2.5 rounded-lg bg-slate-800/60 hover:bg-slate-800 text-slate-300 hover:text-white"><XIcon size={18} /></button>
              </div>
            </>
          )}
          <div className="w-px h-7 bg-slate-800 shrink-0" />

          {/* Undo / Redo */}
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={handleUndo}
              disabled={undoStack.current.length === 0}
              title="Undo (Ctrl+Z)"
              className="p-2.5 rounded-lg bg-slate-800/60 hover:bg-slate-800 text-slate-300 hover:text-white disabled:opacity-30 disabled:pointer-events-none"
            ><Undo2 size={18} /></button>
            <button
              onClick={handleRedo}
              disabled={redoStack.current.length === 0}
              title="Redo (Ctrl+Y)"
              className="p-2.5 rounded-lg bg-slate-800/60 hover:bg-slate-800 text-slate-300 hover:text-white disabled:opacity-30 disabled:pointer-events-none"
            ><Redo2 size={18} /></button>
          </div>
          <div className="w-px h-7 bg-slate-800 shrink-0" />

          {/* Thickness */}
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-sm font-medium text-slate-300">{l.thickness || 'Size'}</span>
            <input
              type="range" min={1} max={8} value={thickness}
              onChange={e => setThickness(parseInt(e.target.value))}
              className="w-20 accent-blue-500"
            />
            <span className="text-sm font-mono text-slate-200 w-4">{thickness}</span>
          </div>
          <div className="w-px h-7 bg-slate-800 shrink-0" />

          {/* Zoom */}
          <div className="flex items-center gap-1.5 shrink-0">
            <button onClick={() => setZoomIdx(i => clampInt(i - 1, 0, ZOOM_LEVELS.length - 1))} className="p-2 rounded-lg bg-slate-800/60 hover:bg-slate-800 text-slate-300 hover:text-white"><ZoomOut size={17} /></button>
            <span className="text-sm font-mono text-slate-200 w-10 text-center">{zoom}x</span>
            <button onClick={() => setZoomIdx(i => clampInt(i + 1, 0, ZOOM_LEVELS.length - 1))} className="p-2 rounded-lg bg-slate-800/60 hover:bg-slate-800 text-slate-300 hover:text-white"><ZoomIn size={17} /></button>
            <button
              onClick={() => setCheckerFill(v => !v)}
              title={l.checkerFill || 'Checkerboard fill: draw with primary + secondary in a checker pattern'}
              className={`p-2 rounded-lg ${checkerFill ? 'bg-blue-600 text-white' : 'bg-slate-800/60 text-slate-300'} hover:text-white`}
            >
              <LayoutGrid size={17} />
            </button>
            <button onClick={() => setShowGrid(g => !g)} title={l.grid || 'Pixel grid'} className={`p-2 rounded-lg ${showGrid ? 'bg-slate-700 text-white' : 'bg-slate-800/60 text-slate-300'} hover:text-white`}><Grid3x3 size={17} /></button>
            {supportsTransparency && (
              <button
                onClick={() => setShowTransparencyOverlay(v => !v)}
                title={l.transparencyToggle || 'Show/hide the transparent-color highlight on the canvas'}
                className={`p-2 rounded-lg ${showTransparencyOverlay ? 'bg-slate-700 text-white' : 'bg-slate-800/60 text-slate-300'} hover:text-white`}
              >
                {showTransparencyOverlay ? <Eye size={17} /> : <EyeOff size={17} />}
              </button>
            )}
            <div className="w-px h-7 bg-slate-800 shrink-0" />
            <button onClick={flipHorizontal} title={l.flipHorizontal || 'Flip horizontally'} className="p-2 rounded-lg bg-slate-800/60 hover:bg-slate-800 text-slate-300 hover:text-white"><FlipHorizontal size={17} /></button>
            <button onClick={flipVertical} title={l.flipVertical || 'Flip vertically'} className="p-2 rounded-lg bg-slate-800/60 hover:bg-slate-800 text-slate-300 hover:text-white"><FlipVertical size={17} /></button>
            <div className="w-px h-7 bg-slate-800 shrink-0" />
            <button onClick={() => scrollBy(0, -1)} title={l.scrollUp || 'Scroll up (wraps around)'} className="p-2 rounded-lg bg-slate-800/60 hover:bg-slate-800 text-slate-300 hover:text-white"><ArrowUp size={17} /></button>
            <button onClick={() => scrollBy(0, 1)} title={l.scrollDown || 'Scroll down (wraps around)'} className="p-2 rounded-lg bg-slate-800/60 hover:bg-slate-800 text-slate-300 hover:text-white"><ArrowDown size={17} /></button>
            <button onClick={() => scrollBy(-1, 0)} title={l.scrollLeft || 'Scroll left (wraps around)'} className="p-2 rounded-lg bg-slate-800/60 hover:bg-slate-800 text-slate-300 hover:text-white"><ArrowLeft size={17} /></button>
            <button onClick={() => scrollBy(1, 0)} title={l.scrollRight || 'Scroll right (wraps around)'} className="p-2 rounded-lg bg-slate-800/60 hover:bg-slate-800 text-slate-300 hover:text-white"><ArrowRight size={17} /></button>
            <div className="w-px h-7 bg-slate-800 shrink-0" />
            <button onClick={() => setShowResetConfirm(true)} title="Reset" className="p-2 rounded-lg bg-slate-800/60 hover:bg-slate-800 text-slate-300 hover:text-white"><RotateCcw size={17} /></button>
          </div>

          <div className="flex-1" />
          {onLangChange && (
            <div className="relative flex items-center bg-slate-900 border border-slate-700/70 rounded-lg px-2 py-1 text-slate-200 hover:text-white transition-colors focus-within:ring-2 focus-within:ring-blue-500/50 focus-within:border-blue-500/50 shrink-0">
              <Languages size={13} className="text-blue-400 mr-1.5 flex-shrink-0" />
              <select
                value={lang}
                onChange={e => onLangChange(e.target.value)}
                className="bg-slate-900 text-slate-200 font-bold text-[11px] font-mono uppercase focus:outline-none cursor-pointer pr-1 py-0.5 appearance-none"
              >
                {LANGUAGE_OPTIONS.map(code => (
                  <option key={code} value={code} className="bg-slate-900 text-slate-100 font-semibold">{code.toUpperCase()}</option>
                ))}
              </select>
            </div>
          )}
          <input ref={openFileInputRef} type="file" accept=".bmp,.bin,.zx7" className="hidden" onChange={handleOpenFileChange} />
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* Left side panel */}
        <div className="w-64 shrink-0 min-h-0 border-r border-slate-800/60 bg-slate-900/60 p-3 flex flex-col gap-3 overflow-y-auto">
          {/* Preview */}
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-300 mb-1">{l.preview || 'Preview'}</div>
            <div className="bg-black rounded border border-slate-800 flex items-center justify-center p-1">
              <canvas
                ref={previewCanvasRef}
                width={Math.min(150, width * pixelAspectX)}
                height={Math.round(Math.min(150, width * pixelAspectX) * (height / (width * pixelAspectX)))}
                style={{ imageRendering: 'pixelated', width: '100%', height: 'auto' }}
              />
            </div>
          </div>

          {/* Open */}
          <button
            onClick={handleOpenClick}
            title={l.openHint || 'Open a previously exported BMP, BIN, or BIN.ZX7 file, without conversion'}
            className="flex items-center justify-center space-x-1.5 text-xs py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium"
          >
            <FolderOpen size={13} /><span>{l.open || 'Open'}</span>
          </button>

          {/* Colors */}
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-300 mb-1">{l.colors || 'Colors'}</div>
            <div className="flex items-center gap-2 mb-1.5">
              <div className="flex flex-col items-center">
                <div
                  className="w-8 h-8 rounded border-2 border-white/80 shadow"
                  style={primaryColor === TRANSPARENT_INDEX
                    ? { background: `repeating-conic-gradient(#ff00aa 0% 25%, #1e1e1e 0% 50%) 0 / 6px 6px` }
                    : { backgroundColor: palette[primaryColor] }}
                  title={l.primaryColor || 'Primary (left click)'}
                />
                <span className="text-[10px] font-semibold text-slate-300">L</span>
              </div>
              <div className="flex flex-col items-center">
                <div
                  className="w-8 h-8 rounded border-2 border-white/40 shadow"
                  style={secondaryColor === TRANSPARENT_INDEX
                    ? { background: `repeating-conic-gradient(#ff00aa 0% 25%, #1e1e1e 0% 50%) 0 / 6px 6px` }
                    : { backgroundColor: palette[secondaryColor] }}
                  title={l.secondaryColor || 'Secondary (right click)'}
                />
                <span className="text-[10px] font-semibold text-slate-300">R</span>
              </div>
            </div>
            <div className={`grid gap-1.5 ${supportsTransparency || mode === 'tvc-4' ? 'grid-cols-4' : 'grid-cols-2'}`}>
              {selectableColors.map((i, slotIdx) => (
                <button
                  key={slotIdx}
                  onClick={() => setPrimaryColor(i)}
                  onContextMenu={e => { e.preventDefault(); setSecondaryColor(i); }}
                  className={`relative w-full aspect-square rounded border-2 ${primaryColor === i ? 'ring-2 ring-blue-400 border-blue-400' : secondaryColor === i ? 'ring-2 ring-amber-400 border-amber-400' : 'border-slate-700'}`}
                  style={{ backgroundColor: palette[i] }}
                >
                  {!supportsTransparency && (
                    <span
                      role="button"
                      onClick={e => { e.stopPropagation(); setRecolorSlot(slotIdx); }}
                      title={l.recolorSlot || 'Change this color'}
                      className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-slate-900 border border-slate-600 flex items-center justify-center text-slate-300 hover:text-white hover:border-slate-400"
                    >
                      <Pencil size={9} />
                    </span>
                  )}
                </button>
              ))}
              {supportsTransparency && (
                <button
                  onClick={() => setPrimaryColor(TRANSPARENT_INDEX)}
                  onContextMenu={e => { e.preventDefault(); setSecondaryColor(TRANSPARENT_INDEX); }}
                  title={l.transparent || 'Transparent'}
                  className={`w-full aspect-square rounded border-2 ${primaryColor === TRANSPARENT_INDEX ? 'ring-2 ring-blue-400 border-blue-400' : secondaryColor === TRANSPARENT_INDEX ? 'ring-2 ring-amber-400 border-amber-400' : 'border-slate-700'}`}
                  style={{ background: `repeating-conic-gradient(#ff00aa 0% 25%, #1e1e1e 0% 50%) 0 / 6px 6px` }}
                />
              )}
            </div>
            {recolorSlot !== null && (
              <div className="mt-2 p-2 rounded border border-slate-700 bg-slate-800/80">
                <div className="text-[10px] text-slate-400 mb-1.5">{l.recolorHint || 'Pick a new color for this slot:'}</div>
                <div className="grid grid-cols-5 gap-1">
                  {palette.map((hex, i) => (
                    <button
                      key={i}
                      onClick={() => handleChangeActiveColor(recolorSlot, i)}
                      className={`w-full aspect-square rounded border ${selectableColors[recolorSlot] === i ? 'ring-2 ring-blue-400 border-blue-400' : 'border-slate-700'}`}
                      style={{ backgroundColor: hex }}
                    />
                  ))}
                </div>
                <button onClick={() => setRecolorSlot(null)} className="mt-1.5 text-[10px] text-slate-500 hover:text-slate-300 underline">
                  {l.cancel || 'Cancel'}
                </button>
              </div>
            )}
          </div>

          <div className="flex-1" />

          {/* Save */}
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-300 mb-1">{l.save || 'Save'}</div>
            <div className="grid grid-cols-1 gap-1.5">
              <button
                onClick={() => { const { indices, mask } = buildExportData(); onSaveBMP(1, indices, mask); }}
                className="flex items-center justify-center space-x-1.5 text-xs py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-100 font-medium"
              >
                <Download size={13} /><span>{l.saveBmp11 || 'BMP (1:1)'}</span>
              </button>
              {mode === 'tvc-16' && (
                <button
                  onClick={() => { const { indices, mask } = buildExportData(); onSaveBMP(2, indices, mask); }}
                  className="flex items-center justify-center space-x-1.5 text-xs py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-100 font-medium"
                >
                  <Download size={13} /><span>{l.saveBmp21 || 'BMP (2:1)'}</span>
                </button>
              )}
              <button
                onClick={() => { const { indices, mask } = buildExportData(); onSaveBIN(indices, mask, selectableColors); }}
                className="flex items-center justify-center space-x-1.5 text-xs py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-100 font-medium"
              >
                <Download size={13} /><span>{l.saveBin || 'BIN'}</span>
              </button>
              <button
                onClick={() => { const { indices, mask } = buildExportData(); onSaveBINZX7(indices, mask, selectableColors); }}
                className="flex items-center justify-center space-x-1.5 text-xs py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-100 font-medium"
              >
                <Download size={13} /><span>{l.saveBinZx7 || 'BIN (ZX7)'}</span>
              </button>
            </div>
          </div>

          <div className="text-[11px] text-slate-400 leading-snug border-t border-slate-800 pt-2">
            {l.panHint || 'Scroll to zoom. Middle-click drag (or the scrollbars) to pan. Left click = primary color, right click = secondary color.'}
          </div>
        </div>

        {/* Canvas viewport */}
        <div
          ref={containerRef}
          className="flex-1 min-w-0 min-h-0 overflow-auto bg-[#0a0a0f] relative"
          style={{
            backgroundImage: 'linear-gradient(45deg, #14141c 25%, transparent 25%), linear-gradient(-45deg, #14141c 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #14141c 75%), linear-gradient(-45deg, transparent 75%, #14141c 75%)',
            backgroundSize: '20px 20px',
            backgroundPosition: '0 0, 0 10px, 10px -10px, -10px 0px'
          }}
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={endDraw}
          onMouseLeave={() => { setHoverPixel(null); endDraw(); }}
          onContextMenu={e => e.preventDefault()}
        >
          <div className="relative inline-block m-8" style={{ width: cssW, height: cssH }}>
            <canvas
              ref={canvasRef}
              width={nativeW}
              height={nativeH}
              style={{ width: cssW, height: cssH, imageRendering: 'pixelated' }}
              className="absolute top-0 left-0 shadow-2xl"
            />
            <canvas
              ref={overlayCanvasRef}
              width={nativeW}
              height={nativeH}
              style={{ width: cssW, height: cssH, imageRendering: 'pixelated' }}
              className="absolute top-0 left-0 pointer-events-none"
            />
            {gridVisible && (
              <div
                className="absolute top-0 left-0 pointer-events-none"
                style={{
                  width: cssW, height: cssH,
                  backgroundImage: `linear-gradient(to right, rgba(255,255,255,0.18) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.18) 1px, transparent 1px)`,
                  backgroundSize: `${gridCellW}px ${zoom}px`
                }}
              />
            )}
            {hoverPixel && (() => {
              // Preview the exact footprint the brush would paint. Mirrors
              // drawThickPixel's geometry (a thickness x thickness square
              // anchored by half = floor((thickness-1)/2)), so what the
              // outline covers is what a click actually changes. Tools that
              // ignore the thickness slider (filled rect, bucket, select)
              // keep the plain single-pixel cursor.
              const usesThickness = tool === 'pencil' || tool === 'line' || tool === 'rect' || tool === 'ellipse';
              const t = usesThickness ? thickness : 1;
              const half = Math.floor((t - 1) / 2);
              return (
                <div
                  className="absolute pointer-events-none border border-white mix-blend-difference"
                  style={{
                    left: (hoverPixel.x - half) * gridCellW,
                    top: (hoverPixel.y - half) * zoom,
                    width: gridCellW * t,
                    height: zoom * t
                  }}
                />
              );
            })()}
          </div>
        </div>
      </div>

      {binPicker && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-5 max-w-sm shadow-2xl">
            <p className="text-sm text-slate-200 mb-1 font-medium">
              {l.binSizeMismatchTitle || "This file's size doesn't exactly match a known resolution."}
            </p>
            <p className="text-xs text-slate-500 mb-4">
              {(l.binSizeMismatchHint || 'File size: {size} bytes. Pick which resolution to interpret it as (best guess pre-selected):').replace('{size}', String(binPicker.buffer.byteLength))}
            </p>
            <div className="flex flex-col gap-2 mb-4">
              <button
                onClick={() => setBinPicker(p => p && { ...p, selected: 'tvc-16' })}
                className={`text-left px-3 py-2 rounded border text-xs ${binPicker.selected === 'tvc-16' ? 'border-blue-500 bg-blue-500/10 text-white' : 'border-slate-700 text-slate-400 hover:border-slate-600'}`}
              >
                16 {l.colors || 'colors'} - 128×240 (2:1) <span className="text-slate-600">- {BIN_SIZES['tvc-16']} bytes</span>
              </button>
              <button
                onClick={() => setBinPicker(p => p && { ...p, selected: 'tvc-4' })}
                className={`text-left px-3 py-2 rounded border text-xs ${binPicker.selected === 'tvc-4' ? 'border-blue-500 bg-blue-500/10 text-white' : 'border-slate-700 text-slate-400 hover:border-slate-600'}`}
              >
                4 {l.colors || 'colors'} - 256×240 (1:1) <span className="text-slate-600">- {BIN_SIZES['tvc-4']} bytes</span>
              </button>
              <button
                onClick={() => setBinPicker(p => p && { ...p, selected: 'tvc-2' })}
                className={`text-left px-3 py-2 rounded border text-xs ${binPicker.selected === 'tvc-2' ? 'border-blue-500 bg-blue-500/10 text-white' : 'border-slate-700 text-slate-400 hover:border-slate-600'}`}
              >
                2 {l.colors || 'colors'} - 512×240 (1:1) <span className="text-slate-600">- {BIN_SIZES['tvc-2']} bytes</span>
              </button>
              <button
                onClick={() => setBinPicker(p => p && { ...p, selected: 'tvc256k' })}
                className={`text-left px-3 py-2 rounded border text-xs ${binPicker.selected === 'tvc256k' ? 'border-blue-500 bg-blue-500/10 text-white' : 'border-slate-700 text-slate-400 hover:border-slate-600'}`}
              >
                256k - 256×240 (1:1) <span className="text-slate-600">- {BIN_SIZES['tvc256k']} bytes</span>
              </button>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setBinPicker(null)} className="px-3 py-1.5 text-xs rounded bg-slate-800 hover:bg-slate-700 text-slate-200">
                {l.cancel || 'Cancel'}
              </button>
              <button onClick={confirmBinPicker} className="px-3 py-1.5 text-xs rounded bg-blue-600 hover:bg-blue-500 text-white">
                {l.load || 'Load'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showBackConfirm && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-5 max-w-sm shadow-2xl">
            <p className="text-sm text-slate-200 mb-4">
              {l.unsavedChangesWarning || 'You have unsaved changes that will be lost if you leave without saving.'}
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowBackConfirm(false)}
                className="px-3 py-1.5 text-xs rounded bg-slate-800 hover:bg-slate-700 text-slate-200"
              >
                {l.cancel || 'Cancel'}
              </button>
              <button
                onClick={() => { setShowBackConfirm(false); onBack(); }}
                className="px-3 py-1.5 text-xs rounded bg-red-700 hover:bg-red-600 text-white"
              >
                {l.discardAndBack || 'Discard and go back'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showResetConfirm && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-5 max-w-sm shadow-2xl">
            <p className="text-sm text-slate-200 mb-4">
              {l.resetWarning || 'This resets the image to how it was when you opened it, discarding every edit you made. This can be undone (Ctrl+Z).'}
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowResetConfirm(false)}
                className="px-3 py-1.5 text-xs rounded bg-slate-800 hover:bg-slate-700 text-slate-200"
              >
                {l.cancel || 'Cancel'}
              </button>
              <button
                onClick={performReset}
                className="px-3 py-1.5 text-xs rounded bg-red-700 hover:bg-red-600 text-white"
              >
                {l.resetConfirm || 'Reset'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PixelEditor;

// --- Helper for the "Open" flow: decode a PNG at the exact target
// resolution directly into an index buffer, with no resizing or dithering.
// Returns null (and the caller should show `sizeMismatch`) if the file's
// dimensions don't match.
export const decodePngToIndices = (
  img: HTMLImageElement,
  width: number,
  height: number,
  palette: string[]
): Uint8Array | null => {
  if (img.width !== width || img.height !== height) return null;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, width, height).data;

  const paletteRgb = palette.map(hexToRgb);
  const indices = new Uint8Array(width * height);

  for (let i = 0; i < width * height; i++) {
    const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2], a = data[i * 4 + 3];
    if (a < 128) { indices[i] = TRANSPARENT_INDEX; continue; }
    let best = 0, bestDist = Infinity;
    for (let p = 0; p < paletteRgb.length; p++) {
      const pc = paletteRgb[p];
      const d = (r - pc.r) ** 2 + (g - pc.g) ** 2 + (b - pc.b) ** 2;
      if (d < bestDist) { bestDist = d; best = p; }
    }
    indices[i] = best;
  }
  return indices;
};
