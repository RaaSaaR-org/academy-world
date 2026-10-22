/** Eager manifest of zone 03 (Phase 7 plan §5.2): read before the title; the zone's code loads later. */
import { defineManifest } from '@/core/zones';

export default defineManifest({
  id: 'greifwerkstatt',
  kind: 'lobe',
  frame: 'island',
  title: { de: 'Greifwerkstatt', en: 'Grip Workshop' },
  number: 3,
  verb: { de: 'GREIFEN', en: 'GRASP' },
  eyebrow: { de: '// 03 · GREIFEN · KINEMATIK & KRAFT', en: '// 03 · GRASP · KINEMATICS & FORCE' },
  glyph: 'greifer',
  // titles inline: the island module reads manifests before this zone's init registers its strings
  stations: [
    { id: 'gelenke', title: { de: 'Gelenke: drei Ringe einfädeln', en: 'Joints: thread three rings' } },
    { id: 'ei', title: { de: 'Das Ei: Kraft statt Position', en: 'The egg: force, not position' } },
    // plan §4.4: „Lastdiagramm“ ◆ replaced „200 Griffe“ (retired, src/systems/retired.ts); card #2 moved to 06 B
    { id: 'lastdiagramm', star: true, title: { de: 'Lastdiagramm: Traglast über Reichweite', en: 'Load chart: payload over reach' } },
  ],
  questions: [5],
  album: 'singularitaet',
  system: 'M3',
  systemLabel: { de: 'M3 · Greifwerkstatt', en: 'M3 · Grip Workshop' },
});
