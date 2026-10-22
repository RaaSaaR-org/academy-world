/** Game-time timers (paused with the game). Owner-scoped so zones are cleaned up. */
interface Timer {
  at: number;
  every: number | null;
  fn: () => void;
  owner: string;
  cancelled: boolean;
}

export class Scheduler {
  private timers: Timer[] = [];
  now = 0;

  after(owner: string, seconds: number, fn: () => void): () => void {
    return this.add({ at: this.now + Math.max(0, seconds), every: null, fn, owner, cancelled: false });
  }

  every(owner: string, seconds: number, fn: () => void): () => void {
    const s = Math.max(0.016, seconds);
    return this.add({ at: this.now + s, every: s, fn, owner, cancelled: false });
  }

  private add(t: Timer): () => void {
    this.timers.push(t);
    return () => {
      t.cancelled = true;
    };
  }

  removeOwner(owner: string): void {
    for (const t of this.timers) if (t.owner === owner) t.cancelled = true;
  }

  tick(now: number): void {
    this.now = now;
    if (!this.timers.length) return;
    const due = this.timers.filter((t) => !t.cancelled && t.at <= now);
    for (const t of due) {
      try {
        t.fn();
      } catch (err) {
        console.error(`[scheduler] timer of "${t.owner}" threw`, err);
      }
      if (t.every != null && !t.cancelled) t.at = Math.max(t.at + t.every, now);
      else t.cancelled = true;
    }
    if (due.length) this.timers = this.timers.filter((t) => !t.cancelled);
  }
}

/** LIFO list of cleanup callbacks; each runs in its own try/catch. */
export class Scope {
  private fns: (() => void)[] = [];
  disposed = false;

  add(fn: () => void): void {
    if (this.disposed) {
      try {
        fn();
      } catch (err) {
        console.error('[scope] late disposer threw', err);
      }
      return;
    }
    this.fns.push(fn);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (let i = this.fns.length - 1; i >= 0; i--) {
      try {
        this.fns[i]();
      } catch (err) {
        console.error('[scope] disposer threw', err);
      }
    }
    this.fns = [];
  }
}
