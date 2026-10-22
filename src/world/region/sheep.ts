/**
 * The sheep under the Unkrautacker's vertical PV fences (plan §4.11: pasture is a listed use of a Cat. II
 * agrivoltaic site, R8 §3.2 [S2]). Twelve faceless sheep, one instanced draw (the ground program's
 * instanced variant). Each keeps to its lane between two fence rows: walk, graze, walk on. They only move
 * while you are on the ground within 250 m (15 Hz); the lift-off's downwash sends them trotting away from
 * the dock for a few seconds (R9 §4 L17: the region reacts). Reduced motion: they graze in place.
 */
import * as THREE from 'three';
import type { ZoneContext } from '@/core/zones';
import { BOX, GroundBatch, ICO, instanced, mat4, rng, type RegionLook } from './look';
import { R } from './tuning';

const C = R.color;
/** the pasture lanes between the fence rows (x centres), and the lanes' north–south extent */
const LANES = [-320, -310, -300, -290, -280];
const Z0 = -322,
  Z1 = -198;

interface Sheep {
  x: number;
  z: number;
  yaw: number;
  lane: number;
  tx: number;
  tz: number;
  graze: number;
  bob: number;
}

export interface Flock {
  readonly mesh: THREE.InstancedMesh;
  update(dt: number, active: boolean): void;
  scatter(): void;
  /** the flock's centre (sound, map) */
  centre(out: THREE.Vector3): THREE.Vector3;
}

export function buildFlock(ctx: ZoneContext, parent: THREE.Object3D, look: RegionLook): Flock {
  const r = rng(808);
  const t = new GroundBatch();
  t.add(ICO, look.s(C.wool, 1, 0, 1), mat4(0, 0.62, 0, 0, 0.42, 0.34, 0.62));
  t.add(BOX, look.s(C.woolDark, 0.9), mat4(0, 0.72, 0.62, 0, 0.2, 0.24, 0.32));
  for (const [x, z] of [
    [-0.2, -0.35],
    [0.2, -0.35],
    [-0.2, 0.35],
    [0.2, 0.35],
  ])
    t.add(BOX, look.s(C.woolDark, 0.9), mat4(x, 0.22, z, 0, 0.08, 0.44, 0.08));
  const n = R.sheep.count;
  const mesh = instanced(t, look, 'region:sheep', n, { cast: false });
  parent.add(mesh);

  const flock: Sheep[] = [];
  for (let i = 0; i < n; i++) {
    const lane = i % LANES.length;
    const x = LANES[lane] + (r() - 0.5) * 5,
      z = Z0 + r() * (Z1 - Z0);
    flock.push({ x, z, yaw: r() * Math.PI * 2, lane, tx: x, tz: z, graze: r() * 6, bob: r() * 6 });
  }
  const _m = new THREE.Matrix4(),
    _q = new THREE.Quaternion(),
    _e = new THREE.Euler(),
    _p = new THREE.Vector3(),
    one = new THREE.Vector3(1, 1, 1);
  const write = (): void => {
    for (let i = 0; i < n; i++) {
      const s = flock[i];
      const nod = s.graze > 0 ? 0.18 + Math.sin(s.bob * 1.7) * 0.06 : 0;
      _q.setFromEuler(_e.set(nod, s.yaw, 0, 'YXZ'));
      mesh.setMatrixAt(i, _m.compose(_p.set(s.x, look.y(s.x, s.z), s.z), _q, one));
    }
    mesh.instanceMatrix.needsUpdate = true;
  };
  write();
  mesh.computeBoundingSphere();

  let scatterT = 0;
  let acc = 0;
  return {
    mesh,
    update(dt, active) {
      if (!active && scatterT <= 0) return;
      acc += dt;
      const step = 1 / R.rate.sheep;
      if (acc < step) return;
      const h = Math.min(acc, 0.25);
      acc = 0;
      const rm = ctx.settings.reducedMotion;
      for (const s of flock) {
        s.bob += h;
        if (scatterT > 0 && !rm) {
          // away from the dock (the downwash front comes from there), kept in the lane
          const d = Math.hypot(s.x, s.z) || 1;
          s.z = THREE.MathUtils.clamp(s.z + (s.z / d) * 2.2 * h, Z0, Z1);
          s.yaw = Math.atan2(s.x / d, s.z / d);
          s.graze = 0;
          continue;
        }
        if (s.graze > 0) {
          s.graze -= h;
          if (s.graze <= 0 && !rm) {
            s.tx = LANES[s.lane] + (r() - 0.5) * 6;
            s.tz = THREE.MathUtils.clamp(s.z + (r() - 0.5) * 16, Z0, Z1);
          }
          continue;
        }
        const dx = s.tx - s.x,
          dz = s.tz - s.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.2 || rm) {
          s.graze = R.sheep.grazeS[0] + r() * (R.sheep.grazeS[1] - R.sheep.grazeS[0]);
          continue;
        }
        const want = Math.atan2(dx, dz);
        let dy = want - s.yaw;
        dy = Math.atan2(Math.sin(dy), Math.cos(dy));
        s.yaw += THREE.MathUtils.clamp(dy, -2 * h, 2 * h);
        const v = Math.min(d, R.sheep.speed * h);
        s.x += Math.sin(s.yaw) * v;
        s.z += Math.cos(s.yaw) * v;
      }
      scatterT = Math.max(0, scatterT - h);
      write();
    },
    scatter() {
      scatterT = R.sheep.scatterS;
    },
    centre(out) {
      let x = 0,
        z = 0;
      for (const s of flock) {
        x += s.x;
        z += s.z;
      }
      return out.set(x / n, look.y(x / n, z / n), z / n);
    },
  };
}
