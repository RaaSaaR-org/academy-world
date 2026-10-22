/**
 * The sites seen from afar (plan §2.5, §5.6, R8 §4.7): one low-poly impostor per ground site, so the island,
 * the Ausguck and the climb of the lift-off see the Revier's work before (and while) the sites' own code is
 * loaded. A site's impostor steps aside whenever its area draws the site itself:
 *  - while the area is ready and its exterior tier shows (the player is near), or
 *  - for good while the area has a far tier of its own (WP9's farm or WP10's hangar may build one).
 * Before the Revier opens the site areas are not even loaded (§2.6), so this is all the island sees of them.
 *
 * Budget (§5.5 region from the island ≤ 20 draws at the plaza, ≤ 30 at the Ausguck, ≤ 120 k triangles):
 * Sonnenacker 2 (statics, the tracker rows) · Traumhangar 1 · Kreislaufhof 2 (hall, the warm door) ·
 * the Unkrautacker's PV fences 1 (a landmark that always stands) · ≈ 9 k triangles together. The tracker rows stow flat when the lift-off's downwash front
 * passes (WP13's flight:phase 'downwash'), like the farm's own rows.
 */
import * as THREE from 'three';
import type { ZoneContext } from '@/core/zones';
import { SITE_PLOTS } from '../layout';
import { BOX, CYL6, DEG, GroundBatch, ROOF, box, instanced, mat4, place, rng, type RegionLook } from './look';
import { R } from './tuning';

const C = R.color;

export interface SiteImpostors {
  /** per frame: hide each impostor while its area draws the site */
  update(dt: number): void;
  /** the downwash front left the dock (WP13): the tracker rows stow as it passes */
  downwash(): void;
  stats(): Record<string, unknown>;
}

const plotOf = (id: string) => SITE_PLOTS.find((p) => p.id === id)!;

export function buildSiteImpostors(ctx: ZoneContext, parent: THREE.Object3D, look: RegionLook, ground: THREE.Object3D): SiteImpostors {
  const y = look.y;
  const groups = new Map<string, THREE.Group>();
  const group = (id: string): THREE.Group => {
    const g = new THREE.Group();
    g.name = `region:far:${id}`;
    parent.add(g);
    groups.set(id, g);
    return g;
  };
  const r = rng(140414);

  // ── Sonnenacker (−290, 60), 150 × 100 m (§4.10): the two Sonnendächer over raised beds, the Hofladen ──
  // (positions as WP3's block-out; WP9's farm takes over with its own tiers)
  const farm = group('sonnenacker');
  const roofs = [
    { x: -254, z: 59 },
    { x: -306, z: 59 },
  ];
  const rows: { x: number; y: number; z: number; tilt: number; stow: number; at: number }[] = [];
  {
    const b = new GroundBatch();
    for (const rf of roofs) {
      const g = y(rf.x, rf.z);
      for (let k = 0; k < 6; k++) {
        const x = rf.x - 15 + k * 6;
        for (const z of [rf.z - 6.5, rf.z, rf.z + 6.5]) b.add(CYL6, look.s(C.alu, 0.4, 0.7), mat4(x, g + 1.5, z, 0, 0.2, 3.0, 0.2));
        rows.push({ x, y: g + 3.12, z: rf.z, tilt: 52 * DEG, stow: 0, at: Math.hypot(x, rf.z) });
      }
      // six raised beds under the roof (1.0 × 30 m, 0.85 m), crop on top
      for (let k = 0; k < 6; k++) {
        const z = rf.z - 5.6 + k * 2.25;
        b.add(BOX, look.s(C.timberSilver, 0.9, 0, 0.8), box(rf.x, g + 0.42, z, 30, 0.85, 1.0));
        b.add(BOX, look.s(C.crop, 1), box(rf.x, g + 1.15, z, 29.6, 0.6, 0.8));
      }
    }
    // the Hofladen at the east gate (timber, a clay roof: rule 4 ≤ 3 % of the screen) and the cistern
    const hx = -224,
      hz = 74,
      hg = y(hx, hz);
    b.add(BOX, look.s(C.timberSilver, 0.85, 0, 0.7), box(hx, hg + 1.7, hz, 9, 3.4, 6));
    b.add(ROOF, look.s(C.clay, 0.85), mat4(hx, hg + 4.6, hz, 0, 9.4, 3.0, 6.4));
    b.add(CYL6, look.s(C.clay, 0.7), mat4(-231, y(-231, 86) + 1.6, 86, 0, 3.1, 3.2, 3.1));
    // hedges on the north and west edges, three unroofed Referenzbeete
    for (let x = -362; x <= -218; x += 6) b.add(BOX, look.s(C.hedge, 1, 0, 1), box(x, y(x, 108) + 0.9, 108, 6.1, 1.8 * (0.85 + r() * 0.3), 1.4));
    for (let z = 14; z <= 104; z += 6) b.add(BOX, look.s(C.hedge, 1, 0, 1), box(-363, y(-363, z) + 0.9, z, 1.4, 1.8 * (0.85 + r() * 0.3), 6.1));
    for (let k = 0; k < 3; k++) b.add(BOX, look.s(C.timberSilver, 0.9, 0, 0.8), box(-247, y(-247, 80) + 0.42, 78 + k * 2.4, 14, 0.85, 1.0));
    place(farm, b, look, 'region:far:sonnenacker:static', { cast: false });
  }
  const pvT = new GroundBatch().add(BOX, look.s(C.pv, 0.32, 0.35), mat4(0, 0, 0, 0, 2.25, 0.05, 14));
  const pv = instanced(pvT, look, 'region:far:sonnenacker:pv', rows.length);
  farm.add(pv);
  const _m = new THREE.Matrix4(),
    _q = new THREE.Quaternion(),
    _p = new THREE.Vector3(),
    _s = new THREE.Vector3(1, 1, 1),
    Z = new THREE.Vector3(0, 0, 1);
  const writeRows = (): void => {
    rows.forEach((w, i) => pv.setMatrixAt(i, _m.compose(_p.set(w.x, w.y, w.z), _q.setFromAxisAngle(Z, w.tilt * (1 - w.stow)), _s)));
    pv.instanceMatrix.needsUpdate = true;
  };
  writeRows();
  pv.computeBoundingSphere();

  // ── Traumhangar: centre polar(132, 165), 48 × 32 × 12 m, the doors toward bearing 312 (WP10 takes over) ──
  {
    const h = plotOf('traumhangar');
    const [hx, , hz] = h.anchor;
    const yaw = (h.facingDeg ?? 0) * DEG;
    const g = y(hx, hz);
    const b = new GroundBatch();
    b.add(BOX, look.s(C.white, 0.55, 0.2), box(hx, g + 4.5, hz, 48, 9, 32, yaw));
    b.add(new THREE.CylinderGeometry(16.6, 16.6, 1, 20, 1, false, 0, Math.PI).rotateZ(Math.PI / 2), look.s(C.alu, 0.45, 0.55), mat4(hx, g + 9, hz, yaw + Math.PI / 2, 1, 48, 0.2));
    // the roof mast (the NAV upload line climbs it, §3.3)
    b.add(CYL6, look.s(C.alu, 0.4, 0.6), mat4(hx, g + 17, hz, 0, 0.5, 12, 0.5));
    place(group('traumhangar'), b, look, 'region:far:traumhangar:static', { cast: false });
  }

  // ── Kreislaufhof (340, −40): the 60 × 30 m hall in the cloud shade, PV on the roof, a warm door ──
  {
    const k = plotOf('kreislaufhof');
    const [kx, , kz] = k.anchor;
    const yaw = (k.facingDeg ?? 0) * DEG;
    const g = y(kx, kz);
    const fr = new THREE.Matrix4().compose(new THREE.Vector3(kx, g, kz), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), _s);
    const at = (m: THREE.Matrix4): THREE.Matrix4 => fr.clone().multiply(m);
    const b = new GroundBatch();
    // clay-plaster walls on a timber frame, a shed roof rising to the north light; the door on the hub side
    b.add(BOX, look.s(C.plaster, 0.85, 0, 0.6), at(box(0, 3.75, 0, 60, 7.5, 30)));
    b.add(BOX, look.s(C.timberSilver, 0.8, 0, 0.6), at(box(0, 7.9, 0, 61, 0.8, 31)));
    b.add(BOX, look.s(C.pv, 0.3, 0.35), at(new THREE.Matrix4().compose(new THREE.Vector3(0, 9.2, 0), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -0.12), new THREE.Vector3(59, 0.15, 29))));
    b.add(BOX, look.s(C.dark, 0.6), at(box(0, 2.6, 15.02, 10, 5.2, 0.1)));
    // bales of sorted aluminium and PET on the yard (sorted = reusable)
    for (let i = 0; i < 6; i++) b.add(BOX, look.s(i % 2 ? C.alu : 0x8f9aa0, 0.6, i % 2 ? 0.5 : 0), at(box(-22 + i * 1.5, 0.6, 19, 1.2, 1.2, 1.2)));
    place(group('kreislaufhof'), b, look, 'region:far:kreislaufhof:static', { cast: false });
    const door = new THREE.Mesh(new THREE.PlaneGeometry(9.4, 4.8), look.warm);
    door.name = 'region:far:kreislaufhof:door';
    door.applyMatrix4(at(new THREE.Matrix4().makeTranslation(0, 2.5, 15.09)));
    groups.get('kreislaufhof')!.add(door);
  }

  // ── Unkrautacker (−230, −260): vertical bifacial PV fences over the pasture (Cat. II), the field's shed.
  // A region landmark, not an impostor: the area builds only its test strips, machines and station, so these
  // stay whether or not its code is loaded (the sheep between the rows are sheep.ts). ──
  {
    const b = new GroundBatch();
    for (let k = 0; k < 6; k++) {
      const x = -325 + k * 10;
      for (let z = -330; z < -190; z += 14) {
        const g0 = y(x, z + 7);
        // two bifacial modules in portrait, upright (the gap below lets the sheep graze), a rail on top, posts
        b.add(BOX, look.s(C.pv, 0.28, 0.3), box(x, g0 + 1.85, z + 7, 0.05, 2.0, 13.8));
        b.add(BOX, look.s(C.alu, 0.4, 0.6), box(x, g0 + 2.88, z + 7, 0.07, 0.06, 13.9));
        for (const dz of [0.2, 7]) b.add(BOX, look.s(C.alu, 0.45, 0.55), box(x, g0 + 1.5, z + dz, 0.09, 3.0, 0.09));
      }
    }
    // the sheep's shelter and the machine shed (open timber) at the field's edge
    b.add(BOX, look.s(C.timberSilver, 0.85, 0, 0.7), box(-300, y(-300, -190) + 1.3, -190, 8, 2.6, 4));
    b.add(BOX, look.s(C.timberFresh, 0.85, 0, 0.6), box(-162, y(-162, -200) + 2.2, -200, 12, 4.4, 7));
    b.add(BOX, look.s(C.grassGreen, 1), box(-162, y(-162, -200) + 4.55, -200, 12.6, 0.3, 7.6));
    const g = new THREE.Group();
    g.name = 'region:landmark:unkrautacker';
    parent.add(g);
    place(g, b, look, 'region:landmark:unkrautacker:static', { cast: true });
  }

  // ── who draws the site now ──
  interface Watch {
    group: THREE.Group;
    root: THREE.Object3D | null;
    ext: THREE.Object3D | null;
    ownFar: boolean;
  }
  const watch = new Map<string, Watch>();
  for (const [id, g] of groups) watch.set(id, { group: g, root: null, ext: null, ownFar: false });
  const bind = (): void => {
    const status = new Map(ctx.zones.list({ kind: 'all' }).map((m) => [m.id, m.status]));
    for (const [id, w] of watch) {
      if (status.get(id) !== 'ready') {
        w.root = w.ext = null;
        w.ownFar = false;
        continue;
      }
      if (!w.root) w.root = ground.getObjectByName(`zone:${id}`) ?? null;
      if (w.root) {
        w.ext = w.root.getObjectByName(`${id}:exterior`) ?? null;
        const far = w.root.getObjectByName(`${id}:far`) ?? ground.getObjectByName(`${id}:far`);
        w.ownFar = !!far && far.children.length > 0;
      }
    }
  };
  bind();
  for (const ev of ['zone:ready', 'zone:error', 'zone:resume']) ctx.events.on(ev, () => bind());
  ctx.every(2, bind);

  // the downwash's tracker wave (R5 §5): each row stows as the front passes, tracks again after 40 s
  let wave: number | null = null;
  return {
    update(dt) {
      for (const w of watch.values()) {
        const areaDraws = !!w.root && (w.ownFar || (!!w.root.parent && !!w.ext?.visible));
        if (w.group.visible === areaDraws) w.group.visible = !areaDraws;
      }
      if (wave != null) {
        wave += dt;
        let moving = false;
        for (const w of rows) {
          const target = wave < 40 && wave * R.downwash.frontSpeed >= w.at ? 1 : 0;
          if (w.stow !== target) {
            w.stow = THREE.MathUtils.clamp(w.stow + Math.sign(target - w.stow) * dt * (ctx.settings.reducedMotion ? 4 : 0.7), 0, 1);
            moving = true;
          }
        }
        if (moving) writeRows();
        if (wave > 60) wave = null;
      }
    },
    downwash() {
      wave = 0;
    },
    stats: () => Object.fromEntries([...watch].map(([id, w]) => [id, { shown: w.group.visible, areaRoot: !!w.root, ownFar: w.ownFar }])),
  };
}
