import type { ZoneContext } from '@/core/zones';
import type { GroundHandle } from '../ground';
import type { Sky } from '../sky';
import { island } from '../start/contract';

/**
 * The dock state (Phase 7 plan §4.15 „State after“, D25): docked again the island is at h = 0 in its day
 * look, the arms hold it, the bridge is out, the sky dressing hidden and the rotors back on their state.
 * One code path for „Zurück ins Dock“ on the Ausguck console, the first half of „Start wiederholen“ and
 * „Abheben ansehen“, and the title's „Im Dock weiterspielen“ (WP1 sets the flight; the finale's eager
 * stand-in follows it here). Eager code: it works before the finale chunk is loaded.
 */
export interface DockDeps {
  ground: () => GroundHandle | null;
  sky: () => Sky | null;
}

/** While the lift-off (or its replay, or the dock switch) runs, a 'flight:state' → ground is the sequence's own. */
export const liftoffLock = { running: false };

/** Put the island back in its dock (the quest's flight is set by the caller or already 'ground'). */
export function applyDocked(ctx: ZoneContext, deps: DockDeps): void {
  ctx.island.setTilt(0, 0);
  ctx.island.setAltitude(0);
  // dock mode is day (§5.7): the dusk params go back to the day look
  ctx.events.emit('finale:dusk', { t: 0 });
  ctx.env.holdEnvMap(false);
  ctx.audio.setAmbienceFilter(null, 0.3);
  island.rotors.reset();
  const g = deps.ground();
  g?.setArms(0);
  g?.setBridge(0);
  if (g) for (let i = 0; i < 6; i++) g.spray.setPlume(i as 0, false);
  deps.sky()?.reveal(0);
  // the trackers (island, farm) go back to the sun; WP4's robot prefetch resumes
  ctx.events.emit('flight:phase', { name: 'dusk', t: 0, h: 0 });
}

/** The airborne state after a reload or a skip from outside the sequence: h at the level-off, the sky dressing shown. */
export function applyAirborne(ctx: ZoneContext, deps: DockDeps, h: number): void {
  ctx.island.setAltitude(h);
  deps.sky()?.reveal(1);
  const g = deps.ground();
  g?.setArms(1);
  g?.setBridge(1);
}
