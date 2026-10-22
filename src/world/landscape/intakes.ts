import * as THREE from 'three';
import type { ZoneContext } from '@/core/zones';
import { flip } from '../geometry';
import { merge } from '../util';
import { HATCHES, INTAKES, INTAKE_RIM, type IntakeDef } from './plan';
import { type Batch, flatRing, paint } from './batch';

/**
 * Kühlluft-Einlässe (ART-V2 §4.1): flush round alu grilles over a carbon pit (the deck opens
 * there, deck.ts), radial or linear slats, a fan turning 0.6 m below and a teal rim light.
 * You walk over them: the deck collider stays. Plus 12 flush service hatches on the ring path.
 * Static parts → batch; fans = one InstancedMesh (static on the low tier).
 */
export interface Intakes {
  update(dt: number, animate: boolean): void;
  /** spin a fan up by hand (FUN-PLAN W5): extra rev/s that decays */
  push(i: number): void;
  readonly fields: readonly IntakeDef[];
}

const PIT_DEPTH = 1.15;
const FAN_Y = -0.62;

export function buildIntakes(ctx: ZoneContext, batch: Batch): Intakes {
  const M = ctx.materials;
  // the pit is deep and dark: unlit (the deck itself casts no shadow, so the low sun lit the pit floor through the grille)
  const pitMat = M.basic(0x0f0e0d);
  const slatMat = M.standard({ color: 0x4a4643, roughness: 0.72, metalness: 0.45 });
  const teal = M.light(0x2dd4bf);
  const hatchMat = M.standard({ vertexColors: true, roughness: 0.6, metalness: 0.4, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -6 });

  for (const f of INTAKES) {
    const R = f.r;
    // pit: inner wall (faces inward), floor, a ring ledge under the grille
    const wall = flip(new THREE.CylinderGeometry(R + INTAKE_RIM, R + INTAKE_RIM, PIT_DEPTH, 48, 1, true).translate(f.x, -PIT_DEPTH / 2, f.z));
    batch.add(pitMat, wall, { name: 'intake-pits' });
    batch.add(pitMat, new THREE.CircleGeometry(R + INTAKE_RIM, 48).rotateX(-Math.PI / 2).translate(f.x, -PIT_DEPTH, f.z), { name: 'intake-pits' });
    // fan shroud ring and motor strut cross at the fan plane
    batch.add(pitMat, new THREE.TorusGeometry(R - 0.12, 0.07, 6, 48).rotateX(Math.PI / 2).translate(f.x, FAN_Y, f.z), { name: 'intake-pits' });
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2;
      batch.add(pitMat, new THREE.BoxGeometry(R * 2 - 0.3, 0.06, 0.08).rotateY(a).translate(f.x, FAN_Y - 0.18, f.z), { name: 'intake-pits' });
    }
    // grille: alu slats, flush (top at y −0.005), outer and inner rings
    const slats: THREE.BufferGeometry[] = [];
    if (f.kind === 'radial') {
      const N = Math.round(R * 22);
      for (let k = 0; k < N; k++) {
        const a = (k / N) * Math.PI * 2;
        const r0 = k % 2 ? R * 0.42 : 0.42;
        const len = R - r0;
        slats.push(new THREE.BoxGeometry(len, 0.07, 0.035).translate(r0 + len / 2, -0.04, 0).rotateY(a).translate(f.x, 0, f.z));
      }
      slats.push(new THREE.TorusGeometry(R * 0.42, 0.03, 4, 48).rotateX(Math.PI / 2).translate(f.x, -0.03, f.z));
      slats.push(new THREE.CylinderGeometry(0.42, 0.42, 0.07, 24).translate(f.x, -0.04, f.z));
    } else {
      const step = 0.15;
      for (let d = -R + step / 2; d < R; d += step) {
        const len = 2 * Math.sqrt(Math.max(0, R * R - d * d));
        if (len < 0.1) continue;
        slats.push(new THREE.BoxGeometry(0.035, 0.07, len).translate(d, -0.04, 0).rotateY(f.yaw).translate(f.x, 0, f.z));
      }
      for (const d of [-R * 0.5, R * 0.5]) slats.push(new THREE.BoxGeometry(2 * Math.sqrt(R * R - d * d), 0.05, 0.05).translate(0, -0.06, d).rotateY(f.yaw).translate(f.x, 0, f.z));
    }
    // flush alu rim (flat top + inner lip)
    // satin rim (the hatches' material): a polished flat ring glared white against the low sun
    batch.add(hatchMat, paint(flatRing(f.x, f.z, R, R + INTAKE_RIM + 0.02, 0.004, 64), 0xa8a29e), { name: 'hatches' });
    batch.add(M.carbon, flip(new THREE.CylinderGeometry(R, R, 0.1, 64, 1, true).translate(f.x, -0.05, f.z)), { name: 'carbon' });
    // anodised slats (a darker alu than the trims): the grille reads as an opening, not a mirror
    for (const s of slats) batch.add(slatMat, s, { name: 'intake-slats' });
    // teal rim light in a carbon reveal
    batch.add(M.carbon, flatRing(f.x, f.z, R + INTAKE_RIM + 0.02, R + INTAKE_RIM + 0.12, 0.006, 64), { name: 'carbon' });
    batch.add(teal, flatRing(f.x, f.z, R + INTAKE_RIM + 0.045, R + INTAKE_RIM + 0.095, 0.011, 64), { name: 'teal-lines' });
  }

  // ── fans (instanced): hub + 7 twisted blades, unit radius, scaled per field ──
  const fanGeo = (() => {
    const parts: THREE.BufferGeometry[] = [paint(new THREE.CylinderGeometry(0.16, 0.2, 0.22, 20), 0x1c1917), paint(new THREE.TorusGeometry(0.18, 0.025, 6, 24).rotateX(Math.PI / 2).translate(0, 0.1, 0), 0xff6700)];
    for (let k = 0; k < 7; k++) {
      const b = new THREE.BoxGeometry(0.78, 0.015, 0.2).translate(0.2 + 0.39, 0, 0);
      const p = b.getAttribute('position');
      for (let i = 0; i < p.count; i++) p.setY(i, p.getY(i) + p.getZ(i) * 0.5);
      b.rotateY((k / 7) * Math.PI * 2);
      parts.push(paint(b, 0x3a3633));
    }
    return merge(parts);
  })();
  // matte blades: metal blades mirrored the low sun up through the grille as a white blob
  const fans = new THREE.InstancedMesh(fanGeo, M.standard({ vertexColors: true, roughness: 0.88, metalness: 0 }), INTAKES.length);
  fans.name = 'island:intake-fans';
  ctx.root.add(fans);
  ctx.freezeStatic(fans);
  const angle = new Float32Array(INTAKES.length);
  const boost = new Float32Array(INTAKES.length);
  const m4 = new THREE.Matrix4(),
    q = new THREE.Quaternion(),
    s = new THREE.Vector3(),
    p = new THREE.Vector3(),
    Y = new THREE.Vector3(0, 1, 0);
  const place = (): void => {
    INTAKES.forEach((f, i) => {
      q.setFromAxisAngle(Y, angle[i]);
      s.set(f.r - 0.2, 1, f.r - 0.2);
      fans.setMatrixAt(i, m4.compose(p.set(f.x, FAN_Y, f.z), q, s));
    });
    fans.instanceMatrix.needsUpdate = true;
  };
  INTAKES.forEach((_, i) => (angle[i] = i * 0.7));
  place();
  fans.computeBoundingSphere();

  // ── service hatches: alu frame, darker lid, four bolts, flush on the ring path ──
  for (const h of HATCHES) {
    const parts: THREE.BufferGeometry[] = [];
    const y = 0.027;
    for (const [w, d, ox, oz] of [
      [1.2, 0.07, 0, -0.565],
      [1.2, 0.07, 0, 0.565],
      [0.07, 1.06, -0.565, 0],
      [0.07, 1.06, 0.565, 0],
    ])
      parts.push(paint(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2).translate(ox, y, oz), 0xbdb7b1));
    parts.push(paint(new THREE.PlaneGeometry(1.06, 1.06).rotateX(-Math.PI / 2).translate(0, y - 0.001, 0), 0x6f6a65));
    parts.push(paint(new THREE.PlaneGeometry(0.5, 0.06).rotateX(-Math.PI / 2).translate(0, y + 0.0005, 0.32), 0x45403c));
    for (const [bx, bz] of [
      [-0.44, -0.44],
      [0.44, -0.44],
      [-0.44, 0.44],
      [0.44, 0.44],
    ])
      parts.push(paint(new THREE.CircleGeometry(0.035, 10).rotateX(-Math.PI / 2).translate(bx, y + 0.0008, bz), 0xd6d3d1));
    for (const g of parts) {
      g.rotateY(h.yaw).translate(h.x, 0, h.z);
      batch.add(hatchMat, g, { name: 'hatches' });
    }
  }

  return {
    fields: INTAKES,
    push(i) {
      boost[i] = Math.min(6, boost[i] + 3.2);
    },
    update(dt, animate) {
      if (!animate) return;
      for (let i = 0; i < INTAKES.length; i++) {
        angle[i] += dt * Math.PI * 2 * (0.4 + boost[i]);
        boost[i] *= Math.exp(-dt * 0.45);
      }
      place();
    },
  };
}
