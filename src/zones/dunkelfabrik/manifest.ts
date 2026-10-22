/** Eager manifest of zone 05 (Phase 7 plan §5.2): read before the title; the zone's code loads later. */
import { defineManifest } from '@/core/zones';

/** island railing gap centred on the Verladebucht (local degrees, 0 = −z, clockwise); hall.ts re-exports it */
export const RAILING_GAP = { fromDeg: 21, toDeg: 35 } as const;

export default defineManifest({
  id: 'dunkelfabrik',
  kind: 'lobe',
  frame: 'island',
  title: { de: 'Dunkelfabrik', en: 'Dark Factory' },
  number: 5,
  verb: { de: 'ARBEITEN', en: 'WORK' },
  eyebrow: { de: '// 05 · ARBEITEN · STATION 7', en: '// 05 · WORK · STATION 7' },
  glyph: 'kiste',
  stations: [
    { id: 'schicht', title: { de: 'Schicht: 18 kg bei 41 °C', en: 'Shift: 18 kg at 41 °C' } },
    // D40: a side station in Entdecker mode (grey objective chip; the route skips it)
    { id: 'schichtplan', title: { de: 'Schichtplan & Waage', en: 'Shift roster & payback beam' }, route: { entdecker: 'side' } },
    { id: 'lichtaus', star: true, title: { de: 'Licht aus: autonomer Anteil', en: 'Lights out: autonomous share' } },
  ],
  questions: [7],
  album: 'ueberschaetzte-geste',
  system: 'M5',
  systemLabel: { de: 'M5 · Dunkelfabrik', en: 'M5 · Dark Factory' },
  // the Verladebucht's gap: the island builds its railings before this zone's code loads (one source: RAILING_GAP above)
  railingGaps: [{ fromDeg: RAILING_GAP.fromDeg, toDeg: RAILING_GAP.toDeg }],
});
