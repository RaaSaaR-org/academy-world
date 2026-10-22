/**
 * The spike's three stops (WP-D0): dock, Schauhalle, Sonnenacker. Plain data (no three, no game), so the
 * stills placeholder uses it too. D1's 12 stops replace it (handle.stops). Texts are copies of existing
 * strings, each with its source; no new claims.
 */
import type { CameraRig, TourStop, Vec3 } from './types';

const D = Math.PI / 180;
/** layout.ts polar(b, r, y): bearing b (0 = north = −z, clockwise) */
const polar = (b: number, r: number, y = 0): Vec3 => [Math.sin(b * D) * r, y, -Math.cos(b * D) * r];
const anglesTo = (eye: Vec3, at: Vec3): { yawDeg: number; pitchDeg: number; d: number } => {
  const dx = at[0] - eye[0],
    dy = at[1] - eye[1],
    dz = at[2] - eye[2];
  const d = Math.hypot(dx, dy, dz);
  return { yawDeg: Math.atan2(-dx, -dz) / D, pitchDeg: Math.asin(dy / d) / D, d };
};

/** world/ground/camera.ts outsideCamera('C1', h 0, t 24): drone R-3 WSW of the dock, looking at (0, −6, 0) */
const C1_EYE = polar(246, 186, 15);
const C1_AT: Vec3 = [0, -6, 0];
const c1 = anglesTo(C1_EYE, C1_AT);
const DOCK: CameraRig = { kind: 'orbit', target: C1_AT, distance: c1.d, yawDeg: c1.yawDeg, pitchDeg: c1.pitchDeg, limits: { pitchDeg: [-40, 5], distance: [120, 320] } };

/** tools/lib/views.mjs `schauhalle`: feet (0, 0, −56) facing north, from the south door toward the north window */
const HALL: CameraRig = { kind: 'look', eye: [0, 1.7, -56], yawDeg: 0, pitchDeg: -2, limits: { yawDeg: [-80, 80], pitchDeg: [-35, 30] } };

/** the Sonnenacker's manifest spawn: the east gate (−212, 0, 70) facing west (layout.ts SITE_PLOTS, spawn [−10, 0, 78], facing 90°) */
const FIELD: CameraRig = { kind: 'look', eye: [-212, 1.7, 70], yawDeg: 90, pitchDeg: -4, limits: { yawDeg: [20, 160], pitchDeg: [-40, 25] } };

export const SPIKE_STOPS: readonly TourStop[] = [
  // „Trockendock 3“: world/start/strings.ts bridgePlaque
  { id: 'dock', title: { de: 'Trockendock 3', en: 'Dry Dock 3' }, areas: [], rig: DOCK, spots: [], card: 'spike:dock' },
  // the area's manifest title (src/zones/schauhalle/manifest.ts)
  { id: 'schauhalle', title: { de: 'Schauhalle Nord', en: 'Showroom North' }, areas: ['schauhalle'], rig: HALL, via: [[0, 4, -36]], spots: [], card: 'spike:schauhalle' },
  // src/zones/sonnenacker/manifest.ts
  { id: 'sonnenacker', title: { de: 'Sonnenacker', en: 'Sun Field' }, areas: ['sonnenacker'], rig: FIELD, spots: [], card: 'spike:sonnenacker' },
];

/**
 * Placeholder card texts, copied (D1's generated content replaces them):
 *  dock        core.start.kicker, core.brand.tagline, core.start.subtitle (src/i18n/core.ts)
 *  schauhalle  the manifest's eyebrow (src/zones/schauhalle/manifest.ts)
 *  sonnenacker the manifest's eyebrow and takeaway (src/zones/sonnenacker/manifest.ts)
 */
export const SPIKE_TEXT = {
  dock: {
    eyebrow: { de: '// Schwebewerk · Insel 17', en: '// The Floating Works · Island 17' },
    title: { de: 'Messung statt Marketing.', en: 'Measurement, not marketing.' },
    body: {
      de: 'Eine Insel, die fliegen soll – noch steht sie im Dock. Probier aus, wie Roboter sehen, regeln, greifen und lernen, miss, was Physical AI heute kann, und bring sie in die Luft.',
      en: 'An island built to fly, still standing in its dock. Try how robots see, control, grasp and learn, measure what Physical AI can do today, and get it into the air.',
    },
  },
  schauhalle: { eyebrow: { de: '// SCHAUHALLE · ECHTE ROBOTER', en: '// SHOWROOM · REAL ROBOTS' } },
  sonnenacker: {
    eyebrow: { de: '// REVIER · AGRI-PV', en: '// REVIER · AGRIVOLTAICS' },
    body: { de: 'Ein Acker, zwei Ernten: Tomaten und Strom.', en: 'One field, two harvests: tomatoes and power.' },
  },
} as const;
