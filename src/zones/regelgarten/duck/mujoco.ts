/**
 * Main-thread side of the duck station's physics (plan §5.4, §5.9; D30): the support probe, the live
 * engine (the station's own MuJoCo worker) and the switch to the recorded generations
 * (`SIM · AUFZEICHNUNG`, recorded.ts) when there is no module worker, no WebAssembly, or a
 * generation stays slower than 3.5 s after the population was halved.
 *
 *   - `import DuckWorker from './duck.worker.ts?worker'`: Vite bundles the worker only from a literal
 *     ?worker import, as one self-contained ES module (vite.config.ts block „worker (WP5)").
 *   - the wasm URL is a hashed same-origin asset (`?url`; the build emits the stripped wasm,
 *     tools/mujoco/strip.mjs) and goes to the glue's locateFile in the init message.
 */
import DuckWorker from './duck.worker.ts?worker';
import wasmUrl from '@mujoco/mujoco/mujoco.wasm?url';
import type { DuckIn, DuckOut, GenOut, TrackOut } from './protocol';
import type { World } from './core';
import { CEM } from '../tuning';

export interface GenRequest {
  run: string;
  restart?: boolean;
  gen: number;
  deck: Record<string, number>;
  curriculum: boolean;
  worlds: 'one' | 'train';
  seed: number;
  fixed?: number[] | null;
  mu?: number[] | null;
  sd?: number[] | null;
}

export interface HeroFrame {
  pose: Float32Array;
  time: number;
  fell: boolean;
  dist: number;
}

/** What the station drives; LiveEngine (worker) and RecordedEngine (recordings) implement it. */
export interface DuckEngine {
  readonly kind: 'live' | 'recorded';
  /** why the recordings are used (null when live) */
  readonly reason: string | null;
  /** current population (adaptive: 64, or 32 on slow CPUs) */
  readonly pop: number;
  ready(): Promise<void>;
  gen(r: GenRequest): Promise<GenOut>;
  track(params: number[], n: number, seed: number): Promise<TrackOut>;
  cancel(run: string): void;
  hero(on: boolean, params: number[] | null, world?: World, idle?: boolean): void;
  push(f: [number, number, number]): void;
  onHero(fn: ((f: HeroFrame) => void) | null): void;
  pause(on: boolean): void;
  dispose(): void;
  /** the last generations' wall times (ms) for the tools */
  readonly timings: number[];
}

/** Can this browser run the live physics? A tiny module worker compiles an 8-byte wasm (plan §5.4). */
export function supported(): Promise<{ ok: boolean; reason: string | null }> {
  if (typeof Worker === 'undefined') return Promise.resolve({ ok: false, reason: 'worker' });
  if (typeof WebAssembly !== 'object' || typeof WebAssembly.instantiate !== 'function') return Promise.resolve({ ok: false, reason: 'wasm' });
  return new Promise((resolve) => {
    let url = '';
    let w: Worker | null = null;
    const done = (ok: boolean, reason: string | null): void => {
      clearTimeout(timer);
      w?.terminate();
      if (url) URL.revokeObjectURL(url);
      resolve({ ok, reason });
    };
    const timer = setTimeout(() => done(false, 'timeout'), 4000);
    try {
      // `export {}` is a syntax error in a classic worker: browsers without module workers fail here
      const src = 'export {}; WebAssembly.instantiate(new Uint8Array([0,97,115,109,1,0,0,0])).then(() => postMessage(1), () => postMessage(0));';
      url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
      w = new Worker(url, { type: 'module' });
      w.onmessage = (e) => done(e.data === 1, e.data === 1 ? null : 'wasm');
      w.onerror = (e) => {
        e.preventDefault?.();
        done(false, 'module-worker');
      };
    } catch {
      done(false, 'module-worker');
    }
  });
}

/** The station's MuJoCo worker. */
export class LiveEngine implements DuckEngine {
  readonly kind = 'live';
  readonly reason = null;
  pop: number = CEM.population;
  readonly timings: number[] = [];
  private readonly worker: Worker;
  private readonly wait: Promise<void>;
  private nextId = 1;
  private readonly pending = new Map<number, { resolve: (m: never) => void; reject: (e: Error) => void }>();
  private heroFn: ((f: HeroFrame) => void) | null = null;
  /** set when the worker cannot keep up even at the halved population: the station switches to the recordings */
  tooSlow = false;
  onFail: ((reason: string) => void) | null = null;

  constructor(links: string[]) {
    this.worker = new DuckWorker();
    let ok!: () => void;
    let fail!: (e: Error) => void;
    this.wait = new Promise<void>((res, rej) => ((ok = res), (fail = rej)));
    this.worker.onmessage = (e: MessageEvent<DuckOut>) => {
      const m = e.data;
      switch (m.t) {
        case 'ready':
          ok();
          break;
        case 'gen':
        case 'track':
        case 'bench':
          this.pending.get(m.id)?.resolve(m as never);
          this.pending.delete(m.id);
          break;
        case 'pose':
          this.heroFn?.(m);
          break;
        case 'hero-fell':
          break;
        case 'error':
          if (m.where === 'init') fail(new Error(m.message));
          else console.warn(`[duck] worker ${m.where}: ${m.message}`);
          break;
        default:
          break;
      }
    };
    this.worker.onerror = (e) => {
      e.preventDefault?.();
      const err = new Error(`duck worker: ${e.message || 'failed to load'}`);
      fail(err);
      for (const p of this.pending.values()) p.reject(err);
      this.pending.clear();
      this.onFail?.('worker');
    };
    this.post({ t: 'init', wasmUrl: this.wasm, links });
  }

  private post(m: DuckIn): void {
    this.worker.postMessage(m);
  }

  ready(): Promise<void> {
    return this.wait;
  }

  gen(r: GenRequest): Promise<GenOut> {
    const id = this.nextId++;
    const pop = this.pop;
    return new Promise<GenOut>((resolve, reject) => {
      this.pending.set(id, {
        resolve: ((m: GenOut) => {
          // adaptive population (R2 §7.4): halve on a slow CPU; still too slow → the recordings
          const s = m.workMs / 1000;
          this.timings.push(Math.round(m.workMs));
          if (this.timings.length > 40) this.timings.shift();
          if (!r.fixed && s > CEM.adaptSeconds && this.pop > CEM.populationSlow) this.pop = CEM.populationSlow;
          else if (!r.fixed && s > CEM.maxGenSeconds && this.pop <= CEM.populationSlow) {
            this.tooSlow = true;
            this.onFail?.('slow');
          }
          resolve(m);
        }) as never,
        reject,
      });
      this.post({ t: 'gen', id, pop: r.fixed ? CEM.population : pop, ...r });
    });
  }

  track(params: number[], n: number, seed: number): Promise<TrackOut> {
    const id = this.nextId++;
    return new Promise<TrackOut>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as never, reject });
      this.post({ t: 'track', id, params, n, seed });
    });
  }

  /** tools (mujoco-check): µs per physics step, with and without the gait; the home pose for 3 s */
  bench(steps = 20000): Promise<{ usPerStep: number; usPerStepGait: number; homeDrift: number; homeFell: boolean }> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as never, reject });
      this.post({ t: 'bench', id, steps });
    });
  }

  /** tools: emulate a CPU `factor`× slower in the worker */
  slow(factor: number): void {
    this.post({ t: 'slow', factor });
  }

  /** the wasm URL handed to locateFile (tools: same origin) */
  readonly wasm = new URL(wasmUrl, location.href).href;

  cancel(run: string): void {
    this.post({ t: 'cancel', run });
  }
  hero(on: boolean, params: number[] | null, world?: World, idle?: boolean): void {
    this.post({ t: 'hero', on, params, world, idle });
  }
  push(f: [number, number, number]): void {
    this.post({ t: 'push', f });
  }
  onHero(fn: ((f: HeroFrame) => void) | null): void {
    this.heroFn = fn;
  }
  pause(on: boolean): void {
    this.post({ t: 'pause', on });
  }
  dispose(): void {
    for (const p of this.pending.values()) p.reject(new Error('duck worker terminated'));
    this.pending.clear();
    this.heroFn = null;
    this.worker.terminate();
  }
}
