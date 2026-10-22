/**
 * Schauhalle juice (plan §4 conventions: ≈ 15 % for sound, popups and timing): the hall's soft hum
 * under the glass, the turntables' whirr near a plinth, the servo whine of a Vorführung, the delivery
 * drone's rotors, the sliding doors. Everything through ctx.audio (the zone bus), positional.
 */
import type { LoopHandle, ZoneContext } from '@/core/zones';
import type * as THREE from 'three';

export interface HallSound {
  /** a robot plays its Vorführung at `at` (an object follows the robot) */
  servo(on: boolean, at: THREE.Object3D | null): void;
  drone(on: boolean, at: THREE.Object3D | null): void;
  door(at: [number, number, number]): void;
  update(dt: number, inside: boolean): void;
  stop(): void;
}

export function createHallSound(ctx: ZoneContext): HallSound {
  let hum: LoopHandle | null = null;
  let servo: LoopHandle | null = null;
  let servoAt: THREE.Object3D | null = null;
  let drone: LoopHandle | null = null;
  let doorT = 0;
  return {
    servo(on, at) {
      if (!on || !at) {
        servo?.setVolume(0, 0.4);
        return;
      }
      if (!servo || servo.stopped || servoAt !== at) {
        servo?.stop();
        servo = ctx.audio.loop('servo', { at, volume: 0, pitch: 0.7 });
        servoAt = at;
      }
      servo.setVolume(0.22, 0.3);
    },
    drone(on, at) {
      if (!on || !at) {
        drone?.setVolume(0, 0.8);
        return;
      }
      if (!drone || drone.stopped) drone = ctx.audio.loop('drone', { at, volume: 0, pitch: 1.1 });
      drone.setVolume(0.5, 0.6);
    },
    door(at) {
      if (ctx.time.elapsed - doorT < 1.2) return;
      doorT = ctx.time.elapsed;
      ctx.audio.play('whoosh', { pitch: 1.6, volume: 0.25, at });
    },
    update(_dt, inside) {
      if (inside && (!hum || hum.stopped)) hum = ctx.audio.loop('hum', { at: [0, 6, 0], volume: 0, pitch: 0.55 });
      hum?.setVolume(inside ? 0.12 : 0, 1.5);
    },
    stop() {
      hum?.stop();
      servo?.stop();
      drone?.stop();
      hum = servo = drone = null;
    },
  };
}
