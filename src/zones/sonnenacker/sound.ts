/**
 * Sonnenacker — the farm's sounds (plan §6.1 juice; R8 §2.9): servo whirrs of the arms (the nearest few
 * only), the wooden „tock“ of a full tray in the crate (the progress bar of „Erntetag“), the motor
 * chorus when the roof turns into its Schutzstellung, the bumblebee buzz at the boxes, the patter of
 * the hail on unsheltered leaves (station B), the two-tone call for help, a soft splat. All procedural
 * on the zone bus (fades with the distance to the plot), positional where it has a place.
 */
import type { LoopHandle, Vec3Input, ZoneContext } from '@/core/zones';
import { JUICE, SITE } from './tuning';

export interface FarmSound {
  pick(at: Vec3Input, ok: boolean): void;
  tock(at: Vec3Input): void;
  chorus(on: boolean, at?: Vec3Input): void;
  hail(on: boolean, at?: Vec3Input): void;
  call(at: Vec3Input): void;
  answer(at: Vec3Input): void;
  splat(at: Vec3Input): void;
  leaf(at: Vec3Input): void;
  /** the bumblebee boxes: positional buzz while the player is near */
  update(dt: number, playerLocal: { x: number; z: number }): void;
  dispose(): void;
}

export function createSound(ctx: ZoneContext, y: (x: number, z: number) => number): FarmSound {
  const A = ctx.audio;
  let chorusLoop: LoopHandle | null = null;
  let hailTimer: (() => void) | null = null;
  const bees: (LoopHandle | null)[] = SITE.bees.map(() => null);
  let picks = 0;
  let pickWindow = 0;
  return {
    pick(at, ok) {
      // at most four servo sounds per second: the farm hums, it does not rattle
      if (picks >= 4) return;
      picks++;
      A.tone({ freq: ok ? 520 : 430, to: ok ? 760 : 300, dur: 0.18, type: 'triangle', volume: 0.08, at });
    },
    tock(at) {
      A.tone({ freq: JUICE.tockHz, to: JUICE.tockHz * 0.62, dur: 0.07, type: 'triangle', volume: 0.5, at });
      A.play('thud', { volume: 0.28, pitch: 1.6, at });
    },
    chorus(on, at) {
      if (on && !chorusLoop) chorusLoop = A.loop('servo', { at: at ?? [0, 3.5, 28], volume: 0.55, pitch: 0.42 });
      else if (!on && chorusLoop) {
        chorusLoop.stop();
        chorusLoop = null;
      }
    },
    hail(on, at) {
      hailTimer?.();
      hailTimer = null;
      if (!on) return;
      // a patter of soft clicks on the leaves (the season's hail front, FIKTION)
      hailTimer = ctx.every(0.045, () => {
        if (Math.random() < 0.55) A.play('type', { volume: 0.18 + Math.random() * 0.12, pitch: 0.7 + Math.random() * 0.8, at });
      });
    },
    call(at) {
      A.tone({ freq: 660, dur: 0.12, type: 'sine', volume: 0.45, at });
      ctx.after(0.16, () => A.tone({ freq: 880, dur: 0.16, type: 'sine', volume: 0.45, at }));
    },
    answer(at) {
      A.tone({ freq: 523, to: 784, dur: 0.22, type: 'triangle', volume: 0.35, at });
    },
    splat(at) {
      A.play('drop', { volume: 0.35, pitch: 0.55, at });
    },
    leaf(at) {
      A.play('whoosh', { volume: 0.2, pitch: 1.8, at });
    },
    update(dt, p) {
      pickWindow += dt;
      if (pickWindow >= 1) {
        pickWindow = 0;
        picks = 0;
      }
      SITE.bees.forEach(([x, z], i) => {
        const near = Math.hypot(p.x - x, p.z - z) < 18;
        if (near && !bees[i]) bees[i] = A.loop('hum', { at: [x, y(x, z) + 1.0, z], volume: 0.32, pitch: 2.6 });
        else if (!near && bees[i]) {
          bees[i]!.stop();
          bees[i] = null;
        }
      });
    },
    dispose() {
      chorusLoop?.stop();
      hailTimer?.();
      for (const b of bees) b?.stop();
    },
  };
}
