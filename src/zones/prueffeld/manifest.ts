/** Eager manifest of zone 06 (Phase 7 plan §5.2): read before the title; the zone's code loads later. */
import { defineManifest } from '@/core/zones';

export default defineManifest({
  id: 'prueffeld',
  kind: 'lobe',
  frame: 'island',
  title: { de: 'Prüffeld', en: 'Proving Ground' },
  number: 6,
  verb: { de: 'MESSEN', en: 'MEASURE' },
  eyebrow: { de: '// 06 · MESSEN · MOBILE MESSZELLE', en: '// 06 · MEASURE · MOBILE TEST CELL' },
  glyph: 'kurve',
  stations: [
    { id: 'vorfuehrung', title: { de: 'Die Vorführung', en: 'The demo' } },
    { id: 'unter-last', star: true, title: { de: 'Unter Last messen', en: 'Measure under load' } },
    // D40: a side station in Entdecker mode (grey objective chip; the route skips it)
    // plan §4.7: „Drei Auditoren, kurz“ (6 clips, 2×, a κ needle) changed its goals: rev 2 resets the rc4 record
    { id: 'drei-auditoren', title: { de: 'Drei Auditoren', en: 'Three auditors' }, route: { entdecker: 'side' }, rev: 2 },
  ],
  // #1 and #3 on arrival; #2 „Wie viele Versuche?“ on the first n = 200 run (moved from 03 C, plan §4.4)
  questions: [1, 2, 3],
  album: 'bester-von-40',
  system: 'M6',
  systemLabel: { de: 'M6 · Prüffeld', en: 'M6 · Proving Ground' },
});
