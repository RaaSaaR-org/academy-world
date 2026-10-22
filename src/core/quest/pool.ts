/**
 * WP1 (quest spine) — the star pool, the mastery denominator (plan §3.1, D21). Read from the manifests
 * at boot, before any zone code loads, so cut or added content moves the threshold by itself.
 */
import type { AreaManifest } from '../zones/manifest';

/** The F1 Schwebetest counts for the pool (the founder: „75 % of all stars in the game“). */
export const F1_STARS = 3;
/** The F1 challenge's record key (the island module registers challenge 'f1' as area 'world'). */
export const F1_KEY = 'world.f1';

/** 3 × every station with mastery !== false in a shipped manifest, plus F1. MUST build: 84. */
export function pool(manifests: Iterable<AreaManifest>): number {
  let n = F1_STARS;
  for (const m of manifests) for (const s of m.stations) if (s.mastery !== false) n += 3;
  return n;
}

/** Stars needed to open the H2 gate: ⌈0.75 × pool⌉ (84 → 63). */
export function masteryNeed(poolStars: number): number {
  return Math.ceil(0.75 * poolStars);
}

/** The player's stars that count for the pool: best stars of every pool station plus F1 (H2 and secrets never count). */
export function poolStars(manifests: Iterable<AreaManifest>, stars: (key: string) => number): number {
  const clamp = (v: number): number => (Number.isFinite(v) ? Math.max(0, Math.min(3, Math.round(v))) : 0);
  let n = clamp(stars(F1_KEY));
  for (const m of manifests) for (const s of m.stations) if (s.mastery !== false) n += clamp(stars(`${m.id}.${s.id}`));
  return n;
}
