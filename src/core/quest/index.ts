/**
 * WP1 (quest spine) — boot entry: creates the spine and registers `ctx.quest`
 * (src/core/zones/types.quest.ts). Game calls it in createCore, before the island module's init.
 */
import { registerContextExtension } from '../zones/ext';
import { registerDebugExt } from '../DebugApi';
import { lastBootSave } from '@/systems/migrate';
import { QuestSpine, type QuestDeps } from './QuestSpine';
import { saveReport } from './report';
import { setResumeSource } from './resume';

export function installQuest(deps: QuestDeps): QuestSpine {
  const spine = new QuestSpine(deps);
  registerContextExtension('quest', () => spine);
  // the resume rule and the title read the glide, the flight, the frames and the rotors from the spine (§3.6)
  const frames = new Map(spine.manifests.map((m) => [m.id, m.frame]));
  setResumeSource({
    glideSeen: () => spine.snapshot().glideSeen,
    flight: () => spine.snapshot().flight.state,
    frameOf: (id) => frames.get(id) ?? null,
    rotors: () => spine.snapshot().start.lift,
  });
  // tool hooks (plan §5.10): the save migration's result (tools/save-migrate.mjs) and the spine
  registerDebugExt('save', () => saveReport({ boot: lastBootSave(), progress: deps.progress, quest: spine, manifests: spine.manifests }));
  registerDebugExt('quest', () => ({ snapshot: spine.snapshot(), stored: spine.stored(), defs: spine.defs.map((d) => ({ ...d })) }));
  return spine;
}

export { QuestSpine, type QuestDeps };
export { saveReport } from './report';
export { planFor, titleFor, resumePlan, titleState, PLAZA, type ResumeInput, type ResumePlan, type TitleState, type TitleKind } from './resume';
export { passSnapshot, zoneValue, takeaways, ISLAND_ORDER, type PassView, type StampView } from './values';
export { pool, poolStars, masteryNeed, F1_STARS, F1_KEY } from './pool';
export { masteryStatus, masteryArea } from './mastery';
export { systemDefs, systemOfArea, SYSTEM_GROUPS, SYSTEM_ORDER } from './systems';
export { deriveQuest, diffQuest, missingRotors, isReady, readQuestStore, emptyQuestStore, QUEST_KEY, type QuestStore, type DeriveInput } from './derive';
export type * from './types';
