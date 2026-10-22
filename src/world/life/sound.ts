/**
 * WP15 — the life beds and one-shots (plan §4.12 L18; R9 §4.4): procedural, no files, ≤ 6 extra voices.
 *  - bumblebees: band-passed noise around 150–350 Hz with a slow tremble (bumblebees buzz-pollinate at
 *    about 100–400 Hz, R9 S30), one loop at the nearer hive;
 *  - the farm bed: drip irrigation (narrow-band pink noise with grains), louder in the Hof-Takt's
 *    irrigation phase;
 *  - one-shots: a sonication buzz, bird chirps (FM sweeps, ≤ 2 at a time, imitating no recorded song),
 *    wing flaps when a flock flushes, a soft whoosh when someone waves.
 * The region's own beds (wind in grass, the far train) are WP14's.
 */
import * as THREE from 'three';
import { registerLoopKind, type LoopHandle } from '@/systems/Audio';
import type { ZoneContext } from '@/core/zones';
import type { Director } from './director';

const BEES = registerLoopKind(
  'life-bees',
  (k) => {
    // two band-passed noise layers with a slow amplitude tremble, and a soft fundamental
    const n = k.noise();
    const b1 = k.filter('bandpass', 240, 6);
    const b2 = k.filter('bandpass', 330, 9);
    const am = k.ctx.createGain();
    am.gain.value = 0.55;
    k.lfo(5.3, 0.25, am.gain);
    n.connect(b1).connect(am);
    n.connect(b2).connect(am);
    const o = k.osc('sawtooth', 214);
    k.lfo(0.7, 14, o.frequency);
    const lp = k.filter('lowpass', 520, 0.7);
    const og = k.ctx.createGain();
    og.gain.value = 0.18;
    o.connect(lp).connect(og).connect(am);
    am.connect(k.out);
  },
  // narrow band-passed noise keeps little energy: calibrated to the zone-loop target at 1–3 m (LEVEL_TARGETS)
  { base: 0.85 },
);

const DRIP = registerLoopKind(
  'life-drip',
  (k) => {
    const n = k.noise();
    const bp = k.filter('bandpass', 2600, 3.5);
    const g = k.ctx.createGain();
    g.gain.value = 0.25;
    // grains: a fast tremolo with a slow drift reads as dripping water
    k.lfo(9.5, 0.22, g.gain);
    k.lfo(0.23, 400, bp.frequency);
    n.connect(bp).connect(g).connect(k.out);
  },
  { base: 0.5 },
);

export interface LifeSounds {
  greet(at: THREE.Vector3): void;
  /** the buzz of a bumblebee on a flower (near only) */
  buzz(at: THREE.Vector3): void;
  chirp(at: THREE.Vector3): void;
  flush(at: THREE.Vector3): void;
  /** the bees' bed follows the nearer hive (an anchor under the ground root) */
  beesAt(anchor: THREE.Object3D | null, volume: number): void;
  dripAt(anchor: THREE.Object3D | null, volume: number): void;
}

export function buildSounds(ctx: ZoneContext, D: Director): LifeSounds {
  const A = ctx.audio;
  let bees: LoopHandle | null = null;
  let beesAnchor: THREE.Object3D | null = null;
  let drip: LoopHandle | null = null;
  let dripAnchor: THREE.Object3D | null = null;
  let chirping = 0;
  const p = (v: THREE.Vector3): [number, number, number] => {
    // ground-frame points to world (the ground root sits at y = −h)
    return [v.x, v.y - D.altitude, v.z];
  };
  const loopAt = (kind: typeof BEES | typeof DRIP, h: LoopHandle | null, anchor: THREE.Object3D | null, cur: THREE.Object3D | null, volume: number): LoopHandle | null => {
    if (!anchor || volume <= 0.001) {
      if (h) h.setVolume(0, 0.6);
      return h;
    }
    if (!h || h.stopped || anchor !== cur) {
      h?.stop();
      h = A.loop(kind, { at: anchor, volume, refDistance: 2.5, maxDistance: 22, bus: 'ambience' });
    } else h.setVolume(volume, 0.8);
    return h;
  };
  ctx.onDispose(() => {
    bees?.stop();
    drip?.stop();
  });
  return {
    greet(at) {
      A.play('whoosh', { volume: 0.07, pitch: 1.7, at: p(at) });
    },
    buzz(at) {
      A.tone({ freq: 290, to: 340, dur: 0.32, type: 'sawtooth', volume: 0.05, at: p(at) });
    },
    chirp(at) {
      if (chirping >= 2) return;
      chirping++;
      const f = 2600 + Math.random() * 900;
      A.tone({ freq: f, to: f * (1.25 + Math.random() * 0.3), dur: 0.09, type: 'sine', volume: 0.08, at: p(at) });
      ctx.after(0.13, () => {
        A.tone({ freq: f * 1.1, to: f * 0.9, dur: 0.07, type: 'sine', volume: 0.06, at: p(at) });
        chirping--;
      });
    },
    flush(at) {
      // a quick run of soft wing flaps
      for (let i = 0; i < 6; i++) ctx.after(i * 0.07 + Math.random() * 0.03, () => A.play('whoosh', { volume: 0.06, pitch: 2.2 + Math.random() * 0.6, at: p(at) }));
    },
    beesAt(anchor, volume) {
      bees = loopAt(BEES, bees, anchor, beesAnchor, volume);
      beesAnchor = anchor;
    },
    dripAt(anchor, volume) {
      drip = loopAt(DRIP, drip, anchor, dripAnchor, volume);
      dripAnchor = anchor;
    },
  };
}
