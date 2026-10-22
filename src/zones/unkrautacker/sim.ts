/**
 * The Unkrautacker's model (plan §4.11; R8 §3.2): three ways to weed without spraying a whole field, on three
 * field states. A toy model (SIM, numbers ILLUSTRATIV): per method and field the share of weeds left and of
 * crop damaged, a relative energy and area rate, and whether herbicide is used. Pure, no three.js.
 *
 *  - mapped hoe: the robot sowed every seed itself and hoes everything that is not on its map; no camera,
 *    slow, on its own solar roof (R8 [S36], QUELLE in the card). Good on dry soil; too coarse for tiny
 *    seedlings; wet soil smears and weeds re-root (agronomic rule of thumb, ILLUSTRATIV).
 *  - camera spot spray: finds each weed and gives it a micro-dose (R8 [S37], HERSTELLERANGABE in the card);
 *    fast and fine in dense weeds, but the spray spot is wider than the gap next to a tiny seedling.
 *  - laser: camera and a laser beam, no chemicals, millimetre-precise; slow and power-hungry in dense weeds.
 * Each field has one best method (the balance of weeding, damage and resources): A laser, B hoe, C spray.
 */
export type FieldId = 'a' | 'b' | 'c';
export type MethodId = 'hoe' | 'spray' | 'laser';
export const FIELDS: readonly FieldId[] = ['a', 'b', 'c'];
export const METHODS: readonly MethodId[] = ['hoe', 'spray', 'laser'];

/** plants per strip: 50 crop plants and 50 weeds (k/50 each, Wilson) */
export const N = 50;

/** [share of weeds left, share of crop damaged] (ILLUSTRATIV) */
export const P: Record<FieldId, Record<MethodId, [number, number]>> = {
  a: { hoe: [0.22, 0.08], spray: [0.1, 0.1], laser: [0.04, 0.02] },
  b: { hoe: [0.05, 0.02], spray: [0.07, 0.02], laser: [0.05, 0.01] },
  c: { hoe: [0.45, 0.06], spray: [0.08, 0.03], laser: [0.18, 0.02] },
};
/** relative energy per hectare and area per hour (1 … 5 bars, ILLUSTRATIV); herbicide used */
export const COST: Record<MethodId, { energy: number; area: number; herbicide: boolean }> = {
  hoe: { energy: 1, area: 2, herbicide: false },
  spray: { energy: 2, area: 5, herbicide: true },
  laser: { energy: 5, area: 1, herbicide: false },
};
export const BEST: Record<FieldId, MethodId> = { a: 'laser', b: 'hoe', c: 'spray' };
/** ★★: no field above this crop loss */
export const MAX_DAMAGE = 0.05;

export interface FieldRun {
  field: FieldId;
  method: MethodId;
  /** weeds left, crop damaged (of N each) */
  left: number;
  damaged: number;
  best: boolean;
}

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

/** One pass of a method over a strip: counts near the model's expectation (± one plant). */
export function run(field: FieldId, method: MethodId, seed: number): FieldRun {
  const r = rng(seed);
  const [pl, pd] = P[field][method];
  const k = (p: number): number => Math.max(0, Math.min(N, Math.round(p * N + (r() - 0.5) * 1.6)));
  return { field, method, left: k(pl), damaged: k(pd), best: BEST[field] === method };
}

/** Which plants a pass removes or damages (indices into the strip's weeds and crops), for the visuals. */
export function outcome(res: FieldRun, seed: number): { weedsLeft: Set<number>; cropsHit: Set<number> } {
  const r = rng(seed ^ 0x9e3779b9);
  const pick = (n: number): Set<number> => {
    const idx = Array.from({ length: N }, (_, i) => i);
    for (let i = idx.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      [idx[i], idx[j]] = [idx[j], idx[i]];
    }
    return new Set(idx.slice(0, n));
  };
  return { weedsLeft: pick(res.left), cropsHit: pick(res.damaged) };
}

/** Stars of an attempt (three fields, one choice each): ★ all three · ★★ no crop loss above 5 % · ★★★ every field with its best method. */
export function stars(runs: readonly FieldRun[]): 0 | 1 | 2 | 3 {
  if (FIELDS.some((f) => !runs.some((x) => x.field === f))) return 0;
  const s2 = runs.every((x) => x.damaged / N <= MAX_DAMAGE);
  const s3 = s2 && runs.every((x) => x.best);
  return (1 + (s2 ? 1 : 0) + (s3 ? 1 : 0)) as 1 | 2 | 3;
}

/** The laser by hand vs the automatic laser over the same weeds in the toy (SIM). */
export function autoLaser(weeds: number, crops: number, seed: number): { hit: number; cropHit: number } {
  const r = rng(seed);
  let hit = 0,
    cropHit = 0;
  for (let i = 0; i < weeds; i++) if (r() > P.a.laser[0]) hit++;
  for (let i = 0; i < crops; i++) if (r() < P.a.laser[1] * 0.5) cropHit++;
  return { hit, cropHit };
}
