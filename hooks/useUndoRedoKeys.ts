import { useEffect, useRef } from 'react';

const isTextEntry = (el: EventTarget | null) => {
  if (!(el instanceof HTMLElement)) return false;
  if (el.isContentEditable || el.tagName === 'TEXTAREA') return true;
  if (el.tagName !== 'INPUT') return false;
  // Sliders, checkboxes etc. have no text undo of their own.
  const type = (el as HTMLInputElement).type;
  return !['range', 'checkbox', 'radio', 'button', 'color', 'file'].includes(type);
};

// Ctrl/Cmd+Z = undo, Ctrl/Cmd+Shift+Z or Ctrl/Cmd+Y = redo. Leaves text
// fields alone so their own undo keeps working.
export const useUndoRedoKeys = (onUndo: () => void, onRedo: () => void, enabled: boolean) => {
  const handlers = useRef({ onUndo, onRedo });
  handlers.current = { onUndo, onRedo };

  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || isTextEntry(e.target)) return;
      const key = e.key.toLowerCase();
      if (key === 'z' && !e.shiftKey) { e.preventDefault(); handlers.current.onUndo(); }
      else if ((key === 'z' && e.shiftKey) || key === 'y') { e.preventDefault(); handlers.current.onRedo(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled]);
};
