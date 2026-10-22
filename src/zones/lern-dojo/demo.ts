/**
 * Lern-Dojo · demonstrations as LeRobot records them (R1 §3): per control tick (30 Hz) the follower's
 * joints (observation.state), the leader's joints (action), the target cube's place and whether the
 * gripper holds it. A demo also keeps its task (the command word), the cubes on the table at its start
 * and the light it was recorded in, so the colour classes can be fitted on its first frame.
 * No DOM, no engine (the Node check records demos too).
 */
import { CLOCK, COLOURS, LAYOUT, STATION_A, type CubeColour } from './tuning';
import { NJ } from './kin';
import type { BenchSim } from './bench';
import type { Bump } from './vision';

/** values per stored tick: q (6) · action (6) · target x, y, z · held */
export const SV = NJ * 2 + 4;
export const O_Q = 0;
export const O_A = NJ;
export const O_T = NJ * 2;
export const O_HELD = NJ * 2 + 3;

export type DemoKind = 'player' | 'example' | 'expert';

export interface DemoCube {
  colour: CubeColour;
  x: number;
  z: number;
  yaw: number;
}

export interface Demo {
  id: number;
  kind: DemoKind;
  /** the task's colour word („Leg den roten Würfel in die Kiste.“) */
  word: CubeColour;
  /** the cube the demonstrator moved (index = COLOURS order) */
  target: number;
  /** the cubes on the table at the start */
  cubes: DemoCube[];
  /** start field of the target (−1: none) */
  field: number;
  /** the target came to rest in the Kiste */
  ok: boolean;
  /** seconds from the first movement to the end */
  dur: number;
  /** grasps beyond the first (slips or drops make the demonstrator grasp again) */
  regrasps: number;
  /** recorded with the light dimmed (Abendlicht) or the camera bumped */
  light: 'day' | 'dusk';
  bump: Bump;
  n: number;
  s: Float32Array;
}

/** The start field a place lies in (−1: none). */
export function fieldAt(x: number, z: number): number {
  const h = LAYOUT.fieldSize / 2 + 0.01;
  return LAYOUT.fields.findIndex((f) => Math.abs(x - f.x) <= h && Math.abs(z - f.z) <= h);
}

/**
 * Records one demo at the control rate. It starts with the first movement (the approach is part of the
 * skill) and drops idle ticks: a pause would teach the policy to stand still (rc4).
 */
export class Recorder {
  private buf: number[] = [];
  started = false;
  /** seconds since the first movement */
  t = 0;
  private home: number[] = [];
  private last: number[] = [];
  private cubes: DemoCube[] = [];
  private target = 0;
  private word: CubeColour = 'rot';
  private grasps0 = 0;
  private light: Demo['light'] = 'day';
  private bump: Bump = { x: 0, z: 0 };

  reset(sim: BenchSim, target: number, word: CubeColour, o: { light?: Demo['light']; bump?: Bump } = {}): void {
    this.buf.length = 0;
    this.started = false;
    this.t = 0;
    this.home = Array.from(sim.leader);
    this.last = [];
    this.target = target;
    this.word = word;
    this.light = o.light ?? 'day';
    this.bump = o.bump ?? { x: 0, z: 0 };
    this.grasps0 = sim.grasps;
    this.cubes = sim.cubes.map((c, i) => ({ colour: COLOURS[i], x: c.p.x, z: c.p.z, yaw: yawOf(c.q), present: c.present })).filter((c) => c.present).map(({ colour, x, z, yaw }) => ({ colour, x, z, yaw }));
  }

  get samples(): number {
    return this.buf.length / SV;
  }

  /** Call once per control tick, after sim.command(). */
  push(sim: BenchSim): void {
    if (!this.started) {
      let moved = 0;
      for (let i = 0; i < NJ; i++) moved = Math.max(moved, Math.abs(sim.leader[i] - this.home[i]));
      if (moved < 0.004) return;
      this.started = true;
    }
    this.t += 1 / CLOCK.ctrlHz;
    const L = this.last;
    let moved = L.length === 0;
    for (let i = 0; i < NJ && !moved; i++) if (Math.abs(sim.leader[i] - L[O_A + i]) > 0.0015 || Math.abs(sim.q[i] - L[O_Q + i]) > 0.0015) moved = true;
    const c = sim.cubes[this.target];
    if (!moved && Math.abs(c.p.x - L[O_T]) + Math.abs(c.p.y - L[O_T + 1]) + Math.abs(c.p.z - L[O_T + 2]) > 0.002) moved = true;
    if (!moved) return;
    const row = new Array<number>(SV);
    for (let i = 0; i < NJ; i++) {
      row[O_Q + i] = sim.q[i];
      row[O_A + i] = sim.leader[i];
    }
    row[O_T] = c.p.x;
    row[O_T + 1] = c.p.y;
    row[O_T + 2] = c.p.z;
    row[O_HELD] = sim.held === this.target ? 1 : 0;
    this.buf.push(...row);
    this.last = row;
  }

  finish(sim: BenchSim, id: number, kind: DemoKind, ok: boolean): Demo {
    const tc = this.cubes.find((c) => c.colour === COLOURS[this.target]);
    return {
      id,
      kind,
      word: this.word,
      target: this.target,
      cubes: this.cubes.map((c) => ({ ...c })),
      field: tc ? fieldAt(tc.x, tc.z) : -1,
      ok,
      dur: this.t,
      regrasps: Math.max(0, sim.grasps - this.grasps0 - 1),
      light: this.light,
      bump: this.bump,
      n: this.samples,
      s: Float32Array.from(this.buf),
    };
  }
}

/**
 * One take: records from the first movement and ends by itself when the target cube has rested in the
 * Kiste for CLOCK.restS (R1 §10.2: no „Demo ohne Ziel"), when it falls off the bench, or after
 * CLOCK.demoMaxS. Call tick() once per control tick, after sim.command().
 */
export class Take {
  readonly rec = new Recorder();
  status: 'rec' | 'done' | 'failed' = 'rec';
  constructor(
    private readonly sim: BenchSim,
    readonly target: number,
    readonly word: CubeColour,
    o: { light?: Demo['light']; bump?: Bump } = {},
  ) {
    this.rec.reset(sim, target, word, o);
  }

  get started(): boolean {
    return this.rec.started;
  }

  tick(): void {
    if (this.status !== 'rec') return;
    this.rec.push(this.sim);
    if (this.sim.restedInBox(this.target) >= CLOCK.restS) this.status = 'done';
    else if (this.sim.fallen(this.target) || this.rec.t >= CLOCK.demoMaxS) this.status = 'failed';
  }

  /** the demo (ok = the cube is in the Kiste) */
  finish(id: number, kind: DemoKind): Demo {
    return this.rec.finish(this.sim, id, kind, this.status === 'done');
  }
}

/** yaw (rad) of a quaternion about +y */
export function yawOf(q: { x: number; y: number; z: number; w: number }): number {
  return Math.atan2(2 * (q.w * q.y + q.x * q.z), 1 - 2 * (q.y * q.y + q.x * q.x));
}

/** The measured value of A: „5 Demos · 4/5 Felder · Ø 8,7 s“ (numbers only; the text is the zone's). */
export function aSummary(demos: readonly Demo[]): { kept: number; fields: number; mean: number; regrasps: number } {
  const ok = demos.filter((d) => d.ok && d.kind === 'player');
  const fields = new Set(ok.map((d) => d.field).filter((f) => f >= 0)).size;
  const mean = ok.length ? ok.reduce((a, d) => a + d.dur, 0) / ok.length : 0;
  return { kept: ok.length, fields, mean, regrasps: ok.reduce((a, d) => a + d.regrasps, 0) };
}

/** Station A's stars from its summary (plan §4.5: 3 kept · ≥ 3 fields · 5 fields, Ø ≤ 9 s, no regrasp). */
export function aStars(s: ReturnType<typeof aSummary>): 0 | 1 | 2 | 3 {
  if (s.kept < STATION_A.keep) return 0;
  if (s.fields < STATION_A.fields) return 1;
  if (s.fields >= LAYOUT.fields.length && s.mean <= STATION_A.meanS && s.regrasps === 0) return 3;
  return 2;
}

/** Compact storage for ctx.progress (≤ 16 KB per area, plan §5.9): only the summary, never the samples. */
export function demoMeta(d: Demo): { k: DemoKind; w: CubeColour; f: number; ok: boolean; t: number; r: number } {
  return { k: d.kind, w: d.word, f: d.field, ok: d.ok, t: Math.round(d.dur * 10) / 10, r: d.regrasps };
}
