/**
 * WP1 — what the save tools read (`__academy.ext('save')()`, tools/fixtures/saves/README.md): the boot
 * migration's result, the v2 data in memory, the quest snapshot and the counts the fixtures check.
 * Pure over its inputs, so tools/quest-derive.mjs builds the same report in Node.
 */
import type { AreaManifest } from '../zones/manifest';
import type { BootSave } from '@/systems/migrate';
import type { Progress } from '@/systems/Progress';
import { pool, poolStars } from './pool';
import type { QuestSpine } from './QuestSpine';

export function saveReport(o: { boot: BootSave | null; progress: Progress; quest: QuestSpine; manifests: readonly AreaManifest[] }): Record<string, unknown> {
  const P = o.progress;
  const kinds: Record<string, string> = {};
  for (const m of o.manifests) kinds[m.id] = m.kind;
  const systemAreas: Record<string, string> = {};
  for (const d of o.quest.defs) systemAreas[d.id] = d.areaId;
  return {
    key: 'emai-academy-island/v1:progress.v2',
    v1Key: 'emai-academy-island/v1:progress',
    source: o.boot?.source ?? 'fresh',
    readOnly: P.readOnly,
    error: o.boot?.error ?? null,
    retired: [...(o.boot?.retired ?? [])],
    revs: { ...(o.boot?.revs ?? {}) },
    kinds,
    systemAreas,
    data: P.dataCopy(),
    quest: o.quest.snapshot(),
    stored: o.quest.stored(),
    islandStamps: P.earnedStamps({ scope: 'island' }),
    allStamps: P.earnedStamps({ scope: 'all' }),
    pool: pool(o.manifests),
    stars: poolStars(o.manifests, (k) => P.challengeRecord(k)?.stars ?? 0),
  };
}
