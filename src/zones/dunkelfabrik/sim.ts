/**
 * Dunkelfabrik — pure models (no three.js, no DOM): Schichtplan roster, Amortisationswaage
 * and the night-shift simulation of Station C. Everything here is deterministic and is
 * checked in Node (see the numbers asserted in the comments).
 *
 * All rates and ages are toy-model values (chips: ILLUSTRATIV / RICHTWERT as noted).
 */

// ════════════════════════════════════════════════════════════════════════════
//  Station A — Schicht (GDD §7.5 A)
// ════════════════════════════════════════════════════════════════════════════

export const CRATE_KG = 18;
export const G = 9.81;
/** Station 7 Takt: one crate every 20 s → 1,440 lifts per 8-h shift ≈ 25.9 t (ILLUSTRATIV) */
export const TAKT_S = 20;
export const SHIFT_H = 8;
export const SHIFT_LIFTS = (SHIFT_H * 3600) / TAKT_S; // 1440
export const SHIFT_TONNES = (SHIFT_LIFTS * CRATE_KG) / 1000; // 25.92

// ════════════════════════════════════════════════════════════════════════════
//  Station B1 — Schichtplan-Wand (roster, ILLUSTRATIV)
// ════════════════════════════════════════════════════════════════════════════

export const POSTS = ['palettieren', 'umsetzen', 'sichtpruefung', 'beladung', 'umreifen', 'anlagenfuehrung'] as const;
export type PostId = (typeof POSTS)[number];
export const SHIFTS = ['frueh', 'spaet', 'nacht'] as const;
export type ShiftId = (typeof SHIFTS)[number];

/** burden per post (heavy, hot) and per shift (night) — hires go to the lowest total burden */
export const POST_BURDEN: Record<PostId, number> = { palettieren: 5, umsetzen: 4, sichtpruefung: 1, beladung: 3, umreifen: 2, anlagenfuehrung: 0 };
export const SHIFT_BURDEN: Record<ShiftId, number> = { frueh: 0, spaet: 1, nacht: 2.5 };
/** posts a robot can take as "heavy work" (for the supervision token) */
export const HEAVY_POSTS: PostId[] = ['palettieren', 'umsetzen', 'beladung'];

export const YEAR_MIN = 2026;
export const YEAR_MAX = 2035;
export const RETIRE_AGE = 65;
export const HIRE_YEARS = [2027, 2029, 2031, 2033, 2035];
export const HIRE_AGE = 24;
/** slot index of "Dein Posten" (Palettieren am Ofen · Spät) */
export const OWN_SLOT = slotIndex('palettieren', 'spaet');

/** ages in 2026 per slot (row-major: post × shift), null = vacant (ILLUSTRATIV, anonymised) */
export const AGES_2026: (number | null)[] = [
  // Früh, Spät, Nacht
  52, 64, null, // Palettieren am Ofen  (Spät = Dein Posten → leer ab 2027; Nacht seit 2025 unbesetzt)
  47, 61, 63, //   Kisten umsetzen
  64, 39, 58, //   Sichtprüfung Etikett
  44, 62, 60, //   Maschinenbeladung
  57, 33, 62, //   Umreifen
  49, 41, 59, //   Anlagenführung
];

export function slotIndex(post: PostId, shift: ShiftId): number {
  return POSTS.indexOf(post) * 3 + SHIFTS.indexOf(shift);
}
export function slotPost(i: number): PostId {
  return POSTS[Math.floor(i / 3)];
}
export function slotShift(i: number): ShiftId {
  return SHIFTS[i % 3];
}
export function slotBurden(i: number): number {
  return POST_BURDEN[slotPost(i)] + SHIFT_BURDEN[slotShift(i)];
}

export type RobotType = 'kognitiv' | 'cobot' | 'fest';
export interface RobotPlacement {
  slot: number;
  type: RobotType;
  /** first year the robot covers the slot */
  year: number;
}

export type SlotState =
  | { kind: 'person'; age: number; hired: boolean }
  /** retired in exactly this year (flip panel shows RUHESTAND) */
  | { kind: 'retired' }
  | { kind: 'empty' }
  | { kind: 'robot'; type: RobotType };

/**
 * Roster state in `year`: everybody ages, retires at 65; one hire every 2 years goes to the
 * lowest-burden empty slot (robot-covered slots count as filled). So heavy, hot and night
 * posts empty first.
 */
export function rosterAt(year: number, robots: readonly RobotPlacement[] = []): SlotState[] {
  type P = { age: number; hired: boolean } | null;
  const people: P[] = AGES_2026.map((a) => (a == null ? null : { age: a, hired: false }));
  const robotAt = (slot: number, y: number): RobotPlacement | undefined => robots.find((r) => r.slot === slot && r.year <= y);
  let retiredNow = new Set<number>();
  for (let y = YEAR_MIN; y <= year; y++) {
    retiredNow = new Set<number>();
    if (y > YEAR_MIN) {
      for (let i = 0; i < people.length; i++) {
        const p = people[i];
        if (!p) continue;
        p.age++;
        if (p.age >= RETIRE_AGE) {
          people[i] = null;
          retiredNow.add(i);
        }
      }
    }
    if (HIRE_YEARS.includes(y)) {
      let best = -1;
      for (let i = 0; i < people.length; i++) {
        if (people[i] || robotAt(i, y)) continue;
        if (best < 0 || slotBurden(i) < slotBurden(best)) best = i;
      }
      if (best >= 0) {
        people[best] = { age: HIRE_AGE, hired: true };
        retiredNow.delete(best);
      }
    }
  }
  return people.map((p, i) => {
    const r = robotAt(i, year);
    if (p) return { kind: 'person', age: p.age, hired: p.hired };
    if (r) return { kind: 'robot', type: r.type };
    if (retiredNow.has(i)) return { kind: 'retired' };
    return { kind: 'empty' };
  });
}

/** posts without a person (robot-covered slots are not counted as empty) */
export function emptyCount(state: SlotState[]): number {
  return state.filter((s) => s.kind === 'empty' || s.kind === 'retired').length;
}
/** posts without a person, whether or not a robot covers them */
export function noPersonCount(state: SlotState[]): number {
  return state.filter((s) => s.kind !== 'person').length;
}

/** EmAI assessment 2026 (RICHTWERT): does robot type T fit post P? */
export type Fit = 'passt' | 'pilot' | 'nein';
export const FIT: Record<PostId, Record<RobotType, Fit>> = {
  palettieren: { kognitiv: 'pilot', cobot: 'passt', fest: 'passt' },
  umsetzen: { kognitiv: 'pilot', cobot: 'nein', fest: 'nein' },
  sichtpruefung: { kognitiv: 'nein', cobot: 'nein', fest: 'passt' },
  beladung: { kognitiv: 'pilot', cobot: 'passt', fest: 'pilot' },
  umreifen: { kognitiv: 'nein', cobot: 'nein', fest: 'pilot' },
  anlagenfuehrung: { kognitiv: 'nein', cobot: 'nein', fest: 'nein' },
};

// ════════════════════════════════════════════════════════════════════════════
//  Station B2 — Amortisationswaage (RICHTWERT / ILLUSTRATIV, 1 k€ = 1 kg)
// ════════════════════════════════════════════════════════════════════════════

export const CAPEX = [
  { id: 'cobot', k: 85, range: '50–120', chip: 'richtwert' as const },
  { id: 'greifer', k: 10, range: '5–15', chip: 'richtwert' as const },
  { id: 'integration', k: 40, range: null, chip: 'illustrativ' as const },
  { id: 'rechner', k: 1, range: '0,6–1,5', chip: 'richtwert' as const },
];
export const CAPEX_TOTAL = CAPEX.reduce((s, c) => s + c.k, 0); // 136 k€
/** full cost of one post per year and shift (RICHTWERT 80–95 k€) */
export const FTE_K = 85;
export const OPEX_WEAR = 4;
export const OPEX_MAINT_RATE = 0.08;
export const OPEX_SUPERVISION_FTE = 0.2;
export const OPEX_MAINT = OPEX_MAINT_RATE * CAPEX_TOTAL; // 10.88
export const OPEX_SUPERVISION = OPEX_SUPERVISION_FTE * FTE_K; // 17
export const OPEX_TOTAL = OPEX_WEAR + OPEX_MAINT + OPEX_SUPERVISION; // 31.88 k€
export const DEFAULT_COVERAGE = 0.8;
/** the Waage beam rests on its stops at ±12° */
export const BEAM_STOP_DEG = 12;
/** arm length (m) from the pivot to each pan hanger */
export const BEAM_ARM_M = 3;

/** net value per year (k€) = Schichten × 85 k€ × Abdeckung − OPEX */
export function annualNet(shifts: number, coverage: number): number {
  return shifts * FTE_K * coverage - OPEX_TOTAL;
}
/** payback in years (Infinity if the net value is ≤ 0) */
export function paybackYears(shifts: number, coverage: number): number {
  const a = annualNet(shifts, coverage);
  return a > 0 ? CAPEX_TOTAL / a : Infinity;
}

// ════════════════════════════════════════════════════════════════════════════
//  Station C — Licht aus (EmAI-Autonomieskala, RICHTWERT; rates ILLUSTRATIV)
// ════════════════════════════════════════════════════════════════════════════

export const GESTURES = ['anfahren', 'greifen', 'etikett', 'palettieren', 'umreifen', 'stoerung'] as const;
export type GestureId = (typeof GESTURES)[number];
/** hidden true capability per gesture (RICHTWERT, EmAI assessment 2026) */
export const TRUE_LEVEL: Record<GestureId, number> = { anfahren: 4, greifen: 3, etikett: 3, palettieren: 4, umreifen: 1, stoerung: 2 };
/** probability per cycle that a gesture needs a human, by level L0…L4 (ILLUSTRATIV toy model) */
export const P_NEED = [1.0, 0.5, 0.1, 0.01, 0.002];
/** supervision share per level (RICHTWERT, EmAI-Autonomieskala based on SAE J3016) */
export const SUPERVISION = ['100 %', '~100 %', '~50 %', '~20 %', '~5 %', '0 %'];

export const NIGHT_CYCLES = SHIFT_LIFTS; // 1440 cycles of 20 s, 22:00 → 06:00
export const CYCLES_PER_HOUR = 3600 / TAKT_S; // 180
export const MRC_DOWNTIME_MIN = 30;
export const MRC_DOWNTIME_CYCLES = (MRC_DOWNTIME_MIN * 60) / TAKT_S; // 90
export const MAX_INTERACTIVE_RTI = 5;
export const NIGHT_START_MIN = 22 * 60;
export const DEFAULT_SEED = 0x5747; // "Station 7"

/** clock text of cycle i, e.g. "23:14" */
export function clockOf(cycle: number): string {
  const m = Math.floor(NIGHT_START_MIN + (cycle * TAKT_S) / 60) % (24 * 60);
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/** Same deterministic PRNG as the engine's mulberry32 (kept local: sim.ts has no imports). */
export function rng32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type NightEvent =
  | { kind: 'rti'; cycle: number; gesture: number }
  | { kind: 'mrc'; cycle: number; gesture: number; overrated: boolean }
  | { kind: 'hour'; hour: number };

export interface NightResult {
  levels: number[];
  seed: number;
  cycles: number;
  autonomous: number;
  share: number;
  interventions: number;
  interventionsPerHour: number;
  /** per gesture */
  interventionsBy: number[];
  mrcs: number;
  mrcMinutes: number;
  /** per hour: autonomous cycles k of n */
  hourly: { k: number; n: number }[];
  /** share if gesture g never needed a human (same draws) */
  without: number[];
  /** index of the gesture whose removal helps most (−1: none) */
  limiting: number;
  /** first MRC per gesture (cycle) for overrated gestures, −1 if none */
  firstOverratedMrc: { gesture: number; cycle: number } | null;
  overrated: number[];
  rtiTaken: number;
  rtiMissed: number;
}

/**
 * Night shift, deterministic for (levels, seed, interactive RtI answers).
 * One uniform draw per planned cycle and gesture (1440 × 6), consumed in a fixed order, so
 * downtime or a missed RtI never shifts the random stream.
 *
 * Per cycle, gesture g with chosen level L and true capability C:
 *   event if draw < P_NEED[min(L, C)]
 *   L > C (overrated)  → nobody is assigned → MRC: safe stop, 30 game-minutes downtime
 *   L = 3              → RtI to the on-call person (≤ 5 interactive ones; missed → MRC)
 *   otherwise          → a person intervenes (counted)
 * autonomer Anteil = cycles in which no gesture needed a human / all 1,440 planned cycles.
 */
export class NightSim {
  readonly draws: Float32Array;
  readonly interactive = new Set<number>(); // key = cycle * 8 + gesture
  cycle = 0;
  private downUntil = 0;
  private lost = 0;
  private r: NightResult;
  /** answers for interactive RtIs (key → taken) */
  readonly answers = new Map<number, boolean>();
  /** set while waiting for the player */
  pending: { cycle: number; gesture: number } | null = null;
  done = false;

  readonly levels: readonly number[];
  readonly seed: number;
  private opts: { forceAuto?: number; answers?: Map<number, boolean>; draws?: Float32Array };

  /** `opts`: gesture forced autonomous (for "ohne X"), fixed RtI answers, shared draws */
  constructor(levels: readonly number[], seed = DEFAULT_SEED, opts: { forceAuto?: number; answers?: Map<number, boolean>; draws?: Float32Array } = {}) {
    this.levels = levels;
    this.seed = seed;
    this.opts = opts;
    if (opts.draws) this.draws = opts.draws;
    else {
      const rnd = rng32(seed);
      this.draws = new Float32Array(NIGHT_CYCLES * GESTURES.length);
      for (let i = 0; i < this.draws.length; i++) this.draws[i] = rnd();
    }
    // interactive RtIs: up to 5 L3 events, evenly sampled over the night
    if (opts.forceAuto == null && !opts.answers) {
      const l3: number[] = [];
      for (let c = 0; c < NIGHT_CYCLES; c++)
        for (let g = 0; g < GESTURES.length; g++) {
          const L = levels[g];
          if (L !== 3 || TRUE_LEVEL[GESTURES[g]] < 3) continue;
          if (this.draws[c * GESTURES.length + g] < P_NEED[3]) l3.push(c * 8 + g);
        }
      const n = Math.min(MAX_INTERACTIVE_RTI, l3.length);
      for (let k = 0; k < n; k++) this.interactive.add(l3[Math.floor(((k + 0.5) * l3.length) / n)]);
    }
    if (opts.answers) for (const [k, v] of opts.answers) this.answers.set(k, v);
    this.r = {
      levels: [...levels],
      seed,
      cycles: NIGHT_CYCLES,
      autonomous: 0,
      share: 0,
      interventions: 0,
      interventionsPerHour: 0,
      interventionsBy: GESTURES.map(() => 0),
      mrcs: 0,
      mrcMinutes: 0,
      hourly: Array.from({ length: SHIFT_H }, () => ({ k: 0, n: 0 })),
      without: [],
      limiting: -1,
      firstOverratedMrc: null,
      overrated: GESTURES.map((g, i) => (levels[i] > TRUE_LEVEL[g] ? i : -1)).filter((i) => i >= 0),
      rtiTaken: 0,
      rtiMissed: 0,
    };
  }

  get result(): NightResult {
    return this.r;
  }

  /** downtime so far (game minutes): cycles lost to safe stops, the same count the result uses */
  get lostMinutes(): number {
    return (this.lost * TAKT_S) / 60;
  }

  /** the line stands still (safe stop, MRC downtime) at the current cycle */
  get stopped(): boolean {
    return this.cycle < this.downUntil;
  }

  /** answer the pending interactive RtI */
  answer(taken: boolean): void {
    if (!this.pending) return;
    this.answers.set(this.pending.cycle * 8 + this.pending.gesture, taken);
    this.pending = null;
  }

  /**
   * Advance up to `maxCycles` cycles. Stops early at an interactive RtI that has no answer yet
   * (then `pending` is set). Emits events through `on`.
   */
  advance(maxCycles: number, on?: (e: NightEvent) => void): void {
    const n = GESTURES.length;
    let budget = maxCycles;
    while (budget > 0 && !this.done) {
      if (this.pending) return;
      const c = this.cycle;
      const hour = Math.floor(c / CYCLES_PER_HOUR);
      const hb = this.r.hourly[hour];
      if (c < this.downUntil) {
        // line stands still (MRC): no production, not autonomous
        hb.n++;
        this.lost++;
      } else {
        // pre-check for an interactive RtI that still needs the player's answer
        for (let g = 0; g < n; g++) {
          const key = c * 8 + g;
          if (!this.interactive.has(key) || this.answers.has(key)) continue;
          const L = this.levels[g];
          const C = TRUE_LEVEL[GESTURES[g]];
          if (this.draws[c * n + g] < P_NEED[Math.min(L, C)]) {
            this.pending = { cycle: c, gesture: g };
            on?.({ kind: 'rti', cycle: c, gesture: g });
            return;
          }
        }
        let mask = 0;
        let stop = false;
        for (let g = 0; g < n; g++) {
          if (this.opts.forceAuto === g) continue;
          const L = this.levels[g];
          const C = TRUE_LEVEL[GESTURES[g]];
          if (this.draws[c * n + g] >= P_NEED[Math.min(L, C)]) continue;
          mask |= 1 << g;
          const key = c * 8 + g;
          if (L > C) {
            stop = true;
            this.r.mrcs++;
            if (!this.r.firstOverratedMrc) this.r.firstOverratedMrc = { gesture: g, cycle: c };
            on?.({ kind: 'mrc', cycle: c, gesture: g, overrated: true });
          } else if (L === 3 && this.answers.get(key) === false) {
            stop = true;
            this.r.mrcs++;
            this.r.rtiMissed++;
            on?.({ kind: 'mrc', cycle: c, gesture: g, overrated: false });
          } else {
            if (L === 3 && this.answers.get(key) === true) this.r.rtiTaken++;
            this.r.interventions++;
            this.r.interventionsBy[g]++;
          }
        }
        hb.n++;
        if (!mask) {
          hb.k++;
          this.r.autonomous++;
        }
        if (stop) this.downUntil = Math.max(this.downUntil, c + 1 + MRC_DOWNTIME_CYCLES);
      }
      this.cycle++;
      budget--;
      if (this.cycle % CYCLES_PER_HOUR === 0) on?.({ kind: 'hour', hour: this.cycle / CYCLES_PER_HOUR });
      if (this.cycle >= NIGHT_CYCLES) this.finish();
    }
  }

  private finish(): void {
    this.done = true;
    const r = this.r;
    r.share = r.autonomous / NIGHT_CYCLES;
    r.interventionsPerHour = r.interventions / SHIFT_H;
    // downtime inside the night (an MRC late in the night is cut at 06:00)
    r.mrcMinutes = (this.lost * TAKT_S) / 60;
    if (this.opts.forceAuto == null) {
      r.without = GESTURES.map((_, g) => {
        const s = new NightSim(this.levels, this.seed, { forceAuto: g, answers: this.answers, draws: this.draws });
        s.advanceAll();
        return s.result.share;
      });
      let best = -1;
      let bestGain = 0.02; // a gesture "limits" if removing it adds ≥ 2 percentage points
      r.without.forEach((w, g) => {
        if (w - r.share > bestGain) {
          bestGain = w - r.share;
          best = g;
        }
      });
      r.limiting = best;
    }
  }

  /** run to the end, treating interactive RtIs without an answer as taken (tests, "ohne X") */
  advanceAll(): void {
    while (!this.done) {
      this.advance(NIGHT_CYCLES);
      if (this.pending) this.answer(true);
    }
  }

}

/** expected autonomous share (analytic, no downtime): Π (1 − p_g) — for hints and checks */
export function expectedShare(levels: readonly number[]): number {
  return GESTURES.reduce((s, g, i) => s * (1 - P_NEED[Math.min(levels[i], TRUE_LEVEL[g])]), 1);
}

/** station level = the lowest chosen gesture level, and which gesture sets it */
export function stationLevel(levels: readonly number[]): { level: number; gesture: number } {
  let gi = 0;
  levels.forEach((l, i) => {
    if (l < levels[gi]) gi = i;
  });
  return { level: levels[gi], gesture: gi };
}
