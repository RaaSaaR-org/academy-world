/**
 * Shared state of the Prüffeld zone: flags of the station flow, EMI-07 helper, the sign
 * text, the two virtual lights and the per-frame hooks every station module registers.
 */
import * as THREE from 'three';
import type { EmiHandle, ZoneContext } from '@/core/zones';
import type { Sfx } from './audio';
import type { FlapSign } from './flapSign';
import { rateDisplay, T_MAX, type Outcome, type RunSettings } from './model';

export interface RunResult {
  settings: RunSettings;
  outcomes: Outcome[];
  k: number;
  n: number;
  /** Wilson 95 % [p, lo, hi] */
  ci: [number, number, number];
  /** ± in percentage points (half width) */
  pm: number;
}

export interface LightRig {
  set(mode: 'stage' | 'hall', studio: boolean): void;
}

export class Shared {
  readonly ctx: ZoneContext;
  sfx!: Sfx;
  emi: EmiHandle | null = null;
  sign: FlapSign | null = null;
  lights: LightRig | null = null;
  /** scripted camera move (installed by cine.ts) */
  cine: (shots: { t: number; pos: [number, number, number]; look: [number, number, number] }[], o?: { fromPose?: boolean; events?: { t: number; fn: () => void }[]; onDone?: () => void }) => void = (_s, o) => {
    for (const e of o?.events ?? []) e.fn();
    o?.onDone?.();
  };
  /** the Rolltor reveal (index.ts) */
  reveal: ((from: 'switch' | 'terminal' | 'instant') => void) | null = null;
  /** exit of the operate mode this zone opened last */
  exitOp: (() => void) | null = null;

  shutterOpen = false;
  docked = false;
  /** C round: 1 = first rating, 2 = rule round, 3 = report printed */
  auditRound = 1;
  lastRun: RunResult | null = null;
  /** best qualifying run (n = 200, T ≥ 40 °C) */
  qualifyingRun: RunResult | null = null;
  cardsPlayed: number[] = [];
  running = false;
  /** a scripted beat (reveal, flip) is playing: no auto-opened cards */
  inBeat = false;
  /** the line arm is busy with a replay (station C) */
  replaying = false;
  /** player is in this zone's operate mode */
  operating: string | null = null;

  private updaters: ((dt: number, t: number) => void)[] = [];
  private fixed: ((dt: number) => void)[] = [];
  readonly targets: Record<'terminal' | 'shutter' | 'handle' | 'console' | 'table', [number, number, number]> = {
    terminal: [-7, 0, 1.3],
    shutter: [0.3, 0, 2.3],
    handle: [10, 0, 9.4],
    console: [8.3, 0, -0.9],
    table: [6, 0, 6],
  };

  constructor(ctx: ZoneContext) {
    this.ctx = ctx;
  }

  onUpdate(fn: (dt: number, t: number) => void): void {
    this.updaters.push(fn);
  }
  onFixed(fn: (dt: number) => void): void {
    this.fixed.push(fn);
  }
  update(dt: number, t: number): void {
    for (const f of this.updaters) f(dt, t);
  }
  private farHooks: (() => void)[] = [];
  /** called while the zone is inactive (≤ 0.1 ms): only cheap visibility toggles */
  onFar(fn: () => void): void {
    this.farHooks.push(fn);
  }
  updateFar(): void {
    for (const f of this.farHooks) f();
  }
  fixedUpdate(dt: number): void {
    for (const f of this.fixed) f(dt);
  }

  /** EMI-07 line by string key (queued). */
  say(key: string, params?: Record<string, string | number>, gesture?: 'point' | 'nod' | 'shrug' | 'wave'): void {
    const e = this.emi;
    if (!e) return;
    void e.say(this.ctx.i18n.text(key, params));
    if (gesture) void e.gesture(gesture);
  }

  /** EMI-07 reacts right now (replaces the current subtitle; for rapid feedback like played cards). */
  react(key: string, params?: Record<string, string | number>, gesture?: 'point' | 'nod' | 'shrug' | 'wave'): void {
    const e = this.emi;
    if (!e) return;
    // replaces the line on screen and plays EMI-07's own chirp (engine voice bus, ducking)
    void e.say(this.ctx.i18n.text(key, params), { interrupt: true });
    if (gesture) void e.gesture(gesture);
  }

  /** A run's rate as shown everywhere: "69 % ± 6 %" or, for a skewed interval, "84–100 %" (model.rateDisplay). */
  rateText(run: Pick<RunResult, 'k' | 'n'>): string {
    const d = rateDisplay(run.k, run.n);
    return d.symmetric ? this.ctx.t('sign.value', { p: d.p, pm: d.pm }) : this.ctx.t('sign.range', { lo: d.lo, hi: d.hi });
  }

  /** Refresh the sign text (language changes, cards, measurements). */
  updateSign(instant = false): void {
    const s = this.sign;
    if (!s) return;
    const t = this.ctx.t.bind(this.ctx);
    const run = this.lastRun;
    if (run) {
      s.setRow(0, this.rateText(run), 0xf5f5f4, instant);
      // the worst case gets named on the sign (FUN-PLAN P2 ★★★)
      s.setRow(1, isWorstCase(run.settings, run.n) ? t('game.b.worst') : t('sign.detail', { n: run.n, t: run.settings.tempC }), TEAL_TEXT, instant);
      return;
    }
    const k = this.cardsPlayed.length;
    if (k >= 9) {
      // all nine questions asked: the claim is gone, only the caveats are left (FUN-PLAN P1 ★★★)
      s.setRow(0, t('sign.nine'), WARM_TEXT, instant);
      s.setRow(1, t('sign.nineCaveats'), WARM_TEXT, instant);
      return;
    }
    s.setRow(0, k ? t('sign.claimStar') : t('sign.claim'), 0xf5f5f4, instant);
    s.setRow(1, k === 0 ? t('sign.vendor') : k === 1 ? t('sign.caveats1') : t('sign.caveatsN', { n: k }), k ? WARM_TEXT : 0xd6d3d1, instant);
  }

  /**
   * Objective for the current step of the flow (only while the player is inside). The mode's route
   * (manifest `route`, D40): Entdecker A → B ◆, C is a side station (named, never the target);
   * Entscheider B ◆ only (A and C are off the route and stay playable).
   */
  refreshObjective(): void {
    const { ctx } = this;
    if (!ctx.playerInside) return;
    const hasA = ctx.pass.has('vorfuehrung'),
      hasB = ctx.pass.has('unter-last'),
      hasC = ctx.pass.has('drei-auditoren');
    const withA = ctx.mode === 'entdecker';
    let key: string | null = null;
    let target: [number, number, number] | undefined;
    if (withA && !hasA && !this.shutterOpen) [key, target] = ['obj.cards', this.targets.terminal];
    else if (!this.shutterOpen) [key, target] = ['obj.shutter', this.targets.shutter];
    else if (!this.docked) [key, target] = ['obj.push', this.targets.handle];
    else if (!hasB) [key, target] = ['obj.measure', this.targets.console];
    else if (withA && !hasA) [key, target] = ['obj.cards', this.targets.terminal];
    // the side station: named with its grey „optional“, the objective does not lead there
    else if (!hasC && this.auditRound >= 2 && this.operating === 'audit') [key, target] = ['obj.rule', this.targets.table];
    else key = hasC ? 'obj.done' : withA ? 'obj.doneSide' : 'obj.doneRoute';
    ctx.hud.setObjective(ctx.i18n.text(key), target ? { target } : undefined);
  }
}

/** the harshest conditions of the cell, all four at once, at n = 200 */
export function isWorstCase(st: RunSettings, n: number): boolean {
  return n === 200 && st.tempC >= T_MAX && st.vib === 2 && st.light === 'halle' && st.shiftH >= 8;
}

export const TEAL_TEXT = new THREE.Color(0x2dd4bf);
export const WARM_TEXT = new THREE.Color(0xff8534).multiplyScalar(0.92);
