import { CLIMB } from '../tuning';

/**
 * The climb of the lift-off (R5 §5.3, timeline.py; plan §4.15), as a pure step: the island's own
 * controller follows a climb command. Holding E (or EMI-01 holding it for you) commands the climb:
 * accelerate at a = (T − W)/m = 0.05 g (T/W 1.05) up to 9.81 m/s, cruise (T = W), and brake at the same
 * 0.05 g so it stops at the level-off, 570 m. Releasing E commands a hover: the controller brakes (up to
 * 0.35 g, a short critically damped tail) and holds the altitude. Thrust is reported as T/W (FIKTION).
 *
 * With E held from the lift-off at t = 22 s: h 98 m at 42 s, the eye in the cloud 61–67 s, the deck out
 * of it at 72 s, braking from 80 s, the level-off at 100 s (as R5's beat sheet).
 */
export interface ClimbState {
  /** altitude over the dock (m) */
  h: number;
  /** climb rate (m/s) */
  v: number;
  /** acceleration (m/s²) of the last step */
  a: number;
  /** thrust / weight of the last step */
  tw: number;
}

export const climbState = (): ClimbState => ({ h: 0, v: 0, a: 0, tw: 1 });

/** the commanded climb rate while climbing: the cruise, capped by the braking curve to the level-off */
function vCommand(h: number): number {
  const left = Math.max(0, CLIMB.levelOff - h);
  return Math.min(CLIMB.cruise, Math.sqrt(2 * CLIMB.accel * left));
}

/** Advance by dt (s). `climb`: E held (or EMI-01 holds it); else the controller holds the altitude. */
export function stepClimb(s: ClimbState, dt: number, climb: boolean): void {
  if (dt <= 0) return;
  // sub-steps keep the braking curve exact at a low frame rate (the director's dt is ≤ 0.1 s)
  const n = Math.max(1, Math.ceil(dt / (1 / 120)));
  const h0 = dt / n;
  let aSum = 0;
  for (let i = 0; i < n; i++) {
    let a: number;
    if (climb) {
      const vc = vCommand(s.h);
      // bang-bang at ±0.05 g, smooth within the last 0.1 m/s (no chatter at the cruise)
      a = Math.max(-CLIMB.accel, Math.min(CLIMB.accel, (vc - s.v) / 0.2));
    } else a = Math.max(-CLIMB.brake, Math.min(CLIMB.accel, -s.v / CLIMB.brakeTau));
    s.v += a * h0;
    if (s.v < 0 && climb) s.v = 0;
    s.h += s.v * h0;
    aSum += a;
    if (s.h >= CLIMB.levelOff) {
      s.h = CLIMB.levelOff;
      s.v = 0;
    }
    if (s.h < 0) {
      s.h = 0;
      s.v = Math.max(0, s.v);
    }
  }
  s.a = aSum / n;
  s.tw = 1 + s.a / CLIMB.g;
}

/** At the level-off (h 570, at rest). */
export const levelled = (s: ClimbState): boolean => s.h >= CLIMB.levelOff - 0.01 && Math.abs(s.v) < 0.01;
