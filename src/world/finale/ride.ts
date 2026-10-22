import * as THREE from 'three';
import type { EmiHandle, ZoneContext } from '@/core/zones';
import { TOWER } from '../layout';
import type { Lift, LiftStop } from '../lift';

/**
 * Scripted lift rides that pass through the deck (FOYER ↔ KIEL, KIEL → AUSGUCK). The car
 * moves, a cinematic camera rides in it, and the player is teleported to the destination
 * at the end (the character controller cannot fly through the deck slab). EMI-01 rides
 * along (attached to the car). Reduced motion: a short fade teleport.
 */

export const STOP_Y: Record<LiftStop, number> = { foyer: 0, ausguck: TOWER.lift.stops.ausguck, kiel: TOWER.lift.stops.kiel };
const EYE = 1.7;

export interface RideOptions {
  to: LiftStop;
  duration: number;
  /** where to look at progress k (0…1) given the camera position; world point */
  look: (k: number, cam: THREE.Vector3) => THREE.Vector3;
  /** final view (deg, world yaw 0 = facing −Z) */
  endYawDeg: number;
  endPitchDeg: number;
  emi?: EmiHandle | null;
  onProgress?: (k: number, carY: number) => void;
}

/** where the rider stands in the car: near the open south side, so the car floor hides little of the view */
const RIDER: [number, number] = [0, 0.7];

export type Ticker = (fn: (dt: number) => boolean) => void;

const _dir = new THREE.Vector3();
const _b = new THREE.Vector3();
const _p = new THREE.Vector3();
const _look = new THREE.Vector3();
const _s1 = new THREE.Vector3();
const _s2 = new THREE.Vector3();

const smooth = (k: number): number => {
  const x = THREE.MathUtils.clamp(k, 0, 1);
  return x * x * x * (x * (x * 6 - 15) + 10);
};

export function dirFromYawPitch(yaw: number, pitch: number, out = new THREE.Vector3()): THREE.Vector3 {
  return out.set(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
}

export function rideLift(ctx: ZoneContext, lift: Lift, tick: Ticker, o: RideOptions): Promise<boolean> {
  return new Promise((resolve) => {
    const h = lift.takeOver();
    if (!h) {
      resolve(false);
      return;
    }
    const lx = TOWER.lift.x,
      lz = TOWER.lift.z;
    const fromY = h.car.position.y;
    const toY = STOP_Y[o.to];
    // the player's spot in the car (or the middle if they are outside)
    const [ox, oz] = RIDER;
    const unlock = ctx.player.lockControls({ look: true });
    ctx.player.release();
    const emi = o.emi ?? null;
    if (emi) {
      emi.object.position.set(lx + 0.85, fromY, lz - 0.85);
      emi.object.rotation.y = Math.PI;
      h.car.attach(emi.object);
    }
    const hum = ctx.audio.loop('hum', { at: h.car, volume: 0.65 });
    ctx.audio.tone({ freq: 523, to: 659, dur: 0.18, type: 'sine', volume: 0.7 });
    const finish = (): void => {
      hum.stop();
      ctx.audio.tone({ freq: 659, to: 523, dur: 0.22, type: 'sine', volume: 0.7 });
      h.release(o.to);
      if (emi) {
        ctx.root.attach(emi.object);
        emi.object.position.y = toY;
      }
    };

    if (ctx.settings.reducedMotion) {
      h.setY(toY);
      finish();
      ctx.player.teleport([lx + ox, toY + 0.05, lz + oz], { fade: true, yawDeg: o.endYawDeg, pitchDeg: o.endPitchDeg });
      ctx.after(0.7, () => {
        unlock();
        resolve(true);
      });
      return;
    }

    const cam = ctx.player.cinematic();
    const yaw0 = ctx.player.yaw,
      pitch0 = ctx.player.pitch;
    let t = 0;
    let ended = false;
    tick((dt) => {
      if (ended) return false;
      t += dt;
      const k = Math.min(1, t / o.duration);
      const y = fromY + (toY - fromY) * smooth(k);
      h.setY(y);
      _p.set(lx + ox, y + EYE, lz + oz);
      // blend from the player's view into the planned look within the first 1.6 s (angles, shortest turn)
      const w = smooth(t / 1.6);
      _b.copy(o.look(k, _p)).sub(_p);
      const yaw1 = Math.atan2(-_b.x, -_b.z),
        pitch1 = Math.atan2(_b.y, Math.hypot(_b.x, _b.z));
      let dy = yaw1 - yaw0;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      dirFromYawPitch(yaw0 + dy * w, pitch0 + (pitch1 - pitch0) * w, _dir);
      cam.set(_p, _look.copy(_p).add(_dir), 1);
      o.onProgress?.(k, y);
      if (k >= 1) {
        ended = true;
        finish();
        ctx.player.teleport([lx + ox, toY + 0.05, lz + oz], { yawDeg: o.endYawDeg, pitchDeg: o.endPitchDeg });
        // hand the camera back after the teleport has settled
        let frames = 0;
        tick(() => {
          frames++;
          if (frames < 3) return true;
          cam.end();
          unlock();
          resolve(true);
          return false;
        });
        return false;
      }
      return true;
    });
  });
}

/** Look plans for the three scripted rides. */
export const LOOKS = {
  /** FOYER → KIEL: south, tilting down as the keel opens up; ends on the turning core (≤ 30° down, past the car floor) */
  down: (k: number, cam: THREE.Vector3): THREE.Vector3 => _look.set(0, cam.y + THREE.MathUtils.lerp(-1.2, -6.2, smooth(k / 0.45)), 0),
  /** KIEL → FOYER: from the core up to the foyer door */
  up: (k: number, cam: THREE.Vector3): THREE.Vector3 => _look.set(0, cam.y + THREE.MathUtils.lerp(-6, -0.3, smooth(k)), 0),
  /** KIEL → AUSGUCK (ending): the core sinks away, then the view swings to the sunset (bearing 295) */
  sunset: (k: number, cam: THREE.Vector3): THREE.Vector3 => {
    const toCore = _s1.set(0, cam.y - 6, 0);
    const sun = _s2.set(cam.x - Math.sin((65 * Math.PI) / 180) * 60, cam.y - 6, cam.z - Math.cos((65 * Math.PI) / 180) * 60);
    const w = smooth((k - 0.3) / 0.35);
    return _look.copy(toCore).lerp(sun, w);
  },
};
