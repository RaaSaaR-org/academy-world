/**
 * Trockendock 3 (plan WP3 build 1, §2.3, D19, D22, R5 §3.1): the wall along `outlineRadius(b, true) + 4`
 * with the bridge notch, 66 m deep.
 *
 *  - the coping (overhangs the slot a little: it hides the yard's polygon edge) and the guard rail;
 *  - the upper 12 m keep the old pit's mining benches (four 3 m steps, each 0.7 m further in, as an open
 *    pit steps in with depth), in sand and clay strata;
 *  - below, the concrete dry-dock wall with ribs, depth ticks 0–66 m in luminous paint (seven-segment
 *    numbers every 10 m, read from the Kanzeln, the Kielraum and the rim; F1's 10 m hover slides them by),
 *    warm work-light strips;
 *  - the wet floor at −66 with its drainage ring, and the keel block (−66 … −60) under the keel tip.
 *
 * Two groups: `rim` (coping, rail, the top bench: seen from everywhere near the dock) and `pit` (everything
 * below −3 m: seen only from the rim, the slot, below the deck and from the ground, so the plaza and the
 * Ausguck skip it; it never casts shadows). The pit gets almost no sun (the island covers it): its sun
 * factor fades out within 2 m of the rim, and its ambient fades fast down the 4 m slot.
 */
import * as THREE from 'three';
import type { ZoneContext } from '@/core/zones';
import { ISLAND, KANZEL_PADS, TROCKENDOCK, bearingOf } from '../layout';
import { T } from './tuning';
import { GroundBatch, mat4, offsetPolyline, orient, sweepSegment, type GroundMaterial, type P2 } from './material';
import { BRIDGE_GAP, NOTCH, wallPolyline } from './outline';

export interface Dock {
  readonly rim: THREE.Group;
  readonly pit: THREE.Group;
  /** the guard rail's line (land side of the coping) for its collider, split at the bridge opening */
  readonly railLines: P2[][];
  /** the concrete face offset (m inward of the top edge) */
  readonly faceInset: number;
  setPitVisible(v: boolean): void;
  /**
   * Only the rim's top (coping, its slot-side face, the guard rail): the eye is low over the island with
   * the pit out of sight, so the coping's underside and land-side edge and the slot's top riser and marks
   * cannot be seen (the terrain's island set; WPF item 3)
   */
  setRimTopOnly(v: boolean): void;
  readonly triangles: number;
}

const C = {
  coping: 0xc9c3ba,
  copingFace: 0x8f887e,
  benchSand: 0xb2a083,
  benchClay: 0x8f7a68,
  tread: 0x7c7064,
  concrete: 0x9d978e,
  rib: 0xa7a197,
  floor: 0x5c5853,
  floorWet: 0x46433f,
  keel: 0x8d877e,
  keelCap: 0x3f3a36,
  paint: 0xe7e5e4,
  rail: 0x9c968f,
};

const sm = THREE.MathUtils.smoothstep;
/** toward the dock axis (vertical faces) and up (horizontal ones) */
const AXIS_UP = (c: THREE.Vector3): THREE.Vector3 => {
  const r = Math.hypot(c.x, c.z) || 1;
  return new THREE.Vector3(-c.x / r, 0.35, -c.z / r);
};
const DOWN = (): THREE.Vector3 => new THREE.Vector3(0, -1, 0);
/** a swept profile segment, wound to face into the slot (or `toward`) */
const sweep = (line: P2[], from: P2, to: P2, toward = AXIS_UP): THREE.BufferGeometry => orient(sweepSegment(line, true, from, to), toward);
/** the sun reaches only the top ≈ 2 m of the slot */
const pitSun = (_x: number, y: number): number => sm(y, -2.4, -0.2);
/** sky light fades fast down the 4 m slot (vertex AO): ≈ 0.55 at −3 m, 0.3 at −8 m, the floor's level below −20 m */
const pitAo = (_x: number, y: number): number => THREE.MathUtils.lerp(T.dock.floorAo, 1, Math.exp(Math.min(0, y + 0.35) / 4.5));

/** seven-segment digits (a b c d e f g) */
const SEG: Record<string, string> = { '0': 'abcdef', '1': 'bc', '2': 'abdeg', '3': 'abcdg', '4': 'bcfg', '5': 'acdfg', '6': 'acdefg', '7': 'abc', '8': 'abcdefg', '9': 'abcdfg' };

/** W6 style: `step` hands the main thread back between the dock's sections (no task > 250 ms at 4× CPU). */
export async function buildDock(ctx: ZoneContext, parent: THREE.Object3D, mat: GroundMaterial, light: THREE.Material, step: () => Promise<void> = () => Promise.resolve()): Promise<Dock> {
  const rim = new THREE.Group();
  rim.name = 'ground:dock-rim';
  const pit = new THREE.Group();
  pit.name = 'ground:dock-pit';
  parent.add(rim, pit);

  const D = T.dock;
  const line = wallPolyline(720);
  const rimB = new GroundBatch();
  // the rim's parts seen only from the slot, from below or from the yard (after the top in the rim's draw)
  const rimSlotB = new GroundBatch();
  const pitB = new GroundBatch();
  const lightB = new GroundBatch();
  // the depth marks below the rim glow faintly (luminous paint, the T0 light tier): F1's 10 m hover is read
  // off them from the Kielraum, deep in the island's shade
  const marksB = new GroundBatch();
  const inset = D.benches * D.benchTread;
  const floorY = TROCKENDOCK.floorY;

  // ── coping (top y 0.06, overhang over the slot, a dark front face) ──
  const cTop: P2 = [D.copingOver, 0.06];
  rimB.add(sweep(line, [-(D.copingWidth - D.copingOver), 0.06], cTop), { color: C.coping, rough: 0.86, grain: 0.8 });
  rimB.add(sweep(line, cTop, [D.copingOver, -0.35]), { color: C.copingFace, rough: 0.8, grain: 0.6, sun: pitSun });
  rimSlotB.add(sweep(line, [D.copingOver, -0.35], [0, -0.35], DOWN), { color: C.copingFace, rough: 0.9, sun: pitSun });
  rimSlotB.add(sweep(line, [-(D.copingWidth - D.copingOver), 0], [-(D.copingWidth - D.copingOver), 0.06], (c) => AXIS_UP(c).negate()), { color: C.copingFace, rough: 0.9 });

  // ── the mining benches (rock strata) and the concrete wall ──
  for (let k = 0; k < D.benches; k++) {
    const d0 = k * D.benchTread;
    const y0 = k === 0 ? -0.35 : -k * D.benchRise;
    const y1 = -(k + 1) * D.benchRise;
    const batch = k === 0 ? rimSlotB : pitB;
    // the riser is battered (0.15 m) and banded: sand above, clay below
    const yMid = (y0 + y1) / 2;
    batch.add(sweep(line, [d0, y0], [d0 + 0.07, yMid]), { color: C.benchSand, rough: 0.95, grain: 1, sun: pitSun, ao: pitAo });
    batch.add(sweep(line, [d0 + 0.07, yMid], [d0 + 0.15, y1]), { color: C.benchClay, rough: 0.95, grain: 1, sun: pitSun, ao: pitAo });
    pitB.add(sweep(line, [d0 + 0.15, y1], [d0 + D.benchTread, y1]), { color: C.tread, rough: 1, grain: 1, sun: pitSun, ao: pitAo });
  }
  const wallTop = -D.benches * D.benchRise;
  const wallSteps = [wallTop, -30, floorY];
  for (let i = 0; i < wallSteps.length - 1; i++)
    pitB.add(sweep(line, [inset, wallSteps[i]], [inset, wallSteps[i + 1]]), { color: C.concrete, rough: 0.88, grain: 0.7, sun: pitSun, ao: pitAo });

  await step();
  // ── ribs (every D.ribEvery m along the concrete wall, not in the notch) ──
  const face = offsetPolyline(line, inset, true);
  const inner = offsetPolyline(line, inset + 1, true);
  let acc = 0;
  const ribBox = new THREE.BoxGeometry(0.8, 1, 0.6);
  for (let i = 0; i < face.length; i++) {
    const a = face[i],
      b = face[(i + 1) % face.length];
    const seg = Math.hypot(b[0] - a[0], b[1] - a[1]);
    acc += seg;
    if (acc < D.ribEvery) continue;
    acc = 0;
    if (Math.abs(a[0]) < NOTCH.half + 1.5 && a[1] > 95) continue;
    const nx = inner[i][0] - a[0],
      nz = inner[i][1] - a[1];
    const yaw = Math.atan2(nx, nz);
    const h = wallTop - 0.4 - floorY;
    pitB.add(ribBox, { color: C.rib, rough: 0.86, grain: 0.7, sun: pitSun, ao: pitAo }, mat4(a[0] + nx * 0.3, floorY + h / 2, a[1] + nz * 0.3, yaw, 1, h, 1));
  }

  // ── depth ticks and numbers (paint on the wall face, 3 cm proud) ──
  const tickBearings = [...ISLAND.lobeBearings.flatMap((b) => [b - 7, b + 7]), ...KANZEL_PADS.map((k) => k.bearing), 172, 188];
  const quad = new THREE.PlaneGeometry(1, 1);
  // each column: its nearest polyline sample (once), then the face offset per depth
  const nearest = (b: number): number => {
    let best = 0,
      bd = Infinity;
    for (let i = 0; i < line.length; i++) {
      const db = Math.abs(((bearingOf(line[i][0], line[i][1]) - b + 540) % 360) - 180);
      if (db < bd) {
        bd = db;
        best = i;
      }
    }
    return best;
  };
  const faceAt = (best: number, y: number): { p: THREE.Vector3; yaw: number } => {
    // the face at depth y: on a riser above the concrete, the concrete below
    const k = Math.min(D.benches, Math.floor(-y / D.benchRise));
    const d = y < wallTop ? inset : k * D.benchTread + 0.12 * ((-y % D.benchRise) / D.benchRise);
    const three: P2[] = [line[(best - 1 + line.length) % line.length], line[best], line[(best + 1) % line.length]];
    const o = offsetPolyline(three, d + 0.03, false);
    const o2 = offsetPolyline(three, d + 1, false);
    const yaw = Math.atan2(o2[1][0] - o[1][0], o2[1][1] - o[1][1]);
    return { p: new THREE.Vector3(o[1][0], y, o[1][1]), yaw };
  };
  const paint = { color: C.paint, rough: 0.7, sun: pitSun, ao: pitAo };
  for (const b of tickBearings) {
    const at = nearest(b);
    for (let m = 1; m <= -floorY; m++) {
      const len = m % 10 === 0 ? 1.3 : m % 5 === 0 ? 0.8 : 0.35;
      const { p, yaw } = faceAt(at, -m);
      const batch = -m >= -3 ? rimSlotB : marksB;
      // the tick runs sideways from the column line; the plane faces the slot
      const side = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
      const c = p.clone().addScaledVector(side, len / 2);
      batch.add(quad, paint, mat4(c.x, c.y, c.z, yaw, len, m % 10 === 0 ? 0.12 : 0.07, 1));
      if (m % 10 === 0) addNumber(marksB, String(m), p.clone().addScaledVector(side, len + 0.25).setY(p.y + 0.05), yaw, paint);
    }
  }

  await step();
  // ── work lights: warm strips under the benches and at mid depth, floor lights along the wall foot ──
  const strip = new THREE.BoxGeometry(1.4, 0.12, 0.06);
  const fstrip = new THREE.BoxGeometry(1.2, 0.04, 0.16);
  acc = 0;
  let n = 0;
  for (let i = 0; i < face.length; i++) {
    const a = face[i],
      b = face[(i + 1) % face.length];
    acc += Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (acc < 14) continue;
    acc = 0;
    n++;
    const nx = inner[i][0] - a[0],
      nz = inner[i][1] - a[1];
    const yaw = Math.atan2(nx, nz);
    const s = { color: 0xffffff, noShade: true };
    lightB.add(strip, s, mat4(a[0] + nx * 0.05, wallTop - 0.6, a[1] + nz * 0.05, yaw));
    if (n % 2 === 0) lightB.add(strip, s, mat4(a[0] + nx * 0.05, -40, a[1] + nz * 0.05, yaw));
    lightB.add(fstrip, s, mat4(a[0] + nx * 0.6, floorY + 0.03, a[1] + nz * 0.6, yaw));
  }

  // ── the floor (wet concrete, a drainage ring) and the keel block ──
  {
    const rings = [0.45, 0.9, 0.975, 1].map((f) => offsetPolyline(line, inset, true).map(([x, z]): P2 => [x * f, z * f]));
    for (let r = 0; r < rings.length - 1; r++) {
      const A = rings[r].map(([x, z]) => new THREE.Vector3(x, floorY, z));
      const B = rings[r + 1].map(([x, z]) => new THREE.Vector3(x, floorY, z));
      const wet = r === 1;
      pitB.add(orientUp(stripBetweenFlat(A, B)), { color: wet ? C.floorWet : C.floor, rough: wet ? 0.22 : 0.55, grain: 0.5, sun: () => 0, ao: () => T.dock.floorAo + 0.1 * r });
    }
    // the centre disc under the keel
    const c = rings[0];
    const pos: number[] = [];
    for (let i = 0; i < c.length; i++) {
      const a = c[i],
        b = c[(i + 1) % c.length];
      pos.push(0, floorY, 0, b[0], floorY, b[1], a[0], floorY, a[1]);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    pitB.add(orientUp(g), { color: C.floor, rough: 0.5, sun: () => 0, ao: () => T.dock.floorAo });
    const kb = TROCKENDOCK.keelBlock;
    pitB.add(new THREE.CylinderGeometry(kb.radius, kb.radius + 0.4, kb.topY - floorY - 0.4, 32, 1), { color: C.keel, rough: 0.9, grain: 0.8, sun: () => 0, ao: () => 0.42 }, mat4(0, (kb.topY - 0.4 + floorY) / 2, 0));
    pitB.add(new THREE.CylinderGeometry(kb.radius - 0.6, kb.radius - 0.6, 0.4, 32, 1), { color: C.keelCap, rough: 0.5, metal: 0.4, sun: () => 0, ao: () => 0.5 }, mat4(0, kb.topY - 0.2, 0));
  }

  await step();
  // ── the guard rail (land side of the coping): posts every 2.4 m, two tube rails; gap at the bridge ──
  const railD = -(D.copingWidth - D.copingOver) + 0.22;
  const railLine = offsetPolyline(line, railD, true);
  const railLines = splitAtBridge(railLine);
  const railStyle = { color: C.rail, rough: 0.36, metal: 0.75 };
  // posts (open, 8 triangles) every ≈ 3 m, the two rails as open square tubes along ≈ 3 m segments
  const post = new THREE.CylinderGeometry(0.05, 0.05, 1.1, 4, 1, true).rotateY(Math.PI / 4);
  for (const l of railLines) {
    const dec: P2[] = [l[0]];
    let a2 = 0;
    for (let i = 1; i < l.length; i++) {
      a2 += Math.hypot(l[i][0] - l[i - 1][0], l[i][1] - l[i - 1][1]);
      if (a2 >= 3 || i === l.length - 1) {
        dec.push(l[i]);
        a2 = 0;
      }
    }
    for (const a of dec) rimB.add(post, railStyle, mat4(a[0], 0.06 + 0.55, a[1]));
    for (const y of [0.62, 1.12])
      for (let i = 0; i < dec.length - 1; i++) {
        const a = new THREE.Vector3(dec[i][0], y, dec[i][1]),
          b = new THREE.Vector3(dec[i + 1][0], y, dec[i + 1][1]);
        const g = new THREE.CylinderGeometry(0.03, 0.03, a.distanceTo(b), 4, 1, true).rotateY(Math.PI / 4);
        const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
        rimB.add(g, railStyle, new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1)));
      }
  }

  const meshes: THREE.Mesh[] = [];
  await step();
  // the top first, then the slot's parts: a draw range shows the top alone (setRimTopOnly)
  const rimTop = rimB.triangles * 3;
  rimB.absorb(rimSlotB);
  const rimMesh = rimB.build(mat, 'ground:dock-rim:static');
  // the pit is in the island's shade: it never casts (and stays out of the shadow pass)
  await step();
  const pitMesh = pitB.build(mat, 'ground:dock-pit:static', { cast: false });
  const lightMesh = lightB.build(light, 'ground:dock-pit:lights', { cast: false, receive: false });
  const marksMesh = marksB.build(ctx.materials.light(0xe7e5e4, 'T0'), 'ground:dock-pit:marks', { cast: false, receive: false });
  if (marksMesh) pit.add(marksMesh);
  if (rimMesh) {
    rim.add(rimMesh);
    meshes.push(rimMesh);
  }
  if (pitMesh) {
    pit.add(pitMesh);
    meshes.push(pitMesh);
  }
  if (lightMesh) pit.add(lightMesh);
  ctx.onDispose(() => {
    for (const m of [rimMesh, pitMesh, lightMesh, marksMesh]) m?.geometry.dispose();
  });

  return {
    rim,
    pit,
    railLines,
    faceInset: inset,
    triangles: meshes.reduce((s, m) => s + m.geometry.getAttribute('position').count / 3, 0),
    setPitVisible(v) {
      pit.visible = v;
    },
    setRimTopOnly(v) {
      if (rimMesh) rimMesh.geometry.drawRange.count = v ? rimTop : Infinity;
    },
  };
}

/** a flat strip between two rings (no winding care: orientUp fixes it) */
function stripBetweenFlat(a: THREE.Vector3[], b: THREE.Vector3[]): THREE.BufferGeometry {
  const pos: number[] = [];
  for (let i = 0; i < a.length; i++) {
    const j = (i + 1) % a.length;
    pos.push(a[i].x, a[i].y, a[i].z, b[i].x, b[i].y, b[i].z, a[j].x, a[j].y, a[j].z, a[j].x, a[j].y, a[j].z, b[i].x, b[i].y, b[i].z, b[j].x, b[j].y, b[j].z);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return g;
}
const orientUp = (g: THREE.BufferGeometry): THREE.BufferGeometry => orient(g, () => new THREE.Vector3(0, 1, 0));

/** split a closed rail line where it crosses the bridge opening at the notch's back wall */
function splitAtBridge(l: P2[]): P2[][] {
  // the rail line's points between the bridge opening's edges (the back wall's middle point) are dropped
  const gap = (p: P2): boolean => Math.abs(p[0]) < BRIDGE_GAP - 0.01 && p[1] > NOTCH.back - 2;
  const out: P2[][] = [];
  let cur: P2[] = [];
  for (const p of l) {
    if (gap(p)) {
      if (cur.length > 1) out.push(cur);
      cur = [];
    } else cur.push(p);
  }
  if (cur.length > 1) {
    // the line is closed: join the tail to the head unless the gap sits between them
    if (out.length && !gap(l[0])) out[0] = [...cur, ...out[0]];
    else out.push(cur);
  }
  return out;
}

/** seven-segment number painted on the wall (one quad per segment) */
function addNumber(batch: GroundBatch, s: string, at: THREE.Vector3, yaw: number, style: { color: number; rough: number }): void {
  const W = 0.42,
    H = 0.8,
    t = 0.09,
    gap = 0.16;
  const side = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
  const q = new THREE.PlaneGeometry(1, 1);
  [...s].forEach((ch, k) => {
    const segs = SEG[ch] ?? '';
    const ox = k * (W + gap);
    const put = (cx: number, cy: number, w: number, h: number): void => {
      const p = at.clone().addScaledVector(side, ox + cx);
      batch.add(q, style, mat4(p.x, at.y + cy, p.z, yaw, w, h, 1));
    };
    if (segs.includes('a')) put(W / 2, H / 2, W, t);
    if (segs.includes('g')) put(W / 2, 0, W, t);
    if (segs.includes('d')) put(W / 2, -H / 2, W, t);
    if (segs.includes('f')) put(0, H / 4, t, H / 2);
    if (segs.includes('b')) put(W, H / 4, t, H / 2);
    if (segs.includes('e')) put(0, -H / 4, t, H / 2);
    if (segs.includes('c')) put(W, -H / 4, t, H / 2);
  });
}

