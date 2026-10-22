/**
 * Manifest stub of the Kreislaufhof (plan §4.11; owner WP14). Manifest only until WP14 adds index.ts:
 * the site reserves its plot and counts for the star pool, registers no stamps and builds nothing.
 * Its ◆ starts trim rotor T1 (cosmetic, never gates). Not on either objective route.
 */
import { defineManifest } from '@/core/zones';

export default defineManifest({
  id: 'kreislaufhof',
  kind: 'site',
  frame: 'ground',
  title: { de: 'Kreislaufhof', en: 'Circular Yard' },
  stations: [{ id: 'sortieren', star: true, title: { de: 'Sortieren', en: 'Sorting' }, route: { entdecker: 'skip', entscheider: 'skip' } }],
  system: 'T1',
  systemLabel: { de: 'T1 · Kreislaufhof', en: 'T1 · Circular Yard' },
  takeaway: { de: 'Was geschraubt ist, lässt sich reparieren.', en: 'What is screwed together can be repaired.' },
});
