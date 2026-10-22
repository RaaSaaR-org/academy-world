/**
 * Sonnenacker — the pure models behind the three stations (R8 §2.3, plan §4.10). No three.js, no DOM,
 * no engine: the stations, tools/agripv-check.mjs and tools/sonnenacker/kurzlauf.mjs run the same
 * code (Node imports it with type stripping). Every outcome is deterministic: the same choices give the
 * same day, so the stars rate the player's preparation, never luck (D8).
 */
import { AGRIPV, DAY, ENERGY, PICK, RIPE } from './tuning';

// ── shared ───────────────────────────────────────────────────────────────────

export interface Band {
  lo: number;
  hi: number;
}

/** Wilson score interval for k successes in n trials (z = 1.96 → 95 %): [p, lo, hi] (as Kit.wilson). */
export function wilson(k: number, n: number, z = 1.96): [number, number, number] {
  if (n <= 0) return [0, 0, 1];
  const p = k / n;
  const z2 = z * z;
  const den = 1 + z2 / n;
  const centre = (p + z2 / (2 * n)) / den;
  const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / den;
  return [p, Math.max(0, centre - half), Math.min(1, centre + half)];
}

/** Seeded PRNG (mulberry32), the same as the brand textures'. */
export function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const GOLDEN = 0.6180339887498949;
/** The i-th member of a golden-ratio low-discrepancy sequence in [0, 1). */
const lds = (i: number, phase: number): number => (phase + i * GOLDEN) % 1;

/** Inverse of the standard normal CDF (Acklam's rational approximation, |error| < 1.2e-9). */
function normInv(p: number): number {
  const a = [-39.6968302866538, 220.946098424521, -275.928510446969, 138.357751867269, -30.6647980661472, 2.50662827745924];
  const b = [-54.4760987982241, 161.585836858041, -155.698979859887, 66.8013118877197, -13.2806815528857];
  const c = [-0.00778489400243029, -0.322396458041136, -2.40075827716184, -2.54973253934373, 4.37466414146497, 2.93816398269878];
  const d = [0.00778469570904146, 0.32246712907004, 2.445134137143, 3.75440866190742];
  const q = Math.min(1 - 1e-12, Math.max(1e-12, p));
  if (q < 0.02425) {
    const r = Math.sqrt(-2 * Math.log(q));
    return (((((c[0] * r + c[1]) * r + c[2]) * r + c[3]) * r + c[4]) * r + c[5]) / ((((d[0] * r + d[1]) * r + d[2]) * r + d[3]) * r + 1);
  }
  if (q > 1 - 0.02425) return -normInv(1 - q);
  const r = q - 0.5;
  const s = r * r;
  return ((((((a[0] * s + a[1]) * s + a[2]) * s + a[3]) * s + a[4]) * s + a[5]) * r) / (((((b[0] * s + b[1]) * s + b[2]) * s + b[3]) * s + b[4]) * s + 1);
}

/** Median of a list (0 for none). */
export function median(xs: readonly number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// ── A „Reif oder nicht?“: USDA colour classes, the wrist camera and a learned threshold ──

/** USDA colour classes [S24]: 0 Green · 1 Breakers · 2 Turning · 3 Pink · 4 Light red · 5 Red. */
export const RIPE_CLASSES = ['green', 'breakers', 'turning', 'pink', 'lightRed', 'red'] as const;
export type RipeClass = 0 | 1 | 2 | 3 | 4 | 5;
export type Light = 'sun' | 'shade' | 'card';

export interface RipeFruit {
  id: number;
  cls: RipeClass;
  /** true redness 0…1 */
  r: number;
}

/** Light red and Red are ripe enough to pick (the station's ground truth). */
export const shouldPick = (cls: RipeClass): boolean => cls >= RIPE.pickFrom;

/** The 12 teaching tomatoes: two per class, in a fixed shuffled order. */
export function ripeTeach(): RipeFruit[] {
  const out: RipeFruit[] = [];
  for (let c = 0; c < 6; c++) for (const off of RIPE.teach) out.push({ id: 100 + out.length, cls: c as RipeClass, r: RIPE.centres[c] + off });
  const rnd = mulberry32(RIPE.seed + 7);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** The 40 test tomatoes (5/5/6/8/8/8 per class), each with its own place in the class. */
export function ripeTest(): RipeFruit[] {
  const rnd = mulberry32(RIPE.seed);
  const out: RipeFruit[] = [];
  RIPE.test.forEach((n, c) => {
    for (let i = 0; i < n; i++) {
      // spread evenly over the class (± jitter), then a little seeded wobble
      const u = n > 1 ? i / (n - 1) - 0.5 : 0;
      out.push({ id: out.length, cls: c as RipeClass, r: RIPE.centres[c] + u * 2 * RIPE.jitter * 0.9 + (rnd() - 0.5) * 0.012 });
    }
  });
  return out;
}

/** A fixed per-fruit, per-light standard-normal number (the camera's noise is part of the scene, not luck). */
function noiseOf(id: number, light: Light): number {
  const rnd = mulberry32(RIPE.seed * 31 + id * 977 + (light === 'sun' ? 1 : light === 'shade' ? 2 : 3));
  return normInv(0.02 + 0.96 * rnd());
}

/** What the wrist camera reads as „redness“ in this light. */
export function reading(f: RipeFruit, light: Light): number {
  if (light === 'sun') return f.r + RIPE.sunNoise * noiseOf(f.id, 'sun');
  const shade = f.r * RIPE.shadeGain + RIPE.shadeOffset + RIPE.shadeNoise * noiseOf(f.id, 'shade');
  if (light === 'shade') return shade;
  // the colour card: white balance against a known reference undoes the shade's gain and offset
  return (shade - RIPE.shadeOffset) / RIPE.shadeGain + RIPE.cardNoise * noiseOf(f.id, 'card');
}

/**
 * The arm learns ONE threshold from your labels (a decision stump on the sun readings): the cut with
 * the fewest disagreements, ties broken by the widest gap. `labels[i]` true = „pflücken“.
 */
export function learnThreshold(teach: readonly RipeFruit[], labels: readonly boolean[]): number {
  const pts = teach.map((f, i) => ({ m: reading(f, 'sun'), pick: !!labels[i] })).sort((a, b) => a.m - b.m);
  const cuts: { t: number; gap: number }[] = [{ t: pts[0].m - 0.05, gap: 0.05 }];
  for (let i = 0; i + 1 < pts.length; i++) cuts.push({ t: (pts[i].m + pts[i + 1].m) / 2, gap: pts[i + 1].m - pts[i].m });
  cuts.push({ t: pts[pts.length - 1].m + 0.05, gap: 0.05 });
  let best = cuts[0];
  let bestErr = Infinity;
  for (const c of cuts) {
    const err = pts.reduce((n, p) => n + ((p.m >= c.t) !== p.pick ? 1 : 0), 0);
    if (err < bestErr || (err === bestErr && c.gap > best.gap)) {
      best = c;
      bestErr = err;
    }
  }
  return best.t;
}

export interface RipeTest {
  k: number;
  n: number;
  /** the arm's verdict per test fruit (true = pick) and whether it was right */
  pick: boolean[];
  right: boolean[];
}

/** The arm sorts the 40 test fruits in this light with your threshold. */
export function runRipeTest(test: readonly RipeFruit[], threshold: number, light: Light): RipeTest {
  const pick = test.map((f) => reading(f, light) >= threshold);
  const right = test.map((f, i) => pick[i] === shouldPick(f.cls));
  return { k: right.filter(Boolean).length, n: test.length, pick, right };
}

// ── B „Licht teilen“: the light rule, the electricity anchor, LER and the DIN check ──

export type Density = 0 | 1 | 2;
export type Policy = 'sonne' | 'pflanze';

export interface RoofChoice {
  density: Density;
  policy: Policy;
  /** „Schutzstellung bei Hagel“: the tables turn flat over the beds when the hail front comes */
  hailStow: boolean;
}

export interface AgriResult {
  /** light under the roof ÷ open field, and what the crop gets with the policy */
  T: number;
  Tcrop: number;
  /** tomato yield in ÷ of the open field, as the light-rule band (the roof alone) */
  crop: Band;
  /** electricity ÷ a PV-only plant on the same land */
  el: number;
  ler: Band;
  /** DIN SPEC 91434: the crop band's lower edge keeps ≥ 66 % */
  din: boolean;
  /** the season's hail front (FIKTION): the share of fruit lost (0 with the Schutzstellung) */
  hailLoss: number;
  /** the season as measured: the crop after the hail, and its LER */
  harvest: Band;
  lerSeason: Band;
  /** the centre of the measured crop band (%), for the prediction */
  centrePct: number;
}

/** R8 §2.3: T by density; Y_crop = 1 − s·(1 − T) for s ∈ [0,7; 1,0]; Y_el = 0,83·(1 − T)/0,30 capped at 1; LER = the sum. */
export function agriPv(c: RoofChoice, o: { hail?: boolean } = {}): AgriResult {
  const T = AGRIPV.densityT[c.density];
  const Tcrop = Math.min(1, T + (c.policy === 'pflanze' ? AGRIPV.plantFirstT : 0));
  const crop: Band = { lo: 1 - AGRIPV.s[1] * (1 - Tcrop), hi: 1 - AGRIPV.s[0] * (1 - Tcrop) };
  const el = Math.min(1, (AGRIPV.elAnchor * (1 - T)) / AGRIPV.elShade) * (c.policy === 'pflanze' ? AGRIPV.plantFirstEl : 1);
  const ler: Band = { lo: crop.lo + el, hi: crop.hi + el };
  const din = crop.lo >= AGRIPV.dinMin - 1e-9;
  const hailLoss = (o.hail ?? true) && !c.hailStow ? AGRIPV.hailLoss : 0;
  const harvest: Band = { lo: crop.lo * (1 - hailLoss), hi: crop.hi * (1 - hailLoss) };
  const lerSeason: Band = { lo: harvest.lo + el, hi: harvest.hi + el };
  return { T, Tcrop, crop, el, ler, din, hailLoss, harvest, lerSeason, centrePct: ((harvest.lo + harvest.hi) / 2) * 100 };
}

/** The ground cover of each density step (table width ÷ row pitch) for the table model's gauges. */
export const GCR = [0.2, 0.375, 0.55] as const;
/** The diffuse share of daylight in the gauge toy. */
const DIFFUSE = 0.28;

export interface Gauges {
  /** the tables' tilt (deg, + toward west) */
  tilt: number;
  /** crop light 0…1 of the open field at this moment, and the roof's power (kW, block A at 30 kWp) */
  crop: number;
  kw: number;
  /** the sun's angle from the zenith in the E–W plane (deg, + west) and its relative strength */
  zenith: number;
  sun: number;
}

/**
 * The Tagesmodell's toy (MODELL chip): the lamp at day fraction `f` (0 = east horizon at 06:00, 1 = west
 * at 20:00). „Sonne zuerst“ turns the tables to the lamp; „Pflanze zuerst“ turns them edge-on to let it
 * through. 2-D in the E–W plane: one table casts W·|cos(θ − ψ)| / cos ψ of shadow per row pitch.
 */
export function gauges(f: number, c: Pick<RoofChoice, 'density' | 'policy'>, stow = false): Gauges {
  const psi = (f - 0.5) * 164; // −82° … +82° from the zenith
  const rad = Math.PI / 180;
  const sun = Math.max(0, Math.pow(Math.cos(psi * rad), 0.55)) * Math.min(1, Math.sin(Math.min(1, Math.max(0, f)) * Math.PI) * 1.4);
  const max = 50;
  let tilt: number;
  if (stow) tilt = 0;
  else if (c.policy === 'sonne') tilt = Math.max(-max, Math.min(max, psi));
  else tilt = Math.max(-max, Math.min(max, psi - Math.sign(psi || 1) * 90));
  const gcr = GCR[c.density];
  const cosInc = Math.abs(Math.cos((tilt - psi) * rad));
  const shaded = Math.min(1, (gcr * cosInc) / Math.max(0.12, Math.cos(psi * rad)));
  const crop = sun > 0 ? DIFFUSE * (1 - gcr * 0.45) + (1 - DIFFUSE) * (1 - shaded) : 0;
  // 30 kWp block A at the medium density; a table facing the beam makes its rated share
  const kwp = 30 * (gcr / GCR[1]);
  const kw = kwp * sun * ((1 - DIFFUSE) * cosInc + DIFFUSE * 0.85);
  return { tilt, crop: Math.max(0, Math.min(1, crop)), kw: Math.max(0, kw), zenith: psi, sun };
}

// ── C „Erntetag“: the Messbeet, the day's attempts and their outcomes ──

export type Vis = 'free' | 'half' | 'hidden';
export type HarvestWindow = keyof typeof PICK.pWindow;

/** The Messbeet as planted: two rows of 30 cherry tomatoes; leaf clusters of three fruits; one fruit behind a stem. */
export interface Messbeet {
  /** visibility before deleafing, per row */
  vis: [Vis[], Vis[]];
  /** the stem fruit of each row (the call frees it), or −1 */
  stem: [number, number];
}

export function messbeet(): Messbeet {
  const rows: [Vis[], Vis[]] = [[], []];
  for (let r = 0; r < 2; r++) {
    const list: Vis[] = [];
    for (let i = 0; i < PICK.perRow - PICK.half - PICK.hidden; i++) list.push('free');
    for (let i = 0; i < PICK.half; i++) list.push('half');
    for (let i = 0; i < PICK.hidden; i++) list.push('hidden');
    const rnd = mulberry32(RIPE.seed + 101 * (r + 1));
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    rows[r] = list;
  }
  const stem: [number, number] = [-1, -1];
  for (const c of DAY.calls) if (c.kind === 'stem') stem[c.row] = c.fruit;
  for (let r = 0; r < 2; r++) if (stem[r] >= 0) rows[r][stem[r]] = 'hidden';
  return { vis: rows, stem };
}

/** The leaf cluster a fruit sits behind. */
export const clusterOf = (fruit: number): number => Math.min(PICK.clustersPerRow - 1, Math.floor(fruit / (PICK.perRow / PICK.clustersPerRow)));

/** Visibility after your work: removed clusters free their fruits; the stem fruit only when its call was answered. */
export function visAfter(m: Messbeet, deleafed: readonly (readonly boolean[])[], stemFreed: readonly boolean[]): [Vis[], Vis[]] {
  return [0, 1].map((r) =>
    m.vis[r].map((v, i) => {
      if (i === m.stem[r]) return stemFreed[r] ? 'free' : 'hidden';
      return deleafed[r]?.[clusterOf(i)] ? 'free' : v;
    }),
  ) as [Vis[], Vis[]];
}

/** p = p_vis · p_ripe · p_window (ILLUSTRATIV). */
export function pickP(vis: Vis, window: HarvestWindow, calibrated: boolean): number {
  const ripe = window === 'midday' && !calibrated ? PICK.pRipeStripes : PICK.pRipe;
  return PICK.pVis[vis] * ripe * PICK.pWindow[window];
}

/** One attempt of the Messbeet's day: which arm (row), which fruit, when (s into the day), its fixed draws. */
export interface Attempt {
  i: number;
  row: 0 | 1;
  fruit: number;
  t: number;
  /** the outcome draw, the damage draw and the cycle time (s, ILLUSTRATIV) */
  u: number;
  d: number;
  cycleS: number;
}

/** The 60 attempts: each Messbeet arm works its row from west to east, one fruit per ≈ 2,4 s of the day. */
export function dayAttempts(): Attempt[] {
  const out: Attempt[] = [];
  const n = PICK.perRow;
  const span = DAY.seconds - 10;
  const zs = Array.from({ length: 2 * n }, (_, i) => normInv((i + 0.5) / (2 * n)));
  const rnd = mulberry32(RIPE.seed + 4242);
  for (let i = zs.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [zs[i], zs[j]] = [zs[j], zs[i]];
  }
  for (let j = 0; j < n; j++)
    for (let r = 0; r < 2; r++) {
      const i = out.length;
      out.push({
        i,
        row: r as 0 | 1,
        fruit: j,
        t: 4 + (span * (j + r * 0.5)) / n,
        u: lds(i, PICK.phase),
        d: lds(i, PICK.damagePhase),
        cycleS: PICK.cycleMedianS * Math.exp(PICK.cycleSigma * zs[i]),
      });
    }
  return out;
}

export interface AttemptOutcome {
  i: number;
  row: 0 | 1;
  fruit: number;
  /** when it happened (s into the day; a jammed arm's attempt waits) */
  t: number;
  p: number;
  ok: boolean;
  damaged: boolean;
  /** never attempted: the arm stayed jammed until the day ended */
  missed: boolean;
  cycleS: number;
  vis: Vis;
}

/** The outcome of one attempt given the state at its moment (deterministic). */
export function decide(a: Attempt, vis: Vis, window: HarvestWindow, calibrated: boolean, miscal: boolean, t = a.t): AttemptOutcome {
  const p = pickP(vis, window, calibrated);
  const ok = a.u < p;
  const damaged = ok && a.d < PICK.damage + (miscal ? PICK.damageMiscal : 0);
  return { i: a.i, row: a.row, fruit: a.fruit, t, p, ok, damaged, missed: false, cycleS: a.cycleS, vis };
}

export interface DayResult {
  k: number;
  n: number;
  rate: [number, number, number];
  damaged: number;
  cycleMedianS: number;
  calls: number;
  callsInTime: number;
  kwh: number;
  kwhUsed: number;
  /** full trays that reached the crate */
  trays: number;
}

/** Sum up a day's outcomes. */
export function dayResult(out: readonly AttemptOutcome[], calls: { answeredIn: number | null }[], trays: number): DayResult {
  const k = out.filter((o) => o.ok).length;
  const n = PICK.perRow * 2;
  return {
    k,
    n,
    rate: wilson(k, n),
    damaged: out.filter((o) => o.damaged).length,
    cycleMedianS: median(out.filter((o) => o.ok).map((o) => o.cycleS)),
    calls: calls.length,
    callsInTime: calls.filter((c) => c.answeredIn != null && c.answeredIn <= DAY.answerS).length,
    kwh: ENERGY.kwhDay,
    kwhUsed: ENERGY.kwhUsedMax,
    trays,
  };
}

export interface DayChoices {
  /** removed leaf clusters per Messbeet row */
  deleafed: boolean[][];
  window: HarvestWindow;
  /** station A found the calibration (the colour card) */
  calibrated: boolean;
  /** seconds until each call of DAY.calls was answered (null: never) */
  answerS: (number | null)[];
}

/** Every leaf removed, every call answered after `answerS` seconds: the prepared day. */
export function preparedChoices(window: HarvestWindow = 'midday', answerS = 4): DayChoices {
  return {
    deleafed: [0, 1].map(() => Array.from({ length: PICK.clustersPerRow }, () => true)),
    window,
    calibrated: true,
    answerS: DAY.calls.map(() => answerS),
  };
}

/** The jam calls' windows per Messbeet row: [from, until] in seconds of the day. */
function jamWindows(choices: DayChoices): { row: 0 | 1; from: number; until: number; late: boolean }[] {
  const out: { row: 0 | 1; from: number; until: number; late: boolean }[] = [];
  DAY.calls.forEach((c, k) => {
    if (c.kind !== 'jam') return;
    const row = jamRow(c.arm);
    if (row == null) return;
    const a = choices.answerS[k];
    out.push({ row, from: c.t, until: a == null ? Infinity : c.t + a, late: a == null || a > DAY.answerS });
  });
  return out;
}

/** Which Messbeet row an arm of Sonnendach A works (the Messbeet is bed PICK.bed: arms 2·bed (south edge, row 0) and 2·bed + 1 (north edge, row 1)). */
export function jamRow(arm: number): 0 | 1 | null {
  if (arm === 2 * PICK.bed) return 0;
  if (arm === 2 * PICK.bed + 1) return 1;
  return null;
}

/**
 * A whole day without a player in the loop (the solve hooks, the Kurzlauf, the check tool): the
 * attempts in time order; a jammed arm's attempts wait for the answer and then catch up (one every
 * catchUpS); after a late answer that arm grips harder (mis-calibrated). The stem fruit is free from
 * the moment its call was answered.
 */
export function simulateDay(choices: DayChoices, o: { catchUpS?: number } = {}): { outcomes: AttemptOutcome[]; result: DayResult; calls: { kind: string; t: number; answeredIn: number | null }[] } {
  const m = messbeet();
  const jams = jamWindows(choices);
  const catchUp = o.catchUpS ?? 0.8;
  const busyUntil = [0, 0];
  const stemCall = DAY.calls.map((c, k) => ({ c, k })).filter((x) => x.c.kind === 'stem');
  const outcomes: AttemptOutcome[] = [];
  for (const a of dayAttempts()) {
    let t = a.t;
    let miscal = false;
    for (const j of jams) {
      if (j.row !== a.row) continue;
      if (t >= j.from && t < j.until) t = j.until;
      if (j.late && t >= j.until) miscal = true;
    }
    t = Math.max(t, busyUntil[a.row]);
    if (t > DAY.seconds + 6) {
      outcomes.push({ i: a.i, row: a.row, fruit: a.fruit, t: DAY.seconds, p: 0, ok: false, damaged: false, missed: true, cycleS: a.cycleS, vis: 'hidden' });
      continue;
    }
    busyUntil[a.row] = t + catchUp;
    const stemFreed = [0, 1].map((r) => stemCall.some(({ c, k }) => c.kind === 'stem' && c.row === r && choices.answerS[k] != null && c.t + (choices.answerS[k] as number) <= t));
    const vis = visAfter(m, choices.deleafed, stemFreed)[a.row][a.fruit];
    outcomes.push(decide(a, vis, choices.window, choices.calibrated, miscal, t));
  }
  const calls = DAY.calls.map((c, k) => ({ kind: c.kind as string, t: c.t, answeredIn: choices.answerS[k] }));
  const k = outcomes.filter((x) => x.ok).length;
  return { outcomes, calls, result: dayResult(outcomes, calls, Math.floor(k / 12)) };
}

// ── energy on the dashboard (RICHTWERT) ──

/** The share of the day's kWh produced by day fraction f (a sun-shaped profile over 06:00–20:00). */
export function kwhShare(f: number): number {
  const x = Math.max(0, Math.min(1, f));
  // ∫ sin(πx)^1.3 — tabulated once (cheap, no allocation per call)
  return SHARE[Math.min(SHARE.length - 1, Math.round(x * (SHARE.length - 1)))];
}
const SHARE: number[] = (() => {
  const N = 200;
  const v = new Array<number>(N + 1).fill(0);
  let s = 0;
  for (let i = 1; i <= N; i++) {
    s += Math.pow(Math.sin((Math.PI * (i - 0.5)) / N), 1.3);
    v[i] = s;
  }
  return v.map((x) => x / s);
})();

/** The dashboard's numbers, derived (R8 §2.3, eigene Rechnung): kWp of block A, kWh per year and per day. */
export function energyFacts(): { kwp: number; kwhYear: number; kwhDay: number; kwhUsed: number } {
  const kwp = (ENERGY.areaM2 * ENERGY.kwpPerHa) / 10000;
  const kwhYear = kwp * ENERGY.kwhPerKwp;
  return { kwp, kwhYear, kwhDay: kwhYear / 365, kwhUsed: (12 * ENERGY.armW * ENERGY.armHours) / 1000 };
}

/** What the robot may cost (R8 §2.6, eigene Rechnung): ≤ €196 k at 6 s, 95 %; scaled with 1 / cycle and success. */
export function robotWorth(cycleS: number, success: number): number {
  return 196000 * (6 / cycleS) * (success / 0.95);
}
