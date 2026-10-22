/**
 * The Kreislaufhof's sorting model (plan §4.11 scene 1; R8 §3.1): 100 pieces of mixed packaging on the belt,
 * a camera that gives each one a score („how sure is it aluminium?“), and a delta picker that grabs every
 * piece at or above your threshold into the aluminium bin. Pure functions, no three.js: tools can run them.
 *
 * The stream (SIM, a toy model; numbers ILLUSTRATIV): 40 aluminium cans, 10 of them crushed or dirty
 * (lower scores), 10 tinplate cans that look like aluminium (high scores for a non-target), 50 other pieces
 * (PET, cartons, cups, film). With the tuned spreads the two curves cross near 0,58 and a band of
 * thresholds gives purity ≥ 90 % with recovery ≥ 70 % in almost every run (R8's lesson: purity costs yield).
 */
export type Kind = 'alu' | 'alu-crushed' | 'tin' | 'pet' | 'carton' | 'cup' | 'film';

export interface Piece {
  kind: Kind;
  /** aluminium (the target class) */
  target: boolean;
  /** the camera's score 0…1 */
  score: number;
}

export const SORT = {
  n: 100,
  mix: { alu: 36, 'alu-crushed': 4, tin: 10, pet: 20, carton: 14, cup: 10, film: 6 } as Record<Kind, number>,
  /** score spreads: mean, standard deviation (clamped to 0.01 … 0.99) */
  score: { alu: [0.8, 0.1], 'alu-crushed': [0.52, 0.1], tin: [0.55, 0.1], other: [0.22, 0.11] } as Record<'alu' | 'alu-crushed' | 'tin' | 'other', [number, number]>,
  /** ★★ purity and recovery; ★★★ the crossing within ± this */
  purity2: 0.9,
  recovery2: 0.7,
  crossTol: 0.05,
};

/** mulberry32 */
export function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gauss(r: () => number, m: number, sd: number): number {
  const u = Math.max(1e-9, r()),
    v = r();
  return m + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** A shuffled stream of SORT.n pieces for one run. */
export function makeStream(seed: number): Piece[] {
  const r = rng(seed);
  const out: Piece[] = [];
  for (const [kind, count] of Object.entries(SORT.mix) as [Kind, number][]) {
    const sp = kind === 'alu' || kind === 'alu-crushed' || kind === 'tin' ? SORT.score[kind] : SORT.score.other;
    for (let i = 0; i < count; i++) out.push({ kind, target: kind === 'alu' || kind === 'alu-crushed', score: Math.min(0.99, Math.max(0.01, gauss(r, sp[0], sp[1]))) });
  }
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export interface Counts {
  /** aluminium picked (true positives) */
  tp: number;
  /** others picked (false positives: dirt in the bin) */
  fp: number;
  /** aluminium let through (false negatives) */
  fn: number;
  picked: number;
  targets: number;
  /** tp / picked (1 when nothing is picked) */
  purity: number;
  /** tp / targets */
  recovery: number;
}

/** Purity and recovery at threshold `th` over `pieces` (a piece is picked when its score ≥ th). */
export function countsAt(pieces: readonly Piece[], th: number): Counts {
  let tp = 0,
    fp = 0,
    fn = 0;
  for (const p of pieces) {
    const pick = p.score >= th;
    if (p.target && pick) tp++;
    else if (p.target) fn++;
    else if (pick) fp++;
  }
  const picked = tp + fp,
    targets = tp + fn;
  return { tp, fp, fn, picked, targets, purity: picked ? tp / picked : 1, recovery: targets ? tp / targets : 0 };
}

/** Both curves on a 0.01 grid (for the Kennlinie) */
export function curves(pieces: readonly Piece[]): { th: number; purity: number; recovery: number }[] {
  const out: { th: number; purity: number; recovery: number }[] = [];
  for (let k = 0; k <= 100; k++) {
    const c = countsAt(pieces, k / 100);
    out.push({ th: k / 100, purity: c.purity, recovery: c.recovery });
  }
  return out;
}

/**
 * Where the curves cross: the threshold with the smallest |purity − recovery| on the 0.01 grid (the middle
 * of a tie), ignoring the ends where nothing or everything is picked. null with no target seen yet.
 */
export function crossing(pieces: readonly Piece[]): number | null {
  if (!pieces.some((p) => p.target)) return null;
  let best = Infinity;
  let ths: number[] = [];
  for (let k = 1; k <= 99; k++) {
    const c = countsAt(pieces, k / 100);
    if (!c.picked) continue;
    const d = Math.abs(c.purity - c.recovery);
    if (d < best - 1e-9) {
      best = d;
      ths = [k / 100];
    } else if (Math.abs(d - best) <= 1e-9) ths.push(k / 100);
  }
  if (!ths.length) return null;
  // the middle of the first run of tied thresholds
  const run = [ths[0]];
  for (let i = 1; i < ths.length && Math.abs(ths[i] - run[run.length - 1] - 0.01) < 1e-6; i++) run.push(ths[i]);
  return Math.round(((run[0] + run[run.length - 1]) / 2) * 100) / 100;
}

export interface SortResult {
  th: number;
  counts: Counts;
  cross: number | null;
  /** ★★: purity ≥ 90 % and recovery ≥ 70 % at the threshold you set */
  star2: boolean;
  /** ★★★: ★★ and the threshold within ± 0,05 of the crossing */
  star3: boolean;
}

/** Judge a finished run at the threshold the player committed. */
export function judge(pieces: readonly Piece[], th: number): SortResult {
  const counts = countsAt(pieces, th);
  const cross = crossing(pieces);
  const star2 = counts.purity >= SORT.purity2 && counts.recovery >= SORT.recovery2;
  const star3 = star2 && cross != null && Math.abs(th - cross) <= SORT.crossTol + 1e-9;
  return { th, counts, cross, star2, star3 };
}

/** A seed whose run allows ★★★ (the solve hooks), and the threshold that earns it. */
export function solvable(from: number): { seed: number; th: number } {
  for (let seed = from; seed < from + 500; seed++) {
    const s = makeStream(seed);
    const c = crossing(s);
    if (c == null) continue;
    for (const d of [0, 0.01, 0.02, 0.03, -0.01, 0.04, -0.02, 0.05]) {
      const th = Math.round((c + d) * 100) / 100;
      if (judge(s, th).star3) return { seed, th };
    }
  }
  return { seed: from, th: 0.6 };
}
