import * as THREE from 'three';
import type { ZoneContext } from '@/core/zones';
import { merge } from './util';
import { buildArm } from './tower/arm';
import { buildFx } from './tower/fx';
import { buildInterior } from './tower/interior';
import { createTowerKit } from './tower/kit';
import { buildLogoProgress } from './tower/logo';
import { buildMesspunkt } from './tower/messpunkt';
import { buildSculpture } from './tower/sculpture';
import { buildStructure, type Statics, type Structure } from './tower/structure';
import { resetTowerState } from './tower/state';
import { SCULPTURE } from './tower/constants';
import { TOWER } from './layout';
import { finishStatic, markStatic, mergeScope, staticMerger } from './statics';

const TOWER_R = SCULPTURE.radius;

/**
 * Akademie-Turm v2 (ART-V2 §3, FUN-PLAN §6): the island's signature.
 *  - a white hyperboloid diagrid around a dark-glass compute core, a ceramic foyer drum (every
 *    coordinate other code depends on is unchanged: circumradius 9, inradius 8.69, foyer 7 m,
 *    S door 4 × 4.5, N lift door 2.6 × 3, Ausguck +44 r 9–13 with the lift hole, shaft (0, ·, −10.7))
 *  - the Recamán relief: ring and 17 arcs as real tubes in one plane on a machined dial, held by a
 *    ceramic yoke and a hub on the diagrid's waist ring — the exact mark from every viewpoint
 *    (tower/sculpture.ts, tower/mount.ts)
 *  - a 6-axis arm under the halo that draws each earned stamp's line with a laser (tower/logo.ts)
 * Modules live in src/world/tower/.
 */
export interface Tower {
  /** world-space group of foyer props (detail tier, toggled by distance) */
  foyer: THREE.Group;
  /** lift car (moved by the lift system) */
  liftCar: THREE.Group;
  /** warm tower lights (dusk.ts lerps its emissiveIntensity) */
  windows: THREE.MeshStandardMaterial;
  /** the needle light = the nav lamp (dusk.ts lerps its emissiveIntensity) */
  needle: THREE.MeshStandardMaterial;
  /** WP12: crown beacons (the six rotors) and the needle light (NAV) */
  setSystems: Structure['setSystems'];
  update(dt: number, camPos: THREE.Vector3): void;
}

export function buildTower(ctx: ZoneContext): Tower {
  resetTowerState();
  const root = ctx.root;
  const kit = createTowerKit(ctx);
  // merged tower light lines follow the kit's day → dusk blend
  staticMerger(ctx).kitK = () => kit.duskK;
  const sculpture = buildSculpture(kit);
  root.add(sculpture.group);
  const statics: Statics = { hull: [], carbon: [], alu: [], teal: [] };
  const structure = buildStructure(ctx, kit, statics, sculpture.stem);
  // sculpture statics (dial body, pins, ticks, back ribs, hub, yoke) join the tower's merged meshes
  for (const k of ['hull', 'carbon', 'alu', 'teal'] as const) for (const g of sculpture.statics[k]) statics[k].push(clean(g));

  const hullMesh = new THREE.Mesh(merge(statics.hull), kit.hullPanel);
  hullMesh.name = 'tower:hull';
  hullMesh.castShadow = true;
  hullMesh.receiveShadow = true;
  root.add(hullMesh);
  const carbonMesh = new THREE.Mesh(merge(statics.carbon), kit.carbon);
  carbonMesh.name = 'tower:carbon';
  carbonMesh.castShadow = true;
  carbonMesh.receiveShadow = true;
  root.add(markStatic(carbonMesh));
  const aluMesh = new THREE.Mesh(merge(statics.alu), kit.alu);
  aluMesh.name = 'tower:alu';
  aluMesh.receiveShadow = true;
  root.add(markStatic(aluMesh));
  const tealMesh = new THREE.Mesh(merge(statics.teal), kit.light('teal'));
  tealMesh.name = 'tower:teal';
  root.add(markStatic(tealMesh));

  const arm = buildArm(kit);
  root.add(arm.group);
  const fx = buildFx(ctx.onDispose);
  root.add(fx.group);
  const logo = buildLogoProgress(ctx, kit, sculpture, arm, fx, () => structure.wave());
  buildMesspunkt(ctx, kit);

  // foyer interior (detail tier)
  const foyer = new THREE.Group();
  foyer.name = 'hub:foyer';
  root.add(mergeScope(foyer)); // its static parts merge inside it (hidden by distance as one)
  buildInterior(ctx, kit, foyer);

  // static tower parts: no per-frame matrix updates (C11b; the arm, anemometer, fx and lift car move)
  for (const n of ['tower:hull', 'tower:glass', 'tower:crown-pods', 'tower:beacons', 'tower:core-rings', 'tower:diagrid', 'tower:doors', 'tower:ausguck-deck', 'tower:needle-light', 'tower:eyebrow', 'tower:sculpture', 'tower:hatch']) {
    const o = root.getObjectByName(n);
    if (o) ctx.freezeStatic(o);
  }

  // budget + geometry probes (tools / acceptance): draw objects and triangles of the tower, the mark vs. the brand path
  ctx.debug.register('tower-budget', () => {
    const out = { exterior: { meshes: 0, tris: 0 }, foyer: { meshes: 0, tris: 0 }, sculptureArmFx: { meshes: 0, tris: 0 } };
    const count = (o: THREE.Object3D, b: { meshes: number; tris: number }): void => {
      o.traverse((m) => {
        const mesh = m as THREE.Mesh;
        if (!mesh.isMesh) return;
        const g = mesh.geometry;
        const n = g.index ? g.index.count : g.getAttribute('position').count;
        const inst = (mesh as THREE.InstancedMesh).isInstancedMesh ? (mesh as THREE.InstancedMesh).count : 1;
        b.meshes++;
        b.tris += (n / 3) * inst;
      });
    };
    for (const o of root.children) {
      if (o === foyer) count(o, out.foyer);
      else if (o === sculpture.group || o === arm.group || o === fx.group) count(o, out.sculptureArmFx);
      else if (o.name.startsWith('tower:') || o.name.startsWith('hub:')) count(o, out.exterior);
    }
    out.exterior.tris = Math.round(out.exterior.tris);
    out.foyer.tris = Math.round(out.foyer.tris);
    out.sculptureArmFx.tris = Math.round(out.sculptureArmFx.tris);
    return out;
  });
  // the relief against assets/brand/logo.svg (radii, centres, sides, end points on a(0…17), one plane)
  ctx.debug.register('logo-check', () => sculpture.check());
  // where the mark is (tools/brand-check.mjs projects the canonical mark with this)
  ctx.debug.register('logo-geom', () => ({ center: sculpture.center.toArray(), radius: TOWER_R }));

  // W1: the lift car (8 draws) hides behind the closed foyer drum when seen from the far side
  const carBox = new THREE.Box3();
  const corner = new THREE.Vector3();
  let carBoxReady = false;
  const carHidden = (cam: THREE.Vector3): boolean => {
    if (structure.doorsOpen || staticMerger(ctx).reference) return false;
    const car = structure.liftCar;
    if (!carBoxReady) {
      car.updateWorldMatrix(true, true);
      carBox.setFromObject(car).translate(corner.copy(car.position).negate());
      carBoxReady = !carBox.isEmpty();
      if (!carBoxReady) return false;
    }
    for (let i = 0; i < 8; i++) {
      corner.set(i & 1 ? carBox.max.x : carBox.min.x, i & 2 ? carBox.max.y : carBox.min.y, i & 4 ? carBox.max.z : carBox.min.z).add(car.position);
      if (!drumBlocks(cam, corner)) return false;
    }
    return true;
  };

  const foyerVisible = (camPos: THREE.Vector3): boolean => {
    const d = Math.hypot(camPos.x, camPos.z);
    // W1: the drum is closed (opaque walls, dark-glass doors): from outside the interior can only be
    // seen through an open door (or up the oculus from below the deck)
    const inside = d < TOWER.inradius + 0.3 && camPos.y > -0.5 && camPos.y < TOWER.foyerHeight + 1;
    return d < 42 && camPos.y < 20 && camPos.y > -8 && (inside || structure.doorsOpen || camPos.y < -0.5 || staticMerger(ctx).reference);
  };
  staticMerger(ctx).onReference(() => {
    structure.liftCar.visible = !carHidden(ctx.camera.position);
    foyer.visible = foyerVisible(ctx.camera.position);
  });

  let t = 0;
  return {
    foyer,
    liftCar: structure.liftCar,
    windows: structure.windows,
    needle: structure.needle,
    setSystems: (crown, nav, k) => structure.setSystems(crown, nav, k),
    update(dt, camPos) {
      // safety net: the static merge normally runs at the end of the island's init (enrichSurfaces)
      finishStatic(root);
      t += dt;
      kit.update();
      structure.update(dt, t, camPos, ctx.player.position);
      logo.update(dt);
      structure.liftCar.visible = !carHidden(camPos);
      foyer.visible = foyerVisible(camPos);
    },
  };
}

/** inside the drum's walls (12-gon inradius 8.69) and between its plinth and roof */
const DRUM_R = 8.6,
  DRUM_Y0 = 0.05,
  DRUM_Y1 = 7;
/** does the segment camera → p pass through the closed foyer drum (walls, roof, plinth)? */
function drumBlocks(c: THREE.Vector3, p: THREE.Vector3): boolean {
  const dx = p.x - c.x,
    dz = p.z - c.z;
  const a = dx * dx + dz * dz;
  const cc = c.x * c.x + c.z * c.z - DRUM_R * DRUM_R;
  if (a < 1e-9 || cc <= 0) return false; // looking straight down, or from inside the drum's footprint
  const b = 2 * (c.x * dx + c.z * dz);
  const disc = b * b - 4 * a * cc;
  if (disc <= 0) return false;
  const s = Math.sqrt(disc);
  const t0 = Math.max(0, (-b - s) / (2 * a)),
    t1 = Math.min(1, (-b + s) / (2 * a));
  if (t1 <= t0) return false;
  const y0 = c.y + (p.y - c.y) * t0,
    y1 = c.y + (p.y - c.y) * t1;
  return Math.min(y0, y1) <= DRUM_Y1 && Math.max(y0, y1) >= DRUM_Y0;
}

function clean(g: THREE.BufferGeometry): THREE.BufferGeometry {
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
  if (!g.getAttribute('normal')) g.computeVertexNormals();
  if (!g.getAttribute('uv')) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.getAttribute('position').count * 2), 2));
  return g;
}
