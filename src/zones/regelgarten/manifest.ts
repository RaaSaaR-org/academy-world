/** Eager manifest of zone 02 (Phase 7 plan §5.2): read before the title; the zone's code loads later. */
import { defineManifest } from '@/core/zones';

export default defineManifest({
  id: 'regelgarten',
  kind: 'lobe',
  frame: 'island',
  title: { de: 'Regelgarten', en: 'Control Garden' },
  number: 2,
  verb: { de: 'REGELN', en: 'CONTROL' },
  eyebrow: { de: '// 02 · REGELN · REGELKREIS', en: '// 02 · CONTROL · FEEDBACK LOOP' },
  glyph: 'pendel',
  stations: [
    { id: 'balancieren', title: { de: 'Balancieren', en: 'Balancing' } },
    { id: 'regler-takt', star: true, title: { de: 'Regler & Takt', en: 'Controller & rate' } },
    { id: 'lauf-ente', title: { de: 'Lauf, Ente!', en: 'Walk, duck!' } },
  ],
  questions: [4],
  album: 'sim-to-real-luecke',
  system: 'M2',
  systemLabel: { de: 'M2 · Regelgarten', en: 'M2 · Control Garden' },
  spawn: { position: [0, 0, 24], yawDeg: 0 },
});
