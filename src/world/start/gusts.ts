/**
 * WP12: gusts and the island's tilt (plan §5.3 rule 4, §1.2). While docked, random gusts never tilt
 * anything: the six Haltearme catch them (`ground.catchGust`: the arms twitch with a hydraulic sigh),
 * the Libelle reads BODEN and its ball stays put. Only the Probestart (the lever) and F1 (WP13) tilt,
 * and in both the player is aboard. Airborne: rc4 (gusts every 60–90 s, ≤ 0.5° tilt, the pods lean,
 * the ball rolls). The tilt itself goes through ctx.island.setTilt (WP4 rotates the environment and
 * the ground root against it; the island never moves). Reduced motion: no visual tilt (the engine).
 */
import type { ZoneContext } from '@/core/zones';
import { DEG } from '../layout';
import type { GroundHandle } from '../ground';
import type { Underside } from '../underside';
import type { Libelle } from '../libelle';
import { GUST, PROBESTART } from './tuning';

export interface Gusts {
  update(dt: number): void;
  /** docked: the arms hold the island (no tilt from gusts) */
  readonly docked: boolean;
  /** the scripted arrival gust (§1.2 6–8 s): docked, the arms catch it */
  dockGust(): void;
  /**
   * The tilt envelope of the Probestart and the airborne Libelle toy (rc4 FUN-PLAN C4): up to A° about
   * the axis across `bearing`, damped back within 0,04°. Returns the readout's numbers (FIKTION).
   */
  toy(o?: { bearing?: number; ball?: boolean }): { max: number; seconds: number };
  /** a scripted tilt is running (the Probestart, F1): random gusts keep their hands off */
  readonly overriding: boolean;
}

export function buildGusts(ctx: ZoneContext, deps: { under: Underside; libelle: Libelle; ground: () => GroundHandle | null; airborne: () => boolean }): Gusts {
  let gust: { s: number; b: number; age: number } | null = null;
  let nextGust = GUST.everyMin * 0.75 + Math.random() * GUST.everySpread;
  let override = false;
  const docked = (): boolean => !deps.airborne() && ctx.flight.altitude <= 0.05;

  ctx.island.onGust(({ strength, bearing }) => {
    if (docked()) {
      // §5.3 rule 4: the arms catch it; you hear the sigh (the ground's), the island and the ball stay still
      deps.ground()?.catchGust(strength, bearing);
      ctx.audio.play('whoosh', { volume: 0.12 + strength * 0.18, pitch: 0.55 });
      return;
    }
    gust = { s: strength, b: bearing, age: 0 };
    deps.under.gust(strength, bearing);
    deps.libelle.gust(strength, bearing);
    ctx.audio.play('whoosh', { volume: 0.25 + strength * 0.35, pitch: 0.6 });
  });

  const toy: Gusts['toy'] = (o = {}) => {
    const A = PROBESTART.tiltMin + Math.random() * PROBESTART.tiltSpread;
    const decay = PROBESTART.decay + Math.random() * PROBESTART.decaySpread;
    const bearing = o.bearing ?? 200 + Math.random() * 140;
    // back within 0,04°: the envelope A·e^(−decay·(k − 0.25)) falls under 0.04
    const settle = 0.25 + Math.log(A / 0.04) / decay;
    if (o.ball !== false && !ctx.settings.reducedMotion) deps.libelle.gust(1, bearing);
    override = true;
    const t0 = ctx.time.elapsed;
    const bx = Math.sin(bearing * DEG),
      bz = -Math.cos(bearing * DEG);
    const stop = ctx.every(1 / 60, () => {
      const k = ctx.time.elapsed - t0;
      const a = k < 0.25 ? (k / 0.25) * A : A * Math.exp(-(k - 0.25) * decay) * Math.cos((k - 0.25) * 5.2);
      // tilt about the gust's axis: roll ~ east component, pitch ~ north component (no-op under reduced motion)
      ctx.island.setTilt(a * bx, -a * bz);
      if (k > settle + 0.2) {
        ctx.island.setTilt(0, 0);
        override = false;
        stop();
      }
    });
    return { max: Math.round(A * 100) / 100, seconds: Math.round(settle * 10) / 10 };
  };

  return {
    get docked() {
      return docked();
    },
    get overriding() {
      return override;
    },
    dockGust() {
      // docked (the arrival is always docked): the arms catch it, zones still feel the gust
      ctx.island.emitGust({ strength: GUST.dockStrength, bearing: 300 });
    },
    toy,
    update(dt) {
      nextGust -= dt;
      if (nextGust <= 0) {
        nextGust = GUST.everyMin + Math.random() * GUST.everySpread;
        ctx.island.emitGust({ strength: 0.3 + Math.random() * 0.7, bearing: Math.round(Math.random() * 360) });
      }
      if (!gust) return;
      gust.age += dt;
      const { s: str, b, age } = gust;
      if (age > 4.5) {
        gust = null;
        if (!override) ctx.island.setTilt(0, 0);
        return;
      }
      if (override) return;
      // rise 1 s, hold, fall — the controller catches it (airborne only: docked gusts never start one)
      const env = age < 1 ? age : age < 2 ? 1 : Math.max(0, 1 - (age - 2) / 2);
      const tilt = 0.5 * str * env;
      ctx.island.setTilt(Math.sin(b * DEG) * tilt, -Math.cos(b * DEG) * tilt);
    },
  };
}
