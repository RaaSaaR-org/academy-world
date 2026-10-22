/**
 * Manifest stub of the Traumhangar (plan §4.8; owner WP10). Manifest only until WP10 adds index.ts:
 * the hangar reserves its plot and counts for the star pool, registers no stamps and builds nothing.
 * Its ◆ „Traumdaten“ installs the Flugmodell (NAVIGATION, D23) and starts trim rotor T2.
 * A ground building: kind 'site' (ground areas load once the Revier is open); `interior` is a plot field (WP4).
 */
import { defineManifest } from '@/core/zones';

export default defineManifest({
  id: 'traumhangar',
  kind: 'site',
  frame: 'ground',
  title: { de: 'Traumhangar', en: 'Dream Hangar' },
  eyebrow: { de: '// TRÄUMEN · WELTMODELLE', en: '// IMAGINE · WORLD MODELS' },
  stations: [
    { id: 'erster-schritt', title: { de: 'Erster Schritt im Kopf', en: 'First step in the head' } },
    { id: 'voraustraeumen', title: { de: 'Wie weit vorausträumen?', en: 'How far ahead to dream?' } },
    // Entscheider: the Bodencrew supplies the Flugmodell after the Probestart, so the route skips the hangar (D23)
    { id: 'traumdaten', star: true, title: { de: 'Traumdaten', en: 'Dream data' }, route: { entscheider: 'skip' } },
    // the H2 Meisterprüfung (D21): optional, its stars never count for the pool
    { id: 'generalprobe', mastery: false, title: { de: 'Generalprobe', en: 'Dress rehearsal' }, route: { entdecker: 'skip', entscheider: 'skip' } },
  ],
  system: 'NAV',
  systemLabel: { de: 'NAVIGATION · Flugmodell an Bord', en: 'NAVIGATION · flight model aboard' },
  trim: 'T2',
  takeaway: { de: 'Erst träumen, dann messen, dann handeln.', en: 'Dream first, then measure, then act.' },
});
