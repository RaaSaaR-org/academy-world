import * as THREE from 'three';
import { WAIST, latticeOuterR } from './constants';
import { metreUVs } from './kit';
import { lathe } from './lathe';

/**
 * How the tower holds its mark (Phase 5): the dial is part of the structure, not a sign in front
 * of it.
 *  - collar: a ceramic band with a teal line round the diagrid's waist (y 25.1, r 6.22–6.84; it
 *    replaces the bare alu waist ring)
 *  - yoke: per side two straight ceramic struts (the diagrid's language) from the collar at
 *    bearings 90 and 125 to a trunnion at 3 / 9 o'clock (alu bearing housing, teal ring): the dial
 *    is carried like a gimbal on a horizontal axis — the island's own balancing idea
 *  - hub: a carbon hub with a bolted alu flange on the dial's back, seated in the collar at 180
 *  - back: eight ceramic ribs (the two on the trunnion axis are the deeper main spar) and two alu
 *    ring beams; every rib's depth is clipped to keep ≥ 0.22 m from the diagrid
 * Everything is static and merges into the tower's hull / carbon / alu / teal meshes (0 draw calls).
 */
export interface Mount {
  carbon: THREE.BufferGeometry[];
  alu: THREE.BufferGeometry[];
  hull: THREE.BufferGeometry[];
  teal: THREE.BufferGeometry[];
  /** saddle axis for the diagrid phase search (a diamond centred on the saddle) */
  stem: { a: THREE.Vector3; b: THREE.Vector3; radiusAt(w: number): number };
  /** smallest gap (m) between the dial / back structure and the diagrid */
  clearance: number;
}

/** z of the diagrid's (and waist ring's) front face at world (x, y); −∞ where the lattice is not in front */
export function latticeFrontZ(x: number, y: number): number {
  const r = latticeOuterR(y);
  let z = Math.abs(x) < r ? Math.sqrt(r * r - x * x) : -Infinity;
  const rr = WAIST.r + WAIST.tube;
  if (Math.abs(y - WAIST.y) < WAIST.tube && Math.abs(x) < rr) z = Math.max(z, Math.sqrt(rr * rr - x * x));
  return z;
}

const MARGIN = 0.22;
/** the collar round the waist: clear of the members (outer face 5.97) by 0.25 m */
export const COLLAR = { rIn: 6.22, rOut: 6.84 };

export function buildMount(o: { R: number; CX: number; CY: number; ZB: number; ZF: number }): Mount {
  const { R, CX, CY, ZB, ZF } = o;
  const carbon: THREE.BufferGeometry[] = [];
  const alu: THREE.BufferGeometry[] = [];
  const hull: THREE.BufferGeometry[] = [];
  const teal: THREE.BufferGeometry[] = [];
  let clearance = Infinity;
  const gap = (x: number, y: number, z: number): number => {
    const g = z - latticeFrontZ(x, y);
    if (g < clearance) clearance = g;
    return g;
  };
  // the dial's own back edge
  for (let i = 0; i < 180; i++) {
    const a = (i / 180) * Math.PI * 2;
    gap(CX + Math.sin(a) * (R - 0.16), CY - Math.cos(a) * (R - 0.16), ZB);
    gap(CX + Math.sin(a) * (R + 0.06), CY - Math.cos(a) * (R + 0.06), ZB + 0.3);
  }

  // ── hub: carbon drum on the dial back, seated in the collar at bearing 180 ──
  const HUB_R = 1.3;
  const HZ = 6.5; // rear face of the hub: it sits in the collar (outer face 6.84 at bearing 180)
  {
    const len = ZB - HZ + 0.02;
    carbon.push(new THREE.CylinderGeometry(HUB_R, HUB_R * 1.06, len, 48, 1, false).rotateX(Math.PI / 2).translate(CX, CY, HZ + len / 2));
    alu.push(new THREE.TorusGeometry(HUB_R + 0.01, 0.05, 6, 48).translate(CX, CY, HZ + 0.06));
    alu.push(new THREE.TorusGeometry(HUB_R * 1.06 + 0.02, 0.05, 6, 48).translate(CX, CY, ZB - 0.08));
    for (let i = 0; i < 12; i++) {
      const a = ((i + 0.5) / 12) * Math.PI * 2;
      alu.push(new THREE.CylinderGeometry(0.075, 0.075, 0.07, 8).rotateX(Math.PI / 2).translate(CX + Math.sin(a) * 0.98, CY - Math.cos(a) * 0.98, HZ - 0.03));
    }
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      gap(CX + Math.sin(a) * HUB_R, CY - Math.cos(a) * HUB_R, HZ);
    }
  }

  // ── back ribs (hull) + ring beam (alu) ─────────────────────────────────────
  {
    const n = 8;
    const rho0 = HUB_R - 0.02;
    const rho1 = R - 0.3;
    const samples = 14;
    for (let i = 0; i < n; i++) {
      const th = (i / n) * Math.PI * 2; // 0 = 6 o'clock, π/2 = 3 o'clock (+x)
      const spar = i === 2 || i === 6;
      const t = spar ? 0.38 : 0.24;
      const u = new THREE.Vector3(Math.sin(th), -Math.cos(th), 0);
      const w = new THREE.Vector3(Math.cos(th), Math.sin(th), 0);
      const prof: [number, number][] = [];
      for (let k = 0; k <= samples; k++) {
        const rho = THREE.MathUtils.lerp(rho0, rho1, k / samples);
        const design = spar ? 1.02 - 0.5 * (rho / R) : 0.82 - 0.62 * (rho / R);
        // worst of the rib's two side faces
        let avail = Infinity;
        for (const side of [-1, 1]) {
          const x = CX + u.x * rho + w.x * side * (t / 2),
            y = CY + u.y * rho + w.y * side * (t / 2);
          avail = Math.min(avail, ZB - latticeFrontZ(x, y) - MARGIN);
        }
        const d = Math.max(0.08, Math.min(design, avail));
        gap(CX + u.x * rho, CY + u.y * rho, ZB - d);
        prof.push([rho, d]);
      }
      // a slight chamfer at the outer end
      prof[prof.length - 1][1] = Math.min(prof[prof.length - 1][1], 0.1);
      hull.push(metreUVs(ribGeo(prof, t, CX, CY, ZB, u, w), 4.8));
    }
    // ring beam on the back plate (passes through the ribs)
    alu.push(new THREE.TorusGeometry(6.4, 0.13, 8, 128).translate(CX, CY, ZB - 0.12));
    alu.push(new THREE.TorusGeometry(R - 0.55, 0.06, 6, 160).translate(CX, CY, ZB - 0.05));
  }

  // ── collar: a ceramic band round the diagrid's waist (it replaces the bare waist ring); the hub
  //    sits in it at bearing 180, the yoke arms leave it at 90 / 270 ────────────────────────────
  {
    const yc = WAIST.y;
    const prof: [number, number][] = [
      [COLLAR.rIn, yc - 0.6],
      [COLLAR.rOut - 0.2, yc - 0.68],
      [COLLAR.rOut - 0.03, yc - 0.52],
      [COLLAR.rOut, yc - 0.2],
      [COLLAR.rOut, yc + 0.2],
      [COLLAR.rOut - 0.03, yc + 0.52],
      [COLLAR.rOut - 0.2, yc + 0.68],
      [COLLAR.rIn, yc + 0.6],
      [COLLAR.rIn, yc - 0.6],
    ];
    const g = new THREE.LatheGeometry(
      prof.map(([r, y]) => new THREE.Vector2(r, y)),
      144,
    );
    hull.push(metreUVs(g, 4.8, 'cyl'));
    // teal light line round the collar (the halo lip's language) and two carbon reveals
    teal.push(new THREE.TorusGeometry(COLLAR.rOut + 0.012, 0.028, 4, 192).rotateX(Math.PI / 2).translate(0, yc, 0));
    for (const dy of [-0.34, 0.34]) carbon.push(new THREE.TorusGeometry(COLLAR.rOut + 0.004, 0.03, 3, 144).rotateX(Math.PI / 2).translate(0, yc + dy, 0));
  }

  // ── yoke: per side two straight ceramic struts (the diagrid's language: straight members, a
  //    triangle in plan) from the collar at bearings 90 and 125 to the trunnion at 3 / 9 o'clock ──
  const ZT = (ZF + ZB) / 2;
  const RS = R + 0.06;
  const XT = R + 1.36; // trunnion boss centre (x)
  for (const sx of [1, -1]) {
    const end = new THREE.Vector3(CX + sx * XT, CY, ZT);
    for (const [bDeg, w, h] of [
      [90, 0.5, 0.86],
      [125, 0.44, 0.7],
    ] as const) {
      const b = (bDeg * Math.PI) / 180;
      const r0 = COLLAR.rIn + 0.25;
      const start = new THREE.Vector3(sx * Math.sin(b) * r0, WAIST.y, -Math.cos(b) * r0);
      const dir = end.clone().sub(start).normalize();
      const line = new THREE.LineCurve3(start, end.clone().addScaledVector(dir, -0.25));
      hull.push(metreUVs(sweepRoundRect(line, 8, (f) => [THREE.MathUtils.lerp(w, w * 0.82, f), THREE.MathUtils.lerp(h, h * 0.82, f)], 0.14), 4.8));
      // carbon shoe where the strut meets the collar
      carbon.push(sweepRoundRect(new THREE.LineCurve3(start.clone().addScaledVector(dir, -0.1), start.clone().addScaledVector(dir, 0.75)), 2, () => [w + 0.1, h + 0.1], 0.16));
    }
    // trunnion: a ceramic bearing housing (the structure's white, so the pivots read from afar) on a
    // bright alu axle out of the dial's band; carbon end face with an alu cap, teal bearing ring
    const x0 = RS - 0.1,
      xa = RS + 0.2,
      x1 = XT + 0.55;
    const toSide = (g: THREE.BufferGeometry): THREE.BufferGeometry => g.rotateY((sx * Math.PI) / 2).translate(CX, CY, ZT);
    alu.push(toSide(new THREE.CylinderGeometry(0.5, 0.5, xa + 0.15 - x0, 40).rotateX(Math.PI / 2).translate(0, 0, (x0 + xa + 0.15) / 2)));
    const housing = lathe(
      [
        [0.78, x1],
        [0.95, x1],
        [1.06, x1 - 0.16],
        [1.06, xa + 0.26],
        [1.0, xa + 0.1],
        [0.58, xa],
      ],
      56,
      0,
      0,
    );
    hull.push(metreUVs(toSide(housing), 4.8));
    carbon.push(toSide(new THREE.CircleGeometry(0.8, 40).translate(0, 0, x1 - 0.01)));
    alu.push(toSide(new THREE.TorusGeometry(0.78, 0.035, 6, 40).translate(0, 0, x1)));
    alu.push(toSide(new THREE.CylinderGeometry(0.24, 0.24, 0.1, 24).rotateX(Math.PI / 2).translate(0, 0, x1 + 0.03)));
    teal.push(toSide(new THREE.TorusGeometry(1.065, 0.028, 4, 56).translate(0, 0, x1 - 0.42)));
  }

  const stem = { a: new THREE.Vector3(CX, WAIST.y, WAIST.r), b: new THREE.Vector3(CX, WAIST.y, COLLAR.rIn), radiusAt: () => 0.05 };
  return { carbon, alu, hull, teal, stem, clearance };
}

/**
 * One back rib: profile [ρ, depth] along the radial direction u, thickness t across (w), standing
 * on the back plate z = zb and reaching back (−z) by depth. Flat faces, outward winding.
 */
function ribGeo(prof: [number, number][], t: number, cx: number, cy: number, zb: number, u: THREE.Vector3, w: THREE.Vector3): THREE.BufferGeometry {
  const pos: number[] = [];
  const P = (rho: number, d: number, side: number): THREE.Vector3 => new THREE.Vector3(cx + u.x * rho + w.x * side * (t / 2), cy + u.y * rho + w.y * side * (t / 2), zb - d);
  const quad = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, out: THREE.Vector3): void => {
    // a-b-c-d around the quad; flip if the geometric normal disagrees with `out`
    const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
    const tri = n.dot(out) >= 0 ? [a, b, c, a, c, d] : [a, c, b, a, d, c];
    for (const p of tri) pos.push(p.x, p.y, p.z);
  };
  const back = new THREE.Vector3(0, 0, -1);
  for (let k = 0; k < prof.length - 1; k++) {
    const [r0, d0] = prof[k];
    const [r1, d1] = prof[k + 1];
    for (const side of [-1, 1]) quad(P(r0, 0, side), P(r1, 0, side), P(r1, d1, side), P(r0, d0, side), w.clone().multiplyScalar(side));
    // back edge, slightly tilted: outward is mostly −z
    quad(P(r0, d0, -1), P(r1, d1, -1), P(r1, d1, 1), P(r0, d0, 1), back);
  }
  const [ra, da] = prof[0];
  const [rb, db] = prof[prof.length - 1];
  quad(P(ra, 0, -1), P(ra, 0, 1), P(ra, da, 1), P(ra, da, -1), u.clone().negate());
  quad(P(rb, 0, -1), P(rb, 0, 1), P(rb, db, 1), P(rb, db, -1), u.clone());
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  // indexed like every other tower part, so the tower's merge keeps its index buffers
  g.setIndex(Array.from({ length: pos.length / 3 }, (_, i) => i));
  return g;
}

/**
 * Sweep a rounded rectangle (width × height from size(f), corner radius rr) along a curve; the
 * frame keeps the profile's height axis as close to world +y as the path allows. Closed with caps.
 */
function sweepRoundRect(curve: THREE.Curve<THREE.Vector3>, steps: number, size: (f: number) => [number, number], rr: number): THREE.BufferGeometry {
  // profile (unit-free): corners with 4 segments each, normals per vertex
  const corner = 4;
  const prof: { x: number; y: number; nx: number; ny: number }[] = [];
  const cs = [
    [1, 1, 0],
    [-1, 1, Math.PI / 2],
    [-1, -1, Math.PI],
    [1, -1, (3 * Math.PI) / 2],
  ];
  for (const [sx, sy, a0] of cs)
    for (let i = 0; i <= corner; i++) {
      const a = a0 + (i / corner) * (Math.PI / 2);
      prof.push({ x: sx, y: sy, nx: Math.cos(a), ny: Math.sin(a) });
    }
  const m = prof.length;
  const pos: number[] = [];
  const nrm: number[] = [];
  const idx: number[] = [];
  const up = new THREE.Vector3(0, 1, 0);
  const T = new THREE.Vector3(),
    S = new THREE.Vector3(),
    U = new THREE.Vector3(),
    C = new THREE.Vector3(),
    v = new THREE.Vector3(),
    n = new THREE.Vector3();
  const frames: { C: THREE.Vector3; S: THREE.Vector3; U: THREE.Vector3; T: THREE.Vector3; w: number; h: number }[] = [];
  for (let i = 0; i <= steps; i++) {
    const f = i / steps;
    curve.getPointAt(f, C);
    curve.getTangentAt(f, T).normalize();
    S.crossVectors(T, up).normalize();
    U.crossVectors(S, T).normalize();
    const [w, h] = size(f);
    frames.push({ C: C.clone(), S: S.clone(), U: U.clone(), T: T.clone(), w, h });
    for (const p of prof) {
      const hx = w / 2 - rr,
        hy = h / 2 - rr;
      v.copy(C)
        .addScaledVector(S, p.x * hx + p.nx * rr)
        .addScaledVector(U, p.y * hy + p.ny * rr);
      n.copy(S).multiplyScalar(p.nx).addScaledVector(U, p.ny).normalize();
      pos.push(v.x, v.y, v.z);
      nrm.push(n.x, n.y, n.z);
    }
  }
  for (let i = 0; i < steps; i++)
    for (let j = 0; j < m; j++) {
      const a = i * m + j,
        b = i * m + ((j + 1) % m);
      const c = a + m,
        d = b + m;
      idx.push(a, c, b, b, c, d);
    }
  // caps (fan around the centre)
  for (const [k, sign] of [
    [0, -1],
    [steps, 1],
  ] as const) {
    const fr = frames[k];
    const base = pos.length / 3;
    pos.push(fr.C.x, fr.C.y, fr.C.z);
    nrm.push(fr.T.x * sign, fr.T.y * sign, fr.T.z * sign);
    for (let j = 0; j < m; j++) {
      const p = pos.slice((k * m + j) * 3, (k * m + j) * 3 + 3);
      pos.push(p[0], p[1], p[2]);
      nrm.push(fr.T.x * sign, fr.T.y * sign, fr.T.z * sign);
    }
    for (let j = 0; j < m; j++) {
      const a = base + 1 + j,
        b = base + 1 + ((j + 1) % m);
      // (a → b) runs counter-clockwise in the (S, U) plane, i.e. around −T
      if (sign > 0) idx.push(base, b, a);
      else idx.push(base, a, b);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setIndex(idx);
  return g;
}
