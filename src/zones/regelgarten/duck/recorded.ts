/**
 * The recorded generations of „Lauf, Ente!" (plan §5.4, chip SIM · AUFZEICHNUNG): used when the browser
 * has no module worker or WebAssembly, or when a generation stays slower than 3.5 s after halving
 * the population. Loaded only then. The data are real generations of the same worker code, run in
 * Node by tools/duck/record.mjs (format there): qpos samples, rebuilt here into every link's pose
 * with the duck's kinematic tree, so the field replays them exactly like live ones.
 *
 * Decks map to the recorded run they behave like (Vorwärts without Durchhalten/Aufrecht → the belly
 * flop, no Vorwärts but Durchhalten/Aufrecht → the statue, only costs → the instant faller, else the
 * walking deck); the hand gaits of C1 to the nearest of 12; the hero replays the generation's best
 * duck (no pushing a recording).
 */
import recUrl from './rec/duck-rec.bin?url';
import { POSE_STRIDE, POS_SCALE, QUAT_SCALE, decodeQpos, fkPoses, type KinNode, type World } from './core';
import type { DuckEngine, GenRequest, HeroFrame } from './mujoco';
import type { GenOut, TrackOut, TrackRunOut } from './protocol';
import type { HackId } from '../tuning';
import { HAND, WORKER } from '../tuning';

interface GenMeta {
  gen: number;
  pop: number;
  recDucks: number;
  off: number;
  len: number;
  samples: number;
  dist: number[];
  fallT: number[];
  friction: number[];
  elite: number[];
  stats: GenOut['stats'];
  eliteStats: GenOut['eliteStats'];
  hack: HackId | null;
  mu: number[];
  sd: number[];
}
interface Header {
  version: number;
  rate: number;
  seconds: number;
  trackSeconds: number;
  links: string[];
  tree: KinNode[];
  scale: { pos: number; quat: number; joint: number };
  stride: number;
  runs: Record<string, { deck?: Record<string, number>; hand?: number[]; gens: GenMeta[] }>;
  tracks: Record<'one' | 'rand', { gait: number[]; seed: number; off: number; len: number; samples: number; runs: TrackRunOut[] }>;
}

export class RecordedEngine implements DuckEngine {
  readonly kind = 'recorded';
  readonly reason: string;
  readonly pop = 64;
  readonly timings: number[] = [];
  private readonly H: Header;
  private readonly data: Int16Array;
  private readonly order: Int32Array;
  private heroFn: ((f: HeroFrame) => void) | null = null;
  private heroTimer = 0;
  private heroSrc: { q: Float32Array; samples: number } | null = null;
  private heroT = 0;
  private paused = false;

  private constructor(H: Header, data: Int16Array, links: string[], reason: string) {
    this.H = H;
    this.data = data;
    this.reason = reason;
    // requested link order → index in the recorded tree
    this.order = Int32Array.from(links, (l) => H.links.indexOf(l));
  }

  static async create(links: string[], reason: string): Promise<RecordedEngine> {
    const res = await fetch(recUrl);
    if (!res.ok) throw new Error(`duck recordings: HTTP ${res.status}`);
    const buf = await res.arrayBuffer();
    const dv = new DataView(buf);
    if (String.fromCharCode(dv.getUint8(0), dv.getUint8(1), dv.getUint8(2), dv.getUint8(3)) !== 'DREC') throw new Error('duck recordings: bad file');
    const hl = dv.getUint32(8, true);
    const H = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 12, hl))) as Header;
    const start = 12 + hl + ((8 - ((12 + hl) % 8)) % 8);
    return new RecordedEngine(H, new Int16Array(buf, start, (buf.byteLength - start) >> 1), links, reason);
  }

  ready(): Promise<void> {
    return Promise.resolve();
  }

  /** qpos samples (Float32, ducks × samples × stride) of one entry, undoing the delta coding */
  private qposOf(off: number, ducks: number, samples: number): Float32Array {
    return decodeQpos(this.data, off, ducks, samples, this.H.stride, this.H.scale);
  }

  /** every requested link's pose (Int16, the live format) from qpos samples, by forward kinematics */
  private poses(q: Float32Array, ducks: number, samples: number): Int16Array {
    return fkPoses(this.H.tree, this.order, q, ducks, samples, this.H.stride);
  }

  /** the recorded run a request behaves like */
  private runFor(r: GenRequest): { deck?: Record<string, number>; hand?: number[]; gens: GenMeta[] } {
    const runs = this.H.runs;
    if (r.fixed) {
      let best = '';
      let bd = Infinity;
      for (const [k, v] of Object.entries(runs)) {
        if (!v.hand) continue;
        const d =
          ((v.hand[0] - r.fixed[HAND.freq.param]) / (HAND.freq.max - HAND.freq.min)) ** 2 +
          ((v.hand[1] - r.fixed[HAND.hipAmp.param]) / (HAND.hipAmp.max - HAND.hipAmp.min)) ** 2 +
          ((v.hand[2] - r.fixed[HAND.kneeAmp.param]) / (HAND.kneeAmp.max - HAND.kneeAmp.min)) ** 2;
        if (d < bd) (bd = d), (best = k);
      }
      return runs[best];
    }
    if (r.worlds === 'train') return runs['retrain:fix'];
    const d = r.deck;
    const pos = (d.durchhalten ?? 0) + (d.aufrecht ?? 0) + (d.vorbild ?? 0) + (d.fuesseHeben ?? 0);
    if ((d.vorwaerts ?? 0) > 0 && pos === 0) return runs['c2:start'];
    if ((d.vorwaerts ?? 0) === 0 && pos > 0) return runs['c2:statue'];
    if ((d.vorwaerts ?? 0) === 0) return runs['c2:costsOnly'];
    return runs['c2:fix'];
  }

  gen(r: GenRequest): Promise<GenOut> {
    const run = this.runFor(r);
    const m = run.gens[Math.min(run.gens.length, Math.max(1, r.gen)) - 1];
    const q = this.qposOf(m.off, m.recDucks, m.samples);
    const rec = this.poses(q, m.recDucks, m.samples);
    // the hero replays the generation's best duck
    const best = m.elite.length ? m.elite[0] : 0;
    if (best < m.recDucks) this.heroSrc = { q: q.slice(best * m.samples * this.H.stride, (best + 1) * m.samples * this.H.stride), samples: m.samples };
    const out: GenOut = {
      t: 'gen',
      id: 0,
      run: r.run,
      gen: r.gen,
      pop: m.pop,
      samples: m.samples,
      links: this.order.length,
      dist: Float32Array.from(m.dist),
      fallT: Float32Array.from(m.fallT),
      friction: Float32Array.from(m.friction),
      elite: m.elite,
      stats: m.stats,
      eliteStats: m.eliteStats,
      hack: m.hack,
      mu: m.mu,
      sd: m.sd,
      rec,
      recDucks: m.recDucks,
      ms: 0,
      workMs: 0,
    };
    return new Promise((res) => setTimeout(() => res(out), 30));
  }

  track(params: number[]): Promise<TrackOut> {
    const pick = (['one', 'rand'] as const)
      .map((k) => [k, this.H.tracks[k].gait.reduce((s, v, i) => s + (v - (params[i] ?? 0)) ** 2, 0)] as const)
      .sort((a, b) => a[1] - b[1])[0][0];
    const t = this.H.tracks[pick];
    const qrec = this.qposOf(t.off, t.runs.length, t.samples);
    const rec = this.poses(qrec, t.runs.length, t.samples);
    const out: TrackOut = { t: 'track', id: 0, runs: t.runs, rec, qrec, samples: t.samples, links: this.order.length, ms: 0 };
    return new Promise((res) => setTimeout(() => res(out), 30));
  }

  cancel(): void {}

  hero(on: boolean, params: number[] | null, world?: World, idle?: boolean): void {
    void world;
    clearInterval(this.heroTimer);
    if (!on || idle || !params || !this.heroSrc) return;
    this.heroT = 0;
    const dt = 1 / WORKER.heroHz;
    this.heroTimer = window.setInterval(() => {
      const src = this.heroSrc;
      if (this.paused || !src || !this.heroFn) return;
      this.heroT += dt;
      const dur = (src.samples - 1) / this.H.rate;
      if (this.heroT > dur + 1) this.heroT = 0;
      const s = Math.min(src.samples - 1, Math.round(Math.min(this.heroT, dur) * this.H.rate));
      const Q = this.H.stride;
      const q = src.q.subarray(s * Q, (s + 1) * Q);
      const L = this.order.length;
      const pose = new Float32Array(L * POSE_STRIDE + Q);
      const p16 = this.poses(Float32Array.from(q), 1, 1);
      for (let k = 0; k < L * POSE_STRIDE; k++) pose[k] = p16[k] / (k % POSE_STRIDE < 3 ? POS_SCALE : QUAT_SCALE);
      pose.set(q, L * POSE_STRIDE);
      this.heroFn({ pose, time: this.heroT, fell: false, dist: q[0] });
    }, 1000 * dt);
  }

  push(): void {}

  onHero(fn: ((f: HeroFrame) => void) | null): void {
    this.heroFn = fn;
  }

  pause(on: boolean): void {
    this.paused = on;
  }

  dispose(): void {
    clearInterval(this.heroTimer);
    this.heroFn = null;
  }
}

