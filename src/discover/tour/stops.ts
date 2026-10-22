/**
 * The tour's 12 stops (WP-D1, plan §3.2). Plain data (no three, no game): the stills tour reads the same
 * stops. Every pose is built from the game's own layout numbers (ANCHORS, copied by
 * tools/discover/content.mjs from layout.ts, the lift-off camera and the console) and the measured views
 * of tools/lib/views.mjs; titles are copied strings (TITLES).
 *
 * Angles as __academy.look: yaw 0 faces −Z (north), +90 faces −X (west), so facing bearing b is yaw −b;
 * pitch + looks up. An orbit rig's yawDeg is the direction the camera faces.
 */
import type { CameraRig, RigLimits, TourStop, Vec3 } from '../types';
import { ANCHORS, TITLES } from '../data/content.gen';
import { SPOTS } from './spots';

const D = Math.PI / 180;
/** layout.ts polar(b, r, y): bearing b (0 = north = −z, clockwise from above) */
export const polar = (b: number, r: number, y = 0): Vec3 => [Math.sin(b * D) * r, y, -Math.cos(b * D) * r];
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const angles = (eye: Vec3, at: Vec3): { yawDeg: number; pitchDeg: number; d: number } => {
  const dx = at[0] - eye[0],
    dy = at[1] - eye[1],
    dz = at[2] - eye[2];
  const d = Math.hypot(dx, dy, dz);
  return { yawDeg: Math.atan2(-dx, -dz) / D, pitchDeg: Math.asin(dy / d) / D, d };
};
/** an orbit around `target`, the camera facing bearing b from `distance`, pitch p (< 0 looks down) */
const orbitFacing = (target: Vec3, b: number, p: number, distance: number, limits: RigLimits): CameraRig => ({ kind: 'orbit', target, distance, yawDeg: -b, pitchDeg: p, limits });
/** a plot-local point → world (layout.ts plotSpawnWorld) */
const plotWorld = (anchor: readonly number[], facingDeg: number, p: readonly number[]): Vec3 => {
  const f = facingDeg * D,
    c = Math.cos(f),
    s = Math.sin(f);
  return [anchor[0] + p[0] * c + p[2] * s, anchor[1] + p[1], anchor[2] - p[0] * s + p[2] * c];
};
const zone = (id: string): Vec3 => ANCHORS.zones.find((z) => z.id === id)!.anchor as unknown as Vec3;
const site = (id: string) => ANCHORS.sites.find((s) => s.id === id)!;
const mid = (a: Vec3, b: Vec3, y: number): Vec3 => [(a[0] + b[0]) / 2, y, (a[2] + b[2]) / 2];

/**
 * A stop plus how its pose meets the ground and, for an interior, its door:
 *   fit   the look eye / the orbit target sits `dy` above the floor there (`terrain`: the terrain only,
 *         not a building's or a machine's own floor)
 *   door  feet just inside the door: the observer stands there while the camera flies in or out, so a
 *         door that opens for the player opens for the camera (the hall's south door, 3.2 m high)
 * `via` (TourStop) is the way in: the first point outside, the last one inside the door.
 */
export interface StopData extends TourStop {
  fit?: { dy: number; terrain?: boolean };
  door?: Vec3;
}

const EYE = 1.7;
const C1 = ANCHORS.c1;
const sonnenacker = site('sonnenacker');
const hangar = site('traumhangar');
/** the Sonnenacker's own spawn: its east gate, facing west into the farm */
const fieldEye = plotWorld(sonnenacker.anchor, sonnenacker.facingDeg, ANCHORS.sonnenackerSpawn.position);
/** inside the Traumhangar's doors (plot-local +z faces the island, bearing 312), looking in */
const hangarEye = plotWorld(hangar.anchor, hangar.facingDeg, [3, 3.2, -3]);
const hangarOut = plotWorld(hangar.anchor, hangar.facingDeg, [0, 4.5, 34]);
const hangarIn = plotWorld(hangar.anchor, hangar.facingDeg, [0, 3, 13]);
const hangarYaw = hangar.facingDeg;
/** the Ausguck deck (tools/lib/views.mjs `ausguck`): bearing 258, r 11, looking down the farm's line */
const AUS_B = 258;
const ausEye = polar(AUS_B, 11, ANCHORS.ausguckY + 0.05 + EYE);
/** a step behind the console's stand and a little higher: the whole console and the sun over the lake */
const CON_B = -ANCHORS.console.yawDeg;
const consoleEye = add(ANCHORS.console.position as unknown as Vec3, [-Math.sin(CON_B * D) * 1.5, 2.3, Math.cos(CON_B * D) * 1.5]);

const STOP_DATA: Omit<StopData, 'title' | 'spots' | 'card'>[] = [
  // 1 · from the drone R-3's side WSW of the dock (outsideCamera('C1', 0, 24): its bearing, the sun behind it),
  //     higher up, so the island's plan (plaza, lobes, tower) reads in a portrait frame; the start card
  //     orbits ATTRACT_CAMERA
  { id: 'dock', areas: [], rig: orbitFacing([0, -20, 0], -angles(C1.position as unknown as Vec3, C1.lookAt as unknown as Vec3).yawDeg, -24, 230, { pitchDeg: [-50, 5], distance: [120, 320] }) },
  // 2 · the bridge head (REVIER.spawn = view `bridgehead`): bearing 0, pitch +6
  {
    id: 'brueckenkopf',
    areas: [],
    rig: { kind: 'look', eye: add(ANCHORS.revierSpawn.position as unknown as Vec3, [0, EYE, 0]), yawDeg: -ANCHORS.revierSpawn.yawDeg, pitchDeg: ANCHORS.revierSpawn.pitchDeg, limits: { yawDeg: [-75, 75], pitchDeg: [-30, 45] } },
    fit: { dy: EYE },
  },
  // 3 · the Libelle from the plaza (view `plaza`, (0, 0, 30)), the tower behind it
  { id: 'libelle', areas: [], rig: orbitFacing(add(ANCHORS.libelle as unknown as Vec3, [0, 3.5, 0]), 0, -4, 19, { pitchDeg: [-50, 15], distance: [6, 30] }) },
  // 4 · 01 Sensordom + 06 Prüffeld: from beyond the Sensordom, along their line (both in a portrait frame), the sun behind
  { id: 'zonen-west', areas: ['sensordom', 'prueffeld'], rig: orbitFacing(mid(zone('sensordom'), zone('prueffeld'), 2), 150, -24, 118, { pitchDeg: [-60, -5], distance: [60, 200] }) },
  // 5 · 02 Regelgarten + 03 Greifwerkstatt, the hall between them: from the west, looking east
  { id: 'zonen-nord', areas: ['regelgarten', 'greifwerkstatt'], rig: orbitFacing(mid(zone('regelgarten'), zone('greifwerkstatt'), 2), 90, -24, 118, { pitchDeg: [-60, -5], distance: [60, 200] }) },
  // 6 · Schauhalle Nord (view `schauhalle`, the south door): from its south-east corner across the plinths to
  //     the north window (in portrait the aisle alone shows no robot), in through the south door
  {
    id: 'schauhalle',
    areas: ['schauhalle'],
    rig: { kind: 'look', eye: [11, 2.6, -54.5], yawDeg: 35, pitchDeg: -8, limits: { yawDeg: [-45, 115], pitchDeg: [-40, 30] } },
    via: [
      [0, 2.9, -36],
      [0, 2.4, -54],
    ],
    door: [0, 0, -53.5],
  },
  // 7 · 04 Lern-Dojo + 05 Dunkelfabrik: from beyond the Dunkelfabrik, along their line
  { id: 'zonen-ost', areas: ['lern-dojo', 'dunkelfabrik'], rig: orbitFacing(mid(zone('lern-dojo'), zone('dunkelfabrik'), 2), 30, -24, 118, { pitchDeg: [-60, -5], distance: [60, 200] }) },
  // 8 · the Ausguck (view `ausguck`): bearing 258, pitch −8, over the Revier
  { id: 'ausguck', areas: [], rig: { kind: 'look', eye: ausEye, yawDeg: -AUS_B + 360, pitchDeg: -8, limits: { yawDeg: [22, 182], pitchDeg: [-45, 25] } } },
  // 9 · the Grubenrand (LANDMARKS.grubenrand): an orbit over the pit edge, the island behind it
  { id: 'grubenrand', areas: [], rig: orbitFacing(ANCHORS.grubenrand as unknown as Vec3, 60, -14, 60, { pitchDeg: [-55, 5], distance: [25, 110] }), fit: { dy: 4, terrain: true } },
  // 10 · the Sonnenacker: over its east gate (the manifest spawn) and into the farm, facing west-north-west
  //      over the PV rows (the sun just out of the frame)
  { id: 'sonnenacker', areas: ['sonnenacker'], rig: orbitFacing([fieldEye[0] - 44.5, 0, fieldEye[2] - 18], 290, -24, 66, { pitchDeg: [-60, -5], distance: [30, 120] }), fit: { dy: 1.5, terrain: true } },
  // 11 · inside the Traumhangar, in through its doors (bearing 312), toward the robots' docks on the back wall
  {
    id: 'traumhangar',
    areas: ['traumhangar'],
    rig: { kind: 'look', eye: hangarEye, yawDeg: hangarYaw, pitchDeg: -12, limits: { yawDeg: [hangarYaw - 80, hangarYaw + 80], pitchDeg: [-40, 35] } },
    via: [hangarOut, hangarIn],
    fit: { dy: 3.2 },
    door: [hangarIn[0], 0, hangarIn[2]],
  },
  // 12 · the launch console on the Ausguck (the finale's toConsole: standPose), facing the sun
  {
    id: 'abheben',
    areas: [],
    rig: { kind: 'look', eye: consoleEye, yawDeg: ANCHORS.console.yawDeg, pitchDeg: -10, limits: { yawDeg: [ANCHORS.console.yawDeg - 90, ANCHORS.console.yawDeg + 90], pitchDeg: [-45, 30] } },
  },
];

export const STOPS: readonly StopData[] = STOP_DATA.map((s) => ({
  ...s,
  title: TITLES[s.id],
  spots: SPOTS.filter((p) => p.stops.includes(s.id)).map((p) => p.id),
  card: `stop:${s.id}`,
}));

export const stopIndex = (id: string): number => STOPS.findIndex((s) => s.id === id);
