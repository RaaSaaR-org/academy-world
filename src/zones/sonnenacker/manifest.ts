/**
 * Eager manifest of the Sonnenacker (plan §4.10, §5.2; owner WP9): read before the title, the farm's
 * code loads once the Revier is open. Its ◆ „Erntetag“ charges the Startakku (ENERGIE, D23) and starts
 * trim rotor T3; its stamps count for the Pass and the stars, never for the rotors or the tower (D27).
 */
import { defineManifest } from '@/core/zones';

export default defineManifest({
  id: 'sonnenacker',
  kind: 'site',
  frame: 'ground',
  title: { de: 'Sonnenacker', en: 'Sun Field' },
  eyebrow: { de: '// REVIER · AGRI-PV', en: '// REVIER · AGRIVOLTAICS' },
  stations: [
    { id: 'reif-oder-nicht', title: { de: 'Reif oder nicht?', en: 'Ripe or not?' } },
    { id: 'licht-teilen', title: { de: 'Licht teilen', en: 'Sharing the light' } },
    // Entscheider: the Bodencrew supplies the Startakku after the Probestart, so the route skips the farm (D23)
    { id: 'erntetag', star: true, title: { de: 'Erntetag', en: 'Harvest day' }, route: { entscheider: 'skip' } },
  ],
  system: 'AKKU',
  systemLabel: { de: 'ENERGIE · Startakku vom Sonnenacker geladen', en: 'ENERGY · start battery charged at the Sun Field' },
  trim: 'T3',
  takeaway: { de: 'Ein Acker, zwei Ernten: Tomaten und Strom.', en: 'One field, two harvests: tomatoes and power.' },
  // at the east gate (the end of the G240 track), looking west into the farm; y above the planar terrain,
  // the teleport drops onto it (the site's plane lies ≈ 0,5–2 m above the plot anchor)
  spawn: { position: [-10, 2, 72.5], yawDeg: 0 },
});
