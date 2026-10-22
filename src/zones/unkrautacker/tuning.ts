/**
 * Unkrautacker tunables (plan §6.1; WP20 edits only this file): the station, the three test strips, the
 * machines, the laser toy, timings and juice. Local coordinates of the plot (layout: 200 × 150 m, local +z
 * toward the hub); y follows the terrain. The model's numbers are in sim.ts.
 */
export const U = {
  /** the field station: a timber canopy with a PV roof over the console (facing local −z, the strips) */
  station: { x: 0, z: 60 },
  console: { x: 0, z: 58.6 },
  /** the three strips A, B, C: their axis x, from the head (z0) to the end (z1), bed width */
  strips: { x: [-4.5, 0, 4.5] as [number, number, number], z0: 54, z1: 44, w: 1.7 },
  /** where the machines wait (x, z), facing −z */
  park: { hoe: [-10.5, 55.5], spray: [-15.5, 55.5], laser: [10.5, 55.5] } as Record<'hoe' | 'spray' | 'laser', [number, number]>,
  /** EMI-09 by the console */
  emi: [3.2, 0, 61.6] as [number, number, number],
  /** the batch: the machines drive from their park to the strip heads (s), then the 4× pass of all three at once (≤ 8 s, plan §4.11) */
  run: { approach: 0.9, pass: 5.2 },
  /** the laser toy: seconds, the camera's height and speed along strip A, the hit radius on the ground */
  toy: { seconds: 20, height: 2.4, speed: 0.48, hitR: 0.12, beamS: 0.09 },
  juice: { verdictDelay: 0.6 },
};
