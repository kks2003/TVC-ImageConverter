import React, { useRef } from 'react';

interface CompareOverlayProps {
  beforeUrl: string;
  position: number; // 0..100, % of width showing the "before" image
  onPositionChange: (position: number) => void;
  beforeLabel: string;
  afterLabel: string;
  sliderTitle: string;
}

// Before/after wipe laid over the converted preview: left of the divider shows
// the untouched source (framed like the conversion), right shows the result.
// Swallows mouse/touch presses so they don't also pan the composition; wheel
// events pass through, so zooming keeps working while comparing.
const CompareOverlay: React.FC<CompareOverlayProps> = ({ beforeUrl, position, onPositionChange, beforeLabel, afterLabel, sliderTitle }) => {
  const ref = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const setFromClientX = (clientX: number) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    onPositionChange(Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100)));
  };

  const stop = (e: React.SyntheticEvent) => e.stopPropagation();

  return (
    <div
      ref={ref}
      className="absolute inset-0 cursor-ew-resize select-none touch-none"
      data-testid="compare-overlay"
      onMouseDown={stop}
      onTouchStart={stop}
      onPointerDown={(e) => {
        e.stopPropagation();
        dragging.current = true;
        e.currentTarget.setPointerCapture(e.pointerId);
        setFromClientX(e.clientX);
      }}
      onPointerMove={(e) => { if (dragging.current) setFromClientX(e.clientX); }}
      onPointerUp={(e) => { dragging.current = false; e.currentTarget.releasePointerCapture(e.pointerId); }}
      onPointerCancel={() => { dragging.current = false; }}
    >
      <img
        src={beforeUrl}
        alt={beforeLabel}
        draggable={false}
        className="absolute inset-0 w-full h-full pointer-events-none"
        style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}
      />
      <div
        role="slider"
        tabIndex={0}
        aria-label={sliderTitle}
        title={sliderTitle}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(position)}
        onKeyDown={(e) => {
          const step = e.shiftKey ? 10 : 2;
          if (e.key === 'ArrowLeft') { e.preventDefault(); onPositionChange(Math.max(0, position - step)); }
          if (e.key === 'ArrowRight') { e.preventDefault(); onPositionChange(Math.min(100, position + step)); }
        }}
        className="absolute top-0 bottom-0 w-0.5 bg-white/90 shadow-[0_0_4px_rgba(0,0,0,0.8)] focus:outline-none focus-visible:bg-blue-400"
        style={{ left: `${position}%`, transform: 'translateX(-50%)' }}
      >
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-white/90 shadow-lg flex items-center justify-center text-slate-900 text-[10px] font-bold">
          ⇔
        </div>
      </div>
      <span className="absolute bottom-1.5 left-1.5 px-1.5 py-0.5 rounded bg-black/60 text-white text-[10px] font-mono pointer-events-none">{beforeLabel}</span>
      <span className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded bg-black/60 text-white text-[10px] font-mono pointer-events-none">{afterLabel}</span>
    </div>
  );
};

export default CompareOverlay;
