/**
 * The six Haltearme (plan WP3 build 2, §2.3, §5.3 rule 4, R5 §3.1): hydraulic clamps from the dock wall to
 * the lobe tips at 30/90/150/210/270/330. Each is a wall housing (static, in the rim batch) and a boom with a
 * clamp pad that presses on the lobe's rim; the booms are ONE instanced draw.
 *
 *  - `setArms(t)`: 0 holding … 1 stowed (the booms swing down into their wall niches, R5 release beat);
 *  - `catchGust(s)`: docked gusts never tilt the island (§5.3 rule 4); the arms catch them: a damped twitch
 *    of the booms nearest the gust and a hydraulic sigh at them. Reduced motion: the sigh only.
 */
import * as THREE from 'three';
import type { ZoneContext } from '@/core/zones';
import { DEG, TROCKENDOCK, polar } from '../layout';
import { T } from './tuning';
import { GroundBatch, mat4, type GroundMaterial } from './material';
import { wallRadius } from './outline';

export interface Arms {
  readonly mesh: THREE.InstancedMesh;
  set(t: number): void;
  catchGust(strength: number, bearing?: number): void;
  update(dt: number): void;
}

const HINGE_Y = -1.25;

export function buildArms(ctx: ZoneContext, parent: THREE.Object3D, mat: GroundMaterial, rim: GroundBatch): Arms {
  const bearings = TROCKENDOCK.arms.bearings;
  const housing = new THREE.BoxGeometry(1.5, 2.1, 0.7);
  const plate = new THREE.BoxGeometry(1.9, 0.12, 1.1);
  for (const b of bearings) {
    const r = wallRadius(b);
    const [x, , z] = polar(b, r - 0.3);
    const yaw = -b * DEG; // local +z points into the slot (toward the island)
    rim.add(housing, { color: 0x4a4541, rough: 0.5, metal: 0.4, sun: () => 0.5 }, mat4(x, -1.3, z, yaw));
    const [px, , pz] = polar(b, r - 0.15);
    rim.add(plate, { color: 0x6f6963, rough: 0.6, metal: 0.3 }, mat4(px, 0.0, pz, yaw));
  }

  // the boom (local: hinge at the origin, +z toward the island): beam, ram, joint ring (orange: it moves), pad
  const B = new GroundBatch();
  // hinge 0.5 m out of the wall (r 106 at the lobe tips) → the pad face on the lobe's rim (r 102)
  const len = TROCKENDOCK.arms.toR - 0.5 - TROCKENDOCK.arms.fromR - 0.22 + 0.04;
  const s = { sun: () => 0.55, noShade: true };
  B.add(new THREE.BoxGeometry(0.42, 0.46, len), { color: 0x3f3a36, rough: 0.46, metal: 0.4, ...s }, mat4(0, 0, len / 2));
  B.add(new THREE.CylinderGeometry(0.11, 0.11, len * 0.8, 10), { color: 0xc9c4bf, rough: 0.28, metal: 0.92, ...s }, new THREE.Matrix4().makeRotationX(Math.PI / 2).setPosition(0, 0.34, len * 0.45));
  B.add(new THREE.CylinderGeometry(0.3, 0.3, 0.62, 18), { color: 0xff6700, rough: 0.5, metal: 0.2, ...s }, new THREE.Matrix4().makeRotationZ(Math.PI / 2));
  B.add(new THREE.BoxGeometry(0.9, 0.9, 0.22), { color: 0x1c1917, rough: 0.95, ...s }, mat4(0, 0, len + 0.11));
  const boom = B.build(mat, 'ground:arms')!;
  const mesh = new THREE.InstancedMesh(boom.geometry, mat, bearings.length);
  mesh.name = 'ground:arms';
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  ctx.onDispose(() => boom.geometry.dispose());

  const base = bearings.map((b) => {
    const r = wallRadius(b);
    const [x, , z] = polar(b, r - 0.5);
    return { b, pos: new THREE.Vector3(x, HINGE_Y, z), yaw: -b * DEG, twitch: 0, vel: 0 };
  });
  let stow = 0;
  const q = new THREE.Quaternion(),
    qy = new THREE.Quaternion(),
    qx = new THREE.Quaternion(),
    one = new THREE.Vector3(1, 1, 1),
    m = new THREE.Matrix4();
  const X = new THREE.Vector3(1, 0, 0),
    Y = new THREE.Vector3(0, 1, 0);
  const write = (): void => {
    base.forEach((a, i) => {
      // stowing swings the boom down (about its local x); a twitch is a small extra swing
      const ang = stow * T.arms.stowDeg * DEG + a.twitch * DEG;
      qy.setFromAxisAngle(Y, a.yaw);
      qx.setFromAxisAngle(X, ang);
      q.multiplyQuaternions(qy, qx);
      mesh.setMatrixAt(i, m.compose(a.pos, q, one));
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  };
  write();

  let active = false;
  return {
    mesh,
    set(t) {
      const prev = stow;
      stow = THREE.MathUtils.clamp(t, 0, 1);
      // juice (R5 release beat): the hydraulics sigh when the arms start to move, six thunks as they lock
      // (stowed in the wall, or back on the lobe tips), one per arm round the dock
      if (prev === 0 && stow > 0) ctx.audio.play('whoosh', { volume: 0.32, pitch: 0.38, at: [0, -1, 0] });
      if ((prev < 1 && stow === 1) || (prev > 0 && stow === 0))
        base.forEach((a, i) => ctx.after(i * 0.16, () => ctx.audio.play('thud', { volume: 0.34, pitch: 0.5 + 0.04 * i, at: [a.pos.x, a.pos.y, a.pos.z] })));
      write();
    },
    catchGust(strength, bearing = 290) {
      const st = THREE.MathUtils.clamp(strength, 0, 1);
      for (const a of base) {
        // the arms on the gust's side take it, the others feel the echo
        const facing = Math.cos(((a.b - bearing) * Math.PI) / 180) * 0.5 + 0.5;
        if (!ctx.settings.reducedMotion) a.vel += T.arms.twitchDeg * st * (0.35 + 0.65 * facing) * T.arms.twitchHz * 6;
      }
      const near = base.reduce((p, a) => (Math.cos(((a.b - bearing) * Math.PI) / 180) > Math.cos(((p.b - bearing) * Math.PI) / 180) ? a : p));
      const at: [number, number, number] = [near.pos.x, 0, near.pos.z];
      ctx.audio.play('whoosh', { volume: 0.18 + 0.25 * st, pitch: 0.42, at });
      ctx.after(0.18, () => ctx.audio.play('thud', { volume: 0.12 + 0.2 * st, pitch: 0.55, at }));
      active = true;
    },
    update(dt) {
      if (!active) return;
      const w = T.arms.twitchHz * Math.PI * 2;
      let moving = false;
      for (const a of base) {
        // damped spring back to 0
        a.vel += (-w * w * a.twitch - 2 * T.arms.twitchDamp * a.vel) * dt;
        a.twitch += a.vel * dt;
        if (Math.abs(a.twitch) > 1e-3 || Math.abs(a.vel) > 1e-3) moving = true;
        else a.twitch = a.vel = 0;
      }
      write();
      active = moving;
    },
  };
}
