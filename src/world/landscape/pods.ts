import * as THREE from 'three';
import type { ZoneContext } from '@/core/zones';
import { circleProfile, sweep } from '../geometry';
import { POD, PODS } from './plan';
import { type Batch, flatRing, paint, rbox } from './batch';
import { capped } from './fins';
import { cullTinyText } from '../detail';
import { staticMerger } from '../statics';

/**
 * Hydro-Kapseln (ART-V2 §4.1): the only greenery on the deck, under glass. A ceramic ring base
 * with a carbon reveal and an alu lip, a clear glass dome with alu ribs, three troughs of plants
 * and three warm grow-light bars (T0 by day, T1 at dusk). People on a flying machine need food
 * and air; the pods say so without a word.
 * Phase 7 (WP15, plan §4.10 „Tomatenkapseln aboard“): the pods grow cherry tomatoes on strings, ripe
 * fruit deep red (§2.7 rule 5). The pod at bearing 240 carries the Sonnenacker's lesson into the air:
 * an SO-101 on a pedestal at its middle trough picks cherry tomatoes at the research pace (the arm, its
 * fruit and the T3 light are the life runtime's, life/kapsel.ts), a crate beside it, and the plaque
 * „Vom Sonnenacker. Diese Kapsel fliegt mit.“
 */

/**
 * Pod 240's Kapsel trough in pod-local metres (x along the trough, z across toward the tower, y up from
 * the deck): the trough nearest the plaza (row +1, z 1.35), so people on the plaza see the arm at work.
 */
const KZ = 1.35;
export const KAPSEL_LOCAL = {
  /** the trough row the arm works at */
  row: 1,
  /** the arm's base on its pedestal, right at the trough's plaza-side wall */
  arm: [0.15, 0.97, KZ + 0.46] as [number, number, number],
  /** where the picked tomatoes go: the crate on the pod floor beside the pedestal */
  crate: [0.56, 0.5, KZ + 0.62] as [number, number, number],
  /** its two vines, at the trough's edge (the SO-101 reaches ≈ 0.41 m, R1 §1.1) */
  vines: [-0.06, 0.34] as number[],
  vineZ: KZ + 0.17,
  /** the vine fruit the arm can reach (two trusses on its vines), y on the vine */
  fruits: (
    [
      [-0.09, 1.1, 0.2],
      [-0.04, 1.16, 0.21],
      [-0.1, 1.23, 0.19],
      [-0.02, 1.05, 0.2],
      [0.01, 1.19, 0.2],
      [0.31, 1.08, 0.2],
      [0.36, 1.14, 0.21],
      [0.3, 1.22, 0.19],
      [0.38, 1.03, 0.2],
      [0.27, 1.17, 0.21],
    ] as [number, number, number][]
  ).map(([x, y, z]) => [x, y, KZ + z] as [number, number, number]),
};
/** pod 240 (index 2 of PODS) and the pod-local → world transform */
export const KAPSEL_POD = PODS[2];
export function kapselWorld(local: readonly [number, number, number], out = new THREE.Vector3()): THREE.Vector3 {
  const yaw = (-KAPSEL_POD.bearing * Math.PI) / 180;
  const c = Math.cos(yaw),
    s = Math.sin(yaw);
  // rotateY(yaw) then translate (as the batch geometry below)
  return out.set(KAPSEL_POD.x + c * local[0] + s * local[2], local[1], KAPSEL_POD.z - s * local[0] + c * local[2]);
}

const TOMATO = 0xb5332a;
const TOMATO_HALF = 0xc8743a;
const TOMATO_GREEN = 0x8c9a4a;

export function buildPods(ctx: ZoneContext, batch: Batch): void {
  const M = ctx.materials;
  const R = POD.radius;
  const plantMat = M.standard({ vertexColors: true, roughness: 0.8, metalness: 0.02 });
  const merger = staticMerger(ctx);
  // the vines (stems, strings, leaves, fruit: ≈ 23 k triangles over the three pods) merge into a near tier
  // of their own, shown while the eye is within ≈ 60 m of a pod (the plaza, the ring, the Ausguck); beyond
  // that they are under a pixel behind the dome glass. In the island-wide static batch they drew in every
  // island view (duck field 910 k > 0.9 M; Integrate, wave 2). Same merged material, so no new program.
  const near = new THREE.Group();
  near.name = 'pods:vines';
  ctx.root.add(near);
  const vines: THREE.BufferGeometry[] = [];
  const glassGeos: THREE.BufferGeometry[] = [];
  const rnd = (() => {
    let s = 99;
    return () => {
      s = (s * 16807) % 2147483647;
      return s / 2147483647;
    };
  })();
  for (const p of PODS) {
    const yaw = (-p.bearing * Math.PI) / 180;
    const kapsel = p === KAPSEL_POD;
    const ringPath = (r: number, n = 64): THREE.Vector3[] => {
      const out: THREE.Vector3[] = [];
      for (let i = 0; i <= n; i++) {
        const a = (i / n) * Math.PI * 2;
        out.push(new THREE.Vector3(p.x + Math.cos(a) * r, 0, p.z + Math.sin(a) * r));
      }
      return out;
    };
    // base: carbon reveal (inset), ceramic drum, alu lip
    batch.add(M.carbon, new THREE.CylinderGeometry(R - 0.05, R - 0.05, 0.12, 64).translate(p.x, 0.06, p.z), { name: 'carbon' });
    const base = new THREE.CylinderGeometry(R + 0.18, R + 0.22, POD.base - 0.1, 64, 1, true).translate(p.x, 0.1 + (POD.base - 0.1) / 2, p.z);
    batch.add(M.hull, base, { name: 'hull', cast: true });
    batch.add(M.hull, flatRing(p.x, p.z, R - 0.02, R + 0.18, POD.base, 64), { name: 'hull' });
    batch.add(M.brushedAlu, sweep(ringPath(R + 0.04), circleProfile(0.06, 8), true), { name: 'alu' });
    // floor inside the dome (composite)
    batch.add(M.deckTone(0x9c968f, 0.85), new THREE.CircleGeometry(R, 48).rotateX(-Math.PI / 2).translate(p.x, POD.base - 0.01, p.z), { name: 'pod-floor' });
    // glass dome (one transparent mesh for all three)
    glassGeos.push(new THREE.SphereGeometry(R, 40, 14, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, POD.dome / R, 1).translate(p.x, POD.base, p.z));
    // ribs: 6 meridians + crown ring
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + yaw;
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= 16; i++) {
        const t = (i / 16) * (Math.PI / 2) * 0.92;
        pts.push(new THREE.Vector3(p.x + Math.cos(a) * Math.cos(t) * (R + 0.03), POD.base + Math.sin(t) * (POD.dome + 0.03), p.z + Math.sin(a) * Math.cos(t) * (R + 0.03)));
      }
      batch.add(M.brushedAlu, sweep(pts, circleProfile(0.04, 6), false), { name: 'alu' });
    }
    batch.add(M.brushedAlu, new THREE.TorusGeometry(R * 0.39, 0.05, 6, 32).rotateX(Math.PI / 2).translate(p.x, POD.base + POD.dome * 0.92, p.z), { name: 'alu' });
    batch.add(M.hull, new THREE.CylinderGeometry(R * 0.36, R * 0.38, 0.12, 24).translate(p.x, POD.base + POD.dome * 0.92 + 0.01, p.z), { name: 'hull' });
    // three troughs of cherry tomatoes on strings (Phase 7): stems up to the grow-light housing, leaf
    // clusters, trusses of fruit — ripe deep red, some half-ripe and green
    const plants: THREE.BufferGeometry[] = [];
    for (let row = -1; row <= 1; row++) {
      const len = 2 * Math.sqrt(Math.max(0, (R - 0.55) ** 2 - (row * 1.35) ** 2));
      const trough = paint(rbox(len, 0.42, 0.62), 0xd6d3d1).translate(0, POD.base + 0.21, row * 1.35);
      plants.push(trough);
      plants.push(paint(new THREE.BoxGeometry(len - 0.08, 0.04, 0.52), 0x3f3a33).translate(0, POD.base + 0.43, row * 1.35));
      const n = Math.max(3, Math.floor(len / 0.42));
      for (let i = 0; i < n; i++) {
        const x = -len / 2 + 0.22 + (i * (len - 0.44)) / Math.max(1, n - 1);
        const z0 = row * 1.35 + (rnd() - 0.5) * 0.08;
        // at the arm's place in the Kapsel the vines leave room for the pedestal's reach
        const armSpot = kapsel && row === KAPSEL_LOCAL.row && Math.abs(x - KAPSEL_LOCAL.arm[0]) < 0.36;
        const top = POD.base + 1.62 + rnd() * 0.18;
        vines.push(paint(new THREE.CylinderGeometry(0.012, 0.016, top - POD.base - 0.45, 5).translate(x, (top + POD.base + 0.45) / 2, z0), 0x56693f));
        // the string up to the light housing
        vines.push(paint(new THREE.CylinderGeometry(0.004, 0.004, POD.base + 1.95 - top, 3).translate(x, (top + POD.base + 1.95) / 2, z0), 0xd6d3d1));
        for (let l = 0; l < 5; l++) {
          const y = POD.base + 0.6 + l * 0.26 + rnd() * 0.08;
          const s = 0.07 + rnd() * 0.04;
          const leafy = new THREE.IcosahedronGeometry(s, 0).scale(1.4, 0.5 + rnd() * 0.25, 1).translate(x + (rnd() - 0.5) * 0.12, y, z0 + (rnd() - 0.5) * 0.16);
          vines.push(paint(leafy, new THREE.Color(0x5f7046).offsetHSL((rnd() - 0.5) * 0.04, 0, (rnd() - 0.5) * 0.08)));
        }
        if (armSpot) continue;
        // two trusses of cherry tomatoes, on the sides that face the aisles
        for (let t = 0; t < 2; t++) {
          const side = t ? 1 : -1;
          const ty = POD.base + 0.7 + t * 0.34 + rnd() * 0.16;
          for (let f = 0; f < 4; f++) {
            const ripe = rnd();
            const hex = ripe < 0.62 ? TOMATO : ripe < 0.8 ? TOMATO_HALF : TOMATO_GREEN;
            const fr = 0.022 + rnd() * 0.006;
            vines.push(paint(new THREE.IcosahedronGeometry(fr, 0).translate(x + (f - 1.5) * 0.04 + (rnd() - 0.5) * 0.02, ty - f * 0.028, z0 + side * (0.2 + rnd() * 0.06)), hex));
          }
        }
      }
      // grow-light bar above the trough (warm, in an alu housing)
      const bar = new THREE.BoxGeometry(len * 0.8, 0.05, 0.08).translate(0, POD.base + 1.95, row * 1.35);
      bar.rotateY(yaw).translate(p.x, 0, p.z);
      batch.add(M.light(0xffe9cc), bar, { name: 'warm-lines' });
      const housing = rbox(len * 0.8 + 0.08, 0.06, 0.16).translate(0, POD.base + 2.0, row * 1.35);
      housing.rotateY(yaw).translate(p.x, 0, p.z);
      batch.add(M.brushedAlu, housing, { name: 'alu' });
      for (const sx of [-1, 1]) {
        const hang = new THREE.CylinderGeometry(0.012, 0.012, POD.dome * 0.9 - 2.0, 4).translate(sx * len * 0.35, POD.base + 2.0 + (POD.dome * 0.9 - 2.0) / 2, row * 1.35);
        hang.rotateY(yaw).translate(p.x, 0, p.z);
        batch.add(M.brushedAlu, hang, { name: 'alu' });
      }
    }
    if (kapsel) {
      // the arm's two vines at the trough's front edge (their fruit is the life runtime's: it gets picked)
      for (const vx of KAPSEL_LOCAL.vines) {
        const vz = KAPSEL_LOCAL.vineZ;
        vines.push(paint(new THREE.CylinderGeometry(0.012, 0.016, 1.25, 5).translate(vx, POD.base + 0.45 + 0.625, vz), 0x56693f));
        vines.push(paint(new THREE.CylinderGeometry(0.004, 0.004, 0.3, 3).translate(vx, POD.base + 1.85, vz), 0xd6d3d1));
        for (let l = 0; l < 4; l++) {
          const s = 0.065 + rnd() * 0.03;
          vines.push(paint(new THREE.IcosahedronGeometry(s, 0).scale(1.4, 0.5, 1).translate(vx + (l % 2 ? 0.07 : -0.07), POD.base + 0.95 + l * 0.22, vz - 0.04), 0x5f7046));
        }
      }
      // the arm's pedestal (a ceramic column with a carbon top plate) and the harvest crate beside it
      const [ax, ay, az] = KAPSEL_LOCAL.arm;
      plants.push(paint(new THREE.CylinderGeometry(0.11, 0.13, ay - POD.base, 16).translate(ax, (ay + POD.base) / 2, az), 0xe7e5e4));
      plants.push(paint(new THREE.CylinderGeometry(0.12, 0.12, 0.02, 16).translate(ax, ay - 0.01, az), 0x2a2622));
      const [cx, cy, cz] = KAPSEL_LOCAL.crate;
      plants.push(paint(rbox(0.3, 0.14, 0.22).translate(cx, cy + 0.07, cz), 0xb9a68a));
      plants.push(paint(new THREE.BoxGeometry(0.26, 0.02, 0.18).translate(cx, cy + 0.1, cz), 0x6f5f4b));
    }
    for (const g of plants) {
      g.rotateY(yaw).translate(p.x, 0, p.z);
      batch.add(plantMat, g, { name: 'pod-plants' });
    }
    for (const g of vines.splice(0)) {
      g.rotateY(yaw).translate(p.x, 0, p.z);
      if (g.getAttribute('uv')) g.deleteAttribute('uv');
      if (!g.getAttribute('normal')) g.computeVertexNormals();
      merger.addGeometry(plantMat, g, { scope: near });
    }
    // teal ring on the plaza around the pod
    batch.add(M.light(0x2dd4bf), flatRing(p.x, p.z, R + 0.42, R + 0.47, 0.03, 64), { name: 'teal-lines' });
    ctx.physics.addStaticCylinder({ radius: R + 0.22, height: POD.base + POD.dome, position: [p.x, (POD.base + POD.dome) / 2, p.z], surface: 'glass' });
  }
  void capped;
  // the near tier's switch (with 4 m of hysteresis); it starts shown, so the boot frame compiles it
  const _eye = new THREE.Vector3();
  ctx.every(0.25, () => {
    _eye.setFromMatrixPosition(ctx.camera.matrixWorld);
    ctx.root.worldToLocal(_eye);
    let d = Infinity;
    for (const p of PODS) d = Math.min(d, Math.hypot(_eye.x - p.x, _eye.y - POD.base - 1, _eye.z - p.z));
    near.visible = merger.reference || d < (near.visible ? 64 : 60);
  });
  const glass = new THREE.Mesh(mergeGlass(glassGeos), M.glassClear);
  glass.name = 'island:pod-glass';
  glass.renderOrder = 2;
  ctx.root.add(glass);
  ctx.freezeStatic(glass);
  buildPlaque(ctx);
}

/** „Vom Sonnenacker. Diese Kapsel fliegt mit.“ on pod 240's ring base, facing the tower (plan §4.10). */
function buildPlaque(ctx: ZoneContext): void {
  const p = KAPSEL_POD;
  const out = Math.atan2(-p.x, -p.z);
  const r = POD.radius + 0.24;
  const g = new THREE.Group();
  g.name = 'island:kapsel-plaque';
  g.position.set(p.x + Math.sin(out) * r, 0.27, p.z + Math.cos(out) * r);
  g.rotation.y = out;
  ctx.root.add(g);
  // one text draw, culled from afar like the Allee's plaque
  const t = ctx.text3d.create({ text: { de: 'Vom Sonnenacker. Diese Kapsel fliegt mit.', en: 'From the Sun Field. This capsule flies with us.' }, font: 'sans-semibold', size: 0.075, color: 0x292524, anchorX: 'center', anchorY: 'middle', maxWidth: 2.4, position: [0, 0, 0.01] }, g);
  cullTinyText(ctx, t);
}

function mergeGlass(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const parts = geos.map((g) => (g.index ? g.toNonIndexed() : g));
  const total = parts.reduce((a, g) => a + g.getAttribute('position').count, 0);
  const pos = new Float32Array(total * 3),
    nor = new Float32Array(total * 3);
  let o = 0;
  for (const g of parts) {
    pos.set(g.getAttribute('position').array as Float32Array, o * 3);
    nor.set(g.getAttribute('normal').array as Float32Array, o * 3);
    o += g.getAttribute('position').count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  return out;
}
