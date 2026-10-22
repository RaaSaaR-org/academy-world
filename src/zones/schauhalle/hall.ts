/**
 * The Schauhalle's shell (plan §4.9, R4 §7.1–7.3): a glass pavilion on the north spoke. Dark glossy
 * floor (static env map, no SSR), clear glass fronts south and north with sliding doors, frosted side
 * walls toward 02 and 03 over a ceramic sill, slim alu mullions, a roof glazing under WP12's roof frame
 * (y 9.3, which carries the 8 tracker segments) with a hatch over Bühne A for the delivery drone.
 *
 * Tiers (layout.ts HALL_PLOTS: detail ≤ 8 m, exterior ≤ 60 m from the rect): the shell, the floor and
 * the plinth bases are exterior (seen through the glass from the plaza, ≤ 12 draws, plan §5.5); the
 * doors and everything inside are detail; the far tier is one box. No part casts a shadow: the glass
 * would darken the hall, and the tracker tables on the roof already cast theirs.
 */
import * as THREE from 'three';
import type { StaticHandle, ZoneContext } from '@/core/zones';
import { box, boxMM, mesh, plane } from './geo';
import { DOORS, FROST, HALL, STAGES } from './layout';
import { FAR_PROXY } from './tuning';

export interface HallShell {
  /** the shared hall materials (furniture reuses them, so they merge into the same draws) */
  readonly mats: HallMats;
  /** 0 closed … 1 open, per door; follows the player by itself */
  update(dt: number): void;
  /** the roof hatch over Bühne A: 0 closed … 1 open */
  setHatch(t: number): void;
  /** far tier: the box stays off where the tower and the hub hide the hall (the Landedeck, the bridge head) */
  updateFar(): void;
  readonly hatchOpen: number;
}

export interface HallMats {
  floor: THREE.MeshStandardMaterial;
  glass: THREE.Material;
  frost: THREE.MeshStandardMaterial;
  ceramic: THREE.MeshStandardMaterial;
  alu: THREE.Material;
  carbon: THREE.Material;
  turntable: THREE.MeshStandardMaterial;
}

export function buildShell(ctx: ZoneContext): HallShell {
  const M = ctx.materials;
  const ext = ctx.groups.exterior;
  const det = ctx.groups.detail;
  const owned: { dispose(): void }[] = [];
  ctx.onDispose(() => owned.forEach((o) => o.dispose()));

  // ── materials ────────────────────────────────────────────────────────────
  // dark glossy showroom floor: the static environment map does the reflections (no SSR, R4 §7.3)
  const floor = new THREE.MeshStandardMaterial({ color: 0x191715, roughness: 0.42, metalness: 0.0, envMapIntensity: 1.15, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2, name: 'schauhalle:floor' });
  // frosted glass toward 02 and 03: light passes, the neighbours blur away
  const frost = new THREE.MeshStandardMaterial({ color: 0xf1efec, roughness: 0.92, metalness: 0, transparent: true, opacity: 0.86, depthWrite: false, side: THREE.DoubleSide, name: 'schauhalle:frost' });
  // white ceramic plinths and sills (island machine look, ART-V2)
  const ceramic = new THREE.MeshStandardMaterial({ color: 0xf3f1ee, roughness: 0.3, metalness: 0.02, name: 'schauhalle:ceramic' });
  const turntable = new THREE.MeshStandardMaterial({ color: 0x2a2725, roughness: 0.36, metalness: 0.2, name: 'schauhalle:turntable' });
  owned.push(floor, frost, ceramic, turntable);
  const mats: HallMats = { floor, glass: M.glassClear, frost, ceramic, alu: M.brushedAlu, carbon: M.carbon, turntable };

  const { x0, x1, z0, z1, clearY, roofY } = HALL;
  const statics: StaticHandle[] = [];
  const wall = (ax0: number, az0: number, ax1: number, az1: number, h = clearY): void => {
    statics.push(ctx.physics.addStaticBox({ size: [Math.max(0.1, ax1 - ax0), h, Math.max(0.1, az1 - az0)], position: [(ax0 + ax1) / 2, h / 2, (az0 + az1) / 2], surface: 'glass' }));
  };

  // ── floor ────────────────────────────────────────────────────────────────
  ext.add(mesh([boxMM(x0 + 0.05, 0, z0 + 0.05, x1 - 0.05, 0.012, z1 - 0.05)], floor, 'schauhalle:floor'));

  // ── glass fronts (south with the entrance, north with the door to the Glasbalkon) ──
  const glass: THREE.BufferGeometry[] = [];
  const alu: THREE.BufferGeometry[] = [];
  const front = (z: number, d: { x0: number; x1: number; h: number }): void => {
    glass.push(boxMM(x0, 0, z - 0.02, d.x0, clearY, z + 0.02), boxMM(d.x1, 0, z - 0.02, x1, clearY, z + 0.02), boxMM(d.x0, d.h, z - 0.02, d.x1, clearY, z + 0.02));
    wall(x0, z - 0.06, d.x0, z + 0.06);
    wall(d.x1, z - 0.06, x1, z + 0.06);
    // mullions every 3 m, a transom over the door, base and head profiles
    for (let x = x0; x <= x1 + 1e-6; x += 3) if (x < d.x0 - 0.1 || x > d.x1 + 0.1) alu.push(boxMM(x - 0.05, 0, z - 0.07, x + 0.05, clearY, z + 0.07));
    alu.push(boxMM(d.x0 - 0.08, 0, z - 0.08, d.x0, d.h, z + 0.08), boxMM(d.x1, 0, z - 0.08, d.x1 + 0.08, d.h, z + 0.08), boxMM(d.x0 - 0.08, d.h, z - 0.08, d.x1 + 0.08, d.h + 0.14, z + 0.08));
    alu.push(boxMM(x0, 0, z - 0.09, d.x0 - 0.08, 0.1, z + 0.09), boxMM(d.x1 + 0.08, 0, z - 0.09, x1, 0.1, z + 0.09));
    alu.push(boxMM(x0, clearY - 0.16, z - 0.09, x1, clearY, z + 0.09));
  };
  front(z1, DOORS.south);
  front(z0, DOORS.north);

  // ── frosted side walls over a ceramic sill ─────────────────────────────────
  const frosted: THREE.BufferGeometry[] = [];
  const sill: THREE.BufferGeometry[] = [];
  for (const x of [x0, x1]) {
    sill.push(boxMM(x - 0.06, 0, z0, x + 0.06, FROST.sill, z1));
    frosted.push(boxMM(x - 0.02, FROST.sill, z0, x + 0.02, clearY, z1));
    for (let z = z0; z <= z1 + 1e-6; z += 3.5) alu.push(boxMM(x - 0.07, 0, z - 0.05, x + 0.07, clearY, z + 0.05));
    alu.push(boxMM(x - 0.09, clearY - 0.16, z0, x + 0.09, clearY, z1), boxMM(x - 0.08, FROST.sill - 0.04, z0, x + 0.08, FROST.sill + 0.04, z1));
    wall(x - 0.08, z0, x + 0.08, z1);
  }

  // ── roof glazing on WP12's frame (y 9.3), the hatch over Bühne A left open in it ──
  const H = STAGES.hatch;
  const ry = roofY + 0.005;
  const hx0 = H.x - H.size / 2,
    hx1 = H.x + H.size / 2,
    hz0 = H.z - H.size / 2,
    hz1 = H.z + H.size / 2;
  for (const [ax0, az0, ax1, az1] of [
    [x0, z0, x1, hz0],
    [x0, hz1, x1, z1],
    [x0, hz0, hx0, hz1],
    [hx1, hz0, x1, hz1],
  ])
    glass.push(boxMM(ax0, ry, az0, ax1, ry + 0.02, az1));
  // the hatch frame (alu) and its two leaves (detail: they slide open for a delivery)
  alu.push(boxMM(hx0 - 0.1, ry - 0.12, hz0 - 0.1, hx1 + 0.1, ry, hz0), boxMM(hx0 - 0.1, ry - 0.12, hz1, hx1 + 0.1, ry, hz1 + 0.1), boxMM(hx0 - 0.1, ry - 0.12, hz0, hx0, ry, hz1), boxMM(hx1, ry - 0.12, hz0, hx1 + 0.1, ry, hz1));
  const leafGeo = box(H.size / 2, 0.03, H.size, 0, 0, 0);
  owned.push(leafGeo);
  const leafMat = M.darkGlass;
  const leaves = [-1, 1].map((s) => {
    const m = new THREE.Mesh(leafGeo, leafMat);
    m.name = 'schauhalle:hatch-leaf';
    m.position.set(H.x + (s * H.size) / 4, ry + 0.035, H.z);
    m.userData.s = s;
    det.add(m);
    return m;
  });
  let hatch = 0;

  ext.add(mesh(glass, M.glassClear, 'schauhalle:glass', { receive: false }));
  // frosted glass scatters the low sun: it blocks the direct light (no hot spots on the glossy floor)
  ext.add(mesh(frosted, frost, 'schauhalle:frost', { receive: false, cast: true }));
  ext.add(mesh(sill, ceramic, 'schauhalle:sill'));
  ext.add(mesh(alu, M.brushedAlu, 'schauhalle:alu'));

  // ── sliding doors: two glass leaves per door that part when you come near ──
  const doorLeafs: { m: THREE.Mesh; from: number; to: number; door: 'south' | 'north' }[] = [];
  const doorGeo: Record<string, THREE.BufferGeometry> = {};
  for (const key of ['south', 'north'] as const) {
    const d = DOORS[key];
    const w = (d.x1 - d.x0) / 2;
    const g = box(w, d.h, 0.03, 0, d.h / 2, 0);
    doorGeo[key] = g;
    owned.push(g);
    for (const s of [-1, 1]) {
      const m = new THREE.Mesh(g, M.glassClear);
      m.name = `schauhalle:door-${key}`;
      const cx = (d.x0 + d.x1) / 2 + (s * w) / 2;
      m.position.set(cx, 0, d.z + (key === 'south' ? -0.12 : 0.12));
      det.add(m);
      doorLeafs.push({ m, from: cx, to: cx + s * (w - 0.08), door: key });
    }
  }
  const doorT = { south: 0, north: 0 };
  // the door frame strips that slide with the leaves (alu edges read the motion)
  const p = new THREE.Vector3();

  // ── far tier: the hall as one light box (≤ 2 draws, ≤ 3 k triangles) ──────────
  const farBox = mesh([boxMM(x0, 0, z0, x1, roofY, z1)], ctx.materials.standard({ color: 0xdedbd6, roughness: 0.4, metalness: 0.1 }), 'schauhalle:far');
  ctx.groups.far.add(farBox);

  // ── the facade sign over the entrance (plan §4.9, R4 §10) ───────────────────
  const T = ctx.i18n.text;
  const sign = ctx.text3d.create({ text: T('sign.title'), font: 'display', size: 0.62, color: 0xf5f5f4, anchorX: 'center', anchorY: 'bottom', letterSpacing: 0.08, position: [0, 4.15, z1 + 0.12] }, ext);
  const sub = ctx.text3d.create({ text: T('sign.sub'), font: 'mono-medium', size: 0.2, color: 0xd6d3d1, anchorX: 'center', anchorY: 'top', letterSpacing: 0.06, uppercase: true, position: [0, 4.02, z1 + 0.12] }, ext);
  sign.name = 'schauhalle:sign';
  sub.name = 'schauhalle:sign-sub';
  // a carbon band behind the sign (merged with the glass head profile's colour family)
  ext.add(mesh([boxMM(-4.6, 3.55, z1 + 0.04, 4.6, 4.95, z1 + 0.1)], M.carbon, 'schauhalle:sign-band'));
  void plane;

  const _f = new THREE.Vector3();
  return {
    mats,
    updateFar() {
      // from the island's southern landing the hall stands right behind the tower (stills: nothing of it
      // shows), so the far box costs a draw for nothing there; from above (the Kanzeln) it shows again
      const f = ctx.player.positionLocal(_f);
      const hidden = f.z > FAR_PROXY.hiddenSouthOfZ && f.y < FAR_PROXY.belowY && Math.abs(f.x) < FAR_PROXY.withinX;
      if (farBox.visible === hidden) farBox.visible = !hidden;
    },
    update(dt) {
      const pl = ctx.player.positionLocal(p);
      for (const key of ['south', 'north'] as const) {
        const d = DOORS[key];
        const near = Math.abs(pl.z - d.z) < 3.2 && pl.x > d.x0 - 1.4 && pl.x < d.x1 + 1.4 && pl.y > -1 && pl.y < 4;
        const target = near ? 1 : 0;
        const rate = ctx.settings.reducedMotion ? 99 : 2.6;
        const t = doorT[key];
        doorT[key] = target > t ? Math.min(1, t + dt * rate) : Math.max(0, t - dt * rate * 0.7);
      }
      for (const l of doorLeafs) {
        const t = doorT[l.door];
        const e = t * t * (3 - 2 * t);
        l.m.position.x = l.from + (l.to - l.from) * e;
      }
      for (const m of leaves) m.position.x = H.x + ((m.userData.s as number) * H.size) / 4 + (m.userData.s as number) * (H.size / 2 + 0.05) * hatch;
    },
    setHatch(t) {
      hatch = THREE.MathUtils.clamp(t, 0, 1);
    },
    get hatchOpen() {
      return hatch;
    },
  };
}
