/**
 * Discover's save (WP-D0, plan §1.7): built in memory, never read from or written to storage.
 *  - mode Entscheider: every hall robot except the H2 stands (schauhalle deliveries.ts)
 *  - every station of every manifest stamped: the tower mark is complete, M1–M6 ready, the Revier open
 *  - the flight on the ground, the Probestart and the glide seen, onboarding done (3)
 * Progress runs it read-only ({ memory: true }); ?reset=1 is ignored. tools/discover/storage.mjs proves it.
 */
import type { AreaManifest } from '@/core/zones/manifest';
import { QUEST_KEY, emptyQuestStore } from '@/core/quest/derive';
import { emptyV2, type ProgressDataV2 } from '@/systems/migrate';

export function discoverSave(manifests: Iterable<AreaManifest>): ProgressDataV2 {
  const d = emptyV2();
  d.mode = 'entscheider';
  for (const m of manifests) for (const s of m.stations) d.stamps[`${m.id}.${s.id}`] = { t: 1 };
  const quest = emptyQuestStore();
  quest.start = { glideSeen: true, probestart: true };
  quest.flight = { state: 'ground', firstFlightAt: null, liftoffSeen: false };
  d.zoneData.world = { [QUEST_KEY]: quest, onboarding: 3 };
  return d;
}
