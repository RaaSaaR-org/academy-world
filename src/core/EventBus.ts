/**
 * Tiny synchronous event bus. Listener errors are caught and logged so one
 * broken listener (e.g. in a half-written zone) can never break the emitter.
 *
 * Core events (payload shape in brackets):
 *   'zone:enter' / 'zone:exit'   { id }
 *   'zone:ready' / 'zone:error'  { id, error? }
 *   'stamp:awarded'              { id, title }
 *   'interact'                   { id, label }
 *   'grab:start' / 'grab:end'    { id, mass }
 *   'throw'                      { id, mass, impulse, speed }
 *   'mode:changed'               { mode }
 *   'lang:changed'               { lang }
 *   'settings:changed'           { settings }
 *   'game:start' / 'game:pause' / 'game:resume'
 *   'player:respawn'             { reason }
 *   'quality:changed'            { level, auto }
 *   'dialogue:idle'              (EMI's queue ran empty, the last line has finished)
 * Zones should prefix custom events with their id: 'robot-lab:door-open'.
 */
export type Listener = (payload: any) => void;

export interface LoggedEvent {
  t: number;
  type: string;
  payload?: unknown;
}

export class EventBus {
  private listeners = new Map<string, Set<Listener>>();
  /** Ring buffer of recent events — exposed via window.__academy.events() for tests. */
  readonly log: LoggedEvent[] = [];

  on(type: string, fn: Listener): () => void {
    let set = this.listeners.get(type);
    if (!set) {
      set = new Set();
      this.listeners.set(type, set);
    }
    set.add(fn);
    return () => this.off(type, fn);
  }

  once(type: string, fn: Listener): () => void {
    const off = this.on(type, (p) => {
      off();
      fn(p);
    });
    return off;
  }

  off(type: string, fn: Listener): void {
    this.listeners.get(type)?.delete(fn);
  }

  emit(type: string, payload?: unknown): void {
    this.log.push({ t: performance.now(), type, payload: summarize(payload) });
    if (this.log.length > 200) this.log.splice(0, this.log.length - 200);
    const set = this.listeners.get(type);
    if (!set) return;
    for (const fn of [...set]) {
      try {
        fn(payload);
      } catch (err) {
        console.error(`[events] listener for "${type}" threw`, err);
      }
    }
  }
}

function summarize(p: unknown): unknown {
  if (p == null || typeof p !== 'object') return p;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(p as Record<string, unknown>)) {
    if (v == null || typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') out[k] = v;
  }
  return out;
}
