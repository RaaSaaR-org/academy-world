/**
 * The Werft yard (plan WP3 build 3, §2.3, §2.5, R8 §4.1): the two gantry cranes K1 / K2 (28 m, far
 * landmarks over the rim from the plaza), their rails, battery containers, the surroundings of the four
 * ground pads, and the fences that bound the walkable area (C1 M13): the yard fence (r ≈ 194, gates where
 * the tracks leave), the track corridors and the site rects. Everything here is static (the rim batch);
 * the fence lines are returned for their colliders.
 */
import * as THREE from 'three';
import { GROUND_PADS, LANDMARKS, polar } from '../layout';
import { GroundBatch, beamGeo, mat4, type P2 } from './material';
import { COLLIDERS, FIELDS, GRUBENRAND, PATHS, type XZ } from './plan';

export interface FenceLines {
  /** the yard fence (r ≈ 194) with gates where the tracks leave: on the flat yard, built before the title */
  readonly yard: P2[][];
  /** the track corridors and the site rects: on the terrain, built once the ring heights are in */
  readonly outer: P2[][];
}

/** K1 / K2 (plan §2.3: polar(75, 140), polar(105, 140); layout's LANDMARKS) */
export const CRANES = LANDMARKS.cranes;

const steel = { color: 0xd6d3d1, rough: 0.48, metal: 0.35, grain: 0.3 };
const dark = { color: 0x44403c, rough: 0.5, metal: 0.4 };
const timber = { color: 0x9a9188, rough: 0.9, grain: 0.6 };
const wire = { color: 0x8a847d, rough: 0.5, metal: 0.6 };

/** solid parts the player bumps into (centre, size): the cranes' bogies and feet, the containers */
export interface SolidBox {
  at: [number, number, number];
  size: [number, number, number];
}

function crane(b: GroundBatch, cx: number, cz: number, solids: SolidBox[]): void {
  // the girder's top at LANDMARKS.craneHeight (28 m)
  const span = 34,
    top = LANDMARKS.craneHeight - 1.6,
    legW = 9;
  // rails along x (the cranes run toward the dock)
  for (const dz of [-span / 2, span / 2]) b.add(new THREE.BoxGeometry(60, 0.18, 0.5), dark, mat4(cx + 4, 0.09, cz + dz));
  for (const dz of [-span / 2, span / 2]) {
    // an A-frame leg: two columns from the bogies to the girder, a cross tie, the bogie
    const z = cz + dz;
    const footA = new THREE.Vector3(cx - legW / 2, 1.1, z),
      footB = new THREE.Vector3(cx + legW / 2, 1.1, z),
      apex = new THREE.Vector3(cx, top - 1, z);
    b.add(beamGeo(footA, apex, 0.9, 1.1), steel);
    b.add(beamGeo(footB, apex, 0.9, 1.1), steel);
    b.add(beamGeo(new THREE.Vector3(cx - legW / 4, 9, z), new THREE.Vector3(cx + legW / 4, 9, z), 0.5), steel);
    b.add(new THREE.BoxGeometry(legW + 2, 1.1, 1.6), dark, mat4(cx, 0.55, z));
    solids.push({ at: [cx, 1.5, z], size: [legW + 2, 3, 1.6] });
  }
  // the box girder (overhangs both legs), the trolley and the hook block on its cables
  b.add(new THREE.BoxGeometry(2.6, 2.4, span + 14), steel, mat4(cx, top + 0.2, cz));
  b.add(new THREE.BoxGeometry(2.7, 0.35, span + 14.1), dark, mat4(cx, top - 0.9, cz));
  b.add(new THREE.BoxGeometry(4.2, 2.6, 4.4), { color: 0x57534e, rough: 0.5, metal: 0.35 }, mat4(cx, top + 2.4, cz + 5));
  for (const dx of [-0.5, 0.5]) b.add(new THREE.BoxGeometry(0.06, 14, 0.06), dark, mat4(cx + dx, top - 8, cz + 5));
  b.add(new THREE.BoxGeometry(1.6, 1.4, 1.2), { color: 0xff6700, rough: 0.5, metal: 0.2 }, mat4(cx, top - 15.6, cz + 5));
}

/** where a polyline crosses the circle r (the track exits through the yard fence) */
function crossings(pts: XZ[], r: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i],
      b = pts[i + 1];
    const ra = Math.hypot(a[0], a[1]),
      rb = Math.hypot(b[0], b[1]);
    if ((ra - r) * (rb - r) > 0) continue;
    const t = (r - ra) / (rb - ra || 1);
    const x = a[0] + (b[0] - a[0]) * t,
      z = a[1] + (b[1] - a[1]) * t;
    const bearing = (Math.atan2(x, -z) * 180) / Math.PI;
    out.push((bearing + 360) % 360);
  }
  return out;
}

export function buildWerft(rim: GroundBatch): SolidBox[] {
  const solids: SolidBox[] = [];
  for (const [x, , z] of CRANES) crane(rim, x, z, solids);
  // battery containers (rule 1: battery containers exist) beside K2, and a parts stack beside K1
  const cont = [0x8a847d, 0x9a9188, 0x6f6963, 0x8a847d];
  [
    [168, 52, 0],
    [168, 59, 0],
    [176, 52, 0],
    [168, -54, 1],
  ].forEach(([x, z, k], i) => {
    rim.add(new THREE.BoxGeometry(6.1, 2.6, 2.45), { color: cont[i], rough: 0.6, metal: 0.3, grain: 0.3 }, mat4(x, 1.3, z));
    rim.add(new THREE.BoxGeometry(0.5, 0.5, 0.06), { color: 0x2dd4bf, rough: 0.5 }, mat4(x - 3.06, 1.9, z));
    if (k) rim.add(new THREE.BoxGeometry(6.1, 2.6, 2.45), { color: 0x9a9188, rough: 0.6, metal: 0.3 }, mat4(x, 3.9, z));
    solids.push({ at: [x, k ? 2.6 : 1.3, z], size: [6.1, k ? 5.2 : 2.6, 2.45] });
  });

  // the Werfthalle between the cranes: the repair shop for the island's parts (rule 10: every object has a
  // job), clay plaster and silver larch, a PV roof, its door toward the dock
  {
    const hx = 171,
      hz = 0,
      W = 30,
      D = 18,
      H = 8;
    rim.add(new THREE.BoxGeometry(W, H, D), { color: 0xc8bfb2, rough: 0.85, grain: 0.7 }, mat4(hx, H / 2, hz));
    rim.add(new THREE.BoxGeometry(W + 0.2, 2.2, D + 0.2), { color: 0x9a9188, rough: 0.9, grain: 0.8 }, mat4(hx, H - 1.1, hz));
    // a shallow ridge along x, PV on both slopes
    for (const side of [-1, 1]) {
      const g = new THREE.BoxGeometry(W + 1.2, 0.18, D / 2 + 0.7);
      const m = new THREE.Matrix4().compose(new THREE.Vector3(hx, H + 0.9, hz + (side * D) / 4), new THREE.Quaternion().setFromEuler(new THREE.Euler(side * 0.2, 0, 0)), new THREE.Vector3(1, 1, 1));
      rim.add(g, { color: 0x2b2a2c, rough: 0.3, metal: 0.3 }, m);
    }
    // the door (west, toward the dock) and its frame
    rim.add(new THREE.BoxGeometry(0.2, 6, 10), { color: 0x3f3a36, rough: 0.5, metal: 0.4 }, mat4(hx - W / 2 - 0.05, 3, hz));
    rim.add(new THREE.BoxGeometry(0.3, 0.4, 10.8), { color: 0xff6700, rough: 0.6 }, mat4(hx - W / 2 - 0.1, 6.2, hz));
    solids.push({ at: [hx, H / 2, hz], size: [W, H, D] });
    // a rack of steel profiles and two coils on the apron in front of it
    for (let k = 0; k < 3; k++) rim.add(new THREE.BoxGeometry(9, 0.25, 0.3), { color: 0x78716c, rough: 0.4, metal: 0.7 }, mat4(hx - W / 2 - 8, 0.5 + k * 0.3, hz + 6 + k * 0.05));
    for (const dz of [-0.7, 0.7]) rim.add(new THREE.BoxGeometry(0.25, 1.2, 0.25), dark, mat4(hx - W / 2 - 8 + dz * 5, 0.6, hz + 6));
    solids.push({ at: [hx - W / 2 - 8, 0.6, hz + 6], size: [9.4, 1.2, 0.8] });
  }

  // the ground pads' surroundings: a painted ring, four bollards (the pad itself is the transit code's)
  const ring = new THREE.RingGeometry(2.25, 2.45, 48).rotateX(-Math.PI / 2);
  const bollard = new THREE.CylinderGeometry(0.16, 0.2, 0.9, 10);
  for (const g of GROUND_PADS) {
    const [x, , z] = g.position;
    rim.add(ring, { color: 0xe7e5e4, rough: 0.7 }, mat4(x, 0.02, z));
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
      rim.add(bollard, { color: 0xc9c3ba, rough: 0.8, grain: 0.6 }, mat4(x + Math.cos(a) * 6.5, 0.45, z + Math.sin(a) * 6.5));
    }
  }

  return solids;
}

/** The fences that bound the walkable area (C1 M13): pure geometry from plan.ts. */
export function fenceLines(): FenceLines {
  const yard: P2[][] = [];
  const fences: P2[][] = [];
  const R = COLLIDERS.yardFence;
  const exits: number[] = [];
  for (const p of PATHS) if (!p.open) exits.push(...crossings(p.pts, R));
  const gateHalf = (6 / R) * (180 / Math.PI); // ±6 m
  {
    let cur: P2[] = [];
    const n = 720;
    for (let i = 0; i <= n; i++) {
      const b = (i / n) * 360;
      const inGate = exits.some((e) => Math.abs(((b - e + 540) % 360) - 180) < gateHalf);
      if (inGate) {
        if (cur.length > 1) yard.push(cur);
        cur = [];
        continue;
      }
      const [x, , z] = polar(b, R);
      cur.push([x, z]);
    }
    if (cur.length > 1) {
      if (yard.length && !exits.some((e) => Math.abs(((0 - e + 540) % 360) - 180) < gateHalf)) yard[0] = [...cur, ...yard[0]];
      else yard.push(cur);
    }
  }
  // the corridors: both sides of every track outside the yard, up to its site
  const siteRects = FIELDS.map((f) => ({ at: f.at, half: [f.size[0] / 2 + COLLIDERS.siteMargin, f.size[1] / 2 + COLLIDERS.siteMargin] as XZ }));
  const inSite = (x: number, z: number): boolean => siteRects.some((s) => Math.abs(x - s.at[0]) < s.half[0] && Math.abs(z - s.at[1]) < s.half[1]);
  // the excavator's lay-by beside the Sonnenacker track (G-LOOK, D42; plan.ts GRUBENRAND.pad): the corridor
  // widens into it, so its fence is a U around the lay-by's far side; other fences stop exactly on its edge
  const L = GRUBENRAND.pad;
  const padHalf: XZ = [L.size[0] / 2 + 1, L.size[1] / 2 + 1];
  const inPad = (q: P2): boolean => Math.abs(q[0] - L.at[0]) < padHalf[0] && Math.abs(q[1] - L.at[1]) < padHalf[1];
  /** a fence polyline cut where `inside` holds, each cut ending exactly on the boundary (bisected) */
  const cut = (line: P2[], inside: (q: P2) => boolean, sink: P2[][]): void => {
    let cur: P2[] = [];
    const edge = (a: P2, b: P2): P2 => {
      let lo = 0,
        hi = 1;
      const ina = inside(a);
      for (let k = 0; k < 24; k++) {
        const m = (lo + hi) / 2;
        if (inside([a[0] + (b[0] - a[0]) * m, a[1] + (b[1] - a[1]) * m]) === ina) lo = m;
        else hi = m;
      }
      const t = ina ? hi : lo;
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    };
    for (let i = 0; i < line.length; i++) {
      const q = line[i];
      if (!inside(q)) {
        if (!cur.length && i > 0) cur.push(edge(line[i - 1], q));
        cur.push(q);
      } else if (cur.length) {
        cur.push(edge(line[i - 1], q));
        if (cur.length > 1) sink.push(cur);
        cur = [];
      }
    }
    if (cur.length > 1) sink.push(cur);
  };
  const raw: P2[][] = [];
  const laybyTrack = PATHS.find((p) => p.id === 'sonnenacker')!;
  let laybyOff = 0;
  for (const p of PATHS) {
    if (p.open) continue;
    const off = p.width / 2 + COLLIDERS.corridor - 1.5;
    if (p === laybyTrack) laybyOff = off;
    for (const side of [-1, 1]) {
      let cur: P2[] = [];
      const dense = densify(p.pts, 3);
      for (let i = 0; i < dense.length; i++) {
        const a = dense[Math.max(0, i - 1)],
          c = dense[Math.min(dense.length - 1, i + 1)];
        let nx = -(c[1] - a[1]),
          nz = c[0] - a[0];
        const l = Math.hypot(nx, nz) || 1;
        nx = (nx / l) * off * side;
        nz = (nz / l) * off * side;
        const q: P2 = [dense[i][0] + nx, dense[i][1] + nz];
        const out = Math.hypot(q[0], q[1]) > R + 1 && !inSite(q[0], q[1]);
        if (out) cur.push(q);
        else if (cur.length) {
          if (cur.length > 1) raw.push(cur);
          cur = [];
        }
      }
      if (cur.length > 1) raw.push(cur);
    }
  }
  // the site rects (plus margin), with a 10 m gate where a track arrives
  for (const s of siteRects) {
    const [hx, hz] = s.half;
    const corners: P2[] = [
      [s.at[0] - hx, s.at[1] - hz],
      [s.at[0] + hx, s.at[1] - hz],
      [s.at[0] + hx, s.at[1] + hz],
      [s.at[0] - hx, s.at[1] + hz],
      [s.at[0] - hx, s.at[1] - hz],
    ];
    const arrivals: P2[] = [];
    for (const p of PATHS) {
      if (p.open) continue;
      for (const q of densify(p.pts, 2)) if (Math.abs(Math.abs(q[0] - s.at[0]) - hx) < 1.2 && Math.abs(q[1] - s.at[1]) < hz) arrivals.push(q);
      for (const q of densify(p.pts, 2)) if (Math.abs(Math.abs(q[1] - s.at[1]) - hz) < 1.2 && Math.abs(q[0] - s.at[0]) < hx) arrivals.push(q);
    }
    let cur: P2[] = [];
    for (const q of densify(corners, 3)) {
      const gate = arrivals.some((a) => Math.hypot(a[0] - q[0], a[1] - q[1]) < 5.5);
      // the yard fence closes the inner side of sites that touch it
      if (gate || Math.hypot(q[0], q[1]) < R + 1) {
        if (cur.length > 1) raw.push(cur);
        cur = [];
      } else cur.push(q);
    }
    if (cur.length > 1) raw.push(cur);
  }
  for (const l of raw) cut(l, inPad, fences);
  // the lay-by's own fence: its outline (1 m out) where it leaves the corridor
  const bed = densify(laybyTrack.pts, 1);
  const inCorridor = (q: P2): boolean => bed.some((b) => Math.hypot(b[0] - q[0], b[1] - q[1]) < laybyOff);
  const [px, pz] = [L.at[0], L.at[1]];
  const outline = densify(
    [
      [px - padHalf[0], pz - padHalf[1]],
      [px + padHalf[0], pz - padHalf[1]],
      [px + padHalf[0], pz + padHalf[1]],
      [px - padHalf[0], pz + padHalf[1]],
      [px - padHalf[0], pz - padHalf[1]],
    ],
    1,
  );
  cut(outline, inCorridor, fences);
  return { yard, outer: fences };
}

/** Post-and-wire field fences (timber posts every 3 m, three wires) standing on the terrain. */
/**
 * Every fence line into one batch: all the posts first, then all the wires, so a draw range can show the posts
 * alone (from the deck the wires are under a pixel: the island set draws the posts only). Returns the posts'
 * vertex count.
 */
export function addFences(b: GroundBatch, lines: P2[][], heightAt: (x: number, z: number) => number): number {
  // one post and one wire segment every ≈ 5 m
  const resampled = lines.map((l) => resample(l, 5));
  for (const line of resampled) fencePosts(b, line, heightAt);
  const posts = b.triangles * 3;
  for (const line of resampled) fenceWires(b, line, heightAt);
  return posts;
}

/** an open timber post: four sides, no caps (8 triangles) */
const POST = (() => {
  const g = new THREE.CylinderGeometry(0.085, 0.085, 1.3, 4, 1, true).rotateY(Math.PI / 4);
  return g;
})();

function fencePosts(b: GroundBatch, line: P2[], heightAt: (x: number, z: number) => number): void {
  for (let i = 0; i < line.length; i++) {
    const a = line[i];
    b.add(POST, timber, mat4(a[0], heightAt(a[0], a[1]) + 0.6, a[1]));
  }
}

function fenceWires(b: GroundBatch, line: P2[], heightAt: (x: number, z: number) => number): void {
  // two wires as thin ribbons, both faces (4 triangles a segment instead of a box's 12)
  for (const y of [0.55, 1.1]) {
    const pos: number[] = [];
    for (let i = 0; i < line.length - 1; i++) {
      const a = line[i],
        c = line[i + 1];
      const ya = heightAt(a[0], a[1]) + y,
        yc = heightAt(c[0], c[1]) + y;
      const t = 0.018;
      const q = [a[0], ya - t, a[1], c[0], yc - t, c[1], a[0], ya + t, a[1], c[0], yc + t, c[1]];
      pos.push(...q.slice(0, 3), ...q.slice(3, 6), ...q.slice(6, 9), ...q.slice(6, 9), ...q.slice(3, 6), ...q.slice(9, 12));
      pos.push(...q.slice(0, 3), ...q.slice(6, 9), ...q.slice(3, 6), ...q.slice(6, 9), ...q.slice(9, 12), ...q.slice(3, 6));
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    b.add(g, wire);
  }
}

/** points every ≈ `step` m along an open polyline (keeps both ends) */
function resample(pts: P2[], step: number): P2[] {
  const out: P2[] = [pts[0]];
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    acc += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    if (acc >= step || i === pts.length - 1) {
      out.push(pts[i]);
      acc = 0;
    }
  }
  return out;
}

export function densify(pts: XZ[], step: number): XZ[] {
  const out: XZ[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i],
      b = pts[i + 1];
    const k = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step));
    for (let j = 0; j < k; j++) out.push([a[0] + ((b[0] - a[0]) * j) / k, a[1] + ((b[1] - a[1]) * j) / k]);
  }
  out.push(pts[pts.length - 1]);
  return out;
}

