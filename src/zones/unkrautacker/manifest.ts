/**
 * Manifest stub of the Unkrautacker (plan §4.11; owner WP14). Manifest only until WP14 adds index.ts:
 * the site reserves its plot and counts for the star pool, registers no stamps and builds nothing.
 * Its ◆ starts trim rotor T4 (cosmetic, never gates). Not on either objective route.
 */
import { defineManifest } from '@/core/zones';

export default defineManifest({
  id: 'unkrautacker',
  kind: 'site',
  frame: 'ground',
  title: { de: 'Unkrautacker', en: 'Weed Field' },
  stations: [{ id: 'jaeten', star: true, title: { de: 'Jäten', en: 'Weeding' }, route: { entdecker: 'skip', entscheider: 'skip' } }],
  system: 'T4',
  systemLabel: { de: 'T4 · Unkrautacker', en: 'T4 · Weed Field' },
  takeaway: { de: 'Präzision statt Gift.', en: 'Precision instead of poison.' },
});
