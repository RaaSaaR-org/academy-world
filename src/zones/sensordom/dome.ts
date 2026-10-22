/**
 * Exterior: geodesic dome on a riser wall (drum r 16 × 4.2 m, geodesic cap to 13 m, centre
 * (0, 0, −4)) with a glazed visor band and two teal swept "eyes" facing the hub — the dome is
 * EMI's head; the LiDAR head spins on top (top y = 16) and throws a teal fan 30 m out.
 * Schleuse tunnel from the gate arch (z ≈ 21.7) through the drum wall (z ≈ 11.7).
 * Far tier: one low-poly silhouette + the fan.
 */
import * as THREE from 'three';
import type { ZoneContext } from '@/core/zones';
import { Builder, placed, type V3 } from './kit';
import { G_SOLID } from './lidar';
import { fanMaterial, own } from './materials';
import { metreUv, rbox, TOK, type Look } from './look';

/** R radius, H total height, D drum (riser wall) height, cz centre z */
export const DOME = { R: 16, H: 13, D: 4.2, cz: -4 } as const;
const CAP = DOME.H - DOME.D;
/** inner face of the drum wall at x = 0 (the dome entrance) */
export const PORTAL = { z0: 11.6 } as const;
export const TUNNEL = { w: 4, h: 3.5, z0: 11.62, z1: 21.4 } as const;
export const HEAD_Y = 15.52;

interface Geodesic {
  verts: THREE.Vector3[];
  faces: [number, number, number][];
  /** per face: 0 = "up" triangle of the subdivision, 1 = "down" (for the alternating panel pattern) */
  kinds: number[];
}

/** Class-I geodesic hemisphere (vertex up). Even `n` puts a vertex ring exactly on the equator. */
export function geodesicHemisphere(n: number): Geodesic {
  const phi = (1 + Math.sqrt(5)) / 2;
  const V = [
    [-1, phi, 0], [1, phi, 0], [-1, -phi, 0], [1, -phi, 0], [0, -1, phi], [0, 1, phi],
    [0, -1, -phi], [0, 1, -phi], [phi, 0, -1], [phi, 0, 1], [-phi, 0, -1], [-phi, 0, 1],
  ].map((v) => new THREE.Vector3(v[0], v[1], v[2]).normalize());
  const F = [
    [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
  ];
  const q = new THREE.Quaternion().setFromUnitVectors(V[0].clone(), new THREE.Vector3(0, 1, 0));
  for (const v of V) v.applyQuaternion(q);
  const verts: THREE.Vector3[] = [];
  const key = new Map<string, number>();
  const vid = (p: THREE.Vector3): number => {
    const k = `${Math.round(p.x * 1e5)},${Math.round(p.y * 1e5)},${Math.round(p.z * 1e5)}`;
    let i = key.get(k);
    if (i === undefined) {
      i = verts.length;
      verts.push(p.clone());
      key.set(k, i);
    }
    return i;
  };
  const faces: [number, number, number][] = [];
  const kinds: number[] = [];
  const tmp = new THREE.Vector3();
  for (const [a, b, c] of F) {
    const A = V[a],
      B = V[b],
      C = V[c];
    const P = (i: number, j: number): number => vid(tmp.set(0, 0, 0).addScaledVector(A, (n - i - j) / n).addScaledVector(B, i / n).addScaledVector(C, j / n).normalize());
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n - i; j++) {
        faces.push([P(i, j), P(i + 1, j), P(i, j + 1)]);
        kinds.push(0);
        if (i + j < n - 1) {
          faces.push([P(i + 1, j), P(i + 1, j + 1), P(i, j + 1)]);
          kinds.push(1);
        }
      }
  }
  for (const v of verts) if (Math.abs(v.y) < 1e-4) v.y = 0;
  const keep = faces.map((f) => (verts[f[0]].y + verts[f[1]].y + verts[f[2]].y) / 3 > 1e-4);
  return { verts, faces: faces.filter((_, i) => keep[i]), kinds: kinds.filter((_, i) => keep[i]) };
}

/** unit hemisphere → cap on the drum */
const toDome = (u: THREE.Vector3, out = new THREE.Vector3()): THREE.Vector3 => out.set(u.x * DOME.R, DOME.D + Math.max(0, u.y) * CAP, u.z * DOME.R + DOME.cz);
/** cap surface point for (azimuth from +z, elevation), lifted along the normal */
export function domePoint(az: number, el: number, lift = 0, out = new THREE.Vector3()): THREE.Vector3 {
  const u = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
  toDome(u, out);
  const n = new THREE.Vector3(u.x / DOME.R, u.y / CAP, u.z / DOME.R).normalize();
  return out.addScaledVector(n, lift);
}
/** inside height above (x, z) local, 0 outside */
export function domeHeightAt(x: number, z: number): number {
  const r2 = (x * x + (z - DOME.cz) ** 2) / (DOME.R * DOME.R);
  return r2 >= 1 ? 0 : DOME.D + CAP * Math.sqrt(1 - r2);
}

export interface DomeParts {
  fanPivots: THREE.Object3D[];
  emitter: THREE.Object3D;
  /** local LiDAR head position */
  headLocal: THREE.Vector3;
}

export function buildDome(ctx: ZoneContext, B: Builder, look: Look): DomeParts {
  const M = ctx.materials;
  // ART-V2 §6.1: the dome is an engineered sensor head. Light ceramic and dark-glass triangles in
  // bands (≈ 60 / 40), the visor band stays dark, alu struts, a ceramic drum on a carbon reveal.
  // An open shell must cast shadows with both sides (FrontSide alone leaves only back faces in the map).
  const capHull = look.own(new THREE.MeshPhysicalMaterial({ color: TOK.hull, roughness: 0.5, metalness: 0, clearcoat: 0.12, clearcoatRoughness: 0.5, envMapIntensity: 0.8, shadowSide: THREE.DoubleSide, name: 'sensordom:cap-hull' }));
  const capGlass = look.own(new THREE.MeshPhysicalMaterial({ color: TOK.carbon, roughness: 0.08, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.04, envMapIntensity: 1.2, shadowSide: THREE.DoubleSide, name: 'sensordom:cap-glass' }));
  const alu = look.alu;
  const hull = look.hull;
  const carbon = look.carbon;

  // ── geodesic cap ─────────────────────────────────────────────────────────
  const geo = geodesicHemisphere(6);
  const P = geo.verts.map((u) => toDome(u));
  const faces = geo.faces;
  const plain: number[] = [],
    glazed: number[] = [],
    full: number[] = [];
  const c = new THREE.Vector3();
  faces.forEach((f, fi) => {
    c.set(0, 0, 0);
    for (const i of f) c.add(geo.verts[i]);
    c.normalize();
    const el = Math.asin(c.y),
      az = Math.atan2(c.x, c.z);
    // bands: ceramic skirt · the visor band (dark all round, EMI's face towards the hub) ·
    // an alternating sensor-window band · ceramic crown
    const visorBand = el > 0.22 && el < 0.6;
    const windowBand = el >= 0.6 && el < 0.95;
    const isGlazed = (visorBand && (Math.abs(az) < 1.3 || geo.kinds[fi] === 1)) || (windowBand && geo.kinds[fi] === 1 && Math.abs(az) > 0.4);
    const dst = isGlazed ? glazed : plain;
    for (const i of f) {
      dst.push(P[i].x, P[i].y, P[i].z);
      full.push(P[i].x, P[i].y, P[i].z);
    }
  });
  const tri = (arr: number[]): THREE.BufferGeometry => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
    g.computeVertexNormals();
    return g;
  };
  B.geo(tri(plain), { mat: capHull, seg: 'struktur', group: 'exterior', castShadow: true });
  B.geo(tri(glazed), { mat: capGlass, seg: 'struktur', group: 'exterior', castShadow: true });
  // colliders: full faces (no seam gaps) in both worlds
  const fullGeo = tri(full);
  const collMesh = new THREE.Mesh(fullGeo, M.basic(0x000000));
  collMesh.visible = false;
  ctx.root.add(collMesh);
  ctx.physics.addStaticTrimesh(collMesh, { surface: 'metal' });
  B.lidar.addTrimesh(fullGeo, G_SOLID, { seg: 'struktur', depth: 'normal' });

  // inside: an unlit gradient shell (the warm ring light washing up the cap) + seam lines
  const inner = fullGeo.clone();
  const ip = inner.getAttribute('position');
  const col = new Float32Array(ip.count * 3);
  const cLo = new THREE.Color(0x6a6560),
    cHi = new THREE.Color(0x1f1d1b),
    cc = new THREE.Color();
  for (let i = 0; i < ip.count; i++) {
    const t = THREE.MathUtils.clamp((ip.getY(i) - DOME.D) / CAP, 0, 1);
    cc.copy(cLo).lerp(cHi, Math.pow(t, 0.55));
    col.set([cc.r, cc.g, cc.b], i * 3);
  }
  inner.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const innerMat = own(new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, name: 'sensordom:inner' }));
  const innerMesh = new THREE.Mesh(inner, innerMat);
  ctx.groups.detail.add(innerMesh);
  B.visor.register(innerMesh, { seg: 'struktur' });
  const seamPos: number[] = [];
  const nIn = new THREE.Vector3();
  const seamSeen = new Set<string>();
  const inward = (p: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 => {
    nIn.set(p.x / DOME.R ** 2, (p.y - DOME.D) / CAP ** 2, (p.z - DOME.cz) / DOME.R ** 2).normalize();
    return out.copy(p).addScaledVector(nIn, -0.06);
  };
  const s0 = new THREE.Vector3(),
    s1 = new THREE.Vector3();
  for (const f of faces)
    for (let k = 0; k < 3; k++) {
      const i = f[k],
        j = f[(k + 1) % 3];
      const id = i < j ? `${i}-${j}` : `${j}-${i}`;
      if (seamSeen.has(id)) continue;
      seamSeen.add(id);
      inward(P[i], s0);
      inward(P[j], s1);
      seamPos.push(s0.x, s0.y, s0.z, s1.x, s1.y, s1.z);
    }
  const seamGeo = new THREE.BufferGeometry();
  seamGeo.setAttribute('position', new THREE.Float32BufferAttribute(seamPos, 3));
  const seams = new THREE.LineSegments(seamGeo, own(new THREE.LineBasicMaterial({ color: 0x6b6661, name: 'sensordom:seams' })));
  ctx.groups.detail.add(seams);
  B.visor.registerRgbOnly(seams);
  // drum lining: carbon wall panels with the opening left free; vertical teal seams every 30°
  const liningTex = own(
    M.canvasTexture(256, 128, (g: CanvasRenderingContext2D, w: number, h: number) => {
      g.fillStyle = '#1c1a19';
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < 2; i++) {
        const x = (i * w) / 2;
        const gr = g.createLinearGradient(x, 0, x + w / 2, 0);
        gr.addColorStop(0, '#201e1c');
        gr.addColorStop(0.5, '#2c2a28');
        gr.addColorStop(1, '#201e1c');
        g.fillStyle = gr;
        g.fillRect(x + 3, 0, w / 2 - 6, h);
        g.fillStyle = '#0e0d0c';
        g.fillRect(x, 0, 3, h);
      }
      // carbon reveal at the foot
      g.fillStyle = '#121110';
      g.fillRect(0, h * 0.9, w, h * 0.1);
    }),
  );
  liningTex.repeat.set(48, 1);
  const lining = new THREE.CylinderGeometry(15.7, 15.7, DOME.D - 0.05, 96, 1, true, 0.15, Math.PI * 2 - 0.3);
  B.geo(placed(lining, [0, DOME.D / 2, DOME.cz]), { mat: own(new THREE.MeshPhysicalMaterial({ map: liningTex, side: THREE.BackSide, roughness: 0.4, metalness: 0.2, clearcoat: 0.5, clearcoatRoughness: 0.25, name: 'sensordom:lining' })), seg: 'struktur' });
  const tealT0 = look.light('teal', 0);
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2 + Math.PI / 12; // 15° off the portal axis: no seam in the opening
    const x = Math.sin(a) * 15.66,
      z = DOME.cz + Math.cos(a) * 15.66;
    if (Math.abs(x) < 3 && z > 8) continue;
    B.geo(placed(new THREE.BoxGeometry(0.06, DOME.D - 0.7, 0.03), [x, (DOME.D - 0.7) / 2 + 0.38, z], [0, a, 0]), { mat: carbon, seg: 'struktur' });
    B.geo(placed(new THREE.BoxGeometry(0.03, DOME.D - 0.8, 0.02), [x * 0.9985, (DOME.D - 0.8) / 2 + 0.43, DOME.cz + (z - DOME.cz) * 0.9985], [0, a, 0]), { mat: tealT0, seg: 'struktur' });
  }
  // the warm ring light at the drum top (T1, in a carbon channel)
  const cove = new THREE.TorusGeometry(15.5, 0.04, 6, 120, Math.PI * 2 - 0.3).rotateX(Math.PI / 2).rotateY(Math.PI / 2 + 0.15);
  B.geo(placed(cove, [0, 4.0, DOME.cz]), { mat: look.light('warm', 1), seg: 'struktur' });
  const coveCh = new THREE.CylinderGeometry(15.62, 15.62, 0.16, 96, 1, true, 0.15, Math.PI * 2 - 0.3);
  B.geo(placed(coveCh, [0, 4.0, DOME.cz]), { mat: carbon, seg: 'struktur' });

  // struts along every edge, alu, standing 10 cm proud of the panels
  const seen = new Set<string>();
  const ex = new THREE.Vector3(),
    ey = new THREE.Vector3(),
    ez = new THREE.Vector3(),
    mid = new THREE.Vector3();
  const mtx = new THREE.Matrix4();
  const sc = new THREE.Vector3();
  for (const f of faces)
    for (let k = 0; k < 3; k++) {
      const i = f[k],
        j = f[(k + 1) % 3];
      const id = i < j ? `${i}-${j}` : `${j}-${i}`;
      if (seen.has(id)) continue;
      seen.add(id);
      ex.subVectors(P[j], P[i]);
      const len = ex.length();
      ex.normalize();
      mid.addVectors(P[i], P[j]).multiplyScalar(0.5);
      ey.set(mid.x / DOME.R ** 2, (mid.y - DOME.D) / CAP ** 2, (mid.z - DOME.cz) / DOME.R ** 2).normalize();
      ez.crossVectors(ex, ey).normalize();
      ey.crossVectors(ez, ex).normalize();
      mtx.makeBasis(ex, ey, ez).scale(sc.set(len + 0.1, 0.1, 0.13)).setPosition(mid.addScaledVector(ey, 0.06));
      B.geo(new THREE.BoxGeometry(1, 1, 1).applyMatrix4(mtx), { mat: alu, seg: 'struktur', group: 'exterior' });
    }

  // EMI's eyes: two swept teal strips on the visor band (brand: teal = EMI eyes) — T1 glow
  for (const s of [-1, 1]) {
    const pos: number[] = [];
    const N = 14;
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const az = s * (0.11 + 0.32 * t);
      const el = 0.38 + 0.09 * t * t;
      const w = 0.022 + 0.016 * Math.sin(Math.PI * t);
      const p0 = domePoint(az, el - w, 0.17),
        p1 = domePoint(az, el + w, 0.17);
      pos.push(p0.x, p0.y, p0.z, p1.x, p1.y, p1.z);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const idx: number[] = [];
    // winding mirrors with the side: both strips must face outward (single-sided material)
    for (let i = 0; i < N; i++) {
      if (s < 0) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
      else idx.push(i * 2, i * 2 + 2, i * 2 + 1, i * 2 + 1, i * 2 + 2, i * 2 + 3);
    }
    g.setIndex(idx);
    g.computeVertexNormals();
    B.geo(g, { mat: look.light('teal', 1), seg: 'struktur', group: 'exterior' });
  }

  // ── drum (riser wall) on the equator vertices, with the tunnel opening at azimuth 0 ──
  // ceramic body from 0.3 m up, a carbon reveal (inset 0.22 m) below it, an alu collar on top;
  // the colliders keep the full 0 … D wall as before
  const eq = geo.verts
    .filter((v) => v.y === 0)
    .map((v) => ({ az: Math.atan2(v.x, v.z), p: toDome(v).setY(0) }))
    .sort((p, q) => p.az - q.az);
  const half = TUNNEL.w / 2 + 0.3;
  const drumT = 0.32;
  const REVEAL = 0.3;
  const seg = (p0: THREE.Vector3, p1: THREE.Vector3, y0: number, y1: number): void => {
    const len = p0.distanceTo(p1);
    if (len < 0.02 || y1 - y0 < 0.02) return;
    const ry = Math.atan2(p1.x - p0.x, p1.z - p0.z) - Math.PI / 2;
    const cx = (p0.x + p1.x) / 2,
      cz = (p0.z + p1.z) / 2;
    B.collider({ size: [len + 0.4, y1 - y0, drumT], pos: [cx, (y0 + y1) / 2, cz], rot: [0, ry, 0], seg: 'struktur' });
    const vy0 = Math.max(y0, REVEAL);
    if (y1 - vy0 > 0.02) B.geo(metreUv(placed(new THREE.BoxGeometry(len + 0.36, y1 - vy0, drumT), [cx, (vy0 + y1) / 2, cz], [0, ry, 0])), { mat: hull, seg: 'struktur', group: 'exterior', castShadow: true });
    if (y0 < REVEAL) {
      // inset reveal: pull the box 0.22 m towards the dome centre
      const n = new THREE.Vector3(cx, 0, cz - DOME.cz).normalize().multiplyScalar(-0.22);
      B.geo(placed(new THREE.BoxGeometry(len + 0.36, REVEAL - y0, drumT), [cx + n.x, (y0 + REVEAL) / 2, cz + n.z], [0, ry, 0]), { mat: carbon, seg: 'struktur', group: 'exterior' });
    }
  };
  const lerpX = (p0: THREE.Vector3, p1: THREE.Vector3, x: number): THREE.Vector3 => p0.clone().lerp(p1, (x - p0.x) / (p1.x - p0.x));
  for (let i = 0; i < eq.length; i++) {
    const p0 = eq[i].p,
      p1 = eq[(i + 1) % eq.length].p;
    const front = p0.z > 8 && p1.z > 8 && Math.min(Math.abs(p0.x), Math.abs(p1.x)) < half;
    if (!front) {
      seg(p0, p1, 0, DOME.D);
      continue;
    }
    // one side of the opening: solid outside |x| > half, lintel above the tunnel
    const inner = Math.abs(p0.x) < Math.abs(p1.x) ? p0 : p1,
      outer = inner === p0 ? p1 : p0;
    const cut = lerpX(inner, outer, Math.sign(outer.x) * half);
    seg(cut, outer, 0, DOME.D);
    seg(inner, cut, TUNNEL.h + 0.25, DOME.D);
  }
  // alu collar on the drum top + slim alu pilasters at the vertices
  const ringBeam = new THREE.TorusGeometry(DOME.R + 0.05, 0.12, 8, 120).rotateX(Math.PI / 2);
  B.geo(placed(ringBeam, [0, DOME.D, DOME.cz]), { mat: alu, seg: 'struktur', group: 'exterior', castShadow: true });
  for (const { p } of eq) {
    if (Math.abs(p.x) < half && p.z > 8) continue;
    const n = new THREE.Vector3(p.x, 0, p.z - DOME.cz).normalize();
    B.geo(placed(new THREE.CylinderGeometry(0.07, 0.09, DOME.D - REVEAL, 10), [p.x + n.x * 0.2, (DOME.D + REVEAL) / 2, p.z + n.z * 0.2]), { mat: alu, seg: 'struktur', group: 'exterior' });
  }
  // a teal T0 line in a carbon channel round the drum at 1 m (the island's data line)
  const drumLineArc = (r: number, y: number, rad: number, mat: THREE.Material): void => {
    const a0 = 0.32,
      span = Math.PI * 2 - 0.64;
    const tor = new THREE.TorusGeometry(r, rad, 4, 140, span).rotateX(Math.PI / 2).rotateY(Math.PI / 2 + a0);
    B.geo(placed(tor, [0, y, DOME.cz]), { mat, seg: 'struktur', group: 'exterior' });
  };
  drumLineArc(DOME.R + drumT / 2 + 0.005, 1.0, 0.025, carbon);
  drumLineArc(DOME.R + drumT / 2 + 0.02, 1.0, 0.012, tealT0);
  // portal frame around the opening (outside): ceramic jamb, alu lintel, teal lintel line
  B.geo(metreUv(placed(rbox(TUNNEL.w + 1.6, 0.5, 0.5), [0, TUNNEL.h + 0.5, 12.05])), { mat: hull, seg: 'struktur', group: 'exterior', castShadow: true });
  B.geo(placed(rbox(TUNNEL.w + 1.7, 0.08, 0.54, 0.02), [0, TUNNEL.h + 0.78, 12.05]), { mat: alu, seg: 'struktur', group: 'exterior' });
  B.geo(placed(new THREE.BoxGeometry(TUNNEL.w + 0.6, 0.05, 0.04), [0, TUNNEL.h + 0.22, PORTAL.z0 - 0.06]), { mat: look.light('teal', 1), seg: 'struktur', group: 'exterior' });

  // ── Schleuse: a light lock, not a dark tunnel (QA-02) ──────────────────────
  const tz = (TUNNEL.z0 + TUNNEL.z1) / 2,
    tl = TUNNEL.z1 - TUNNEL.z0;
  const wallT = 0.25;
  const interiorHull = look.hullWarm;
  for (const s of [-1, 1]) {
    const pos: V3 = [s * (TUNNEL.w / 2 + wallT / 2), TUNNEL.h / 2, tz];
    B.collider({ size: [wallT, TUNNEL.h, tl], pos, seg: 'struktur' });
    B.geo(metreUv(placed(rbox(wallT, TUNNEL.h, tl), pos)), { mat: interiorHull, seg: 'struktur', group: 'exterior', castShadow: true });
    // carbon skirting reveal + teal T1 skirting line (the lock glows)
    B.geo(placed(new THREE.BoxGeometry(0.04, 0.12, tl), [s * (TUNNEL.w / 2 - 0.02), 0.11, tz]), { mat: carbon, seg: 'struktur', group: 'exterior' });
    B.geo(placed(new THREE.BoxGeometry(0.02, 0.03, tl - 0.2), [s * (TUNNEL.w / 2 - 0.045), 0.13, tz]), { mat: look.light('teal', 1), seg: 'struktur', group: 'exterior' });
  }
  B.collider({ size: [TUNNEL.w + 2 * wallT, wallT, tl], pos: [0, TUNNEL.h + wallT / 2, tz], seg: 'struktur' });
  B.geo(metreUv(placed(rbox(TUNNEL.w + 2 * wallT, wallT, tl), [0, TUNNEL.h + wallT / 2, tz])), { mat: interiorHull, seg: 'struktur', group: 'exterior', castShadow: true });
  // ceiling light slot: a warm T1 panel in a carbon channel along the whole lock
  B.geo(placed(new THREE.BoxGeometry(0.62, 0.04, tl - 0.4), [0, TUNNEL.h - 0.01, tz]), { mat: carbon, seg: 'struktur', group: 'exterior' });
  B.geo(placed(new THREE.BoxGeometry(0.5, 0.02, tl - 0.6), [0, TUNNEL.h - 0.035, tz]), { mat: look.light('warm', 1, { dusk: false }), seg: 'struktur', group: 'exterior' });
  // wall washes: the slot light falling down both walls (unlit additive gradient, 1 draw call)
  {
    const wpos: number[] = [],
      wcol: number[] = [];
    const top = new THREE.Color(0xffe9cc).multiplyScalar(0.07),
      bot = new THREE.Color(0x000000);
    for (const s of [-1, 1]) {
      const x = s * (TUNNEL.w / 2 - 0.012);
      const z0 = TUNNEL.z0 + 0.3,
        z1 = TUNNEL.z1 - 0.3;
      const y0 = 0.3,
        y1 = TUNNEL.h - 0.05;
      const quad: [number, number, THREE.Color][] = [
        [z0, y0, bot],
        [z1, y0, bot],
        [z1, y1, top],
        [z0, y0, bot],
        [z1, y1, top],
        [z0, y1, top],
      ];
      for (const [z, y, cl] of quad) {
        wpos.push(x, y, z);
        wcol.push(cl.r, cl.g, cl.b);
      }
    }
    const wg = new THREE.BufferGeometry();
    wg.setAttribute('position', new THREE.Float32BufferAttribute(wpos, 3));
    wg.setAttribute('color', new THREE.Float32BufferAttribute(wcol, 3));
    const wm = own(new THREE.MeshBasicMaterial({ vertexColors: true, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, side: THREE.DoubleSide, name: 'sensordom:wash' }));
    wm.forceSinglePass = true; // Z1: additive: one pass, same image
    const wash = new THREE.Mesh(wg, wm);
    ctx.groups.exterior.add(wash);
    B.visor.register(wash, { seg: 'unsichtbar', lidar: 'hide' });
  }
  // ribs: alu portal frames outside (the last one frames the mouth)
  for (const z of [TUNNEL.z0 + 1.6, TUNNEL.z0 + 4.2, TUNNEL.z0 + 6.8, TUNNEL.z1 - 0.16]) {
    for (const s of [-1, 1]) B.geo(placed(rbox(0.26, TUNNEL.h + 0.45, 0.3), [s * (TUNNEL.w / 2 + 0.3), (TUNNEL.h + 0.45) / 2, z]), { mat: alu, seg: 'struktur', group: 'exterior' });
    B.geo(placed(rbox(TUNNEL.w + 0.86, 0.26, 0.3), [0, TUNNEL.h + 0.36, z]), { mat: alu, seg: 'struktur', group: 'exterior' });
  }
  // the lock's own light (no shadows): it reads lit from the gate and from inside
  ctx.lights.point([0, 3.0, tz + 1.5], { color: 0xffe2c0, intensity: 3.5, distance: 8.5 });

  // freestanding gate arch (6.5 m clear): two ceramic blades, alu lintel, dark-glass sign face
  const VW = 6.5,
    VH = 4.6;
  const archZ = TUNNEL.z1 + 0.25;
  for (const s of [-1, 1]) {
    B.collider({ size: [0.5, VH + 0.9, 0.6], pos: [s * (VW / 2 + 0.25), (VH + 0.9) / 2, archZ], seg: 'struktur' });
    // blade: tapered ceramic fin on a carbon foot
    const blade = new THREE.CylinderGeometry(0.2, 0.28, VH + 0.6, 4, 1).rotateY(Math.PI / 4).scale(1, 1, 1.45);
    B.geo(metreUv(placed(blade, [s * (VW / 2 + 0.25), (VH + 0.6) / 2 + 0.15, archZ])), { mat: hull, seg: 'struktur', group: 'exterior', castShadow: true });
    B.geo(placed(new THREE.CylinderGeometry(0.3, 0.32, 0.15, 16), [s * (VW / 2 + 0.25), 0.075, archZ]), { mat: carbon, seg: 'struktur', group: 'exterior' });
  }
  B.collider({ size: [VW + 1.0, 0.9, 0.6], pos: [0, VH + 0.45, archZ], seg: 'struktur' });
  B.geo(placed(rbox(VW + 1.2, 0.9, 0.5, 0.06), [0, VH + 0.45, archZ - 0.04]), { mat: alu, seg: 'struktur', group: 'exterior', castShadow: true });
  B.geo(placed(rbox(VW + 0.7, 0.72, 0.06, 0.02), [0, VH + 0.45, archZ + 0.23]), { mat: look.darkGlass, seg: 'struktur', group: 'exterior' });
  B.geo(placed(new THREE.BoxGeometry(VW + 0.7, 0.02, 0.02), [0, VH + 0.82, archZ + 0.25]), { mat: tealT0, seg: 'struktur', group: 'exterior' });
  // floors: light deck composite in the lock
  const lockFloor = new THREE.Mesh(metreUv(new THREE.BoxGeometry(TUNNEL.w, 0.1, tl).translate(0, 0, tz), 6), look.deck);
  lockFloor.material = own(look.deck.clone());
  (lockFloor.material as THREE.MeshStandardMaterial).polygonOffset = true;
  (lockFloor.material as THREE.MeshStandardMaterial).polygonOffsetFactor = -4;
  (lockFloor.material as THREE.MeshStandardMaterial).polygonOffsetUnits = -8;
  B.geo(lockFloor.geometry, { mat: lockFloor.material as THREE.Material, seg: 'boden', group: 'exterior' });
  // teal guide strip (T1 in the lock) in a carbon channel
  B.geo(placed(new THREE.BoxGeometry(0.16, 0.012, TUNNEL.z1 - PORTAL.z0 + 0.2), [0, 0.054, (TUNNEL.z1 + PORTAL.z0) / 2]), { mat: carbon, seg: 'boden', group: 'exterior' });
  B.geo(placed(new THREE.BoxGeometry(0.07, 0.012, TUNNEL.z1 - PORTAL.z0 + 0.2), [0, 0.058, (TUNNEL.z1 + PORTAL.z0) / 2]), { mat: look.light('teal', 1), seg: 'boden', group: 'exterior' });

  // gate sign (troika: 2 draw calls) on the dark-glass face
  // the small eyebrow reads only up close: detail tier (Z1, one draw less from the spawn)
  ctx.text3d.create({ text: { de: '// 01 · SEHEN · SENSORIK', en: '// 01 · SEE · SENSING' }, font: 'mono-medium', size: 0.13, color: 0xff6700, letterSpacing: 0.14, anchorX: 'center', anchorY: 'middle', position: [0, VH + 0.66, archZ + 0.27] }, ctx.groups.detail);
  ctx.text3d.create({ text: { de: 'SENSORDOM', en: 'SENSOR DOME' }, font: 'display', size: 0.42, color: 0xf5f5f4, letterSpacing: 0.08, anchorX: 'center', anchorY: 'middle', position: [0, VH + 0.3, archZ + 0.27] }, ctx.groups.exterior);

  // ── LiDAR head (landmark): white shell puck Ø 1.4, alu ring, orange spin ring ──
  const top = DOME.H;
  const hz = DOME.cz;
  B.geo(placed(new THREE.CylinderGeometry(0.95, 1.1, 0.26, 32), [0, top + 0.05, hz]), { mat: alu, seg: 'struktur', group: 'exterior', castShadow: true });
  B.geo(placed(new THREE.CylinderGeometry(0.14, 0.2, 2.0, 16), [0, top + 1.1, hz]), { mat: hull, seg: 'struktur', group: 'exterior', castShadow: true });
  B.geo(placed(new THREE.CylinderGeometry(0.24, 0.24, 0.08, 20), [0, top + 0.24, hz]), { mat: carbon, seg: 'struktur', group: 'exterior' });
  B.geo(placed(new THREE.CylinderGeometry(0.66, 0.7, 0.3, 40), [0, 15.12, hz]), { mat: look.shell, seg: 'struktur', group: 'exterior', castShadow: true });
  B.geo(placed(new THREE.CylinderGeometry(0.7, 0.7, 0.06, 40), [0, 15.3, hz]), { mat: alu, seg: 'struktur', group: 'exterior' });
  B.geo(placed(new THREE.CylinderGeometry(0.68, 0.68, 0.4, 40, 1, true), [0, 15.53, hz]), { mat: look.darkGlass, seg: 'struktur', group: 'exterior' });
  B.geo(placed(new THREE.CylinderGeometry(0.7, 0.7, 0.05, 40), [0, 15.755, hz]), { mat: alu, seg: 'struktur', group: 'exterior' });
  B.geo(placed(new THREE.SphereGeometry(0.7, 40, 10, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.32, 1), [0, 15.78, hz]), { mat: look.shell, seg: 'struktur', group: 'exterior', castShadow: true });

  // rotating part: emitter window, the orange spin ring and the fan (exterior) / a fan in the far tier
  const fanGeo = buildFanGeometry();
  const fanMat = fanMaterial();
  const pivot = new THREE.Group();
  pivot.position.set(0, HEAD_Y, hz);
  ctx.groups.exterior.add(pivot);
  const fan = new THREE.Mesh(fanGeo, fanMat);
  fan.frustumCulled = false;
  fan.renderOrder = 5;
  pivot.add(fan);
  const emitter = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.3, 0.18), look.light('teal', 1));
  emitter.position.set(0.69, 0, 0);
  pivot.add(emitter);
  // orange spin ring: a segmented band, so the rotation reads
  const spin = new THREE.Mesh(
    mergeSimple(Array.from({ length: 6 }, (_, k) => new THREE.CylinderGeometry(0.715, 0.715, 0.07, 10, 1, true, (k / 6) * Math.PI * 2, Math.PI / 4))),
    M.orangePaint,
  );
  spin.material = own(M.orangePaint.clone());
  (spin.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
  spin.position.y = -0.28;
  pivot.add(spin);
  const farPivot = new THREE.Group();
  farPivot.position.copy(pivot.position);
  ctx.groups.far.add(farPivot);
  const farFan = new THREE.Mesh(fanGeo, fanMat);
  farFan.frustumCulled = false;
  farPivot.add(farFan);

  // far silhouette: low-poly dome + head in light hull tones, one draw call
  const lo = geodesicHemisphere(2);
  const loPos: number[] = [];
  for (const f of lo.faces) for (const i of f) {
    const p = toDome(lo.verts[i]);
    loPos.push(p.x, p.y, p.z);
  }
  const farGeo = new THREE.BufferGeometry();
  farGeo.setAttribute('position', new THREE.Float32BufferAttribute(loPos, 3));
  farGeo.computeVertexNormals();
  const farParts = [farGeo, placed(new THREE.CylinderGeometry(DOME.R, DOME.R, DOME.D, 20, 1, true), [0, DOME.D / 2, hz]), placed(new THREE.CylinderGeometry(0.2, 0.2, 2.2, 6), [0, top + 1.1, hz]), placed(new THREE.CylinderGeometry(0.7, 0.7, 1.0, 10), [0, 15.5, hz]), placed(new THREE.BoxGeometry(5, 4, 10), [0, 2, 16.5])];
  const farMerged = mergeSimple(farParts);
  const farMesh = new THREE.Mesh(farMerged, own(new THREE.MeshStandardMaterial({ color: TOK.hullWarm, roughness: 0.6, metalness: 0, name: 'sensordom:far' })));
  ctx.groups.far.add(farMesh);

  return { fanPivots: [pivot, farPivot], emitter, headLocal: new THREE.Vector3(0, HEAD_Y, hz) };
}

/** LiDAR fan (ART-V2 B2): an 18 m blade aimed −25° … −5° at the deck, so it scans the island, not the sky */

function buildFanGeometry(): THREE.BufferGeometry {
  const pos: number[] = [],
    uv: number[] = [],
    trail: number[] = [],
    idx: number[] = [];
  const R0 = 0.72,
    R1 = 18,
    K = 20,
    RS = 6;
  const el0 = THREE.MathUtils.degToRad(-25),
    el1 = THREE.MathUtils.degToRad(-5);
  const trails = [[0, 1]];
  for (const [yaw, alpha] of trails) {
    const base = pos.length / 3;
    const cy = Math.cos(yaw),
      sy = Math.sin(yaw);
    for (let k = 0; k <= K; k++) {
      const el = el0 + ((el1 - el0) * k) / K;
      for (let r = 0; r <= RS; r++) {
        const t = r / RS;
        const rad = R0 + (R1 - R0) * t * t; // denser near the head
        const x = rad * Math.cos(el),
          y = rad * Math.sin(el);
        pos.push(x * cy, y, -x * sy);
        uv.push(rad / R1, k / K);
        trail.push(alpha);
      }
    }
    for (let k = 0; k < K; k++)
      for (let r = 0; r < RS; r++) {
        const i0 = base + k * (RS + 1) + r,
          i1 = i0 + RS + 1;
        idx.push(i0, i1, i0 + 1, i1, i1 + 1, i0 + 1);
      }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('aTrail', new THREE.Float32BufferAttribute(trail, 1));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

function mergeSimple(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const pos: number[] = [],
    nor: number[] = [];
  for (const p0 of parts) {
    const p = p0.index ? p0.toNonIndexed() : p0;
    if (!p.getAttribute('normal')) p.computeVertexNormals();
    const a = p.getAttribute('position'),
      n = p.getAttribute('normal');
    for (let i = 0; i < a.count; i++) {
      pos.push(a.getX(i), a.getY(i), a.getZ(i));
      nor.push(n.getX(i), n.getY(i), n.getZ(i));
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  return g;
}

export function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type { V3 };
