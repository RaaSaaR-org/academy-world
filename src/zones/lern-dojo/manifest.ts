/** Eager manifest of zone 04 (Phase 7 plan §5.2): read before the title; the zone's code loads later. */
import { defineManifest } from '@/core/zones';

export default defineManifest({
  id: 'lern-dojo',
  kind: 'lobe',
  frame: 'island',
  title: { de: 'Lern-Dojo', en: 'Learning Dojo' },
  number: 4,
  verb: { de: 'LERNEN', en: 'LEARN' },
  eyebrow: { de: '// 04 · LERNEN · IMITATION & SPRACHE', en: '// 04 · LEARN · IMITATION & LANGUAGE' },
  glyph: 'band',
  // Phase 7 (plan §4.5): the real SO-101 — new goals on all three stations, so rev 2 resets their rc4
  // records (stamps stay; the rc4 C prediction moves to legacy, the zone's prediction is now in B)
  stations: [
    { id: 'vormachen', rev: 2, title: { de: 'Vormachen: Demos am SO-101', en: 'Demonstrate: demos on the SO-101' } },
    { id: 'nachmachen', star: true, rev: 2, title: { de: 'Befehlen: Sprache & Verteilung', en: 'Command: language & distribution' } },
    { id: 'datensatz-audit', rev: 2, title: { de: 'Prüfen: Datensatz je Bedingung', en: 'Check: dataset per condition' } },
  ],
  questions: [8, 6],
  album: 'policy-kopiert-fehler',
  system: 'M4',
  systemLabel: { de: 'M4 · Lern-Dojo', en: 'M4 · Learning Dojo' },
  // gate spawn looking slightly up: the demo cloud above the roof is the landmark
  spawn: { position: [0, 0, 24], yawDeg: 0, pitchDeg: 12 },
});
