/**
 * „Lauf, Ente!" juice (R2 §6.9): the falls of a generation as ONE aggregated clatter whose density
 * follows the falls (64 soft „plocks" at generation 1), the hero's servo whine (pitch follows joint
 * speed) with foot taps on contact, the rubber duck's squeak (egg 10) and the slow-motion swell.
 * Everything through ctx.audio (the zone bus), so the levels stay inside the cues/zones targets.
 */
import type { LoopHandle, ZoneContext } from '@/core/zones';
import type * as THREE from 'three';

export interface DuckSound {
  /** n ducks fell this frame near `at` (zone-local) */
  falls(n: number, at: [number, number, number]): void;
  /** hero joint speed (rad/s, summed |q̇|) and whether a foot just touched down */
  hero(on: boolean, jointSpeed: number, tap: boolean, at: THREE.Object3D | null, tapAt?: [number, number, number]): void;
  squeak(at: [number, number, number]): void;
  slowmo(at: [number, number, number]): void;
  /** end of a generation's replay: a short tone, higher for a longer median distance */
  genEnd(median: number, at: [number, number, number]): void;
  stop(): void;
}

export function createDuckSound(ctx: ZoneContext): DuckSound {
  let pending = 0;
  let nextAt = 0;
  let servo: LoopHandle | null = null;
  let servoAt: THREE.Object3D | null = null;
  return {
    falls(n, at) {
      pending += n;
      const now = ctx.time.elapsed;
      if (pending <= 0 || now < nextAt) return;
      // one soft thump per slot; louder and lower the more ducks fall together (≤ 25 per second)
      const k = Math.min(1, Math.log2(1 + pending) / 6);
      ctx.audio.tone({ freq: 210 - 70 * k, to: 70, dur: 0.07 + 0.05 * k, type: 'sine', volume: 0.35 + 0.5 * k, at });
      if (pending > 3) ctx.audio.play('thud', { volume: 0.25 + 0.4 * k, pitch: 1.5 - 0.4 * k, at });
      pending = 0;
      nextAt = now + 0.04;
    },
    hero(on, speed, tap, at, tapAt) {
      if (!on || !at) {
        servo?.setVolume(0, 0.15);
        return;
      }
      if (!servo || servo.stopped || servoAt !== at) {
        servo?.stop();
        servo = ctx.audio.loop('servo', { at, volume: 0, pitch: 0.9 });
        servoAt = at;
      }
      const s = Math.min(1, speed / 25);
      servo.setVolume(0.08 + 0.32 * s, 0.08);
      servo.setPitch(0.8 + 0.9 * s);
      if (tap) ctx.audio.tone({ freq: 1400, to: 900, dur: 0.025, type: 'triangle', volume: 0.25, at: tapAt });
    },
    squeak(at) {
      // rubber duck: a short FM-ish sweep up and back down
      ctx.audio.tone({ freq: 900, to: 1500, dur: 0.09, type: 'square', volume: 0.35, at });
      ctx.after(0.09, () => ctx.audio.tone({ freq: 1500, to: 700, dur: 0.14, type: 'square', volume: 0.3, at }));
    },
    slowmo(at) {
      ctx.audio.play('whoosh', { pitch: 0.55, volume: 0.55, at });
      ctx.audio.tone({ freq: 110, to: 55, dur: 1.6, type: 'sine', volume: 0.45, at });
    },
    genEnd(median, at) {
      const base = 300 * Math.pow(2, Math.max(0, Math.min(1.2, median)) / 0.8);
      [1, 1.26, 1.5].forEach((m, i) => ctx.after(i * 0.07, () => ctx.audio.tone({ freq: base * m, dur: 0.14, type: 'triangle', volume: 0.6, at })));
    },
    stop() {
      servo?.stop();
      servo = null;
      servoAt = null;
    },
  };
}
