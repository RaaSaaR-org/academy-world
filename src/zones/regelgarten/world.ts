/**
 * Regelgarten — static world: gravel garden, plinths, consoles, Gehirn-Stapel shell, Weltenwand
 * frame, planters, gyroscope sculptures, colliders and the far silhouette. Static geometry is
 * merged per material (one draw call each); only animated parts stay separate.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { ZoneContext } from '@/core/zones';
import { mulberry32 } from '@/core/zones';
import { metreUv, rbox, TOK, type Look } from './look';

// ── layout (local coordinates, GDD §7.2) ─────────────────────────────────────
export const LAYOUT = {
  mast: { z: -10, plinthW: 17, plinthD: 2, plinthH: 1.2, railHalf: 8, cartW: 1.6, cartH: 1.0, cartD: 1.2, pole: 12, poleR: 0.175, tipR: 0.3 },
  // Bedienmodus camera: GDD asks for (0, 1.7, 1.5) aimed at mid-mast; pulled back/up and aimed right of the
  // mast so the whole 12 m pendulum + the Gehirn-Stapel sit in the free area left of the docked panel
  leitstand: { x: 0, z: -1, w: 3, d: 1, cam: [-1.6, 2.9, 3.8] as [number, number, number], look: [4.6, 6.3, -10] as [number, number, number] },
  tower: { x: -6.5, z: -2, w: 2.4, h: 7.5 },
  bahn: { x0: 5, x1: 11, z: 6, h: 0.9, stand: [8, 0, 10] as [number, number, number], ped: [5.5, 0, 9.1] as [number, number, number] },
  /** C „Lauf, Ente!" (R2 §6.2): Trainingsfeld x −17…−9 on a 0.3 m plinth, Belohnungspult at (−7, 4) on a 0.6 m step, Teststrecke on a 1 m plinth */
  duck: { x0: -17, x1: -9, z0: 0.8, z1: 7.2, plinth: 0.3, console: { x: -7, z: 4, step: 0.6 }, track: { x0: -8.2, x1: -7.0, z0: 1.6, z1: 2.4, h: 1.0 } },
  emi: [3, 0, 14] as [number, number, number],
  gyros: [
    [12.6, 0, -2.6],
    [11.2, 0, 16.4],
    [-10.4, 0, 15.6],
  ] as [number, number, number][],
} as const;

/** Collects geometries per material and merges them into one mesh each. */
export class Merger {
  private parts = new Map<THREE.Material, THREE.BufferGeometry[]>();
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private s = new THREE.Vector3();
  private p = new THREE.Vector3();

  add(mat: THREE.Material, geo: THREE.BufferGeometry, pos: [number, number, number] = [0, 0, 0], rot: [number, number, number] = [0, 0, 0], scale: [number, number, number] = [1, 1, 1]): void {
    this.p.set(pos[0], pos[1], pos[2]);
    this.q.setFromEuler(this.e.set(rot[0], rot[1], rot[2]));
    this.s.set(scale[0], scale[1], scale[2]);
    this.m.compose(this.p, this.q, this.s);
    const g = geo.index ? geo.toNonIndexed() : geo;
    if (g !== geo) geo.dispose();
    g.applyMatrix4(this.m);
    if (!g.getAttribute('uv')) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((g.getAttribute('position').count * 2) | 0), 2));
    let list = this.parts.get(mat);
    if (!list) this.parts.set(mat, (list = []));
    list.push(g);
  }

  box(mat: THREE.Material, w: number, h: number, d: number, pos: [number, number, number], rot?: [number, number, number]): void {
    this.add(mat, new THREE.BoxGeometry(w, h, d), pos, rot);
  }

  build(parent: THREE.Object3D, o: { shadow?: (m: THREE.Material) => boolean; name?: string } = {}): THREE.Mesh[] {
    const out: THREE.Mesh[] = [];
    for (const [mat, list] of this.parts) {
      const keep = list.map((g) => {
        // only keep the attributes every part has
        for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal' && name !== 'uv') g.deleteAttribute(name);
        return g;
      });
      const merged = mergeGeometries(keep, false);
      for (const g of keep) g.dispose();
      if (!merged) continue;
      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged, mat);
      mesh.name = `${o.name ?? 'regelgarten'}:${mat.name || 'mat'}`;
      const sh = o.shadow ? o.shadow(mat) : false;
      mesh.castShadow = sh;
      mesh.receiveShadow = true;
      parent.add(mesh);
      out.push(mesh);
    }
    this.parts.clear();
    return out;
  }
}

/** Deck-composite garden floor (ART-V2 §6.2): staggered 3 × 1.5 m panels, darker runway paths and
 *  station pads (one canvas texture, one draw call). Light lines (inlays, contour rings) are geometry. */
function groundTexture(_ctx: ZoneContext): THREE.CanvasTexture {
  const S = 1024;
  const R = 22;
  const k = S / (2 * R);
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d')!;
  const X = (x: number): number => (x + R) * k;
  const Z = (z: number): number => (z + R) * k;
  const rnd = mulberry32(2026);
  // deck composite #C3BEB8, ±3 % per-panel albedo, 3 × 1.5 m staggered panels
  g.fillStyle = '#c3beb8';
  g.fillRect(0, 0, S, S);
  for (let row = 0, z = -R; z < R; z += 1.5, row++) {
    const off = row % 2 ? 1.5 : 0;
    for (let x = -R - off; x < R; x += 3) {
      const v = Math.round((rnd() - 0.5) * 12);
      g.fillStyle = `rgb(${195 + v},${190 + v},${184 + v})`;
      g.fillRect(X(x) + 1, Z(z) + 1, 3 * k - 2, 1.5 * k - 2);
    }
  }
  g.fillStyle = 'rgba(70,64,58,0.55)';
  for (let row = 0, z = -R; z < R; z += 1.5, row++) {
    g.fillRect(0, Z(z) - 1, S, 2);
    const off = row % 2 ? 1.5 : 0;
    for (let x = -R - off; x < R; x += 3) g.fillRect(X(x) - 1, Z(z), 2, 1.5 * k);
  }
  // flush service hatches (one every ~40 m²)
  g.strokeStyle = 'rgba(70,64,58,0.5)';
  g.lineWidth = 1;
  for (let i = 0; i < 40; i++) {
    const hx = -R + rnd() * 2 * R,
      hz = -R + rnd() * 2 * R;
    g.strokeRect(X(hx), Z(hz), 0.4 * k, 0.4 * k);
  }
  // runway paths and station pads: deckPath #8F8A84, 3 × 3 m panels, a carbon edge line
  const pave = (x0: number, z0: number, x1: number, z1: number, tone = '#8f8a84'): void => {
    g.fillStyle = '#3a3633';
    g.fillRect(X(x0) - 2, Z(z0) - 2, (x1 - x0) * k + 4, (z1 - z0) * k + 4);
    g.fillStyle = tone;
    g.fillRect(X(x0), Z(z0), (x1 - x0) * k, (z1 - z0) * k);
    g.fillStyle = 'rgba(52,47,43,0.5)';
    for (let x = Math.ceil(x0 / 3) * 3; x < x1; x += 3) g.fillRect(X(x) - 1, Z(z0), 2, (z1 - z0) * k);
    for (let z = Math.ceil(z0 / 3) * 3; z < z1; z += 3) g.fillRect(X(x0), Z(z) - 1, (x1 - x0) * k, 2);
  };
  pave(-1.6, 2, 1.6, 22.5); // main path from the gate
  pave(-4.6, -6.6, 4.6, 2.8); // Leitstand plaza
  pave(-8.8, -7.8, 8.8, -6.6, '#9a958f'); // viewing strip in front of the mast
  pave(1.6, 11, 7, 12.6); // path to A
  pave(4.6, 7.4, 11.4, 12.6); // A stand
  pave(-9.6, 1, -4.6, 7.2); // C stand
  pave(-4.6, 5, -1.6, 6.6); // path to C
  pave(1.6, 13.2, 4.6, 15.4, '#9a958f'); // EMI spot
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/** teal survey inlays (the measurement lines to the stations) as polylines [x, z] */
const INLAYS: [number, number][][] = [
  [
    [0, 22.4],
    [0, 2.6],
  ],
  [
    [0, 11.8],
    [8, 11.8],
    [8, 7.6],
  ],
  [
    [0, 5.8],
    [-3.7, 5.8],
    [-3.7, 4.9],
  ],
  [
    [-8.6, -7.2],
    [8.6, -7.2],
  ],
];

export interface WorldHandles {
  /** animate sculptures (dt, t) — cheap */
  update(dt: number, t: number): void;
  /** Gehirn-Stapel floor strips + pulse spine: set rates (Hz) */
  setRates(planner: number, skill: number, reflex: number, plannerOn: boolean): void;
  updateTower(dt: number, reduced: boolean): void;
  /** tower label canvas */
  redrawTowerLabels(): void;
  gyroAnchors: THREE.Vector3[];
  towerObject: THREE.Object3D;
  /** far tier pole (animated in updateFar) */
  farPole: THREE.Object3D;
  farCart: THREE.Object3D;
}

export function buildWorld(ctx: ZoneContext, look: Look): WorldHandles {
  const M = ctx.materials;
  const ext = ctx.groups.exterior;
  const det = ctx.groups.detail;
  const textures: THREE.Texture[] = [];
  const geos: THREE.BufferGeometry[] = [];
  const mats: THREE.Material[] = [];
  ctx.onDispose(() => {
    for (const t of textures) t.dispose();
    for (const g of geos) g.dispose();
    for (const m of mats) m.dispose();
  });

  // ── ground: deck composite (was dark raked gravel) ────────────────────────
  const gtex = groundTexture(ctx);
  textures.push(gtex);
  const gmat = new THREE.MeshStandardMaterial({ map: gtex, roughness: 0.82, metalness: 0.05, polygonOffset: true, polygonOffsetFactor: -5, polygonOffsetUnits: -12 });
  gmat.name = 'regelgarten:deck';
  mats.push(gmat);
  const ggeo = new THREE.CircleGeometry(21.62, 72).rotateX(-Math.PI / 2);
  geos.push(ggeo);
  // UVs straight from local x/z so the canvas (x → column, z → row) lines up with the zone frame
  const uv = ggeo.getAttribute('uv') as THREE.BufferAttribute;
  const gpos = ggeo.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (gpos.getX(i) + 22) / 44, 1 - (gpos.getZ(i) + 22) / 44);
  const ground = new THREE.Mesh(ggeo, gmat);
  ground.position.y = 0.035;
  ground.receiveShadow = true;
  ground.name = 'regelgarten:ground';
  ext.add(ground);

  const mg = new Merger();
  const L = LAYOUT;
  // ART-V2 Flugmaschine materials: ceramic bodies, carbon reveals and tops, alu trims and rails
  const hull = look.hull;
  const carbon = look.carbon;
  const alu = look.alu;
  const shell = look.shell;
  const hazard = M.hazard(2);
  const rubber = M.rubber;
  const R = (w: number, h: number, d: number, r?: number): THREE.BufferGeometry => metreUv(rbox(w, h, d, r));

  // ── Pendelmast plinth + rails + end stops ─────────────────────────────────
  const pz = L.mast.z;
  const PH = L.mast.plinthH;
  mg.add(carbon, new THREE.BoxGeometry(L.mast.plinthW - 0.5, 0.22, L.mast.plinthD - 0.5), [0, 0.11, pz]); // plinth reveal
  mg.add(hull, R(L.mast.plinthW, PH - 0.22, L.mast.plinthD), [0, 0.22 + (PH - 0.22) / 2, pz]);
  mg.add(alu, R(L.mast.plinthW + 0.2, 0.1, L.mast.plinthD + 0.2, 0.03), [0, PH - 0.01, pz]); // alu cap trim
  mg.box(carbon, L.mast.plinthW - 0.1, 0.02, 1.3, [0, PH + 0.05, pz]); // carbon track bed
  for (const dz of [-0.42, 0.42]) mg.box(alu, 16.4, 0.09, 0.09, [0, PH + 0.09, pz + dz]); // rails
  for (let x = -8; x <= 8; x += 1) mg.box(carbon, 0.16, 0.05, 1.3, [x, PH + 0.045, pz]); // sleepers
  for (const s of [-1, 1]) {
    mg.box(hazard, 0.5, 0.9, 1.7, [s * 8.35, PH + 0.45, pz]);
    mg.box(rubber, 0.12, 0.6, 1.4, [s * 8.04, PH + 0.45, pz]);
  }
  ctx.physics.addStaticBox({ size: [L.mast.plinthW + 0.2, PH + 0.2, L.mast.plinthD + 0.2], position: [0, (PH + 0.2) / 2, pz], surface: 'metal' });

  // a low barrier at the viewing line: tapered alu bollards on carbon feet + an alu rail
  for (let x = -8; x <= 8; x += 2) {
    mg.add(carbon, new THREE.CylinderGeometry(0.11, 0.12, 0.1, 14), [x, 0.05, -7.9]);
    mg.add(alu, new THREE.CylinderGeometry(0.055, 0.075, 0.62, 12), [x, 0.41, -7.9]);
    mg.add(hull, new THREE.CylinderGeometry(0.07, 0.07, 0.05, 14), [x, 0.74, -7.9]);
  }
  mg.box(alu, 16.2, 0.05, 0.05, [0, 0.62, -7.9]);
  ctx.physics.addStaticBox({ size: [16.2, 0.75, 0.2], position: [0, 0.375, -7.9] });

  // ── Leitstand (3 × 1 m console at (0, 0, −1), facing −z) ──────────────────
  const lz = L.leitstand.z;
  mg.add(carbon, new THREE.BoxGeometry(2.6, 0.12, 0.6), [0, 0.06, lz]);
  mg.add(hull, R(3, 0.73, 1, 0.06), [0, 0.12 + 0.365, lz]);
  mg.add(carbon, R(3.1, 0.06, 1.15, 0.02), [0, 0.98, lz + 0.05], [0.22, 0, 0]);
  mg.add(alu, R(3.12, 0.08, 1.02, 0.02), [0, 0.88, lz]);
  mg.add(carbon, R(1.9, 0.78, 0.08, 0.02), [0, 1.4, lz - 0.5], [-0.2, 0, 0]); // screen back
  mg.add(alu, new THREE.CylinderGeometry(0.045, 0.06, 0.42, 12), [0, 1.0, lz - 0.46]); // screen post
  ctx.physics.addStaticBox({ size: [3.1, 1.1, 1.1], position: [0, 0.55, lz] });

  // ── Gehirn-Stapel: alu + ceramic frame, glass floor plates, teal level lines ─
  const tx = L.tower.x,
    tz = L.tower.z,
    tw = L.tower.w,
    th = L.tower.h;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) mg.add(alu, new THREE.CylinderGeometry(0.06, 0.08, th, 12), [tx + (sx * tw) / 2, th / 2, tz + (sz * tw) / 2]);
  mg.add(hull, R(tw + 0.3, 0.22, tw + 0.3, 0.06), [tx, th + 0.11, tz]); // roof
  mg.add(alu, R(tw + 0.36, 0.05, tw + 0.36, 0.02), [tx, th - 0.01, tz]);
  mg.add(carbon, new THREE.BoxGeometry(tw, 0.12, tw), [tx, 0.06, tz]); // base reveal
  mg.add(hull, R(tw + 0.5, 0.14, tw + 0.5, 0.05), [tx, 0.19, tz]);
  for (const y of [2.5, 5.0]) {
    for (const s of [-1, 1]) {
      mg.box(alu, tw + 0.06, 0.08, 0.08, [tx, y, tz + (s * tw) / 2]);
      mg.box(alu, 0.08, 0.08, tw + 0.06, [tx + (s * tw) / 2, y, tz]);
    }
  }
  // floor machines: planner = slow dish, skill = actuator bank, reflex = dense core (ceramic, carbon)
  mg.add(shell, new THREE.CylinderGeometry(0.42, 0.55, 0.5, 24), [tx, 5.4, tz]);
  for (let i = 0; i < 4; i++) mg.add(shell, R(0.18, 0.9, 0.18, 0.03), [tx - 0.45 + i * 0.3, 3.05, tz - 0.2]);
  mg.add(hull, R(0.9, 0.9, 0.9, 0.06), [tx, 0.72, tz]);
  mg.add(carbon, R(0.94, 0.1, 0.94, 0.03), [tx, 1.2, tz]);
  // glass floor plates (one transparent mesh with the shell glass)
  const plateMat = new THREE.MeshStandardMaterial({ color: 0xe7e5e4, roughness: 0.12, metalness: 0, transparent: true, opacity: 0.22, depthWrite: false });
  plateMat.name = 'regelgarten:glassplates';
  mats.push(plateMat);
  const plateGeos = [2.5, 5.0].map((y) => new THREE.BoxGeometry(tw - 0.06, 0.04, tw - 0.06).translate(tx, y + 0.06, tz));
  const glassPlates = new THREE.Mesh(mergeGeometries(plateGeos, false)!, plateMat);
  plateGeos.forEach((g) => g.dispose());
  geos.push(glassPlates.geometry);
  glassPlates.renderOrder = 1;
  ext.add(glassPlates);
  const glassGeo = new THREE.BoxGeometry(tw, th - 0.3, tw);
  geos.push(glassGeo);
  const glass = new THREE.Mesh(glassGeo, M.glass);
  glass.position.set(tx, (th - 0.3) / 2 + 0.15, tz);
  glass.renderOrder = 2;
  glass.name = 'regelgarten:tower-glass';
  ext.add(glass);
  ctx.physics.addStaticBox({ size: [tw + 0.3, th, tw + 0.3], position: [tx, th / 2, tz] });

  // ── Balancier-Bahn plinth (A) ─────────────────────────────────────────────
  const bz = L.bahn.z,
    bx = (L.bahn.x0 + L.bahn.x1) / 2;
  mg.add(carbon, new THREE.BoxGeometry(6.1, 0.14, 0.5), [bx, 0.07, bz]);
  mg.add(hull, R(6.6, L.bahn.h - 0.14, 0.9, 0.05), [bx, 0.14 + (L.bahn.h - 0.14) / 2, bz]);
  mg.add(carbon, R(6.8, 0.06, 1.0, 0.02), [bx, L.bahn.h + 0.02, bz]);
  mg.add(alu, R(6.82, 0.03, 1.02, 0.01), [bx, L.bahn.h - 0.02, bz]);
  for (const dz of [-0.12, 0.12]) mg.box(alu, 6.2, 0.03, 0.03, [bx, L.bahn.h + 0.065, bz + dz]);
  for (const s of [-1, 1]) {
    mg.box(hazard, 0.16, 0.32, 0.5, [bx + s * 3.1, L.bahn.h + 0.16, bz]);
  }
  ctx.physics.addStaticBox({ size: [6.8, L.bahn.h + 0.1, 1.0], position: [bx, (L.bahn.h + 0.1) / 2, bz] });
  // pole rack (spare poles 0.5 / 1 / 2 m) at the right end
  mg.add(carbon, R(0.5, 0.08, 0.3, 0.02), [bx + 3.9, 0.75, bz + 0.1]);
  mg.add(alu, new THREE.CylinderGeometry(0.035, 0.045, 1.5, 10), [bx + 3.9, 0.75, bz - 0.05]);
  for (const [i, len] of [0.5, 1, 2].entries()) mg.add(alu, new THREE.CylinderGeometry(0.02, 0.02, len, 8), [bx + 3.75 + i * 0.13, 0.8 + len / 2, bz + 0.12]);
  ctx.physics.addStaticBox({ size: [0.6, 2.2, 0.5], position: [bx + 3.9, 1.1, bz] });
  // operator pedestal
  const ped = L.bahn.ped;
  mg.add(hull, R(0.5, 0.95, 0.4, 0.06), [ped[0], 0.475, ped[2]], [0, -0.5, 0]);
  mg.add(carbon, R(0.58, 0.05, 0.48, 0.02), [ped[0], 0.97, ped[2]], [0.2, -0.5, 0]);
  ctx.physics.addStaticBox({ size: [0.6, 1.0, 0.5], position: [ped[0], 0.5, ped[2]] });

  // ── C „Lauf, Ente!": Trainingsfeld plinth with a rail, Belohnungspult on its step, Teststrecke ──
  const DU = L.duck;
  {
    const fx = (DU.x0 + DU.x1) / 2,
      fz = (DU.z0 + DU.z1) / 2,
      fw = DU.x1 - DU.x0 + 0.4,
      fd = DU.z1 - DU.z0 + 0.4;
    mg.add(carbon, new THREE.BoxGeometry(fw - 0.3, 0.1, fd - 0.3), [fx, 0.05, fz]); // reveal
    mg.add(hull, R(fw, DU.plinth - 0.1, fd, 0.04), [fx, 0.1 + (DU.plinth - 0.1) / 2, fz]);
    mg.add(carbon, R(fw - 0.1, 0.02, fd - 0.1, 0.008), [fx, DU.plinth + 0.005, fz]); // tile bed
    // a waist-high alu rail on posts round the field (the ducks are 0.42 m: you look over it)
    const ry = 0.95;
    for (const [x0, z0, x1, z1] of [
      [DU.x0 - 0.3, DU.z0 - 0.3, DU.x1 + 0.3, DU.z0 - 0.3],
      [DU.x0 - 0.3, DU.z1 + 0.3, DU.x1 + 0.3, DU.z1 + 0.3],
      [DU.x0 - 0.3, DU.z0 - 0.3, DU.x0 - 0.3, DU.z1 + 0.3],
      [DU.x1 + 0.3, DU.z0 - 0.3, DU.x1 + 0.3, DU.z1 + 0.3],
    ] as [number, number, number, number][]) {
      const len = Math.hypot(x1 - x0, z1 - z0);
      mg.add(alu, new THREE.CylinderGeometry(0.03, 0.03, len, 8), [(x0 + x1) / 2, ry, (z0 + z1) / 2], x0 === x1 ? [Math.PI / 2, 0, 0] : [0, 0, Math.PI / 2]);
      const n = Math.max(2, Math.round(len / 2));
      for (let i = 0; i <= n; i++) mg.add(alu, new THREE.CylinderGeometry(0.025, 0.035, ry - DU.plinth, 8), [x0 + ((x1 - x0) * i) / n, DU.plinth + (ry - DU.plinth) / 2, z0 + ((z1 - z0) * i) / n]);
    }
    ctx.physics.addStaticBox({ size: [fw + 0.2, 1.0, fd + 0.2], position: [fx, 0.5, fz] });
  }
  // Belohnungspult on a 0.6 m step (two treads up from the east), facing −x
  const cx = DU.console.x,
    cz = DU.console.z,
    cs = DU.console.step;
  {
    const sx0 = cx - 0.9,
      sx1 = cx + 2.0;
    mg.add(hull, R(sx1 - sx0, cs, 2.8, 0.04), [(sx0 + sx1) / 2, cs / 2, cz]);
    mg.add(carbon, R(sx1 - sx0 + 0.04, 0.03, 2.84, 0.01), [(sx0 + sx1) / 2, cs + 0.005, cz]);
    mg.add(hull, R(0.5, cs / 2, 2.0, 0.03), [sx1 + 0.25, cs / 4, cz]); // lower tread
    mg.add(carbon, R(0.52, 0.02, 2.02, 0.008), [sx1 + 0.25, cs / 2 + 0.004, cz]);
    ctx.physics.addStaticBox({ size: [sx1 - sx0, cs, 2.8], position: [(sx0 + sx1) / 2, cs / 2, cz] });
    ctx.physics.addStaticBox({ size: [0.5, cs / 2, 2.0], position: [sx1 + 0.25, cs / 4, cz] });
  }
  mg.add(carbon, new THREE.BoxGeometry(0.6, 0.12, 1.9), [cx, cs + 0.06, cz]);
  mg.add(hull, R(0.9, 0.73, 2.2, 0.06), [cx, cs + 0.12 + 0.365, cz]);
  mg.add(carbon, R(1.05, 0.06, 2.3, 0.02), [cx + 0.05, cs + 0.98, cz], [0, 0, 0.22]);
  mg.add(alu, R(0.92, 0.08, 2.22, 0.02), [cx, cs + 0.88, cz]);
  mg.add(alu, new THREE.CylinderGeometry(0.03, 0.04, 0.5, 10), [cx - 0.1, cs + 1.0, cz + 0.95]); // screen post
  ctx.physics.addStaticBox({ size: [1.0, 1.1, 2.3], position: [cx, cs + 0.55, cz] });
  // Teststrecke: a 1 m plinth beside the desk, eye level from the step
  {
    const T2 = DU.track;
    const tx0 = T2.x0 - 0.15,
      tx1 = T2.x1 + 0.15,
      tz0 = T2.z0 - 0.08,
      tz1 = T2.z1 + 0.08;
    mg.add(hull, R(tx1 - tx0, T2.h - 0.04, tz1 - tz0, 0.04), [(tx0 + tx1) / 2, (T2.h - 0.04) / 2, (tz0 + tz1) / 2]);
    mg.add(carbon, R(tx1 - tx0 + 0.02, 0.04, tz1 - tz0 + 0.02, 0.01), [(tx0 + tx1) / 2, T2.h - 0.02, (tz0 + tz1) / 2]);
    for (const z of [tz0 - 0.02, tz1 + 0.02]) mg.box(alu, tx1 - tx0, 0.05, 0.03, [(tx0 + tx1) / 2, T2.h + 0.02, z]); // lips
    ctx.physics.addStaticBox({ size: [tx1 - tx0, T2.h, tz1 - tz0], position: [(tx0 + tx1) / 2, T2.h / 2, (tz0 + tz1) / 2] });
  }

  // ── hydroponic troughs (were planters with icosahedron shrubs) ───────────
  // glass boxes 0.9 m high in alu frames on a carbon reveal, neat plant rows, a warm grow-light bar
  // on two slim posts; same footprints, the collider now matches the 0.9 m glass
  const planters: [number, number, number, number][] = [
    [-5.4, 12, -2.4, 18.6],
    [2.4, 16.6, 5.4, 20.4],
    [10.6, 1.2, 14.6, 3.6],
    [-15.4, 10.2, -12.2, 12.4],
    [-11, -13.8, -4, -12.4],
    [4, -13.8, 11, -12.4],
  ];
  const TH = 0.9;
  const substrate = M.standard({ color: 0x2a2623, roughness: 0.96, metalness: 0 });
  const plantPos: [number, number, number, number, number][] = [];
  const growMg = new Merger();
  const glassGeos: THREE.BufferGeometry[] = [];
  const rnd = mulberry32(17);
  for (const [x0, z0, x1, z1] of planters) {
    const w = x1 - x0,
      d = z1 - z0,
      cxp = (x0 + x1) / 2,
      czp = (z0 + z1) / 2;
    mg.add(carbon, new THREE.BoxGeometry(w - 0.24, 0.1, d - 0.24), [cxp, 0.05, czp]); // reveal
    mg.add(hull, R(w, 0.3, d, 0.05), [cxp, 0.1 + 0.15, czp]); // ceramic tub
    mg.add(substrate, new THREE.BoxGeometry(w - 0.16, 0.02, d - 0.16), [cxp, 0.41, czp]); // grow bed (matte: clear-coat carbon mirrored the low sun)
    // alu frame: corner posts + top rim
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) mg.box(alu, 0.05, TH - 0.38, 0.05, [cxp + sx * (w / 2 - 0.03), 0.4 + (TH - 0.38) / 2, czp + sz * (d / 2 - 0.03)]);
    for (const s of [-1, 1]) {
      mg.box(alu, w, 0.04, 0.05, [cxp, TH, czp + s * (d / 2 - 0.03)]);
      mg.box(alu, 0.05, 0.04, d, [cxp + s * (w / 2 - 0.03), TH, czp]);
    }
    // glass sides (no lid: the plants breathe)
    glassGeos.push(
      new THREE.PlaneGeometry(w - 0.06, TH - 0.4).translate(cxp, 0.4 + (TH - 0.4) / 2, z0 + 0.03),
      new THREE.PlaneGeometry(w - 0.06, TH - 0.4).rotateY(Math.PI).translate(cxp, 0.4 + (TH - 0.4) / 2, z1 - 0.03),
      new THREE.PlaneGeometry(d - 0.06, TH - 0.4).rotateY(-Math.PI / 2).translate(x0 + 0.03, 0.4 + (TH - 0.4) / 2, czp),
      new THREE.PlaneGeometry(d - 0.06, TH - 0.4).rotateY(Math.PI / 2).translate(x1 - 0.03, 0.4 + (TH - 0.4) / 2, czp),
    );
    ctx.physics.addStaticBox({ size: [w, TH, d], position: [cxp, TH / 2, czp] });
    // plant rows along the long side
    const long = w >= d;
    const L0 = long ? w : d,
      S0 = long ? d : w;
    const rows = Math.max(2, Math.round((S0 - 0.3) / 0.42));
    const per = Math.max(2, Math.round((L0 - 0.3) / 0.36));
    for (let r = 0; r < rows; r++)
      for (let i = 0; i < per; i++) {
        const a = -L0 / 2 + 0.15 + ((i + 0.5) * (L0 - 0.3)) / per;
        const b = -S0 / 2 + 0.15 + ((r + 0.5) * (S0 - 0.3)) / rows;
        const px = cxp + (long ? a : b),
          pzz = czp + (long ? b : a);
        plantPos.push([px, 0.42, pzz, 0.85 + rnd() * 0.3, rnd() * Math.PI * 2]);
      }
    // grow-light bar on two slim posts along the long axis (T0 warm by day, T1 at dusk)
    const barY = 1.75;
    const ends: [number, number][] = long
      ? [
          [x0 + 0.25, czp],
          [x1 - 0.25, czp],
        ]
      : [
          [cxp, z0 + 0.25],
          [cxp, z1 - 0.25],
        ];
    for (const [ex, ez] of ends) mg.add(alu, new THREE.CylinderGeometry(0.022, 0.03, barY - TH, 8), [ex, TH + (barY - TH) / 2, ez]);
    const blen = L0 - 0.4;
    growMg.add(carbon, R(long ? blen : 0.12, 0.06, long ? 0.12 : blen, 0.02), [cxp, barY, czp]);
    growMg.add(look.light('warm', 0), new THREE.BoxGeometry(long ? blen - 0.1 : 0.06, 0.012, long ? 0.06 : blen - 0.1), [cxp, barY - 0.035, czp]);
  }
  growMg.build(ext, { name: 'regelgarten:grow' });
  // satin glass: at roughness 0.45 the low sun's highlight on the 0.5 m sides bloomed into a white blot
  const troughGlassMat = new THREE.MeshStandardMaterial({ color: 0xe7e5e4, roughness: 0.82, metalness: 0, transparent: true, opacity: 0.12, envMapIntensity: 0.3, depthWrite: false, side: THREE.DoubleSide });
  troughGlassMat.name = 'regelgarten:troughglass';
  // Z1: one pass for both faces (satin, 12 % opacity: the back-then-front order is not visible)
  troughGlassMat.forceSinglePass = true;
  mats.push(troughGlassMat);
  const troughGlass = new THREE.Mesh(mergeGeometries(glassGeos, false)!, troughGlassMat);
  glassGeos.forEach((g) => g.dispose());
  geos.push(troughGlass.geometry);
  troughGlass.renderOrder = 1;
  ext.add(troughGlass);

  // gyroscope pedestals: tapered ceramic on a carbon foot, alu collar plate
  for (const [gx, , gz] of L.gyros) {
    mg.add(carbon, new THREE.CylinderGeometry(0.6, 0.62, 0.12, 24), [gx, 0.06, gz]);
    mg.add(hull, new THREE.CylinderGeometry(0.46, 0.6, 0.8, 24), [gx, 0.52, gz]);
    mg.add(alu, new THREE.CylinderGeometry(0.66, 0.66, 0.08, 32), [gx, 0.96, gz]);
    mg.add(alu, new THREE.CylinderGeometry(0.035, 0.035, 0.8, 8), [gx, 1.35, gz]);
    ctx.physics.addStaticCylinder({ radius: 0.66, height: 1.0, position: [gx, 0.5, gz] });
  }
  // service step at the entrance gyro (it has a job: maintenance access to the gimbals) — and the way
  // up to the Sensorkapsel on the plinth (ground → 0.5 m → 1.0 m, two jumps of ≤ 0.6 m)
  {
    const [gx, , gz] = L.gyros[2];
    const sx = gx + 1.0,
      sz = gz;
    mg.add(carbon, new THREE.BoxGeometry(0.46, 0.1, 0.46), [sx, 0.05, sz]);
    mg.add(hull, R(0.6, 0.38, 0.6, 0.04), [sx, 0.1 + 0.19, sz]);
    mg.add(carbon, R(0.62, 0.04, 0.62, 0.015), [sx, 0.5, sz]);
    ctx.physics.addStaticBox({ size: [0.6, 0.52, 0.6], position: [sx, 0.26, sz] });
  }
  // light lines (unlit T0, one draw call): data cable tower → Leitstand → mast, survey inlays,
  // planner rail marks, and the contour rings around each balancing sculpture (the error band)
  const cable = new Merger();
  const tealLine = look.light('teal', 0);
  cable.box(tealLine, 5.25, 0.012, 0.04, [-2.625, 0.045, -2.0]);
  cable.box(tealLine, 0.04, 0.012, 6.8, [0, 0.045, -5.4]);
  for (const x of [-4.56, 0, 4.56]) cable.box(tealLine, 0.05, 0.02, 1.5, [x, PH + 0.07, pz]);
  for (const pts of INLAYS)
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, z0] = pts[i],
        [x1, z1] = pts[i + 1];
      const len = Math.hypot(x1 - x0, z1 - z0);
      cable.add(tealLine, new THREE.BoxGeometry(0.035, 0.008, len + 0.035), [(x0 + x1) / 2, 0.044, (z0 + z1) / 2], [0, Math.atan2(x1 - x0, z1 - z0), 0]);
    }
  const contours: [number, number, number[]][] = [
    ...L.gyros.map(([x, , z]) => [x, z, [1.05, 1.5, 2.1]] as [number, number, number[]]),
    [14.2, 9.6, [1.05, 1.45, 2.0]],
    [-10.6, -5.4, [1.15, 1.6, 2.15]],
  ];
  for (const [x, z, radii] of contours)
    radii.forEach((r, i) => {
      const wdt = i === 0 ? 0.03 : 0.018;
      cable.add(tealLine, new THREE.RingGeometry(r - wdt / 2, r + wdt / 2, 96).rotateX(-Math.PI / 2), [x, 0.043, z]);
    });

  mg.build(ext, { shadow: (m) => m === hull || m === alu, name: 'regelgarten:static' });
  cable.build(ext, { name: 'regelgarten:lines' });

  // plants: one InstancedMesh of hydroponic rosettes (plant green only under glass)
  const leaves: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 4; k++) {
    const leaf = new THREE.SphereGeometry(1, 6, 3);
    leaf.scale(0.05, 0.016, 0.12).translate(0, 0, 0.1).rotateX(-0.55).rotateY((k / 4) * Math.PI * 2 + 0.3);
    leaves.push(leaf);
  }
  leaves.push(new THREE.SphereGeometry(0.06, 6, 4).scale(1, 1.3, 1).translate(0, 0.05, 0));
  const plantGeo = mergeGeometries(leaves.map((g) => (g.index ? g.toNonIndexed() : g)), false)!;
  leaves.forEach((g) => g.dispose());
  plantGeo.computeVertexNormals();
  geos.push(plantGeo);
  const plants = new THREE.InstancedMesh(plantGeo, M.standard({ color: TOK.plant, roughness: 0.75, metalness: 0 }), plantPos.length);
  const mtx = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const pv = new THREE.Vector3();
  const sv = new THREE.Vector3();
  for (const [i, [x, y, z, s, a]] of plantPos.entries()) {
    q.setFromAxisAngle(up, a);
    mtx.compose(pv.set(x, y, z), q, sv.set(s, s, s));
    plants.setMatrixAt(i, mtx);
  }
  plants.computeBoundingSphere();
  plants.receiveShadow = true;
  plants.name = 'regelgarten:plants';
  det.add(plants);

  // ── gyroscope sculptures (detail tier, animated) ──────────────────────────
  const ringGeo = new THREE.TorusGeometry(1, 0.035, 8, 48);
  const hubGeo = new THREE.CylinderGeometry(0.22, 0.22, 0.06, 20);
  const accentGeo = new THREE.TorusGeometry(0.24, 0.022, 6, 28);
  geos.push(ringGeo, hubGeo, accentGeo);
  const rings = new THREE.InstancedMesh(ringGeo, alu, L.gyros.length * 3);
  const hubs = new THREE.InstancedMesh(hubGeo, carbon, L.gyros.length);
  const accents = new THREE.InstancedMesh(accentGeo, M.orangePaint, L.gyros.length);
  rings.castShadow = false;
  for (const m of [rings, hubs, accents]) {
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.frustumCulled = false;
    det.add(m);
  }
  const gyroAnchors = L.gyros.map(([x, , z]) => new THREE.Vector3(x, 1.85, z));
  const gq = [new THREE.Quaternion(), new THREE.Quaternion(), new THREE.Quaternion()];
  const ge = new THREE.Euler();
  const gs = new THREE.Vector3();
  const gm = new THREE.Matrix4();
  const tilt = new THREE.Quaternion();
  const spinQ = new THREE.Quaternion();
  const axisY = new THREE.Vector3(0, 1, 0);
  const axisX = new THREE.Vector3(1, 0, 0);
  const axisZ = new THREE.Vector3(0, 0, 1);

  // ── Gehirn-Stapel: light strips, pulse spine, labels ──────────────────────
  const stripMats = [0, 1, 2].map(() => {
    const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x2dd4bf), toneMapped: false });
    m.name = 'regelgarten:strip';
    mats.push(m);
    return m;
  });
  const floorY = [0.25, 2.62, 5.12]; // reflex, skill, planner (strip heights near each floor's base)
  for (let f = 0; f < 3; f++) {
    const sm = new Merger();
    const y = floorY[f] + 0.08;
    const h = tw - 0.12;
    for (const s of [-1, 1]) {
      sm.box(stripMats[f], h, 0.05, 0.03, [tx, y, tz + s * (tw / 2 - 0.08)]);
      sm.box(stripMats[f], 0.03, 0.05, h, [tx + s * (tw / 2 - 0.08), y, tz]);
    }
    sm.build(ext, { name: `regelgarten:strip${f}` });
  }
  // pulse spine: a dim vertical rod with bright pulses travelling down (instanced)
  const spineGeo = new THREE.CylinderGeometry(0.025, 0.025, th - 0.4, 6);
  geos.push(spineGeo);
  const spine = new THREE.Mesh(spineGeo, M.standard({ color: 0x1f3a37, roughness: 0.6 }));
  spine.position.set(tx + 0.75, (th - 0.4) / 2 + 0.2, tz + 0.75);
  ext.add(spine);
  const PULSES = 24;
  const pulseGeo = new THREE.CylinderGeometry(0.05, 0.05, 1, 8);
  geos.push(pulseGeo);
  const pulses = new THREE.InstancedMesh(pulseGeo, look.light('teal', 1), PULSES);
  pulses.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  pulses.frustumCulled = false;
  ext.add(pulses);
  const pulseY = new Float32Array(PULSES).fill(-10);
  const pulseSeg = new Int8Array(PULSES);
  let pulseNext = 0;
  const spawnAcc = [0, 0, 0];
  // segments: 0 planner→skill (y 7.0 → 4.9), 1 skill→reflex (4.9 → 2.4), 2 reflex→ground (2.4 → 0.2)
  const segTop = [7.0, 4.9, 2.4],
    segBot = [4.9, 2.4, 0.25];
  const steady = new THREE.Mesh(pulseGeo, look.light('teal', 1));
  steady.visible = false;
  steady.position.set(tx + 0.75, 0, tz + 0.75);
  ext.add(steady);
  const rates = { planner: 0.5, skill: 100, reflex: 1000, plannerOn: true };
  const flashPhase = [0, 0, 0];
  const pm = new THREE.Matrix4();
  const pp = new THREE.Vector3();
  const ps = new THREE.Vector3(1, 0.32, 1);
  const pq = new THREE.Quaternion();

  // labels canvas: 3 plates on the +z face and 3 on the +x face of the tower
  const LC = document.createElement('canvas');
  LC.width = 512;
  LC.height = 384;
  const lg = LC.getContext('2d')!;
  const ltex = new THREE.CanvasTexture(LC);
  ltex.colorSpace = THREE.SRGBColorSpace;
  ltex.anisotropy = 4;
  textures.push(ltex);
  const lmat = new THREE.MeshBasicMaterial({ map: ltex, color: 0xdcdcdc, toneMapped: false });
  lmat.name = 'regelgarten:towerlabels';
  mats.push(lmat);
  const plates: THREE.BufferGeometry[] = [];
  const plateY = [6.55, 4.05, 1.55]; // planner, skill, reflex
  for (let f = 0; f < 3; f++) {
    for (const face of [0, 1]) {
      const pg = new THREE.PlaneGeometry(1.5, 0.56);
      const uvA = pg.getAttribute('uv') as THREE.BufferAttribute;
      for (let i = 0; i < uvA.count; i++) uvA.setY(i, (2 - f) / 3 + uvA.getY(i) / 3);
      if (face === 0) pg.translate(tx - 0.2, plateY[f], tz + tw / 2 + 0.02);
      else {
        pg.rotateY(Math.PI / 2);
        pg.translate(tx + tw / 2 + 0.02, plateY[f], tz + 0.2);
      }
      plates.push(pg);
    }
  }
  const plateGeo = mergeGeometries(plates, false)!;
  for (const p of plates) p.dispose();
  geos.push(plateGeo);
  const plateMesh = new THREE.Mesh(plateGeo, lmat);
  plateMesh.name = 'regelgarten:tower-labels';
  ext.add(plateMesh);
  const fmtHz = (hz: number): string => (hz >= 1000 ? '1 kHz' : hz < 1 ? `${ctx.i18n.num(hz, 1)} Hz` : `${Math.round(hz)} Hz`);
  const redrawTowerLabels = (): void => {
    const rows: [string, string, string][] = [
      [ctx.t('tower.planner'), ctx.t('tower.plannerRange'), rates.plannerOn ? fmtHz(rates.planner) : ctx.t('b.plannerOff')],
      [ctx.t('tower.skill'), ctx.t('tower.skillRange'), fmtHz(rates.skill)],
      [ctx.t('tower.reflex'), ctx.t('tower.reflexRange'), fmtHz(rates.reflex)],
    ];
    lg.fillStyle = '#141414';
    lg.fillRect(0, 0, 512, 384);
    rows.forEach(([name, range, now], i) => {
      const y0 = i * 128;
      lg.fillStyle = '#1F1F1F';
      lg.fillRect(6, y0 + 6, 500, 116);
      lg.fillStyle = 'rgba(45,212,191,0.9)';
      lg.fillRect(6, y0 + 6, 4, 116);
      lg.font = '700 46px "Space Grotesk", sans-serif';
      lg.fillStyle = '#F5F5F4';
      lg.fillText(name, 26, y0 + 58);
      lg.font = '500 22px "Geist Mono", monospace';
      lg.fillStyle = '#A8A29E';
      lg.fillText(range.toUpperCase(), 28, y0 + 100);
      lg.font = '500 40px "Geist Mono", monospace';
      lg.fillStyle = '#2DD4BF';
      const w = lg.measureText(now).width;
      lg.fillText(now, 492 - w, y0 + 98);
    });
    ltex.needsUpdate = true;
  };
  redrawTowerLabels();

  // ── far silhouette (> 130 m): 2 draw calls ────────────────────────────────
  const fm = new Merger();
  // far tier in light hull tones (ART-V2 §6.0): no black blobs from the Ausguck
  const farHull = M.standard({ color: TOK.hullWarm, roughness: 0.6, metalness: 0 });
  fm.box(farHull, L.mast.plinthW, L.mast.plinthH, L.mast.plinthD, [0, L.mast.plinthH / 2, pz]);
  fm.box(farHull, tw, th, tw, [tx, th / 2, tz]);
  fm.box(farHull, L.duck.x1 - L.duck.x0 + 0.4, L.duck.plinth + 0.4, L.duck.z1 - L.duck.z0 + 0.4, [(L.duck.x0 + L.duck.x1) / 2, (L.duck.plinth + 0.4) / 2, (L.duck.z0 + L.duck.z1) / 2]);
  fm.box(farHull, 2.2, 0.8, 1.1, [bx, 0.4, bz]);
  fm.build(ctx.groups.far, { name: 'regelgarten:far' });
  const farCart = new THREE.Group();
  farCart.position.set(0, L.mast.plinthH, pz);
  ctx.groups.far.add(farCart);
  const farPoleGeo = new THREE.CylinderGeometry(0.2, 0.2, L.mast.pole, 6).translate(0, L.mast.pole / 2 + 1, 0);
  geos.push(farPoleGeo);
  const farPole = new THREE.Mesh(farPoleGeo, alu);
  farPole.position.y = 0;
  farCart.add(farPole);

  const setRates = (planner: number, skill: number, reflex: number, plannerOn: boolean): void => {
    const changed = planner !== rates.planner || skill !== rates.skill || reflex !== rates.reflex || plannerOn !== rates.plannerOn;
    rates.planner = planner;
    rates.skill = skill;
    rates.reflex = reflex;
    rates.plannerOn = plannerOn;
    if (changed) redrawTowerLabels();
  };

  const updateTower = (dt: number, reduced: boolean): void => {
    const r = [rates.reflex, rates.skill, rates.plannerOn ? rates.planner : 0];
    for (let f = 0; f < 3; f++) {
      const hz = r[f];
      let k: number;
      if (hz <= 0) k = 0.12;
      else if (hz > 30 || reduced) k = 1.0;
      else {
        flashPhase[f] = (flashPhase[f] + dt * hz) % 1;
        k = 0.18 + 1.4 * Math.exp(-flashPhase[f] * 7);
      }
      // level lines in the ART-V2 tiers: steady T0 (L ≈ 0.51), a tick flashes at T1 (L ≈ 1.44)
      const km = k > 1.05 ? 2.1 : 0.74 * k;
      stripMats[f].color.setRGB(0.176 * km, 0.831 * km, 0.749 * km);
    }
    // pulses (segments with rate ≤ 30 Hz drawn as discrete pulses, faster ones as a steady beam)
    const segRates = [rates.plannerOn ? rates.planner : 0, rates.skill, rates.reflex];
    for (let sgi = 0; sgi < 3; sgi++) {
      const hz = segRates[sgi];
      if (hz <= 0 || hz > 30 || reduced) continue;
      spawnAcc[sgi] += dt * hz;
      while (spawnAcc[sgi] >= 1) {
        spawnAcc[sgi] -= 1;
        pulseY[pulseNext] = segTop[sgi];
        pulseSeg[pulseNext] = sgi;
        pulseNext = (pulseNext + 1) % PULSES;
      }
    }
    for (let i = 0; i < PULSES; i++) {
      if (pulseY[i] > -5) {
        pulseY[i] -= dt * 3.2;
        if (pulseY[i] < segBot[pulseSeg[i]]) pulseY[i] = -10;
      }
      pp.set(tx + 0.75, pulseY[i], tz + 0.75);
      ps.set(1, pulseY[i] > -5 ? 0.32 : 0.0001, 1);
      pm.compose(pp, pq, ps);
      pulses.setMatrixAt(i, pm);
    }
    pulses.instanceMatrix.needsUpdate = true;
    // steady beams for fast layers (skill segment and reflex segment)
    // one beam covering the steady (> 30 Hz) layers below the planner
    const reflexSteady = rates.reflex > 30 || reduced;
    const skillSteady = reflexSteady && (rates.skill > 30 || reduced);
    const top = skillSteady ? segTop[1] : segTop[2];
    steady.visible = reflexSteady;
    steady.scale.set(0.7, top - segBot[2], 0.7);
    steady.position.y = (top + segBot[2]) / 2;
  };

  const update = (_dt: number, t: number): void => {
    // gyroscopes: nested gimbals precessing at different rates
    for (let i = 0; i < L.gyros.length; i++) {
      const a = gyroAnchors[i];
      const ph = i * 1.7;
      tilt.setFromAxisAngle(axisZ, 0.38 + 0.05 * Math.sin(t * 0.2 + ph));
      gq[0].setFromAxisAngle(axisY, t * 0.25 + ph).multiply(tilt);
      gq[1].copy(gq[0]).multiply(spinQ.setFromAxisAngle(axisX, Math.PI / 2 + Math.sin(t * 0.33 + ph) * 0.5));
      gq[2].copy(gq[1]).multiply(spinQ.setFromAxisAngle(axisY, t * 0.7 + ph));
      for (let k = 0; k < 3; k++) {
        const s = 0.82 - k * 0.2;
        gs.set(s, s, s);
        gm.compose(a, gq[k], gs);
        rings.setMatrixAt(i * 3 + k, gm);
      }
      // rotor: spins fast inside the innermost gimbal
      const rq = spinQ.copy(gq[2]).multiply(tilt.setFromEuler(ge.set(Math.PI / 2, t * 6, 0)));
      gs.set(1, 1, 1);
      gm.compose(a, rq, gs);
      hubs.setMatrixAt(i, gm);
      accents.setMatrixAt(i, gm);
    }
    rings.instanceMatrix.needsUpdate = true;
    hubs.instanceMatrix.needsUpdate = true;
    accents.instanceMatrix.needsUpdate = true;
  };
  update(0, 0);

  return { update, setRates, updateTower, redrawTowerLabels, gyroAnchors, towerObject: glass, farPole, farCart };
}
