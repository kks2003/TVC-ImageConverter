// Undo/redo history of immutable values. Changes arriving within
// `coalesceMs` of the previous one are merged into a single step, so a slider
// drag or a burst of wheel zooms undoes in one go.
export class UndoStack<T> {
  private past: T[] = [];
  private future: T[] = [];
  private lastChangeAt = -Infinity;

  constructor(
    private current: T,
    private readonly coalesceMs = 600,
    private readonly limit = 100,
    private readonly equals: (a: T, b: T) => boolean = Object.is,
  ) {}

  get canUndo() { return this.past.length > 0; }
  get canRedo() { return this.future.length > 0; }

  // Records `value` as the new current state.
  record(value: T, now: number): void {
    if (this.equals(value, this.current)) return;
    const coalesce = this.past.length > 0 && now - this.lastChangeAt < this.coalesceMs;
    if (!coalesce) {
      this.past.push(this.current);
      if (this.past.length > this.limit) this.past.shift();
    }
    this.current = value;
    this.future = [];
    this.lastChangeAt = now;
  }

  // Moves one step back/forward and returns the state to apply, or null.
  undo(): T | null {
    const prev = this.past.pop();
    if (prev === undefined) return null;
    this.future.push(this.current);
    this.current = prev;
    this.lastChangeAt = -Infinity;
    return prev;
  }

  redo(): T | null {
    const next = this.future.pop();
    if (next === undefined) return null;
    this.past.push(this.current);
    this.current = next;
    this.lastChangeAt = -Infinity;
    return next;
  }

  reset(value: T): void {
    this.past = [];
    this.future = [];
    this.current = value;
    this.lastChangeAt = -Infinity;
  }
}
