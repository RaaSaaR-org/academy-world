import * as THREE from 'three';
import type { ZoneContext } from '@/core/zones';
import { sweep } from '../geometry';
import { FIN, FIN_BANKS } from './plan';
import { type Batch, arcPts, flatStrip } from './batch';

/**
 * Wärmetauscher (ART-V2 §4.1): six curved banks of vertical alu fins on a ceramic plinth arc,
 * one beside each spoke, where the zones' machines dump their heat. Carbon plinth reveal, an
 * alu rail tying the fin tops, a teal foot line toward the path. All static (batch).
 */
export function buildFinBanks(ctx: ZoneContext, batch: Batch): void {
  const M = ctx.materials;
  // anodised fins (darker than the trims, so the pack reads as a heat sink, not a fence)
  const finMat = M.standard({ color: 0x4a4643, roughness: 0.72, metalness: 0.45 });
  const D = FIN.plinthD,
    H = FIN.plinthH,
    REV = 0.1;
  const c = 0.05;
  const body: [number, number][] = [
    [-D / 2, REV],
    [D / 2, REV],
    [D / 2, REV + H - c],
    [D / 2 - c, REV + H],
    [-D / 2 + c, REV + H],
    [-D / 2, REV + H - c],
  ];
  const reveal: [number, number][] = [
    [-D / 2 + 0.22, 0],
    [D / 2 - 0.22, 0],
    [D / 2 - 0.22, REV + 0.01],
    [-D / 2 + 0.22, REV + 0.01],
  ];
  const lip: [number, number][] = [
    [-D / 2 - 0.012, REV + H - 0.07],
    [D / 2 + 0.012, REV + H - 0.07],
    [D / 2 + 0.012, REV + H - 0.035],
    [-D / 2 - 0.012, REV + H - 0.035],
  ];
  const rail = (u: number): [number, number][] => [
    [u - 0.03, REV + H + FIN.height - 0.02],
    [u + 0.03, REV + H + FIN.height - 0.02],
    [u + 0.03, REV + H + FIN.height + 0.04],
    [u - 0.03, REV + H + FIN.height + 0.04],
  ];
  for (const fb of FIN_BANKS) {
    // the profile is symmetric, so the sweep direction does not matter
    const path = arcPts(0, 0, fb.r, fb.b1, fb.b0, 40).map(([x, z]) => new THREE.Vector3(x, 0, z));
    batch.add(M.hull, capped(path, body), { name: 'hull', cast: true });
    batch.add(M.carbon, capped(path, reveal), { name: 'carbon' });
    batch.add(M.brushedAlu, capped(path, lip), { name: 'alu' });
    for (const u of [-FIN.depth / 2 + 0.05, FIN.depth / 2 - 0.05]) batch.add(M.brushedAlu, capped(path, rail(u)), { name: 'alu' });
    // fins: radial plates
    for (let k = 0; k < FIN.count; k++) {
      const b = (fb.b0 + 0.4 + ((fb.b1 - fb.b0 - 0.8) * k) / (FIN.count - 1)) * (Math.PI / 180);
      const g = new THREE.BoxGeometry(FIN.thick, FIN.height, FIN.depth).translate(0, REV + H + FIN.height / 2, -fb.r).rotateY(-b);
      batch.add(finMat, g, { name: 'fins' });
    }
    // end plates (ceramic) close the fin pack
    for (const bb of [fb.b0 + 0.2, fb.b1 - 0.2]) {
      const b = bb * (Math.PI / 180);
      batch.add(M.hull, new THREE.BoxGeometry(0.06, FIN.height + 0.06, FIN.depth + 0.12).translate(0, REV + H + FIN.height / 2, -fb.r).rotateY(-b), { name: 'hull' });
    }
    // teal foot line toward the hub, in a carbon channel
    const inner = arcPts(0, 0, fb.r - D / 2 - 0.16, fb.b0 - 0.6, fb.b1 + 0.6, 40);
    batch.add(M.carbon, flatStrip(inner, 0.12, 0.006), { name: 'carbon' });
    batch.add(M.light(0x2dd4bf), flatStrip(inner, 0.05, 0.011), { name: 'teal-lines' });
    // colliders: three chords
    for (let k = 0; k < 3; k++) {
      const a0 = (fb.b0 + ((fb.b1 - fb.b0) * k) / 3) * (Math.PI / 180),
        a1 = (fb.b0 + ((fb.b1 - fb.b0) * (k + 1)) / 3) * (Math.PI / 180);
      const p0 = [Math.sin(a0) * fb.r, -Math.cos(a0) * fb.r],
        p1 = [Math.sin(a1) * fb.r, -Math.cos(a1) * fb.r];
      const len = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
      ctx.physics.addStaticBox({ size: [D, 1.6, len + 0.3], position: [(p0[0] + p1[0]) / 2, 0.8, (p0[1] + p1[1]) / 2], rotation: [0, Math.atan2(p1[0] - p0[0], p1[1] - p0[1]), 0], surface: 'metal' });
    }
  }
}

/** Sweep a closed profile along a path and close both ends. */
export function capped(path: THREE.Vector3[], profile: [number, number][]): THREE.BufferGeometry {
  const tube = sweep(path, profile, false).toNonIndexed();
  const caps: number[] = [];
  const tri = THREE.ShapeUtils.triangulateShape(profile.map(([u, v]) => new THREE.Vector2(u, v)), []);
  const up = new THREE.Vector3(0, 1, 0);
  for (const end of [0, path.length - 1]) {
    const p = path[end];
    const a = path[Math.max(0, end - 1)],
      b = path[Math.min(path.length - 1, end + 1)];
    const t = b.clone().sub(a).normalize();
    const side = new THREE.Vector3().crossVectors(up, t).normalize();
    const vup = new THREE.Vector3().crossVectors(t, side).normalize();
    const P = profile.map(([u, v]) => p.clone().addScaledVector(side, u).addScaledVector(vup, v));
    for (const [i0, j0, k0] of tri) {
      // make every triangle counter-clockwise in (u, v): its 3D normal is then +t
      const [ui, vi] = profile[i0],
        [uj, vj] = profile[j0],
        [uk, vk] = profile[k0];
      const ccw = (uj - ui) * (vk - vi) - (vj - vi) * (uk - ui) > 0;
      const [i, j, k] = ccw ? [i0, j0, k0] : [i0, k0, j0];
      const order = end === 0 ? [i, k, j] : [i, j, k];
      for (const o of order) caps.push(P[o].x, P[o].y, P[o].z);
    }
  }
  const cg = new THREE.BufferGeometry();
  cg.setAttribute('position', new THREE.Float32BufferAttribute(caps, 3));
  cg.computeVertexNormals();
  if (tube.getAttribute('uv')) tube.deleteAttribute('uv');
  const total = tube.getAttribute('position').count + cg.getAttribute('position').count;
  const pos = new Float32Array(total * 3);
  pos.set(tube.getAttribute('position').array as Float32Array, 0);
  pos.set(cg.getAttribute('position').array as Float32Array, tube.getAttribute('position').count * 3);
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.computeVertexNormals();
  return out;
}
