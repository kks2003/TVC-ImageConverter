import { useCallback, useEffect, useRef, useState } from 'react';
import { UndoStack } from '../services/undoStack';

// Tracks `value` in an undo history; the history starts over whenever
// `resetKey` changes (e.g. a new image is loaded). undo()/redo() return the
// state to apply (the caller applies it), or null when there is none.
// `equals` decides when a value coming back is the one just restored.
export const useUndoHistory = <T,>(value: T, resetKey: unknown, equals: (a: T, b: T) => boolean = Object.is, coalesceMs = 600) => {
  const stack = useRef(new UndoStack<T>(value, coalesceMs, 100, equals));
  const lastResetKey = useRef(resetKey);
  const applying = useRef<T | null>(null);
  const [, bump] = useState(0);

  useEffect(() => {
    if (!Object.is(resetKey, lastResetKey.current)) {
      lastResetKey.current = resetKey;
      stack.current.reset(value);
    } else if (applying.current !== null && equals(applying.current, value)) {
      // The state we just restored arriving back: not a new change.
    } else {
      stack.current.record(value, performance.now());
    }
    applying.current = null;
    bump((n) => n + 1);
  }, [value, resetKey]);

  const step = useCallback((dir: 'undo' | 'redo') => {
    const next = dir === 'undo' ? stack.current.undo() : stack.current.redo();
    if (next !== null) applying.current = next;
    bump((n) => n + 1);
    return next;
  }, []);

  return {
    canUndo: stack.current.canUndo,
    canRedo: stack.current.canRedo,
    undo: useCallback(() => step('undo'), [step]),
    redo: useCallback(() => step('redo'), [step]),
  };
};
