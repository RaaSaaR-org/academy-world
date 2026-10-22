/**
 * Eager manifest of the Schauhalle Nord (plan §4.9, §5.2; owner WP11): read before the title, the hall's
 * code loads later. One station, the Lastenheft (★, three stars in the pool, §3.1); no system: the hall
 * starts no rotor (D28). The Entscheider „Schaufenster“ is a route stop, not a station (D41, layout.ts
 * ROUTE_STEPS); its Lastenheft is skipped on that route by the default role.
 */
import { defineManifest } from '@/core/zones';

export default defineManifest({
  id: 'schauhalle',
  kind: 'hall',
  frame: 'island',
  title: { de: 'Schauhalle Nord', en: 'Showroom North' },
  eyebrow: { de: '// SCHAUHALLE · ECHTE ROBOTER', en: '// SHOWROOM · REAL ROBOTS' },
  stations: [{ id: 'lastenheft', title: { de: 'Lastenheft', en: 'Requirements sheet' } }],
  spawn: { position: [0, 0, 17], yawDeg: 0 },
});
