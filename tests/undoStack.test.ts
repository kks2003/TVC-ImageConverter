import { describe, expect, it } from 'vitest';
import { UndoStack } from '../services/undoStack';

describe('UndoStack', () => {
  it('undoes and redoes separate changes', () => {
    const s = new UndoStack('a', 500);
    s.record('b', 0); s.record('c', 1000);
    expect(s.undo()).toBe('b');
    expect(s.undo()).toBe('a');
    expect(s.undo()).toBeNull();
    expect(s.redo()).toBe('b');
    expect(s.redo()).toBe('c');
    expect(s.redo()).toBeNull();
  });

  it('merges rapid changes (a slider drag) into one step', () => {
    const s = new UndoStack(0, 500);
    s.record(1, 1000); s.record(2, 1100); s.record(3, 1200); // one drag
    s.record(10, 5000);                                       // later change
    expect(s.undo()).toBe(3);
    expect(s.undo()).toBe(0);
    expect(s.canUndo).toBe(false);
  });

  it('a new change after undo drops the redo branch', () => {
    const s = new UndoStack('a', 0);
    s.record('b', 0); s.record('c', 10);
    s.undo();
    s.record('x', 20);
    expect(s.canRedo).toBe(false);
    expect(s.undo()).toBe('b');
  });

  it('does not merge the first change after an undo into the restored state', () => {
    const s = new UndoStack('a', 1000);
    s.record('b', 0);
    s.undo();          // back to 'a'
    s.record('c', 1);  // within coalesce window, but must be its own step
    expect(s.undo()).toBe('a');
  });

  it('ignores re-recording the current value and respects the limit', () => {
    const s = new UndoStack(0, 0, 3);
    s.record(0, 0);
    expect(s.canUndo).toBe(false);
    for (let i = 1; i <= 10; i++) s.record(i, i * 10);
    let n = 0; while (s.undo() !== null) n++;
    expect(n).toBe(3);
  });

  it('reset clears everything', () => {
    const s = new UndoStack('a', 0);
    s.record('b', 0); s.undo();
    s.reset('z');
    expect(s.canUndo || s.canRedo).toBe(false);
  });
});

describe('UndoStack with custom equality', () => {
  it('treats structurally equal snapshots as the same state', () => {
    const map = { a: 1 };
    const s = new UndoStack({ map, mode: 'x' }, 0, 100, (p, q) => p.map === q.map && p.mode === q.mode);
    s.record({ map, mode: 'x' }, 0); // re-wrapped, same content
    expect(s.canUndo).toBe(false);
  });
});
