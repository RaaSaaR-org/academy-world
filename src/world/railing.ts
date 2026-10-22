import * as THREE from 'three';
import type { ZoneContext, ZoneManifest } from '@/core/zones';
import { ISLAND, PATHS, REVIER, ZONE_PLOTS, bearingOf, polar } from './layout';
import { circleProfile, outlineSamples, sweep, type OutlineSample } from './geometry';
import { merge } from './util';
import { type Batch, sharedBatch } from './landscape/batch';

/**
 * Perimeter railing (1.1 m) wherever nothing attaches (§4.2), with the zones' declared
 * railing gaps (manifest `railingGaps`, local degrees), the gap where the bridge leaves the Landedeck
 * (Phase 7), the glass parapets of the Kanzeln and the Glasbalkon, and the Allee railing. ART-V2 §4.3: slim alu posts, two cables,
 * a rounded handrail with a teal line underneath; glass only where people look out.
 */
export function buildRailings(ctx: ZoneContext, manifests: ZoneManifest[]): void {
  const M = ctx.materials;
  const root = ctx.root;
  const H = 1.1;
  CARBON_FOOT = M.carbon;

  // gaps declared by zones (local degrees: 0 = local −z = outward, clockwise from above)
  const gapsFor = new Map<string, { fromDeg: number; toDeg: number }[]>();
  for (const m of manifests) if (m.railingGaps?.length) gapsFor.set(m.id, m.railingGaps);

  const kanzelCenters = ISLAND.kanzeln.bearings.map((b) => polar(b, ISLAND.kanzeln.ring));
  const inGap = (p: OutlineSample): boolean => {
    // Glasbalkon neck (north): the walkway joins at |x| < 2.3
    if (p.z < -80 && Math.abs(p.x) < 2.4) return true;
    // Phase 7 (§2.3): the bridge to the bridge head leaves the Landedeck's south rim (x 0, 4 m wide)
    if (p.z > REVIER.bridge.fromZ - 3 && Math.abs(p.x - REVIER.bridge.x) < REVIER.bridge.width / 2 + 0.05) return true;
    // Kanzeln attach to the rim
    for (const c of kanzelCenters) if (Math.hypot(p.x - c[0], p.z - c[2]) < ISLAND.kanzeln.radius + 0.25) return true;
    for (const z of ZONE_PLOTS) {
      const gaps = gapsFor.get(z.id);
      if (!gaps) continue;
      const dx = p.x - z.anchor[0],
        dz = p.z - z.anchor[2];
      if (Math.hypot(dx, dz) > z.radius + 1) continue;
      let local = bearingOf(dx, dz) - z.bearing;
      local = ((local + 540) % 360) - 180;
      for (const g of gaps) {
        let a = ((g.fromDeg + 540) % 360) - 180,
          b = ((g.toDeg + 540) % 360) - 180;
        if (b < a) [a, b] = [b, a];
        if (local >= a && local <= b) return true;
      }
    }
    return false;
  };
  const isKanzel = (_p: OutlineSample): boolean => false;

  const N = 1440;
  const pts = outlineSamples(N, 0.22);
  // split into runs (contiguous samples not in a gap)
  type Run = { pts: OutlineSample[]; glass: boolean };
  const runs: Run[] = [];
  let cur: Run | null = null;
  // start at a gap (the Glasbalkon neck) so runs never wrap
  const startIdx = pts.findIndex((p) => inGap(p));
  for (let k = 0; k <= N; k++) {
    const p = pts[(startIdx + k) % N];
    if (inGap(p)) {
      cur = null;
      continue;
    }
    const glass = isKanzel(p);
    if (!cur || cur.glass !== glass) {
      if (cur) cur.pts.push(p); // overlap one sample so the rail is continuous
      cur = { pts: [], glass };
      runs.push(cur);
    }
    cur.pts.push(p);
  }

  const batch = sharedBatch(ctx);
  const alu = M.brushedAlu;
  const teal = M.light(0x2dd4bf);
  const v = (p: OutlineSample, y: number): THREE.Vector3 => new THREE.Vector3(p.x, y, p.z);
  for (const run of runs) {
    if (run.pts.length < 2) continue;
    const path = run.pts;
    addRail(batch, alu, teal, path.map((p) => v(p, 0)), H);
    // colliders: chord boxes along the run
    let a = path[0];
    for (let i = 1; i < path.length; i++) {
      const b = path[i];
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      if (len < 3.5 && i < path.length - 1) continue;
      const mx = (a.x + b.x) / 2,
        mz = (a.z + b.z) / 2;
      const yaw = Math.atan2(b.x - a.x, b.z - a.z);
      ctx.physics.addStaticBox({ size: [0.25, 1.3, len + 0.2], position: [mx, 0.65, mz], rotation: [0, yaw, 0], surface: 'metal' });
      a = b;
    }
  }
  const glassMat = M.standard({ color: 0xd6d3d1, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide, envMapIntensity: 0.8 });
  const glassGeos: THREE.BufferGeometry[] = [];

  // ── glass parapets: Glasbalkon and the four Kanzeln (open toward the deck) ─
  const parapet = (cx: number, cz: number, R: number): void => {
    // keep the arc that lies outside the main deck disc (r > 85.2)
    const steps = 72;
    const pts: THREE.Vector3[] = [];
    let started = false;
    const runs: THREE.Vector3[][] = [];
    for (let i = 0; i <= steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      const x = cx + Math.sin(a) * R,
        z = cz + Math.cos(a) * R;
      // the Glasbalkon neck joins the deck at z ≈ −85…−87 (|x| < 2.4); only there is the parapet open
      // (`z < −84` alone matched the balcony's far north end too: no parapet, the player walked off)
      const outside = Math.hypot(x, z) > ISLAND.radius + 0.6 && !(z < -84 && z > -88 && Math.abs(x) < 2.4);
      if (outside) {
        if (!started) runs.push([]);
        started = true;
        runs[runs.length - 1].push(new THREE.Vector3(x, H, z));
      } else started = false;
    }
    // merge a run that wraps around the start
    if (runs.length > 1 && runs[0][0].distanceTo(new THREE.Vector3(cx + Math.sin(0) * R, H, cz + Math.cos(0) * R)) < 1e-3) {
      const first = runs.shift()!;
      runs[runs.length - 1].push(...first);
    }
    void pts;
    for (const path of runs) {
      if (path.length < 2) continue;
      const base = path.map((p) => new THREE.Vector3(p.x, 0, p.z));
      addRail(batch, alu, teal, base, H, { cables: false, step: 1.8 });
      const glassPos: number[] = [],
        idx: number[] = [];
      path.forEach((p, i) => {
        glassPos.push(p.x, 0.08, p.z, p.x, H - 0.08, p.z);
        if (i > 0) {
          const k = (i - 1) * 2;
          idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
        }
      });
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(glassPos, 3));
      g.setIndex(idx);
      g.computeVertexNormals();
      glassGeos.push(g);
      for (let i = 0; i < path.length - 1; i += 3) {
        const p = path[i],
          q = path[Math.min(path.length - 1, i + 3)];
        const len = p.distanceTo(q);
        ctx.physics.addStaticBox({ size: [0.2, 1.3, len + 0.15], position: [(p.x + q.x) / 2, 0.65, (p.z + q.z) / 2], rotation: [0, Math.atan2(q.x - p.x, q.z - p.z), 0] });
      }
    }
  };
  parapet(ISLAND.glasbalkon.center[0], ISLAND.glasbalkon.center[2], ISLAND.glasbalkon.radius - 0.2);
  for (const c of kanzelCenters) parapet(c[0], c[2], ISLAND.kanzeln.radius - 0.2);
  if (glassGeos.length) {
    const gm = new THREE.Mesh(merge(glassGeos), glassMat);
    gm.name = 'island:glass-parapets';
    gm.renderOrder = 2;
    root.add(gm);
    ctx.freezeStatic(gm);
  }

  // ── Recamán-Allee railing (§6.1) ─────────────────────────────────────────
  buildAvenueRailing(ctx);
}

/**
 * Both sides of the Allee (ART-V2 §4.3): the same slim alu railing as the rim. The hoop railing
 * ("bike racks", D5) is gone; the Recamán echo moved into the floor. Gap where the ring path crosses.
 */
function buildAvenueRailing(ctx: ZoneContext): void {
  const M = ctx.materials;
  const batch = sharedBatch(ctx);
  const xSide = PATHS.avenue.width / 2 + 0.35;
  const segments: [number, number][] = [
    [PATHS.plazaRadius + 0.6, PATHS.ring.inner - 0.6],
    [PATHS.ring.outer + 0.6, PATHS.avenue.to - 0.8],
  ];
  for (const [z0, z1] of segments)
    for (const side of [-1, 1]) {
      const x = side * xSide;
      const pts: THREE.Vector3[] = [];
      for (let z = z0; z < z1; z += 1.2) pts.push(new THREE.Vector3(x, 0, z));
      pts.push(new THREE.Vector3(x, 0, z1));
      addRail(batch, M.brushedAlu, M.light(0x2dd4bf), pts, 1.1, { side: side as 1 | -1 });
      ctx.physics.addStaticBox({ size: [0.2, 1.15, z1 - z0], position: [x, 0.575, (z0 + z1) / 2], surface: 'metal' });
    }
}

/**
 * One railing run (ART-V2 §4.3): tapered alu posts every 2.4 m on carbon feet, two stainless cables
 * at 0.4 and 0.75 m, a rounded alu handrail (0.09 × 0.06) at `H` with a teal line on its underside
 * (T0 by day, T1 at dusk). Nothing casts a shadow (QA-04: thin bars dithered the deck).
 */
function addRail(batch: Batch, alu: THREE.Material, teal: THREE.Material, base: THREE.Vector3[], H: number, o: { cables?: boolean; step?: number; side?: 1 | -1 } = {}): void {
  const at = (y: number): THREE.Vector3[] => base.map((p) => new THREE.Vector3(p.x, y, p.z));
  const hr: [number, number][] = [];
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    hr.push([Math.cos(a) * 0.045, Math.sin(a) * 0.03]);
  }
  batch.add(alu, sweep(at(H), hr, false), { name: 'alu' });
  batch.add(teal, sweep(at(H - 0.032), [[-0.014, -0.006], [0.014, -0.006], [0.014, 0.004], [-0.014, 0.004]], false), { name: 'teal-lines' });
  if (o.cables !== false) for (const y of [0.4, 0.75]) batch.add(alu, sweep(at(y), circleProfile(0.009, 4), false), { name: 'alu' });
  // posts by arc length
  const step = o.step ?? 2.4;
  let s = 0,
    last = -1e9;
  for (let i = 0; i < base.length; i++) {
    if (i > 0) s += base[i].distanceTo(base[i - 1]);
    if (s - last >= step || i === base.length - 1) {
      const p = base[i];
      batch.add(alu, new THREE.CylinderGeometry(0.04, 0.05, H - 0.06, 8).translate(p.x, 0.06 + (H - 0.06) / 2, p.z), { name: 'alu' });
      batch.add(alu, new THREE.CylinderGeometry(0.055, 0.055, 0.03, 8).translate(p.x, H - 0.05, p.z), { name: 'alu' });
      batch.add(CARBON_FOOT, new THREE.CylinderGeometry(0.075, 0.09, 0.06, 10).translate(p.x, 0.03, p.z), { name: 'carbon-feet' });
      last = s;
    }
  }
}
let CARBON_FOOT: THREE.Material;
