/** Eager manifest of zone 01 (Phase 7 plan §5.2): read before the title; the zone's code loads later. */
import { defineManifest } from '@/core/zones';

export default defineManifest({
  id: 'sensordom',
  kind: 'lobe',
  frame: 'island',
  title: { de: 'Sensordom', en: 'Sensor Dome' },
  number: 1,
  verb: { de: 'SEHEN', en: 'SEE' },
  eyebrow: { de: '// 01 · SEHEN · SENSORIK', en: '// 01 · SEE · SENSING' },
  glyph: 'sensor',
  stations: [{ id: 'messbrille' }, { id: 'dunkelkammer' }, { id: 'messstrecke', star: true }],
  questions: [9],
  album: 'spiegel-geisterpunkte',
  system: 'M1',
  systemLabel: { de: 'M1 · Sensordom', en: 'M1 · Sensor Dome' },
  // on the spoke, 8 m outside the gate: the Schleuse centred, the dome ≈ 40 % of the frame (GDD §7.1 acceptance 1)
  spawn: { position: [0, 0, 30], yawDeg: 0 },
});
