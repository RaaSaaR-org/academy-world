/**
 * Prüffeld — pure models (no three.js, no DOM): the Messzelle's success model (GDD §7.6 B),
 * the failure-mode mix, the torque-drift side plot, Wilson intervals, Cohen's κ and the
 * six authored audit clips of station C (Phase 7 plan §4.7, rev 2) with their rule-based classification.
 *
 * All model parameters are ILLUSTRATIV (toy model, GDD §7.6); the draws are SIM · LIVE.
 * Verified by a node check (polish pass, 20 000 seeded runs): tuning target 44 °C / mittel /
 * Halle / 8 h / n = 200 → mean 69.2 % (inside the GDD band 68–76 %; with n = 200 a single run
 * scatters ± 3.3 points, so about a third of runs land at 64–68 %: honest binomial noise, the
 * GDD formula is kept as written). Wilson checks of Appendix B (16/20 → 58.4–91.9 %, 80/100 →
 * 71.1–86.7 %, 146/200 → 66.5–78.7 %), Cohen's κ textbook case, failure shares sum to 1.
 * Station C, six clips (plan §4.7): round-1 mean κ stays below 0,8 for every tagging the player can give
 * (the best is ≈ 0,52, rating exactly like one auditor), a rule-consistent round 2 gives κ = 1 for all 18
 * rules (tools/fixtures: the playtest's solve-c checks both).
 */

// ── success model (Station B) ────────────────────────────────────────────────

/** Vibration level: 0 aus / 1 mittel / 2 stark */
export type Vib = 0 | 1 | 2;
export type Light = 'studio' | 'halle';

export interface RunSettings {
  /** ambient / cell temperature, °C (22…44) */
  tempC: number;
  vib: Vib;
  light: Light;
  /** shift duration in hours (1…8) */
  shiftH: number;
  /** number of trials */
  n: number;
}

export const F_V: readonly number[] = [1, 0.96, 0.9];
export const N_CHOICES = [20, 50, 100, 200] as const;
export const T_MIN = 22;
export const T_MAX = 44;

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Temperature factor f_T = 1 − 0.008 · max(0, T − 25) */
export const fT = (tempC: number): number => 1 - 0.008 * Math.max(0, tempC - 25);
/** Drift factor f_D(t) = 1 − 0.012 · t_h · max(0, (T − 30) / 14) */
export const fD = (tempC: number, tH: number): number => 1 - 0.012 * tH * Math.max(0, (tempC - 30) / 14);
export const fL = (light: Light): number => (light === 'studio' ? 1 : 0.93);

/** p(t) = 0.96 · f_T · f_V · f_L · f_D(t) — probability that one pick succeeds at shift hour tH. */
export function pSuccess(s: Pick<RunSettings, 'tempC' | 'vib' | 'light'>, tH: number): number {
  return clamp01(0.96 * fT(s.tempC) * F_V[s.vib] * fL(s.light) * fD(s.tempC, tH));
}

/** Expected success rate over a whole run (trials evenly spread over the shift). */
export function expectedRate(s: RunSettings): number {
  let sum = 0;
  for (let i = 0; i < s.n; i++) sum += pSuccess(s, trialHour(s, i));
  return sum / s.n;
}

/** Shift hour of trial i (trials evenly spread over the shift). */
export const trialHour = (s: Pick<RunSettings, 'shiftH' | 'n'>, i: number): number => ((i + 0.5) / s.n) * s.shiftH;

/** Torque drift of the wrist drive in % (side plot, ILLUSTRATIV): 12 % over 8 h at 45 °C. */
export const torqueDriftPct = (tempC: number, tH: number): number => 12 * (tH / 8) * Math.max(0, (tempC - 30) / 15);

// ── outcomes ────────────────────────────────────────────────────────────────

/** Station B outcome classes (index order is used for colours and counts). */
export const OUTCOMES = ['erfolg', 'teil', 'rutschen', 'fehlgriff', 'uebertemp', 'drift'] as const;
export type Outcome = (typeof OUTCOMES)[number];

/**
 * Failure-mode shares (of failures) at shift hour tH:
 *  Übertemperatur-Stopp 20 % only at T ≥ 40 °C and t ≥ 4 h; Drift grows 0 → 30 % over an 8 h shift;
 *  the rest splits Rutschen 35 (×1.5 stark) : Fehlgriff 25 (×1.5 Gegenlicht) : Teil-Erfolg 15.
 */
export function failureShares(s: Pick<RunSettings, 'tempC' | 'vib' | 'light'>, tH: number): Record<Exclude<Outcome, 'erfolg'>, number> {
  const u = s.tempC >= 40 && tH >= 4 ? 0.2 : 0;
  const d = 0.3 * Math.min(1, Math.max(0, tH / 8));
  const rest = 1 - u - d;
  const wR = 0.35 * (s.vib === 2 ? 1.5 : 1);
  const wF = 0.25 * (s.light === 'halle' ? 1.5 : 1);
  const wT = 0.15;
  const sw = wR + wF + wT;
  return { uebertemp: u, drift: d, rutschen: (rest * wR) / sw, fehlgriff: (rest * wF) / sw, teil: (rest * wT) / sw };
}

/** Draw one trial outcome. `rand` returns uniform [0, 1). */
export function drawTrial(s: RunSettings, i: number, rand: () => number): Outcome {
  const tH = trialHour(s, i);
  if (rand() < pSuccess(s, tH)) return 'erfolg';
  const sh = failureShares(s, tH);
  let r = rand();
  for (const k of ['rutschen', 'fehlgriff', 'teil', 'drift', 'uebertemp'] as const) {
    r -= sh[k];
    if (r < 0) return k;
  }
  return 'teil';
}

/** Small seeded PRNG (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── statistics ──────────────────────────────────────────────────────────────

/** Wilson score interval (z = 1.96). Returns [p, lo, hi]. Same formula as the engine kit (Appendix B). */
export function wilson(k: number, n: number, z = 1.96): [number, number, number] {
  if (n <= 0) return [0, 0, 1];
  const p = k / n;
  const z2 = z * z;
  const den = 1 + z2 / n;
  const centre = (p + z2 / (2 * n)) / den;
  const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / den;
  return [p, Math.max(0, centre - half), Math.min(1, centre + half)];
}

/** "± x %" for the sign: half the width of the Wilson interval, in percentage points. */
export const plusMinusPct = (k: number, n: number): number => {
  const [, lo, hi] = wilson(k, n);
  return ((hi - lo) / 2) * 100;
};

/**
 * How a measured rate is shown (sign, stamp, card, EMI): "p % ± pm %" only while the Wilson
 * interval is nearly symmetric around p̂ (rounded sides differ by ≤ 2 points, never past 0/100 %),
 * else the interval itself, "lo–hi %". Small or extreme samples are skewed: 20/20 is 84–100 %,
 * not "100 % ± 8 %"; 16/20 is 58–92 %, not "80 % ± 17 %". All values in whole percent.
 */
export function rateDisplay(k: number, n: number): { p: number; pm: number; lo: number; hi: number; symmetric: boolean } {
  const [p, lo, hi] = wilson(k, n);
  const P = Math.round(p * 100),
    LO = Math.round(lo * 100),
    HI = Math.round(hi * 100);
  const pm = Math.max(1, Math.round(plusMinusPct(k, n)));
  const symmetric = n > 0 && Math.abs(P - LO - (HI - P)) <= 2 && P + pm <= 100 && P - pm >= 0;
  return { p: P, pm, lo: LO, hi: HI, symmetric };
}

/** Cohen's κ for two raters over the same items (categories are small integers). */
export function cohenKappa(a: readonly number[], b: readonly number[], categories = 6): number {
  const n = Math.min(a.length, b.length);
  if (!n) return 0;
  let agree = 0;
  const ca = new Array<number>(categories).fill(0);
  const cb = new Array<number>(categories).fill(0);
  for (let i = 0; i < n; i++) {
    if (a[i] === b[i]) agree++;
    ca[a[i]]++;
    cb[b[i]]++;
  }
  const po = agree / n;
  let pe = 0;
  for (let c = 0; c < categories; c++) pe += (ca[c] / n) * (cb[c] / n);
  if (pe >= 1 - 1e-12) return po >= 1 - 1e-12 ? 1 : 0;
  return (po - pe) / (1 - pe);
}

/** Mean pairwise κ for three raters (Appendix B). Returns [mean, κAB, κAC, κBC]. */
export function meanKappa(a: readonly number[], b: readonly number[], c: readonly number[]): [number, number, number, number] {
  const ab = cohenKappa(a, b),
    ac = cohenKappa(a, c),
    bc = cohenKappa(b, c);
  return [(ab + ac + bc) / 3, ab, ac, bc];
}

// ── Station C: the twelve audit clips ──────────────────────────────────────

/** Tag categories (keys 1–6). */
export const TAGS = ['erfolg', 'teil', 'fehlgriff', 'rutschen', 'kollision', 'zeit'] as const;
export type Tag = (typeof TAGS)[number];
export const TAG_INDEX: Record<Tag, number> = { erfolg: 0, teil: 1, fehlgriff: 2, rutschen: 3, kollision: 4, zeit: 5 };

export interface ClipFacts {
  /** the part was gripped at all */
  grasped: boolean;
  /** the part was lost before it lay in the bin (slipped, dropped beside it) */
  lost: boolean;
  collided: boolean;
  /** second grasp attempt after the first one slipped */
  regrasp: boolean;
  /** placement offset from the target (mm), null when it never lay in the bin */
  offsetMm: number | null;
  /** time from start to release (s) */
  timeS: number;
}

/** Authored motion variant the arm replays (see arm motion scripts). */
export type ClipMotion = 'ok' | 'miss' | 'slip' | 'offset' | 'regrasp' | 'slow' | 'dropBeside';

export interface Clip {
  id: number;
  motion: ClipMotion;
  facts: ClipFacts;
  /** one of the four ambiguous clips (framed with orange brackets in round 2) */
  ambiguous: boolean;
  /** NPC auditors' fixed round-1 tags */
  r1B: Tag;
  r1C: Tag;
  /** small authored variation of the placement (mm, in bin x/z) for the replay */
  place: [number, number];
}

const ok = (id: number, offsetMm: number, timeS: number, place: [number, number]): Clip => ({
  id,
  motion: 'ok',
  facts: { grasped: true, lost: false, collided: false, regrasp: false, offsetMm, timeS },
  ambiguous: false,
  r1B: 'erfolg',
  r1C: 'erfolg',
  place,
});

/**
 * Plan §4.7 („Drei Auditoren, kurz“, rev 2): 6 clips — 2 clear successes, 1 clear Fehlgriff and 3 ambiguous
 * ones (placed 15 mm off, regrasped, placed at 9,5 s). The auditors disagree on exactly the three
 * ambiguous clips in round 1. Authored, fixed.
 */
export const CLIPS: readonly Clip[] = [
  ok(1, 2, 6.4, [1.4, -1.4]),
  { id: 2, motion: 'offset', facts: { grasped: true, lost: false, collided: false, regrasp: false, offsetMm: 15, timeS: 6.5 }, ambiguous: true, r1B: 'erfolg', r1C: 'teil', place: [12, -9] },
  { id: 3, motion: 'miss', facts: { grasped: false, lost: false, collided: false, regrasp: false, offsetMm: null, timeS: 5.2 }, ambiguous: false, r1B: 'fehlgriff', r1C: 'fehlgriff', place: [0, 0] },
  { id: 4, motion: 'regrasp', facts: { grasped: true, lost: false, collided: false, regrasp: true, offsetMm: 3, timeS: 7.6 }, ambiguous: true, r1B: 'erfolg', r1C: 'teil', place: [2.1, -2.1] },
  ok(5, 1, 6.3, [-0.7, -0.7]),
  { id: 6, motion: 'slow', facts: { grasped: true, lost: false, collided: false, regrasp: false, offsetMm: 4, timeS: 9.5 }, ambiguous: true, r1B: 'erfolg', r1C: 'zeit', place: [-2.8, 2.8] },
];

/** The success rule of round 2. */
export interface Rule {
  tolMm: 5 | 10 | 20;
  limitS: 8 | 10 | 12;
  regraspAllowed: boolean;
}
export const TOL_CHOICES = [5, 10, 20] as const;
export const LIMIT_CHOICES = [8, 10, 12] as const;

/**
 * Classification by the rule (decision order, shown to the player):
 *  collision → Kollision · not gripped → Fehlgriff · part lost → Rutschen · release after the
 *  time limit → Zeitüberschreitung · regrasp not allowed or offset > tolerance → Teil-Erfolg ·
 *  otherwise Erfolg.
 */
export function classify(f: ClipFacts, r: Rule): Tag {
  if (f.collided) return 'kollision';
  if (!f.grasped) return 'fehlgriff';
  if (f.lost || f.offsetMm == null) return 'rutschen';
  if (f.timeS > r.limitS) return 'zeit';
  if (f.regrasp && !r.regraspAllowed) return 'teil';
  if (f.offsetMm > r.tolMm) return 'teil';
  return 'erfolg';
}

/** κ needed before the Failure-Mode-Report prints. */
export const KAPPA_MIN = 0.8;
