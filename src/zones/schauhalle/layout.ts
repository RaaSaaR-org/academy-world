/**
 * Hall-local layout of the Schauhalle Nord (plan §4.9, §2.3; R4 §7.2). Local frame = world minus the
 * anchor (0, 0, −66): x east, z south, the south front (z +14, world −52) faces the ring path and the hub,
 * the north front (z −14) the Glasbalkon and the cloud window. The central aisle (x −2.2…2.2) continues
 * the north spoke from the south door to the north door. Robot plinths are in data/robots.ts.
 *
 *            N  z −14  ┌──── Glasfront · Wolkenfenster · Nordtür ────┐
 *   Vitrine · Pannen  │ TRESOR H2   ║   ◎ A  ◎ B      SELBST BAUEN │ Danke
 *   Größenwand        │ GEHEN       ║   GREIFEN & FAHREN           │
 *   (west wall)       │             ║ ▣ Kistenwaage   FANUC        │
 *            S  z +14  └ Empfang · Lastenheft ║ Eingang ║ Kurzlauf ×3┘
 */

/** the rect and its height (9 m clear under the roof frame of WP12 at y 9.3) */
export const HALL = { x0: -15, x1: 15, z0: -14, z1: 14, roofY: 9.3, clearY: 8.88, wall: 0.12 } as const;
/** sliding glass doors (plan §4.9: entered from the ring path, left by the north door) */
export const DOORS = {
  south: { x0: -2.0, x1: 2.0, z: 14, h: 3.2 },
  north: { x0: -1.5, x1: 1.5, z: -14, h: 2.9 },
} as const;
export const AISLE = { x0: -2.2, x1: 2.2 } as const;

/** the frosted side walls (toward 02 west and 03 east) start above this sill of solid panel */
export const FROST = { sill: 0.9 } as const;

/** Größenwand (R4 §7.3, R6): the line-up along the west wall, sorted by height from the entrance north */
export const WALL = {
  boardX: -14.62,
  z0: 13.4,
  z1: -3.4,
  height: 2.6,
  /** the line-up's centre line and where its x = 0 (the smallest robot) lands */
  lineupX: -13.15,
  lineupZ0: 12.0,
  /** the two figures before the small end: „Du“ 1.75 m (eye 1.65) and EMI 1.55 m */
  duZ: 13.15,
  emiZ: 12.55,
  figureX: -13.5,
  /** the „Du“ floor mark where you stand to compare */
  markAt: [-11.6, 12.4] as readonly [number, number],
} as const;

/** reception desk with the Lastenheft terminal, just inside the entrance (west of the door) */
export const RECEPTION = { at: [-5.2, 10.7] as readonly [number, number], w: 2.6, d: 0.8, h: 1.05, terminalAt: [-4.3, 10.7] as readonly [number, number] } as const;

/** Bühne A (the delivery and compare stage, roof hatch above) and Bühne B */
export const STAGES = {
  a: [3.8, -11.2] as readonly [number, number],
  b: [7.0, -11.2] as readonly [number, number],
  r: 1.2,
  h: 0.22,
  console: [5.4, -8.7] as readonly [number, number],
  hatch: { x: 3.8, z: -11.2, size: 3.0 },
} as const;

/** the Tresor: the H2 under its cover in front of the north window (data/robots.ts has its plinth) */
export const TRESOR = { at: [-3.6, -11.0] as readonly [number, number] } as const;

/** Pannen-Wand + Fundvitrine on the north part of the west wall (R9 §5: next to each other) */
export const PANNEN = { x: -14.55, z0: -4.4, z1: -8.6, y0: 0.9, y1: 2.3 } as const;
export const VITRINE = { x: -14.1, z0: -9.2, z1: -13.4, depth: 0.9, cols: 5, rows: 5, y0: 0.55, y1: 2.15 } as const;

/** the „Danke“ room (egg 15 „Werkbank der Offenen“, R9 §5 #15): a room behind the SELBST BAUEN pylon */
export const DANKE = { x0: 10.9, x1: 15, z0: -14, z1: -9.3, door: { x0: 12.4, x1: 13.6, h: 2.4 } } as const;
export const PYLONS = {
  gehen: [-2.9, 8.6] as readonly [number, number],
  greifen: [2.9, 8.6] as readonly [number, number],
  bauen: [10.4, -9.5] as readonly [number, number],
  size: [0.42, 3.4, 0.42] as readonly [number, number, number],
} as const;

/** Kistenwaage (R4 §7.3): the rack of loads at the aisle and three load points on green models (C2 m9) */
export const KISTEN = {
  rack: [1.75, 5.4] as readonly [number, number],
  /** a post with a hook plate beside each load-point robot; the plate's sensor reads the loads on it */
  posts: {
    'fanuc-r2000ic-165f': [3.75, 5.9] as readonly [number, number],
    'anymal-d': [-3.35, 4.0] as readonly [number, number],
    ur5e: [3.2, -3.0] as readonly [number, number],
  },
  plateY: 0.86,
} as const;

/** the Schaufenster's three Kurzlauf stands, along the south glass east of the door, screens facing north */
export const KURZLAUF = {
  belohnung: [4.6, 11.4] as readonly [number, number],
  erntetag: [7.9, 11.4] as readonly [number, number],
  traumdaten: [11.2, 11.4] as readonly [number, number],
  w: 1.9,
} as const;

/** EMI-01 talks over the radio here (no body in the hall, plan §4.9) */
export const ENTRY_TRIGGER = { z: 12.6 } as const;
