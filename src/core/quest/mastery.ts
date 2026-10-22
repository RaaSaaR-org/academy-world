/**
 * WP1 — the H2 Meisterprüfung gate (plan §3.1, D21, D39): ★★★ on the three ladder stations of the
 * Traumhangar (R1, G1, H1-2) and ⌈0.75 × pool⌉ stars. Pure: the tools (tools/quest-derive.mjs) run it
 * in Node. The hangar is the area whose ◆ starts NAV; its ladder is its counted stations in manifest
 * order, the H2 Generalprobe its station with `mastery: false`.
 */
import type { AreaManifest } from '../zones/manifest';
import type { Stars } from '../zones/types';
import { F1_KEY, masteryNeed, pool, poolStars } from './pool';
import type { MasteryStatus } from './types';

/** The hangar of the mastery ladder: the area whose ◆ installs the Flugmodell (NAV). */
export function masteryArea(manifests: Iterable<AreaManifest>): AreaManifest | null {
  for (const m of manifests) if (m.system === 'NAV') return m;
  return null;
}

export interface MasteryInput {
  manifests: readonly AreaManifest[];
  /** best stars of a challenge ('<area>.<station>', and F1_KEY) */
  stars(key: string): number;
  /** the stamp was earned (not skipped) */
  earned(key: string): boolean;
  h2Unveiled: boolean;
}

export function masteryStatus(i: MasteryInput): MasteryStatus {
  const total = pool(i.manifests);
  const stars = poolStars(i.manifests, i.stars);
  const hangar = masteryArea(i.manifests);
  const ladder = hangar ? hangar.stations.filter((s) => s.mastery !== false) : [];
  const step = (n: number): Stars => (ladder[n] ? (Math.max(0, Math.min(3, Math.round(i.stars(`${hangar!.id}.${ladder[n].id}`)))) as Stars) : 0);
  const ladderStars = { r1: step(0), g1: step(1), h12: step(2) };
  const need = masteryNeed(total);
  const h2 = hangar?.stations.find((s) => s.mastery === false) ?? null;
  const h2Key = h2 ? `${hangar!.id}.${h2.id}` : null;
  return {
    ladder: ladderStars,
    stars,
    pool: total,
    need,
    open: ladder.length >= 3 && ladderStars.r1 === 3 && ladderStars.g1 === 3 && ladderStars.h12 === 3 && stars >= need,
    // earned with ★ in the Generalprobe (its stamp, or a starred result)
    h2Earned: !!h2Key && (i.earned(h2Key) || i.stars(h2Key) >= 1),
    h2Unveiled: i.h2Unveiled,
  };
}

export { F1_KEY };
