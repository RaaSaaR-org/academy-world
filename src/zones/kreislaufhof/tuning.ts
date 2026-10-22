/**
 * Kreislaufhof tunables (plan §6.1; WP20 edits only this file): the hall, the sorting line, the delta
 * picker, the repair bench, timings and juice. Local coordinates of the plot (src/world/layout.ts: the
 * 60 × 30 m rect, local +z toward the hub), y from the hall's floor. The model's numbers are in sim.ts.
 */
export const K = {
  hall: {
    w: 60,
    d: 30,
    /** wall height (the roof rises to the north light) */
    h: 7.6,
    wall: 0.35,
    /** the door on the hub side (local +z) */
    door: { x: 0, w: 10, h: 5.2 },
    /** the floor stands this far above the highest terrain under the hall */
    floorLift: 0.14,
  },
  /** the sorting line: belt top height, its axis (z), from the infeed to the end (x), the camera, the picker */
  line: {
    y: 0.95,
    z: 4,
    width: 0.8,
    x0: -24,
    x1: -9,
    camX: -21,
    pickX: -15,
    /** belt speed (m/s) at 1×; the gaps between pieces at the infeed (s, min … max) */
    speed: 0.75,
    gap: [0.72, 1.06] as [number, number],
    /** the aluminium bin behind the belt, the rest container at the end */
    bin: { x: -15, z: 2.45, w: 1.3, d: 1.0, h: 0.75 },
    rest: { x: -8, z: 4, w: 1.4, d: 1.4, h: 0.85 },
    /** the console you operate (a lectern facing the line) */
    console: { x: -15, z: 7.8 },
    /** speeds the player can choose */
    fast: 2,
  },
  /** the delta picker: top centre, base and effector radii, upper and lower arm lengths, cycle */
  picker: { top: [-15, 2.55, 3.25] as [number, number, number], rb: 0.32, re: 0.1, l1: 0.5, l2: 1.25, hoverY: 1.42, grabY: 1.07, binY: 1.2, cycle: { track: 0.28, grab: 0.06, carry: 0.24, back: 0.16 } },
  /** the repair bench: centre, top height; device spots and the crates beside it */
  bench: {
    x: 12.1,
    z: 5,
    w: 2.6,
    d: 1.0,
    top: 0.92,
    arm: [12.1, 4.86] as [number, number],
    deviceA: [11.82, 4.9] as [number, number],
    deviceB: [12.38, 4.9] as [number, number],
    crates: [
      { id: 'reuse', x: 14.4, z: 5.2 },
      { id: 'akku', x: 15.3, z: 5.2 },
      { id: 'pcb', x: 16.2, z: 5.2 },
      { id: 'plastic', x: 17.1, z: 5.2 },
    ] as const,
    shredder: { x: 18.6, z: 5.0 },
    /** the SO-101's unscrewing: per screw (s) */
    screwS: 1.15,
  },
  /** EMI-09 waits by the door, inside */
  emi: [2.5, 0, 10.5] as [number, number, number],
  /** warm work light (rule 7): two virtual lights over the stations */
  lights: [
    [-15, 6.2, 4.5],
    [13, 6.2, 4.5],
  ] as [number, number, number][],
  juice: {
    /** the score popup over a piece passing the camera (s) */
    scorePopupS: 1.1,
    /** EMI's remarks about the threshold: at most one per … s */
    remarkEveryS: 14,
  },
};
