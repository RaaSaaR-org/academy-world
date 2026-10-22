/**
 * The Kreislaufhof's hall (plan §2.3, §2.7; R8 §3.1): 60 × 30 m in the cloud bank's shade, clay plaster on a
 * glulam frame, PV on the roof, a north-light band, the big door toward the island. Inside, warm work light
 * (rule 7) over the sorting line (left) and the repair bench (right); sorted bales wait at the side, ready
 * to go (every object has a job, rule 10).
 *
 * The shell is the area's exterior tier (≤ 150 m from the plot edge; the region's impostor shows it from
 * farther), the interior its detail tier. Statics are merged (ctx.mergeStatic) into a few draws.
 */
import * as THREE from 'three';
import type { ZoneContext } from '@/core/zones';
import { K } from './tuning';

export interface Hall {
  /** the floor's height in the zone's local frame (the terrain under the hall plus a lift) */
  readonly floor: number;
  /** a static part of the interior at (x, y from the floor, z) */
  box(parent: THREE.Object3D, size: [number, number, number], at: [number, number, number], mat: THREE.Material, o?: { collide?: boolean; name?: string; ry?: number }): THREE.Mesh;
  readonly mat: Record<'plaster' | 'timber' | 'timberSilver' | 'alu' | 'pv' | 'concrete' | 'rubber' | 'steel' | 'dark' | 'glass' | 'crate' | 'paintLine', THREE.Material>;
  readonly warm: THREE.Material;
  /** the info board by the door (its mesh, for the interactable) */
  readonly infoBoard: THREE.Mesh;
  /** moving parts of the interior (detail tier): kept out of the static merge */
  readonly live: THREE.Group;
}

export function buildHall(ctx: ZoneContext): Hall {
  const H = K.hall;
  // the floor: the highest terrain under the hall plus a lift (the plot's local y 0 is the world's y 0)
  let top = -Infinity;
  for (let x = -H.w / 2; x <= H.w / 2; x += 5)
    for (let z = -H.d / 2; z <= H.d / 2; z += 5) {
      const w = ctx.toWorld([x, 0, z]);
      top = Math.max(top, ctx.frames.heightAt(w.x, w.z));
    }
  const F = (Number.isFinite(top) ? top : 0) + H.floorLift;

  const M = ctx.materials;
  const mat = {
    plaster: M.standard({ color: 0xc8bfb2, roughness: 0.9, metalness: 0 }),
    timber: M.standard({ color: 0xb9a68a, roughness: 0.82, metalness: 0 }),
    timberSilver: M.standard({ color: 0x9a9188, roughness: 0.88, metalness: 0 }),
    alu: M.standard({ color: 0xb9b6b0, roughness: 0.4, metalness: 0.6 }),
    pv: M.standard({ color: 0x23262b, roughness: 0.3, metalness: 0.35 }),
    concrete: M.standard({ color: 0xa8a39b, roughness: 0.92, metalness: 0 }),
    rubber: M.standard({ color: 0x2a2826, roughness: 0.9, metalness: 0 }),
    steel: M.standard({ color: 0x8a8580, roughness: 0.45, metalness: 0.55 }),
    dark: M.standard({ color: 0x302d2b, roughness: 0.6, metalness: 0.15 }),
    glass: M.standard({ color: 0x3a4246, roughness: 0.18, metalness: 0.4 }),
    crate: M.standard({ color: 0x8f8778, roughness: 0.85, metalness: 0 }),
    paintLine: M.standard({ color: 0xd6d3d1, roughness: 0.8, metalness: 0 }),
  };
  const warm = M.light(0xffd9a8, 'line');
  const geos: THREE.BufferGeometry[] = [];
  ctx.onDispose(() => geos.forEach((g) => g.dispose()));
  const box = (parent: THREE.Object3D, size: [number, number, number], at: [number, number, number], m: THREE.Material, o: { collide?: boolean; name?: string; ry?: number } = {}): THREE.Mesh => {
    const g = new THREE.BoxGeometry(...size);
    geos.push(g);
    const mesh = new THREE.Mesh(g, m);
    mesh.position.set(at[0], F + at[1], at[2]);
    if (o.ry) mesh.rotation.y = o.ry;
    if (o.name) mesh.name = o.name;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    if (o.collide) ctx.physics.addStaticBox({ size, position: [at[0], F + at[1], at[2]], rotation: [0, o.ry ?? 0, 0], surface: m === mat.concrete ? 'concrete' : m === mat.timber || m === mat.timberSilver ? 'wood' : 'metal' });
    return mesh;
  };

  const ext = ctx.groups.exterior;
  const det = ctx.groups.detail;
  const hw = H.w / 2,
    hd = H.d / 2,
    t = H.wall;
  // ── the shell (exterior tier) ──
  // the floor slab, its plinth standing out of the ground (colliders: the floor, the walls with the door gap)
  const slab = new THREE.Mesh(new THREE.BoxGeometry(H.w + 0.6, F + 0.6, H.d + 0.6), mat.concrete);
  geos.push(slab.geometry);
  slab.position.set(0, (F - 0.6) / 2, 0);
  slab.receiveShadow = true;
  ext.add(slab);
  ctx.physics.addStaticBox({ size: [H.w + 0.6, 0.6, H.d + 0.6], position: [0, F - 0.3, 0], surface: 'concrete' });
  // a ramp at the door (the floor stands a hand above the yard)
  const ramp = new THREE.Mesh(new THREE.BoxGeometry(H.door.w + 2, 0.12, 2.4), mat.concrete);
  geos.push(ramp.geometry);
  const ry = F - 0.08 - (ctx.frames.heightAt(ctx.toWorld([0, 0, hd + 2]).x, ctx.toWorld([0, 0, hd + 2]).z) + 0.02);
  ramp.position.set(H.door.x, F - 0.06 - ry / 2, hd + 1.4);
  ramp.rotation.x = Math.atan2(ry, 2.4);
  ramp.receiveShadow = true;
  ext.add(ramp);
  ctx.physics.addStaticFromMesh(ramp, { shape: 'box', surface: 'concrete' });
  // walls: back, the two ends, the front in three pieces around the door
  box(ext, [H.w, H.h, t], [0, H.h / 2, -hd + t / 2], mat.plaster, { collide: true });
  box(ext, [t, H.h, H.d], [-hw + t / 2, H.h / 2, 0], mat.plaster, { collide: true });
  box(ext, [t, H.h, H.d], [hw - t / 2, H.h / 2, 0], mat.plaster, { collide: true });
  const dl = H.door.x - H.door.w / 2,
    dr = H.door.x + H.door.w / 2;
  box(ext, [dl + hw, H.h, t], [(-hw + dl) / 2, H.h / 2, hd - t / 2], mat.plaster, { collide: true });
  box(ext, [hw - dr, H.h, t], [(dr + hw) / 2, H.h / 2, hd - t / 2], mat.plaster, { collide: true });
  box(ext, [H.door.w, H.h - H.door.h, t], [H.door.x, H.door.h + (H.h - H.door.h) / 2, hd - t / 2], mat.plaster);
  // window bands: the front at eye height, the north light high on the back wall
  for (const [x0, x1] of [
    [-hw + 2, dl - 1.5],
    [dr + 1.5, hw - 2],
  ])
    box(ext, [x1 - x0, 1.4, 0.06], [(x0 + x1) / 2, 3.4, hd + 0.01], mat.glass);
  box(ext, [H.w - 4, 1.3, 0.06], [0, 5.9, -hd - 0.01], mat.glass);
  // the glulam frame outside: posts every 6 m, the ring beam, the roof with its PV and the north light
  for (let x = -hw; x <= hw + 0.01; x += 6)
    for (const z of [hd + 0.18, -hd - 0.18]) box(ext, [0.32, H.h + 0.5, 0.32], [x, (H.h + 0.5) / 2, z], mat.timber);
  box(ext, [H.w + 0.9, 0.55, H.d + 0.9], [0, H.h + 0.25, 0], mat.timber);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(H.w + 0.6, 0.25, H.d + 0.6), mat.timberSilver);
  geos.push(roof.geometry);
  roof.position.set(0, F + H.h + 0.65, 0);
  roof.castShadow = true;
  ext.add(roof);
  for (let x = -hw + 3; x < hw - 2; x += 6) {
    const pv = new THREE.Mesh(new THREE.BoxGeometry(5.4, 0.08, H.d - 3), mat.pv);
    geos.push(pv.geometry);
    pv.position.set(x, F + H.h + 0.95, 0.6);
    pv.rotation.x = -0.06;
    pv.castShadow = true;
    ext.add(pv);
  }
  // the yard: sorted bales on pallets, ready to go (aluminium, PET, cardboard)
  const bale = (x: number, z: number, color: number): void => {
    box(ext, [1.15, 0.12, 1.15], [x, 0.06, z], mat.timberSilver);
    box(ext, [1.1, 1.0, 1.1], [x, 0.62, z], M.standard({ color, roughness: 0.75, metalness: color === 0xb9b6b0 ? 0.5 : 0 }));
  };
  [0xb9b6b0, 0xb9b6b0, 0x8f9aa0, 0x8f9aa0, 0xb4a487, 0xb4a487].forEach((c, i) => bale(18 + (i % 3) * 1.4, hd + 3 + Math.floor(i / 3) * 1.4, c));
  // the name over the door
  ctx.text3d.create({ text: { de: 'KREISLAUFHOF', en: 'CIRCULAR YARD' }, font: 'display', size: 0.62, color: 0x2b2a2c, anchorX: 'center', anchorY: 'middle', letterSpacing: 0.06, position: [H.door.x, F + H.door.h + 1.25, hd + 0.02] }, ext);
  ctx.text3d.create({ text: ctx.i18n.text('hall.sub'), font: 'mono-medium', size: 0.24, color: 0x57534e, anchorX: 'center', anchorY: 'middle', letterSpacing: 0.14, uppercase: true, position: [H.door.x, F + H.door.h + 0.62, hd + 0.02] }, ext);

  // ── the interior (detail tier) ──
  // the ceiling and its beams, warm light bars between them, a light band on the back wall (seen through the door)
  box(det, [H.w - 2 * t, 0.08, H.d - 2 * t], [0, H.h - 0.04, 0], mat.timber);
  for (let x = -hw + 6; x < hw; x += 6) box(det, [0.26, 0.62, H.d - 2 * t], [x, H.h - 0.38, 0], mat.timber);
  {
    const parts: THREE.BufferGeometry[] = [];
    for (let x = -hw + 3; x < hw; x += 6) for (const z of [-7, 0, 7]) parts.push(new THREE.BoxGeometry(2.6, 0.06, 0.32).translate(x, F + H.h - 0.75, z));
    parts.push(new THREE.BoxGeometry(H.w - 8, 0.16, 0.05).translate(0, F + 4.6, -hd + t + 0.03));
    const g = mergeBoxes(parts);
    geos.push(g);
    const lights = new THREE.Mesh(g, warm);
    lights.name = 'kreislaufhof:lights';
    det.add(lights);
  }
  // walkway lines on the floor in front of the stations, and from the door into the hall
  box(det, [46, 0.012, 0.12], [0, 0.006, 9.4], mat.paintLine);
  box(det, [46, 0.012, 0.12], [0, 0.006, 12.2], mat.paintLine);
  // pallet racking along the back wall (sorted bales waiting for the truck): uprights, beams, pallets, bales
  const rack = M.standard({ color: 0x5b6670, roughness: 0.55, metalness: 0.4 });
  const baleCol = [0xb9b6b0, 0x8f9aa0, 0xb4a487];
  for (let i = 0; i < 6; i++) {
    const x = -26 + i * 3;
    for (const z of [-hd + t + 0.4, -hd + t + 1.6]) box(det, [0.09, 4.4, 0.09], [x, 2.2, z], rack);
    if (i === 5) continue;
    for (const y of [0.15, 1.65, 3.15]) {
      for (const z of [-hd + t + 0.4, -hd + t + 1.6]) box(det, [3, 0.1, 0.08], [x + 1.5, y, z], rack);
      box(det, [2.4, 0.12, 1.1], [x + 1.5, y + 0.11, -hd + t + 1.0], mat.timberSilver);
      for (const dx of [-0.6, 0.6]) box(det, [1.05, 1.0, 1.0], [x + 1.5 + dx, y + 0.67, -hd + t + 1.0], M.standard({ color: baleCol[(i + Math.round(y) + (dx > 0 ? 1 : 0)) % 3], roughness: 0.75, metalness: 0 }));
    }
  }
  ctx.physics.addStaticBox({ size: [15.4, 4.4, 1.6], position: [-18.5, F + 2.2, -hd + t + 1.0], surface: 'metal' });
  // wire cages of collected e-waste, the old devices waiting for the bench
  for (let i = 0; i < 3; i++) {
    const x = 0 + i * 1.5;
    box(det, [1.2, 1.1, 1.0], [x, 0.55, -hd + t + 0.9], mat.steel);
    box(det, [1.0, 0.7, 0.8], [x, 0.4, -hd + t + 0.9], mat.dark);
  }
  ctx.physics.addStaticBox({ size: [4.4, 1.1, 1.0], position: [1.5, F + 0.55, -hd + t + 0.9], surface: 'metal' });
  // a parked electric pallet truck (generic) and a stack of empty pallets
  box(det, [0.8, 1.25, 0.7], [-3.6, 0.63, -7.2], M.standard({ color: 0x9ca4a8, roughness: 0.5, metalness: 0.3 }), { collide: true });
  for (const dz of [-0.2, 0.2]) box(det, [1.15, 0.06, 0.16], [-2.75, 0.08, -7.2 + dz], mat.steel);
  for (let k = 0; k < 5; k++) box(det, [1.2, 0.14, 0.8], [3.4, 0.07 + k * 0.15, -7.4], mat.timberSilver, { collide: k === 0 });
  ctx.physics.addStaticBox({ size: [1.2, 0.75, 0.8], position: [3.4, F + 0.375, -7.4], surface: 'wood' });
  // shelves of repaired devices along the right back wall, tagged for pick-up
  for (let i = 0; i < 3; i++) {
    const x = 9 + i * 2.6;
    box(det, [2.4, 2.2, 0.05], [x, 1.1, -hd + t + 0.5], mat.timberSilver, { collide: false });
    for (const y of [0.4, 1.1, 1.8]) {
      box(det, [2.4, 0.04, 0.5], [x, y, -hd + t + 0.75], mat.timber);
      for (let k = 0; k < 3; k++) box(det, [0.3, 0.1, 0.13], [x - 0.8 + k * 0.8 + ((i + k) % 2) * 0.1, y + 0.07, -hd + t + 0.72], k % 2 ? mat.dark : M.standard({ color: 0x8e979b, roughness: 0.55, metalness: 0.05 }));
    }
  }
  ctx.physics.addStaticBox({ size: [7.8, 2.2, 0.8], position: [11.6, F + 1.1, -hd + t + 0.6], surface: 'wood' });
  // the info board by the door („Warum Kreislauf?“)
  const infoBoard = box(det, [2.2, 1.3, 0.06], [-6.8, 1.7, hd - t - 0.05], mat.dark, { name: 'kreislaufhof:info' });
  box(det, [2.32, 1.42, 0.04], [-6.8, 1.7, hd - t - 0.02], mat.timber);

  const live = new THREE.Group();
  live.name = 'kreislaufhof:live';
  det.add(live);
  return { floor: F, box, mat, warm, infoBoard, live };
}

/** merge plain box geometries (position + normal) into one */
function mergeBoxes(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const pos: number[] = [],
    nor: number[] = [];
  for (const p of parts) {
    const g = p.index ? p.toNonIndexed() : p;
    const a = g.getAttribute('position'),
      n = g.getAttribute('normal');
    for (let i = 0; i < a.count; i++) {
      pos.push(a.getX(i), a.getY(i), a.getZ(i));
      nor.push(n.getX(i), n.getY(i), n.getZ(i));
    }
    p.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  return out;
}
