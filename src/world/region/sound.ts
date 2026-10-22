/**
 * The Revier's sound beds (plan WP14 goal, R8 §4.7 rule 7: ≤ 8 region voices, distance-attenuated). Two
 * places get their own bed; life's sounds (bees, rovers, the farm) are WP15's:
 *  - the Grubenrand: wind in the old steel lattice, a faint whistle, now and then a creak of the wheel;
 *  - the Unkrautacker's pasture: a soft wind over the grass and the fences, crickets, now and then a sheep.
 * Both are procedural (no audio files) and only run while you are on the ground near them.
 */
import * as THREE from 'three';
import type { LoopHandle, ZoneContext } from '@/core/zones';
import { registerLoopKind } from '@/systems/Audio';

declare module '@/systems/Audio' {
  interface LoopKindRegistry {
    'revier-steel': true;
    'revier-meadow': true;
  }
}

let registered = false;
function registerKinds(): void {
  if (registered) return;
  registered = true;
  registerLoopKind(
    'revier-steel',
    (k) => {
      // wind through a lattice: band-passed noise breathing slowly, a thin whistle riding on it
      const n = k.noise();
      const bp = k.filter('bandpass', 520, 1.3);
      const amp = k.ctx.createGain();
      amp.gain.value = 0.55;
      k.lfo(0.11, 0.35, amp.gain);
      k.lfo(0.07, 160, bp.frequency);
      n.connect(bp).connect(amp).connect(k.out);
      const w = k.osc('sine', 233);
      const wg = k.ctx.createGain();
      wg.gain.value = 0.025;
      k.lfo(0.19, 0.022, wg.gain);
      k.lfo(0.05, 9, w.frequency);
      w.connect(wg).connect(k.out);
    },
    { base: 0.07 },
  );
  registerLoopKind(
    'revier-meadow',
    (k) => {
      // a soft wind over grass, crickets in the evening light
      const n = k.noise();
      const lp = k.filter('lowpass', 850, 0.6);
      const hp = k.filter('highpass', 140, 0.6);
      k.lfo(0.06, 300, lp.frequency);
      n.connect(hp).connect(lp).connect(k.out);
      const c = k.osc('sine', 4150);
      const cg = k.ctx.createGain();
      cg.gain.value = 0;
      const trill = k.osc('square', 28);
      const tg = k.ctx.createGain();
      tg.gain.value = 0.018;
      trill.connect(tg).connect(cg.gain);
      k.lfo(0.31, 0.012, cg.gain);
      c.connect(cg).connect(k.out);
    },
    { base: 0.05 },
  );
}

export interface RegionSound {
  update(dt: number, player: THREE.Vector3, grounded: boolean): void;
}

/** One bed at an anchor: on within `on` m, off beyond `off` m (and while not on the ground). */
export function buildSound(ctx: ZoneContext, beds: { kind: 'revier-steel' | 'revier-meadow'; at: THREE.Object3D | THREE.Vector3; on: number; off: number; extra?: (near: boolean) => void }[]): RegionSound {
  registerKinds();
  const live: { bed: (typeof beds)[number]; loop: LoopHandle | null; anchor: THREE.Object3D }[] = beds.map((bed) => {
    let anchor: THREE.Object3D;
    if (bed.at instanceof THREE.Object3D) anchor = bed.at;
    else {
      anchor = new THREE.Object3D();
      anchor.position.copy(bed.at);
      anchor.name = `region:sound:${bed.kind}`;
    }
    return { bed, loop: null, anchor };
  });
  ctx.onDispose(() => live.forEach((l) => l.loop?.stop()));
  const _p = new THREE.Vector3();
  let acc = 0;
  return {
    update(dt, player, grounded) {
      acc += dt;
      if (acc < 0.25) return;
      acc = 0;
      for (const l of live) {
        const d = player.distanceTo(l.anchor.getWorldPosition(_p));
        const want = grounded && d < l.bed.on;
        if (want && !l.loop) l.loop = ctx.audio.loop(l.bed.kind, { at: l.anchor, refDistance: 14, maxDistance: l.bed.off, volume: 1 });
        else if (l.loop && (!grounded || d > l.bed.off)) {
          l.loop.stop();
          l.loop = null;
        }
        l.bed.extra?.(!!l.loop && d < l.bed.on * 0.6);
      }
    },
  };
}
