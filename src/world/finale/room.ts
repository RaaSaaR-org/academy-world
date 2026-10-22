import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type RAPIER from '@dimforge/rapier3d-compat';
import type { KinematicHandle, ZoneContext } from '@/core/zones';
import { DEG, KEEL, TOWER, ZONE_PLOTS, polar } from '../layout';
import { drawGlyph } from '../glyphs';
import { C, F, chip, hairline, wrap, type Lang } from './draw';
import { LESSONS, LESSON_STR, S } from './strings';
import { zoneValue, type PassView } from '@/core/quest/values';

/**
 * The finale's own furniture in the Kielraum (catwalk ring r 9–13 at y −36 around the
 * Regelkern at −40, GDD §6.6). The island team owns the catwalk, the core and the shaft;
 * this adds the stations, the six lesson posts (one per thruster M1–M6 = per zone),
 * practical lights (desk lamp, screen glow, IMU halo, gimbal uplights, LED edge strips),
 * the gimbal-stabilised horizon ring, six loose crates and railing colliders.
 *
 * Station frames: `opFrame` = the user faces the core (local −Z inward, +X right);
 * `wallFrame` = the object faces the walkway/core (its front +Z points inward).
 */

const Y = KEEL.catwalkY;
const _q = new THREE.Quaternion();

export interface Pose {
  position: THREE.Vector3;
  lookAt: THREE.Vector3;
}

export interface Room {
  group: THREE.Group;
  leitstand: THREE.Object3D;
  vendor: THREE.Object3D;
  messwand: THREE.Object3D;
  lectern: THREE.Object3D;
  plaque: THREE.Object3D;
  callPanel: THREE.Object3D;
  posts: THREE.Object3D[];
  crates: KinematicHandle[];
  /** private-world gravity for the crates (m/s², world axes); null = straight down */
  setCrateGravity(g: [number, number, number] | null): void;
  /** stand-here points (world feet) */
  spots: { f1: THREE.Vector3; f2: THREE.Vector3; f3: THREE.Vector3; arrive: THREE.Vector3 };
  /** operate camera poses (world) */
  poses: { f1: Pose; f2: Pose; year: Pose };
  /** EMI waypoints near each station (world, on the ring) */
  emiSpots: { f1: THREE.Vector3; f2: THREE.Vector3; f3: THREE.Vector3; lift: THREE.Vector3 };
  /** canvases (redraw, then call mark*) */
  leitstandCanvas: HTMLCanvasElement;
  messwandCanvas: HTMLCanvasElement;
  lecternCanvas: HTMLCanvasElement;
  markLeitstand(): void;
  markMesswand(): void;
  markLectern(): void;
  /** redraw the lesson posts and the plaque (pass values, language, mode) */
  refreshPosts(view: PassView): void;
  setVisible(v: boolean): void;
  update(dt: number, t: number, tilt: { roll: number; pitch: number }): void;
  /** W8: hand redrawn screens to the GPU, ≤ 4 MB per frame and only while the room is drawn (call every frame) */
  flushUploads(): void;
}

/** Ring-angle helper: world point at compass bearing b, radius r, height above the catwalk. */
function at(b: number, r: number, h = 0): THREE.Vector3 {
  const [x, , z] = polar(b, r);
  return new THREE.Vector3(x, Y + h, z);
}
const rotOp = (b: number): number => Math.PI - b * DEG; // user faces the core
const rotWall = (b: number): number => -b * DEG; // front faces the core

export const BEARINGS = { f1: 62, f2Screen: 180, f2Vendor: 157, f3: 300, plaque: 15 };
export const LESSON_BEARINGS: Record<string, number> = Object.fromEntries(ZONE_PLOTS.map((z) => [z.id, z.bearing]));

function canvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}
function screenMat(c: HTMLCanvasElement, bright = 0.92): { mat: THREE.MeshBasicMaterial; tex: THREE.CanvasTexture } {
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const mat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, color: new THREE.Color(bright, bright, bright) });
  return { mat, tex };
}

export function buildRoom(ctx: ZoneContext): Room {
  const M = ctx.materials;
  const group = new THREE.Group();
  group.name = 'finale:kielraum';
  ctx.root.add(group);
  const disposables: { dispose(): void }[] = [];
  ctx.onDispose(() => disposables.forEach((d) => d.dispose()));

  // W8 (PERF-09): redrawn canvas screens are queued and uploaded ≤ 4 MB per frame while the room is
  // drawn (F2 → F3 used to push the wall, the lesson atlas and the Leitstand, 10.8 MB, in one frame)
  const UPLOAD_BUDGET = 4 * 1024 * 1024;
  const dirty = new Set<THREE.Texture>();
  const markTex = (tex: THREE.Texture): void => void dirty.add(tex);

  // the common console kit (ART-V2 §5.8, §6.0): warm-grey hull bodies (rounded boxes), carbon tops,
  // brushed-alu trim, boards in alu frames with dark-glass faces. Each object merges per material.
  const body = M.standard({ color: 0x24211f, roughness: 0.55, metalness: 0.65 });
  const hull = M.standard({ color: 0x57524d, roughness: 0.42, metalness: 0.55 });
  const carbon = M.standard({ color: 0x1f1d1c, roughness: 0.5, metalness: 0.35 });
  const alu = M.standard({ color: 0xc9c4be, roughness: 0.28, metalness: 0.95 });
  const glass = M.standard({ color: 0x0f0e0d, roughness: 0.08, metalness: 0.2, envMapIntensity: 1.4 });
  const glossy = M.standard({ color: 0xece9e6, roughness: 0.16, metalness: 0.05, envMapIntensity: 1.3 });
  disposables.push(body, hull, carbon, alu, glass, glossy);
  /** merge geometries into one mesh per material under `parent` */
  const kit = (parent: THREE.Object3D, parts: [THREE.Material, THREE.BufferGeometry[]][]): void => {
    for (const [mat, list] of parts) {
      if (!list.length) continue;
      const geo = mergeGeometries(list, false);
      if (!geo) continue;
      const m = new THREE.Mesh(geo, mat);
      m.castShadow = true;
      m.receiveShadow = true;
      parent.add(m);
      disposables.push(geo);
    }
  };
  const flat = (g: THREE.BufferGeometry): THREE.BufferGeometry => (g.index ? g.toNonIndexed() : g);
  const rbox = (w: number, h: number, d: number, r = 0.04): THREE.BufferGeometry => flat(new RoundedBoxGeometry(w, h, d, 2, r));
  const box = (w: number, h: number, d: number): THREE.BufferGeometry => flat(new THREE.BoxGeometry(w, h, d));
  const cyl = (r0: number, r1: number, h: number, n = 12): THREE.BufferGeometry => flat(new THREE.CylinderGeometry(r0, r1, h, n));

  // ── railing colliders (the island's catwalk rails are visual only) ─────────
  for (const r of [KEEL.catwalkInner, KEEL.catwalkOuter]) {
    const wall = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 1.2, 64, 1, true), body);
    wall.position.y = Y + 0.6;
    wall.visible = false;
    group.add(wall);
    ctx.physics.addStaticTrimesh(wall, { surface: 'metal' });
  }

  // ── LED edge strips along both catwalk edges (warm, wayfinding) ────────────
  {
    const g = mergeGeometries([new THREE.RingGeometry(KEEL.catwalkInner + 0.06, KEEL.catwalkInner + 0.13, 160, 1), new THREE.RingGeometry(KEEL.catwalkOuter - 0.13, KEEL.catwalkOuter - 0.07, 160, 1)])!;
    g.rotateX(-Math.PI / 2);
    const strip = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0xffb877, toneMapped: true }));
    strip.position.y = Y + 0.02;
    strip.name = 'finale:led-strips';
    group.add(strip);
    disposables.push(g, strip.material as THREE.Material);
  }

  // ── the Regelkern well (Phase 5): a dark graphite bowl under the gimbal, from the catwalk's inner
  // edge down to −46, so the white rings read against black instead of the cloud sea. Twelve ribs,
  // a warm level line under the lip and a teal ring with four compass ticks on the floor (the
  // reference the horizon ring above is levelled against). One mesh per material.
  {
    const wellMat = M.standard({ color: 0x141211, roughness: 0.62, metalness: 0.45, side: THREE.DoubleSide });
    const ribMat = M.standard({ color: 0x3b3734, roughness: 0.4, metalness: 0.8 });
    const prof: [number, number][] = [
      [KEEL.catwalkInner - 0.02, Y - 0.3],
      [8.75, Y - 0.62],
      [8.45, Y - 2.4],
      [8.1, Y - 5.4],
      [7.35, Y - 7.7],
      [6.0, Y - 9.25],
      [4.0, Y - 9.85],
      [0.01, Y - 10.0],
    ];
    const well = new THREE.Mesh(new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 96), wellMat);
    well.name = 'finale:well';
    group.add(well);
    disposables.push(well.geometry);
    // ribs: thin flat bars following the bowl, slightly proud of it
    const ribs: THREE.BufferGeometry[] = [];
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2 + Math.PI / 12;
      for (let i = 0; i < prof.length - 2; i++) {
        const [r0, y0] = prof[i],
          [r1, y1] = prof[i + 1];
        const dx = r1 - r0,
          dy = y1 - y0;
        const len = Math.hypot(dx, dy);
        const g = new THREE.BoxGeometry(0.12, len + 0.06, 0.1);
        g.rotateZ(Math.atan2(-dx, dy));
        // sit proud of the bowl on its inner (upper) side
        g.translate((r0 + r1) / 2 + (dy / len) * 0.06, (y0 + y1) / 2 - (dx / len) * 0.06, 0);
        g.rotateY(-a);
        ribs.push(g.index ? g.toNonIndexed() : g);
      }
    }
    const ribMesh = new THREE.Mesh(mergeGeometries(ribs)!, ribMat);
    group.add(ribMesh);
    disposables.push(ribMesh.geometry);
    // light lines: warm level line under the lip, teal floor ring + compass ticks (line tier: T0 → T1)
    const warm = M.light(0xffd9ad);
    const teal = M.light(0x2dd4bf);
    const lip = new THREE.Mesh(new THREE.TorusGeometry(8.6, 0.03, 6, 160).rotateX(Math.PI / 2).translate(0, Y - 1.2, 0), warm);
    const floorParts: THREE.BufferGeometry[] = [new THREE.TorusGeometry(3.2, 0.045, 6, 128).rotateX(Math.PI / 2).translate(0, Y - 9.9, 0)];
    for (let k = 0; k < 4; k++) floorParts.push(new THREE.BoxGeometry(0.07, 0.04, 1.1).translate(0, Y - 9.9, 3.85).rotateY((k * Math.PI) / 2));
    // the four hangers of the gimbal frame (island truss, alu) get carbon sleeves where they cross the
    // well (bare alu beams read as grey planks against the black bowl)
    const sleeves: THREE.BufferGeometry[] = [];
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2;
      const g = new THREE.BoxGeometry(1.7, 0.62, 0.62).translate(7.55, KEEL.coreY, 0);
      g.applyMatrix4(new THREE.Matrix4().makeRotationY(-a));
      sleeves.push(g);
    }
    const sleeveMesh = new THREE.Mesh(mergeGeometries(sleeves.map((g) => (g.index ? g.toNonIndexed() : g)))!, carbon);
    const floorLines = new THREE.Mesh(mergeGeometries(floorParts.map((g) => (g.index ? g.toNonIndexed() : g)))!, teal);
    group.add(lip, floorLines, sleeveMesh);
    disposables.push(lip.geometry, floorLines.geometry, sleeveMesh.geometry);
  }

  // ── Leitstand (F1) ────────────────────────────────────────────────────────
  const leitstandCanvas = canvas(768, 288);
  const lsScreen = screenMat(leitstandCanvas, 0.9);
  disposables.push(lsScreen.mat, lsScreen.tex);
  const leit = new THREE.Group();
  leit.position.copy(at(BEARINGS.f1, 10.25));
  leit.rotation.y = rotOp(BEARINGS.f1);
  group.add(leit);
  {
    // a low console (top ≈ 0.8 m) so the operator looks over it at the core: hull body, carbon desk,
    // alu trim along the front edge, an alu lamp post with an arm reaching over the desk
    kit(leit, [
      [hull, [rbox(1.7, 0.6, 0.5, 0.05).translate(0, 0.3, -0.05)]],
      [carbon, [rbox(1.76, 0.05, 0.64, 0.02).rotateX(-0.42).translate(0, 0.68, 0.02)]],
      [
        alu,
        [
          box(1.78, 0.025, 0.03).translate(0, 0.585, 0.3),
          box(1.72, 0.03, 0.03).translate(0, 0.03, 0.21),
          box(0.08, 2.6, 0.08).translate(-1.1, 1.3, -0.3),
          box(0.9, 0.06, 0.06).translate(-0.7, 2.57, -0.3),
          rbox(0.5, 0.1, 0.32, 0.03).translate(-0.3, 2.52, -0.22),
          ...[-1, 1].map((s) => cyl(0.035, 0.035, 0.24, 10).translate(s * 0.8, 0.82, 0.18)),
        ],
      ],
    ]);
    const knobs = new THREE.Mesh(mergeGeometries([-1, 1].map((s) => new THREE.SphereGeometry(0.055, 12, 8).translate(s * 0.8, 0.96, 0.18)))!, M.tealPaint);
    leit.add(knobs);
    disposables.push(knobs.geometry);
    // screen on the slanted top
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(1.36, 0.51), lsScreen.mat);
    scr.position.set(0, 0.712, 0.035);
    scr.rotation.x = -(Math.PI / 2 - 0.42);
    leit.add(scr);
    disposables.push(scr.geometry);
    // status display behind the operator, facing the core (Phase 5): the same live canvas, big enough
    // to read across the ring, so the Leitstand is a focal point from the lift and the lectern
    {
      const W = 2.2,
        H = (W * 288) / 768,
        cy = 1.92,
        z = 2.55;
      kit(leit, [
        [carbon, [rbox(W + 0.14, H + 0.14, 0.08, 0.03).translate(0, cy, z + 0.05)]],
        [alu, [...[-1, 1].map((s) => box(0.07, cy - H / 2, 0.07).translate(s * (W / 2 - 0.25), (cy - H / 2) / 2, z + 0.08)), box(W + 0.18, 0.03, 0.12).translate(0, cy - H / 2 - 0.085, z + 0.02)]],
      ]);
      const big = new THREE.Mesh(new THREE.PlaneGeometry(W, H).rotateY(Math.PI), lsScreen.mat);
      big.position.set(0, cy, z);
      leit.add(big);
      disposables.push(big.geometry);
    }
    // lamp hood underside (warm, below the bloom threshold)
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.28).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xd9bb93 }));
    glow.position.set(-0.3, 2.465, -0.22);
    leit.add(glow);
    disposables.push(glow.geometry, glow.material as THREE.Material);
  }
  leit.updateMatrixWorld(true);
  ctx.lights.point(leit.localToWorld(new THREE.Vector3(-0.2, 2.25, 0.2)), { color: 0xffd6a3, intensity: 24, distance: 10 });

  // ── crates: six loose crates in a PRIVATE Rapier world (GDD §6.6, friction 0.05) ──────────
  // Its gravity is tilted with the island in F1 (×4 for readability), so they slide. The shared
  // world only holds kinematic proxies (the player bumps into them; a player capsule in the
  // private world pushes them back). Flat cuboid floor: boxes snag on the catwalk trimesh.
  const R = ctx.physics.rapier;
  const pw = ctx.physics.createPrivateWorld({ gravity: { x: 0, y: -9.81, z: 0 } });
  const pwFixed = pw.createRigidBody(R.RigidBodyDesc.fixed());
  const pwBox = (size: [number, number, number], pos: THREE.Vector3, yaw: number, friction = 0.6): void => {
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    pw.createCollider(R.ColliderDesc.cuboid(size[0] / 2, size[1] / 2, size[2] / 2).setTranslation(pos.x, pos.y, pos.z).setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }).setFriction(friction), pwFixed);
  };
  {
    // floor: 12 overlapping 30° slabs, top at the grating; rails: 36 wall segments each side
    for (let k = 0; k < 12; k++) {
      const b = k * 30 + 15;
      pwBox([7.2, 0.4, 4.4], at(b, 11, -0.2), -b * DEG, 0.05);
    }
    for (let k = 0; k < 36; k++) {
      const b = k * 10 + 5;
      for (const r of [KEEL.catwalkInner - 0.1, KEEL.catwalkOuter + 0.1]) pwBox([(2 * Math.PI * r) / 36 + 0.2, 1.4, 0.2], at(b, r, 0.7), -b * DEG);
    }
  }
  const crates: KinematicHandle[] = [];
  const crateMeshes: THREE.Object3D[] = [];
  const crateBodies: RAPIER.RigidBody[] = [];
  {
    const crateGeo = new THREE.BoxGeometry(0.55, 0.55, 0.55);
    disposables.push(crateGeo);
    // beside the console near the inner rail, where the operator sees them slide
    const spots: [number, number, number][] = [
      [-2.4, 0.276, -0.85],
      [-3.0, 0.276, -0.72],
      [-2.68, 0.828, -0.8],
      [2.4, 0.276, -0.85],
      [2.98, 0.276, -0.7],
      [2.55, 0.276, -0.2],
    ];
    leit.updateMatrixWorld(true);
    const q = new THREE.Quaternion();
    for (const [x, y, z] of spots) {
      const mesh = new THREE.Mesh(crateGeo, M.crate);
      mesh.position.copy(leit.localToWorld(new THREE.Vector3(x, y, z)));
      mesh.rotation.y = leit.rotation.y + (Math.random() - 0.5) * 0.3;
      mesh.castShadow = true;
      group.add(mesh);
      q.setFromEuler(mesh.rotation);
      const body = pw.createRigidBody(
        R.RigidBodyDesc.dynamic()
          .setTranslation(mesh.position.x, mesh.position.y, mesh.position.z)
          .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w })
          .setLinearDamping(0.08)
          .setAngularDamping(0.4),
      );
      pw.createCollider(R.ColliderDesc.cuboid(0.275, 0.275, 0.275).setMass(18).setFriction(0.05).setRestitution(0.05), body);
      crateBodies.push(body);
      crates.push(ctx.physics.addKinematic(mesh, { shape: 'box' }));
      crateMeshes.push(mesh);
    }
  }
  // the player as a kinematic capsule in the private world (pushes the crates)
  const pwPlayer = pw.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(0, -100, 0));
  pw.createCollider(R.ColliderDesc.capsule(0.5, 0.35), pwPlayer);

  // ── Messwand (F2 big screen) and the vendor kiosk ──────────────────────────
  const messwandCanvas = canvas(1280, 720);
  const mwScreen = screenMat(messwandCanvas, 0.88);
  // W8: the wall keeps its mip chain. Without it (tried: the plan's suggestion) its 1–2 px strokes
  // broke up when seen from the lift or the catwalk; the upload queue above keeps the frames light.
  disposables.push(mwScreen.mat, mwScreen.tex);
  const wall = new THREE.Group();
  wall.position.copy(at(BEARINGS.f2Screen, 13.25));
  wall.rotation.y = rotWall(BEARINGS.f2Screen);
  group.add(wall);
  {
    const W = 6.4,
      H = 3.6,
      cy = 1.2 + H / 2;
    // a board in an alu frame with a dark-glass back, on two alu legs with hull feet
    const t = 0.07;
    kit(wall, [
      [glass, [box(W + 0.16, H + 0.16, 0.1).translate(0, cy, -0.1)]],
      [
        alu,
        [
          box(W + 0.3, t, 0.18).translate(0, cy + H / 2 + 0.08, -0.06),
          box(W + 0.3, t, 0.18).translate(0, cy - H / 2 - 0.08, -0.06),
          box(t, H + 0.3, 0.18).translate(-W / 2 - 0.12, cy, -0.06),
          box(t, H + 0.3, 0.18).translate(W / 2 + 0.12, cy, -0.06),
          ...[-1, 1].flatMap((s) => [box(0.12, 1.3, 0.12).translate(s * (W / 2 - 0.4), 0.65, 0.36), box(0.12, 0.12, 0.55).translate(s * (W / 2 - 0.4), 1.25, 0.12)]),
        ],
      ],
      [hull, [-1, 1].map((s) => rbox(0.5, 0.08, 0.6, 0.03).translate(s * (W / 2 - 0.4), 0.04, 0.36))],
    ]);
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(W, H), mwScreen.mat);
    scr.position.set(0, cy, 0.0);
    wall.add(scr);
    disposables.push(scr.geometry);
  }
  ctx.lights.point(at(BEARINGS.f2Screen, 11.6, 2.6), { color: 0xd9ebe6, intensity: 20, distance: 12 });

  const vendorCanvas = canvas(384, 576);
  const vdScreen = screenMat(vendorCanvas, 0.95);
  disposables.push(vdScreen.mat, vdScreen.tex);
  const vendor = new THREE.Group();
  vendor.position.copy(at(BEARINGS.f2Vendor, 12.2));
  vendor.rotation.y = rotWall(BEARINGS.f2Vendor) + 0.35;
  group.add(vendor);
  {
    // the vendor's kiosk stays glossy white (Hersteller X's showroom look), rounded like the kit
    kit(vendor, [[glossy, [rbox(0.74, 0.95, 0.42, 0.06).translate(0, 0.475, 0), rbox(0.74, 1.04, 0.06, 0.025).rotateX(-0.1).translate(0, 1.5, -0.02)]]]);
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.64, 0.96), vdScreen.mat);
    scr.position.set(0, 1.5, 0.015);
    scr.rotation.x = -0.1;
    vendor.add(scr);
    disposables.push(scr.geometry);
  }

  // ── Lectern (F3) ──────────────────────────────────────────────────────────
  const lecternCanvas = canvas(640, 400);
  const lcScreen = screenMat(lecternCanvas, 0.86);
  disposables.push(lcScreen.mat, lcScreen.tex);
  const lect = new THREE.Group();
  lect.position.copy(at(BEARINGS.f3, 10.9));
  lect.rotation.y = rotOp(BEARINGS.f3);
  group.add(lect);
  {
    kit(lect, [
      [hull, [rbox(0.36, 1.0, 0.36, 0.05).translate(0, 0.5, -0.05)]],
      [carbon, [rbox(0.9, 0.05, 0.62, 0.02).rotateX(0.34).translate(0, 1.12, 0.02)]],
      [alu, [rbox(0.62, 0.04, 0.5, 0.015).translate(0, 1.0, 0), box(0.4, 0.03, 0.4).translate(0, 0.015, -0.05)]],
    ]);
    const paper = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.5), lcScreen.mat);
    paper.position.set(0, 1.152, 0.03);
    paper.rotation.x = -Math.PI / 2 + 0.34;
    lect.add(paper);
    disposables.push(paper.geometry);
  }

  // ── lesson posts M1–M6 (atlas 3 × 2 tiles of 512²) ─────────────────────────
  const atlas = canvas(1536, 1024);
  const atScreen = screenMat(atlas, 0.82);
  disposables.push(atScreen.mat, atScreen.tex);
  const postObjs: THREE.Object3D[] = [];
  const glowColors: THREE.BufferAttribute[] = [];
  {
    const bodies: THREE.BufferGeometry[] = [];
    const faces: THREE.BufferGeometry[] = [];
    const glows: THREE.BufferGeometry[] = [];
    LESSONS.forEach((l, i) => {
      const b = LESSON_BEARINGS[l.zone] ?? i * 60;
      const g = new THREE.Group();
      g.position.copy(at(b, 12.55));
      g.rotation.y = rotWall(b);
      group.add(g);
      g.updateMatrixWorld(true);
      postObjs.push(g);
      const mtx = g.matrixWorld;
      const tilt = new THREE.Matrix4().makeRotationX(-0.16);
      const panelM = new THREE.Matrix4().makeTranslation(0, 1.42, 0).multiply(tilt);
      bodies.push(new THREE.BoxGeometry(0.09, 0.95, 0.09).translate(0, 0.475, -0.04).applyMatrix4(mtx));
      bodies.push(new THREE.BoxGeometry(1.08, 1.08, 0.05).translate(0, 0, -0.035).applyMatrix4(panelM).applyMatrix4(mtx));
      const face = new THREE.PlaneGeometry(1, 1);
      const col = i % 3,
        row = Math.floor(i / 3);
      const uv = face.getAttribute('uv');
      for (let k = 0; k < uv.count; k++) uv.setXY(k, (col + uv.getX(k)) / 3, 1 - (row + 1 - uv.getY(k)) / 2);
      faces.push(face.translate(0, 0, 0.0).applyMatrix4(panelM).applyMatrix4(mtx));
      const glow = new THREE.BoxGeometry(1.08, 0.035, 0.07).translate(0, 0.56, -0.01).applyMatrix4(panelM).applyMatrix4(mtx);
      glows.push(glow);
    });
    // board frames and posts in alu (the faces are the dark atlas screens)
    const bm = new THREE.Mesh(mergeGeometries(bodies.map((g) => (g.index ? g.toNonIndexed() : g)))!, alu);
    group.add(bm);
    const fm = new THREE.Mesh(mergeGeometries(faces)!, atScreen.mat);
    group.add(fm);
    // glow strips: one mesh with per-post vertex colours (teal = zone measured)
    for (const gg of glows) {
      const n = gg.getAttribute('position').count;
      gg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    }
    const merged = mergeGeometries(glows)!;
    const gm = new THREE.Mesh(merged, new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }));
    group.add(gm);
    glowColors.push(merged.getAttribute('color') as THREE.BufferAttribute);
    disposables.push(bm.geometry, fm.geometry, merged, gm.material as THREE.Material);
  }
  const glowVertsPerPost = glowColors[0].count / LESSONS.length;

  // ── plaque at the lift landing (wayfinding + FIKTION line) ─────────────────
  const plaqueCanvas = canvas(768, 320);
  const plScreen = screenMat(plaqueCanvas, 0.85);
  disposables.push(plScreen.mat, plScreen.tex);
  const plaque = new THREE.Group();
  plaque.position.copy(at(BEARINGS.plaque, 12.7));
  plaque.rotation.y = rotWall(BEARINGS.plaque) - 0.55; // faces the walkway, turned toward the lift
  group.add(plaque);
  {
    const back = new THREE.Mesh(mergeGeometries([new THREE.BoxGeometry(1.56, 0.68, 0.05).translate(0, 1.5, -0.03), new THREE.BoxGeometry(0.08, 1.2, 0.08).translate(0, 0.6, -0.06)])!, alu);
    plaque.add(back);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.625), plScreen.mat);
    face.position.set(0, 1.5, 0.0);
    plaque.add(face);
    disposables.push(back.geometry, face.geometry);
  }

  // ── call panel on the shaft column (if the car is elsewhere) ──────────────
  const callPanel = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.4, 0.28), M.standard({ color: 0x1c1917, roughness: 0.4, metalness: 0.6 }));
  callPanel.position.set(TOWER.lift.x + 1.7, Y + 1.25, TOWER.lift.z + 1.25);
  group.add(callPanel);
  {
    const b = new THREE.Mesh(new THREE.CircleGeometry(0.07, 20), M.standard({ color: 0x2dd4bf, emissive: 0x2dd4bf, emissiveIntensity: 0.9 }));
    b.rotation.y = Math.PI / 2;
    b.position.set(0.032, 0, 0);
    callPanel.add(b);
    disposables.push(b.geometry, b.material as THREE.Material, callPanel.material as THREE.Material);
  }

  // ── Regelkern accents: IMU halo, horizon ring, gimbal uplights ─────────────
  const halo = (() => {
    const c = canvas(256, 256);
    const g = c.getContext('2d')!;
    const gr = g.createRadialGradient(128, 128, 20, 128, 128, 128);
    gr.addColorStop(0, 'rgba(255,240,220,0.55)');
    gr.addColorStop(0.35, 'rgba(255,214,170,0.22)');
    gr.addColorStop(0.7, 'rgba(45,212,191,0.06)');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 256, 256);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.SpriteMaterial({ map: tex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.85 });
    const s = new THREE.Sprite(mat);
    s.scale.setScalar(9);
    s.position.set(0, KEEL.coreY, 0);
    s.renderOrder = 3;
    disposables.push(tex, mat);
    return s;
  })();
  group.add(halo);

  const horizon = new THREE.Mesh(new THREE.TorusGeometry(2.4, 0.03, 6, 120), new THREE.MeshBasicMaterial({ color: new THREE.Color(0x2dd4bf).multiplyScalar(1.6), toneMapped: false }));
  horizon.rotation.x = Math.PI / 2;
  const horizonPivot = new THREE.Group();
  horizonPivot.position.set(0, KEEL.coreY, 0);
  horizonPivot.add(horizon);
  // four tick marks on the ring
  {
    const ticks = mergeGeometries([0, 1, 2, 3].map((k) => new THREE.BoxGeometry(0.05, 0.05, 0.35).translate(0, 0, 2.4).rotateY((k * Math.PI) / 2)))!;
    const tm = new THREE.Mesh(ticks, horizon.material as THREE.Material);
    horizonPivot.add(tm);
    disposables.push(ticks);
  }
  group.add(horizonPivot);
  disposables.push(horizon.geometry, horizon.material as THREE.Material);

  {
    const n = 8;
    const puck = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.14, 0.17, 0.12, 14), new THREE.MeshBasicMaterial({ color: 0xffe3bd, toneMapped: false }), n);
    // soft light shafts (Phase 5): brightest where the view looks through the beam's core and at the
    // puck, fading along the beam and toward its silhouette — no flat planks against the dark well
    const coneGeo = new THREE.CylinderGeometry(0.7, 0.1, 3.4, 24, 1, true).translate(0, 1.7, 0);
    const beamMat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(0xffd9b0).multiplyScalar(0.5) } },
      vertexShader: /* glsl */ `
        varying vec3 vN; varying vec3 vV; varying float vAlong;
        void main() {
          vAlong = uv.y;
          vec4 p = instanceMatrix * vec4(position, 1.0);
          vec4 mv = modelViewMatrix * p;
          vN = normalize(normalMatrix * mat3(instanceMatrix) * normal);
          vV = -mv.xyz;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor; varying vec3 vN; varying vec3 vV; varying float vAlong;
        void main() {
          // clamp before pow: pow(x < 0) is NaN in GLSL (black dots after the sanitize pass)
          float facing = clamp(abs(dot(vN, vV)) / max(length(vN) * length(vV), 1e-5), 0.0, 1.0);
          float along = clamp(vAlong, 0.0, 1.0);
          float a = pow(facing, 2.5) * pow(1.0 - along, 1.8) * smoothstep(0.0, 0.06, along);
          gl_FragColor = vec4(uColor * a, 1.0);
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    const cone = new THREE.InstancedMesh(coneGeo, beamMat, n);
    const m4 = new THREE.Matrix4(),
      q = new THREE.Quaternion(),
      e = new THREE.Euler();
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + Math.PI / 8;
      const p = new THREE.Vector3(Math.cos(a) * 6.4, KEEL.coreY + 0.3, Math.sin(a) * 6.4);
      m4.compose(p, q.identity(), new THREE.Vector3(1, 1, 1));
      puck.setMatrixAt(k, m4);
      // lean inward toward the gimbals
      e.set(0, 0, 0);
      q.setFromAxisAngle(new THREE.Vector3(-Math.sin(a), 0, Math.cos(a)), 0.42);
      m4.compose(p, q, new THREE.Vector3(1, 1, 1));
      cone.setMatrixAt(k, m4);
    }
    cone.renderOrder = 3;
    puck.computeBoundingSphere();
    cone.computeBoundingSphere();
    group.add(puck, cone);
    disposables.push(puck.geometry, puck.material as THREE.Material, coneGeo, beamMat);
  }

  // ── colliders for the furniture (boxes in each object's frame) ─────────────
  const solid = (obj: THREE.Object3D, size: [number, number, number], local: [number, number, number]): void => {
    obj.updateMatrixWorld(true);
    const p = obj.localToWorld(new THREE.Vector3(...local));
    ctx.physics.addStaticBox({ size, position: [p.x, p.y, p.z], rotation: [0, obj.rotation.y, 0], surface: 'metal' });
    pwBox(size, p, obj.rotation.y); // the crates bump into the furniture too
  };
  // the lift car's footprint at the keel landing
  pwBox([3.1, 1.4, 3.1], new THREE.Vector3(TOWER.lift.x, Y + 0.7, TOWER.lift.z), 0);
  solid(leit, [1.8, 0.9, 0.62], [0, 0.45, -0.02]);
  solid(leit, [2.3, 2.4, 0.16], [0, 1.2, 2.62]); // the status display behind the operator
  solid(vendor, [0.76, 1.95, 0.46], [0, 0.975, 0]);
  solid(lect, [0.7, 1.15, 0.5], [0, 0.575, 0]);
  solid(wall, [6.4, 1.3, 0.25], [0, 0.65, 0.36]);
  solid(plaque, [1.56, 1.8, 0.1], [0, 0.9, -0.03]);
  for (const p of postObjs) solid(p, [1.0, 2.0, 0.22], [0, 1.0, -0.04]);

  // ── canvases: static ones drawn here ──────────────────────────────────────
  const lang = (): Lang => ctx.lang;
  const drawVendor = (): void => {
    const g = vendorCanvas.getContext('2d')!;
    const W = vendorCanvas.width,
      H = vendorCanvas.height;
    const L = lang();
    const gr = g.createLinearGradient(0, 0, 0, H);
    gr.addColorStop(0, '#2B2725');
    gr.addColorStop(1, '#141312');
    g.fillStyle = gr;
    g.fillRect(0, 0, W, H);
    // glossy sheen
    const sh = g.createLinearGradient(0, 0, W, H * 0.6);
    sh.addColorStop(0, 'rgba(255,255,255,0.10)');
    sh.addColorStop(0.5, 'rgba(255,255,255,0.0)');
    g.fillStyle = sh;
    g.fillRect(0, 0, W, H);
    g.fillStyle = C.text;
    g.font = F.display(26);
    g.fillText('HERSTELLER X', 30, 56);
    g.fillStyle = C.text2;
    g.font = F.mono(17);
    g.fillText(S.vendorName, 30, 92);
    g.fillStyle = C.text;
    g.font = F.display(140);
    g.fillText('99 %', 22, 262);
    g.font = F.display(46, 500);
    g.fillText(ctx.i18n.resolve(S.vendorClaim).replace(/^99 %\s*/, ''), 30, 320);
    g.fillStyle = C.text2;
    g.font = F.sans(19);
    let y = 384;
    for (const line of S.vendorSheet.slice(0, 2)) y = wrap(g, ctx.i18n.resolve(line), 30, y, W - 60, 25) + 8;
    g.fillStyle = C.text3;
    g.font = F.mono(14);
    wrap(g, ctx.i18n.resolve(S.vendorFoot), 30, H - 64, W - 60, 18);
    chip(g, L === 'de' ? 'FIKTION' : 'FICTION', 30, H - 30, 14, 'fiktion');
    markTex(vdScreen.tex);
  };
  const drawPlaque = (): void => {
    const g = plaqueCanvas.getContext('2d')!;
    const W = plaqueCanvas.width,
      H = plaqueCanvas.height;
    const L = lang();
    g.fillStyle = C.bg;
    g.fillRect(0, 0, W, H);
    hairline(g, 0, 0, W, 4);
    g.fillStyle = C.orange;
    g.font = F.mono(20);
    g.fillText(L === 'de' ? '// KIELRAUM · −36 m' : '// KEEL ROOM · −36 m', 32, 52);
    g.fillStyle = C.text;
    g.font = F.display(46);
    g.fillText(L === 'de' ? 'Regelkern · −40 m' : 'Control core · −40 m', 32, 112);
    g.fillStyle = C.text2;
    g.font = F.sans(22);
    const rows = L === 'de' ? ['F1 Leitstand →', 'F2 Prüfstand ↓', 'F3 Pult ←'] : ['F1 Control desk →', 'F2 Test stand ↓', 'F3 Lectern ←'];
    g.fillText(rows.join('     '), 32, 168);
    g.fillStyle = C.text3;
    g.font = F.mono(17);
    g.fillText(ctx.i18n.resolve({ de: 'IMU · 1000 Hz · SCHUB M1–M6', en: 'IMU · 1000 Hz · THRUST M1–M6' }), 32, 222);
    chip(g, L === 'de' ? 'FIKTION' : 'FICTION', 32, 272, 16, 'fiktion');
    g.fillStyle = C.text3;
    g.font = F.sans(19);
    g.fillText(L === 'de' ? 'Der Regelkreis dahinter ist echt.' : 'The control loop behind it is real.', 150, 279);
    markTex(plScreen.tex);
  };

  // W8: the posts, the vendor kiosk and the plaque only change with the pass, the language, the
  // mode or the fonts; redrawing them unchanged (every F2/F3 step did) re-uploaded the 6 MB atlas
  let postsKey = '';
  const refreshPosts = (view: PassView): void => {
    const fonts = (document as Document & { fonts?: FontFaceSet }).fonts?.status ?? 'loaded';
    const key = [ctx.i18n.lang, ctx.mode, fonts, ...LESSONS.map((l) => `${zoneValue(view, l.zone)?.value ?? ''}:${view.stamps.some((st) => st.zone === l.zone && st.earned)}`)].join('|');
    if (key === postsKey) return;
    postsKey = key;
    const g = atlas.getContext('2d')!;
    LESSONS.forEach((l, i) => {
      const x = (i % 3) * 512,
        y = Math.floor(i / 3) * 512;
      const v = zoneValue(view, l.zone);
      const measured = view.stamps.some((s) => s.zone === l.zone && s.earned);
      g.save();
      g.beginPath();
      g.rect(x, y, 512, 512);
      g.clip();
      g.fillStyle = '#181716';
      g.fillRect(x, y, 512, 512);
      hairline(g, x, y, 512, 5);
      g.fillStyle = C.orange;
      g.font = F.mono(24);
      g.fillText(ctx.i18n.resolve(l.eyebrow), x + 34, y + 58);
      const plot = ZONE_PLOTS.find((z) => z.id === l.zone);
      if (plot) drawGlyph(g, plot.glyph, x + 512 - 62, y + 50, 22, measured ? C.teal : C.text3, 3);
      g.fillStyle = C.text;
      g.font = F.display(40);
      let yy = wrap(g, ctx.i18n.resolve(l.title), x + 34, y + 124, 450, 46, 2);
      g.fillStyle = C.stone300;
      g.font = F.sans(27);
      yy = wrap(g, ctx.i18n.resolve(l.face), x + 34, yy + 14, 446, 36, 4);
      g.fillStyle = C.border;
      g.fillRect(x + 34, y + 372, 444, 2);
      g.fillStyle = C.text3;
      g.font = F.mono(19);
      g.fillText(ctx.i18n.resolve(LESSON_STR.yours).toUpperCase(), x + 34, y + 410);
      g.font = F.mono(27, 500);
      g.fillStyle = v ? C.teal : C.text3;
      wrap(g, v ? v.value : ctx.i18n.resolve(LESSON_STR.none), x + 34, y + 452, 446, 32, 2);
      g.restore();
      // glow strip colour
      const col = new THREE.Color(measured ? 0x2dd4bf : 0x57534e).multiplyScalar(measured ? 1.35 : 0.7);
      const attr = glowColors[0];
      for (let k = 0; k < glowVertsPerPost; k++) attr.setXYZ(i * glowVertsPerPost + k, col.r, col.g, col.b);
      attr.needsUpdate = true;
    });
    markTex(atScreen.tex);
    drawVendor();
    drawPlaque();
  };

  // ── stand points and camera poses ─────────────────────────────────────────
  leit.updateMatrixWorld(true);
  wall.updateMatrixWorld(true);
  const f1Pos = leit.localToWorld(new THREE.Vector3(0, 1.78, 1.85));
  const f1Look = new THREE.Vector3(0, KEEL.coreY + 1.7, 0);
  // the run camera hovers just inside the ring so the whole wall fits left of the operate panel
  const f2Pos = at(BEARINGS.f2Screen, 7.4, 1.95);
  const f2Look = wall.localToWorld(new THREE.Vector3(1.6, 2.85, 0));
  // „Ein Jahr später" on the wall: centred, the screen fills ≈ 3/4 of the view at FOV 60
  const yearLook = wall.localToWorld(new THREE.Vector3(0, 3.0, 0));
  const yearPos = at(BEARINGS.f2Screen, 13.25 - 4.6, 3.0);

  const crateSpawn = crateBodies.map((b) => {
    const t = b.translation();
    return { x: t.x, y: t.y, z: t.z };
  });
  // C11b: the room stands still apart from the crates (kinematic poses) and the horizon ring (follows the
  // tilt): bake every other matrix once instead of recomputing ~50 of them each frame
  {
    const moving = new Set<THREE.Object3D>([horizonPivot, ...crateMeshes]);
    group.matrixAutoUpdate = false;
    group.updateMatrix();
    for (const c of group.children) if (!moving.has(c)) ctx.freezeStatic(c);
    group.updateMatrixWorld(true);
  }
  let visible = true;
  return {
    group,
    leitstand: leit,
    vendor,
    messwand: wall,
    lectern: lect,
    plaque,
    callPanel,
    posts: postObjs,
    crates,
    setCrateGravity(g) {
      pw.gravity = g ? { x: g[0], y: g[1], z: g[2] } : { x: 0, y: -9.81, z: 0 };
      if (g) for (const b of crateBodies) b.wakeUp();
    },
    spots: { f1: at(BEARINGS.f1, 11.5), f2: at(BEARINGS.f2Vendor + 4, 11.0), f3: at(BEARINGS.f3, 12.0), arrive: new THREE.Vector3(TOWER.lift.x, Y, TOWER.lift.z) },
    poses: { f1: { position: f1Pos, lookAt: f1Look }, f2: { position: f2Pos, lookAt: f2Look }, year: { position: yearPos, lookAt: yearLook } },
    emiSpots: { f1: at(BEARINGS.f1 - 13, 12.0), f2: at(BEARINGS.f2Vendor - 10, 11.0), f3: at(BEARINGS.f3 + 10, 11.2), lift: at(10, 11.3) },
    leitstandCanvas,
    messwandCanvas,
    lecternCanvas,
    markLeitstand: () => markTex(lsScreen.tex),
    markMesswand: () => markTex(mwScreen.tex),
    markLectern: () => markTex(lcScreen.tex),
    flushUploads() {
      if (!dirty.size || !visible) return;
      let bytes = 0;
      for (const tex of dirty) {
        const img = tex.image as HTMLCanvasElement;
        const b = img.width * img.height * 4;
        if (bytes > 0 && bytes + b > UPLOAD_BUDGET) break;
        tex.needsUpdate = true;
        bytes += b;
        dirty.delete(tex);
      }
    },
    refreshPosts,
    setVisible(v) {
      if (v === visible) return;
      visible = v;
      group.visible = v;
    },
    update(dt, t, tilt) {
      // crates: private world → kinematic proxies (and meshes); player → private capsule
      const pp = ctx.player.position;
      pwPlayer.setNextKinematicTranslation({ x: pp.x, y: pp.y + 0.85, z: pp.z });
      for (let i = 0; i < crateBodies.length; i++) {
        const b = crateBodies[i];
        if (b.isSleeping()) continue;
        const tr = b.translation(),
          ro = b.rotation();
        // fell through a gap? back to the spawn spot
        if (tr.y < Y - 3) {
          b.setTranslation(crateSpawn[i], true);
          b.setLinvel({ x: 0, y: 0, z: 0 }, true);
          continue;
        }
        _q.set(ro.x, ro.y, ro.z, ro.w);
        crates[i].setPose([tr.x, tr.y, tr.z], _q);
      }
      // the horizon ring stays level with the true horizon (×4 for readability, like the crates)
      horizonPivot.rotation.set(-tilt.pitch * 4 * DEG, 0, -tilt.roll * 4 * DEG);
      halo.material.opacity = 0.78 + Math.sin(t * 1.3) * 0.05;
      void dt;
    },
  };
}
