import React, { useEffect, useState } from 'react';
import { X, Loader2 } from 'lucide-react';
import type { DitherMethod, ProcessingSettings } from '../types';
import type { Translation } from '../i18n';
import { convertImage } from '../services/convert';
import { ditherOptionGroups } from '../services/ditherOptions';

interface DitherGridProps {
  t: Translation;
  img: HTMLImageElement;
  settings: ProcessingSettings;
  aspect: number; // displayed width / height of the result
  onPick: (method: DitherMethod) => void;
  onClose: () => void;
}

// Converts the image with every dither method (all other settings as they
// are) and shows the results side by side; clicking one selects it.
const DitherGrid: React.FC<DitherGridProps> = ({ t, img, settings, aspect, onPick, onClose }) => {
  const methods = ditherOptionGroups(t).flatMap((g) => g.items);
  const [results, setResults] = useState<Partial<Record<DitherMethod, string | null>>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Current method first, then the rest in menu order.
      const order = [settings.ditherMethod, ...methods.map((m) => m.value).filter((m) => m !== settings.ditherMethod)];
      for (const method of order) {
        if (cancelled) return;
        let url: string | null = null;
        try {
          url = (await convertImage(img, { ...settings, ditherMethod: method })).url;
        } catch (err) {
          console.error('Dither preview failed for', method, err);
        }
        if (cancelled) return;
        setResults((prev) => ({ ...prev, [method]: url }));
        // Let the browser paint each tile as it arrives.
        await new Promise((r) => setTimeout(r, 0));
      }
    })();
    return () => { cancelled = true; };
    // Runs once per opening: the grid reflects the settings at that moment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const done = Object.keys(results).length;

  return (
    <div className="fixed inset-0 z-[100] bg-slate-950/90 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4" onClick={onClose}>
      <div
        className="relative bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl w-full max-w-6xl max-h-[95vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={t.ditherGridTitle}
      >
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-800">
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-white">{t.ditherGridTitle}</h3>
            <p className="text-[11px] text-slate-400">{t.ditherGridHint} {done < methods.length && <span className="mono">({done}/{methods.length})</span>}</p>
          </div>
          <button onClick={onClose} className="w-9 h-9 shrink-0 bg-slate-800 hover:bg-slate-700 rounded-full flex items-center justify-center text-white" title={t.ttClosePreview}>
            <X size={18} />
          </button>
        </div>
        <div className="overflow-y-auto p-3 sm:p-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3" data-testid="dither-grid">
          {methods.map((m) => {
            const url = results[m.value];
            const isCurrent = m.value === settings.ditherMethod;
            return (
              <button
                key={m.value}
                onClick={() => { onPick(m.value); onClose(); }}
                disabled={!url}
                data-method={m.value}
                className={`group text-left rounded-lg border p-1.5 transition-colors ${isCurrent ? 'border-blue-500 bg-blue-600/10' : 'border-slate-800 hover:border-slate-500 bg-slate-950/40'} disabled:cursor-wait`}
              >
                <div className="w-full bg-black rounded overflow-hidden flex items-center justify-center" style={{ aspectRatio: `${aspect}` }}>
                  {url ? (
                    <img src={url} alt={m.label} className="pixelated w-full h-full" />
                  ) : url === null ? (
                    <span className="text-rose-400 text-xs">!</span>
                  ) : (
                    <Loader2 size={18} className="text-slate-600 animate-spin" />
                  )}
                </div>
                <div className={`mt-1 text-[11px] truncate mono ${isCurrent ? 'text-blue-300 font-bold' : 'text-slate-300'}`}>{m.label}</div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default DitherGrid;
