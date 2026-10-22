/**
 * Station 7's line (GDD §7.5 Line + Cells): furnace mouth → conveyor along z = −8 → camera arch
 * (Etikett prüfen, x = −6) → 6-axis arm on a track (Kiste greifen, Palettieren onto P1 at (9, −8))
 * → AMR shuttle (Anfahren) → Umreifen (12, −11) → Verladebucht deck lift; service point (Störung
 * beheben) at (0, −10). Crates are kinematic (no dynamics): one InstancedMesh, rebuilt per frame.
 *
 * Day ('day'): crates queue at the conveyor end for the player (Station A), the arm is parked.
 * Night ('night'): the cell runs on its own at a time-lapse speed; frozen while `running` is false.
 */
import * as THREE from 'three';
import type { ZoneContext } from '@/core/zones';
import { buildArm, ARM, type ArmRig } from './arm';
import { FLOOR_Y, LIFT, type Hall } from './hall';
import { atlasUV, box, boxMM, canvasTex, capsule, coneTex, cyl, easeInOut, merge, mesh, plane, radialTex, sphere, type CanvasTex } from './geo';
import { look } from './look';

export const CRATE = { w: 0.6, h: 0.3, d: 0.4 } as const;
export const BELT = { x0: -11.2, x1: 4.0, z: -8, top: 0.9 } as const;
export const END_X = BELT.x1 - CRATE.w / 2 - 0.04; // front crate centre at the end stop
export const HANDPALETTE = { x: 10, z: -3 } as const;
export const P1 = { x: 9, z: -8 } as const;
export const UMREIFEN = { x: 12, z: -11 } as const;
export const SERVICE = { x: 0, z: -10 } as const;
const PALLET_TOP = 0.15;
const QUEUE_MAX = 4;

/** cell anchor per gesture (GESTURES order: anfahren, greifen, etikett, palettieren, umreifen, stoerung) */
export const CELLS: { lamp: [number, number, number]; person: [number, number, number, number]; label: [number, number, number] }[] = [
  { lamp: [10, 3.3, -12.6], person: [8.4, 0, -12.4, 0.6], label: [10, 3.9, -12.9] },
  { lamp: [4.2, 3.6, -10.6], person: [2.4, 0, -11.2, 0.9], label: [3.4, 4.3, -11.0] },
  { lamp: [-6, 3.3, -9.3], person: [-6.2, 0, -9.7, 0], label: [-6, 3.9, -9.4] },
  { lamp: [9, 3.6, -7.4], person: [7.6, 0, -6.6, 2.4], label: [8.2, 4.3, -7.4] },
  { lamp: [12.6, 3.3, -10.7], person: [13.35, 0, -10.35, -1.7], label: [12.8, 3.9, -11.6] },
  { lamp: [0, 3.3, -10.4], person: [-1.0, 0, -9.4, 0.2], label: [0, 3.9, -10.6] },
];
export type LampState = 'day' | 'off' | 'standby' | 'work' | 'alert';

interface Pallet {
  pos: THREE.Vector3;
  yaw: number;
  count: number;
  strapped: boolean;
  visible: boolean;
}

export interface Line {
  mode: 'day' | 'night';
  /** visual time-lapse factor in night mode (1 = real-time-ish, 3 = fast) */
  speed: number;
  /** false = the line stands still (MRC) */
  running: boolean;
  readonly crateMaterial: THREE.Material;
  readonly crateGeometry: THREE.BufferGeometry;
  readonly arm: ArmRig;
  /** crates waiting at the end stop (day) */
  queued(): number;
  /** local position of the front crate if it is at the end stop */
  frontCrate(out: THREE.Vector3): boolean;
  /** remove the front crate (the player lifts it) */
  takeFront(): boolean;
  readonly hand: Pallet;
  /** local centre of Handpalette slot i (0…11) */
  handSlot(i: number, out: THREE.Vector3): THREE.Vector3;
  setLamp(k: number, s: LampState): void;
  setPerson(k: number, on: boolean): void;
  setLabels(levels: number[] | null): void;
  /** night: dim the hanging signs so the lamps carry the image */
  setLabelDim(dim: boolean): void;
  setDayPeople(): void;
  /** prefill the belt (day start) */
  prefill(n: number): void;
  /** clear the belt and pallets (before the night) */
  resetForNight(): void;
  resetForDay(): void;
  /** called when the camera arch scans a crate */
  onScan: (() => void) | null;
  onPalletOut: (() => void) | null;
  /** a crate rolled over ~0.6 m of rollers (clack) */
  onClack: (() => void) | null;
  update(dt: number, t: number): void;
  relabel(): void;
  /** 0 = day … 1 = lights out: LED edges go T0 → T1, the floor glow under the line comes up */
  setNight(level: number): void;
  /**
   * Station A race (FUN-PLAN D1): during your minute the cell arm palletises onto its own pallet P1
   * from its infeed at Station 7's 20 s Takt (FIKTION) → 3 crates in 60 s. Off: the arm parks.
   */
  race(on: boolean): void;
  /** crates the arm placed in the current/last race */
  robotCount(): number;
  /** the arm set a crate down on P1 during a race */
  onRobotCrate: ((n: number, at: THREE.Vector3) => void) | null;
  /**
   * Plan §4.6 A (M5 bereit, by day): the AMR takes the strapped pallet from the Umreifer to the deck lift
   * of the Verladebucht and the lift sinks it into the hold: the cargo for the first flight. `onAboard`
   * runs when it is below the deck. Ignored at night or while the AMR is on a mission.
   */
  shipCargo(onAboard?: () => void): void;
}

export function buildLine(ctx: ZoneContext, hall: Hall, gestureName: (k: number) => string): Line {
  const M = ctx.materials;
  const det = ctx.groups.detail;
  const owned: { dispose(): void }[] = [];
  ctx.onDispose(() => owned.forEach((o) => o.dispose()));

  // ── crate material (stone-600 composite crate with a hazard label) ───────
  const crateTex = canvasTex(256, 128);
  drawCrate(crateTex);
  owned.push(crateTex.tex);
  const crateMaterial = new THREE.MeshStandardMaterial({ map: crateTex.tex, roughness: 0.72, metalness: 0.08, name: 'dunkelfabrik:crate' });
  owned.push(crateMaterial);
  const crateGeometry = new THREE.BoxGeometry(CRATE.w, CRATE.h, CRATE.d);
  owned.push(crateGeometry);
  const MAX = 40;
  const crates = new THREE.InstancedMesh(crateGeometry, crateMaterial, MAX);
  crates.name = 'df:crates';
  crates.frustumCulled = false;
  crates.castShadow = false;
  crates.receiveShadow = true;
  det.add(crates);

  // ── conveyor: frame (merged), instanced rollers, end stop ────────────────
  const conv: THREE.BufferGeometry[] = [];
  const len = BELT.x1 - BELT.x0;
  for (const sz of [BELT.z - 0.52, BELT.z + 0.52]) conv.push(boxMM(BELT.x0, BELT.top - 0.16, sz - 0.04, BELT.x1 + 0.1, BELT.top - 0.02, sz + 0.04));
  for (let x = BELT.x0 + 0.4; x < BELT.x1; x += 1.6) for (const sz of [BELT.z - 0.48, BELT.z + 0.48]) conv.push(box(0.08, BELT.top - 0.16, 0.08, x, (BELT.top - 0.16) / 2, sz));
  conv.push(boxMM(BELT.x1 + 0.02, BELT.top - 0.1, BELT.z - 0.55, BELT.x1 + 0.12, BELT.top + 0.22, BELT.z + 0.55)); // end stop
  conv.push(boxMM(BELT.x0, 0.12, BELT.z - 0.44, BELT.x1, 0.16, BELT.z + 0.44)); // drip tray
  det.add(mesh(merge(conv), M.metalDark, { name: 'df:conveyor' }));
  const rollerGeo = cyl(0.045, 0.045, 0.96, 12, 0, 0, 0, Math.PI / 2, 0, 0);
  owned.push(rollerGeo);
  const nRollers = Math.floor(len / 0.25);
  const rollers = new THREE.InstancedMesh(rollerGeo, M.steel, nRollers);
  rollers.name = 'df:rollers';
  const _m = new THREE.Matrix4();
  const _q = new THREE.Quaternion();
  const _e = new THREE.Euler();
  const _p = new THREE.Vector3();
  const _s = new THREE.Vector3(1, 1, 1);
  const rollerX: number[] = [];
  for (let i = 0; i < nRollers; i++) {
    const x = BELT.x0 + 0.125 + i * 0.25;
    rollerX.push(x);
    rollers.setMatrixAt(i, _m.makeTranslation(x, BELT.top - 0.045, BELT.z));
  }
  rollers.instanceMatrix.needsUpdate = true;
  det.add(rollers);
  ctx.physics.addStaticBox({ size: [len + 0.3, 1.1, 1.12], position: [BELT.x0 + len / 2 + 0.1, 0.55, BELT.z], surface: 'metal' });
  // "Abnahme" lamp on the end stop: orange when a crate waits (active station), teal otherwise
  const ledParts: THREE.BufferGeometry[] = [];
  for (let x = BELT.x0 + 0.4; x < BELT.x1; x += 1.6) ledParts.push(box(0.05, 0.03, 0.02, x, BELT.top - 0.09, BELT.z + 0.57));
  det.add(mesh(merge(ledParts), M.emissiveTeal, { receive: false, name: 'df:belt-leds' }));
  // small status lamp on the end-stop post (orange = a crate is waiting); kept small so its bloom never hides the crate
  const pickLamp = mesh(sphere(0.045, 12, 8, BELT.x1 + 0.07, BELT.top + 0.3, BELT.z + 0.48), M.emissiveTeal, { receive: false, name: 'df:pick-lamp' });
  det.add(pickLamp);
  det.add(mesh(cyl(0.02, 0.02, 0.24, 6, BELT.x1 + 0.07, BELT.top + 0.12, BELT.z + 0.48), M.metalDark, { name: 'df:pick-pole' }));

  // ── night kit: teal LED edges along every conveyor rail, the arm track and the Umreifen portal
  //    (T0 by day, T1 with the lights out) + a soft additive glow on the floor under the line ──
  const LK = look(ctx);
  const ledEdgeMat = LK.light(0x2dd4bf, 0).clone();
  ledEdgeMat.name = 'dunkelfabrik:led-edges';
  owned.push(ledEdgeMat);
  const ledEdges: THREE.BufferGeometry[] = [];
  for (const sz of [BELT.z - 0.565, BELT.z + 0.565]) ledEdges.push(boxMM(BELT.x0, BELT.top - 0.075, sz - 0.006, BELT.x1 + 0.1, BELT.top - 0.05, sz + 0.006));
  for (const sz of [ARM.trackZ - 0.356, ARM.trackZ + 0.356]) ledEdges.push(boxMM(ARM.trackX0 - 0.7, 0.07, sz - 0.006, ARM.trackX1 + 0.7, 0.095, sz + 0.006));
  ledEdges.push(boxMM(UMREIFEN.x - 1.0, 2.06, UMREIFEN.z + 0.86, UMREIFEN.x + 1.0, 2.085, UMREIFEN.z + 0.875));
  ledEdges.push(boxMM(UMREIFEN.x - 1.0, 2.06, UMREIFEN.z - 0.875, UMREIFEN.x + 1.0, 2.085, UMREIFEN.z - 0.86));
  det.add(mesh(merge(ledEdges), ledEdgeMat, { receive: false, name: 'df:led-edges' }));
  const glowStrip = canvasTex(8, 64);
  {
    const gr = glowStrip.g.createLinearGradient(0, 0, 0, 64);
    gr.addColorStop(0, 'rgba(255,255,255,0)');
    gr.addColorStop(0.5, 'rgba(255,255,255,1)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    glowStrip.g.fillStyle = gr;
    glowStrip.g.fillRect(0, 0, 8, 64);
    glowStrip.tex.colorSpace = THREE.NoColorSpace;
    glowStrip.tex.needsUpdate = true;
  }
  owned.push(glowStrip.tex);
  const floorGlowMat = new THREE.MeshBasicMaterial({ map: glowStrip.tex, color: 0x2dd4bf, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -12, polygonOffsetUnits: -24, name: 'dunkelfabrik:line-floorglow' });
  owned.push(floorGlowMat);
  const floorGlow = mesh(
    merge([plane(BELT.x1 - BELT.x0 + 1.2, 3.2, (BELT.x0 + BELT.x1) / 2, FLOOR_Y + 0.007, BELT.z, -Math.PI / 2), plane(ARM.trackX1 - ARM.trackX0 + 2.4, 2.4, (ARM.trackX0 + ARM.trackX1) / 2, FLOOR_Y + 0.007, ARM.trackZ, -Math.PI / 2)]),
    floorGlowMat,
    { receive: false, name: 'df:line-floorglow' },
  );
  floorGlow.visible = false;
  det.add(floorGlow);

  // ── camera arch (Etikett prüfen) with teal IR beams ──────────────────────
  const archX = -6;
  det.add(
    mesh(
      merge([
        boxMM(archX - 0.08, 0, BELT.z - 0.78, archX + 0.08, 2.3, BELT.z - 0.62),
        boxMM(archX - 0.08, 0, BELT.z + 0.62, archX + 0.08, 2.3, BELT.z + 0.78),
        boxMM(archX - 0.14, 2.18, BELT.z - 0.8, archX + 0.14, 2.42, BELT.z + 0.8),
        box(0.22, 0.22, 0.34, archX, 2.02, BELT.z, 0, 0, 0),
        cyl(0.07, 0.07, 0.1, 12, archX, 1.87, BELT.z),
      ]),
      M.panelElevated,
      { name: 'df:arch' },
    ),
  );
  const beamMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x2dd4bf).multiplyScalar(1.6), transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  beamMat.forceSinglePass = true; // Z1: additive, so the face order does not matter: one pass
  owned.push(beamMat);
  const beamParts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 7; i++) beamParts.push(boxMM(archX - 0.006, BELT.top + 0.02, BELT.z - 0.6 + i * 0.2 - 0.006, archX + 0.006, 2.16, BELT.z - 0.6 + i * 0.2 + 0.006));
  const beams = mesh(merge(beamParts), beamMat, { receive: false, name: 'df:ir-beams' });
  det.add(beams);
  let scanGlow = 0;

  // ── the arm on its track ─────────────────────────────────────────────────
  det.add(
    mesh(
      merge([boxMM(ARM.trackX0 - 0.7, 0, ARM.trackZ - 0.35, ARM.trackX1 + 0.7, 0.1, ARM.trackZ + 0.35), boxMM(ARM.trackX0 - 0.7, 0.1, ARM.trackZ - 0.28, ARM.trackX1 + 0.7, 0.14, ARM.trackZ - 0.2), boxMM(ARM.trackX0 - 0.7, 0.1, ARM.trackZ + 0.2, ARM.trackX1 + 0.7, 0.14, ARM.trackZ + 0.28)]),
      M.metalDark,
      { name: 'df:track' },
    ),
  );
  const arm = buildArm(ctx, det, 3.9);
  // robot cell guard: welded-mesh fence (alpha-tested) around the arm, P1 kept reachable for the arm
  const fenceTex = canvasTex(64, 64);
  {
    const g = fenceTex.g;
    g.clearRect(0, 0, 64, 64);
    g.strokeStyle = '#3d3d3d';
    g.lineWidth = 3;
    g.strokeRect(0, 0, 64, 64);
    g.lineWidth = 1.5;
    for (let i = 8; i < 64; i += 8) {
      g.beginPath();
      g.moveTo(i, 0);
      g.lineTo(i, 64);
      g.moveTo(0, i);
      g.lineTo(64, i);
      g.stroke();
    }
    fenceTex.tex.wrapS = fenceTex.tex.wrapT = THREE.RepeatWrapping;
    fenceTex.tex.needsUpdate = true;
  }
  owned.push(fenceTex.tex);
  const fenceMat = new THREE.MeshStandardMaterial({ map: fenceTex.tex, alphaTest: 0.5, transparent: false, side: THREE.DoubleSide, roughness: 0.6, metalness: 0.5, color: 0x8a837d, name: 'dunkelfabrik:fence' });
  owned.push(fenceMat);
  const fence: THREE.BufferGeometry[] = [];
  const fenceRun = (ax: number, az: number, bx: number, bz: number): void => {
    const l = Math.hypot(bx - ax, bz - az);
    const p = plane(l, 1.6, (ax + bx) / 2, 0.95, (az + bz) / 2, 0, -Math.atan2(bz - az, bx - ax), 0);
    const uv = p.getAttribute('uv') as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * l * 2.5, uv.getY(i) * 1.6 * 2.5);
    fence.push(p);
    ctx.physics.addStaticBox({ size: [l, 1.8, 0.06], position: [(ax + bx) / 2, 0.9, (az + bz) / 2], rotation: [0, -Math.atan2(bz - az, bx - ax), 0], surface: 'metal' });
  };
  fenceRun(4.4, -7.45, 8.2, -7.45);
  fenceRun(2.4, -11.6, 9.9, -11.6);
  fenceRun(9.9, -11.6, 9.9, -9.0);
  fenceRun(2.4, -11.6, 2.4, -8.6);
  det.add(mesh(merge(fence), fenceMat, { receive: false, name: 'df:fence' }));
  // fence posts + light-curtain posts at P1 (teal tips)
  const posts: THREE.BufferGeometry[] = [];
  for (const [px, pz] of [
    [4.4, -7.45],
    [6.3, -7.45],
    [8.2, -7.45],
    [2.4, -11.6],
    [6.1, -11.6],
    [9.9, -11.6],
    [9.9, -9.0],
    [2.4, -8.6],
    [9.95, -7.0],
  ] as const)
    posts.push(box(0.07, 1.9, 0.07, px, 0.95, pz));
  det.add(mesh(merge(posts), M.metalDark, { name: 'df:fence-posts' }));
  ctx.physics.addStaticBox({ size: [1.9, 1.2, 0.1], position: [9.0, 0.6, -7.0], surface: 'metal' });

  // ── pallets (instanced: Handpalette, P1, AMR pallet) ─────────────────────
  const palGeo = merge([
    boxMM(-0.6, 0.1, -0.6, 0.6, PALLET_TOP, 0.6),
    ...[-0.5, 0, 0.5].map((z) => boxMM(-0.6, 0, z - 0.07, 0.6, 0.1, z + 0.07)),
    ...[-0.55, 0.55].map((x) => boxMM(x - 0.05, 0.02, -0.6, x + 0.05, 0.1, 0.6)),
  ]);
  owned.push(palGeo);
  const pallets = new THREE.InstancedMesh(palGeo, M.standard({ color: 0x3a3532, roughness: 0.8, metalness: 0.1 }), 3);
  pallets.name = 'df:pallets';
  pallets.frustumCulled = false;
  det.add(pallets);
  const hand: Pallet = { pos: new THREE.Vector3(HANDPALETTE.x, FLOOR_Y, HANDPALETTE.z), yaw: 0, count: 0, strapped: false, visible: true };
  const p1: Pallet = { pos: new THREE.Vector3(P1.x, FLOOR_Y, P1.z), yaw: 0, count: 0, strapped: false, visible: true };
  const pa: Pallet = { pos: new THREE.Vector3(UMREIFEN.x, FLOOR_Y, UMREIFEN.z), yaw: 0, count: 12, strapped: true, visible: true };
  const palletList = [hand, p1, pa];
  // strap bands on the AMR pallet
  const bandGeo = merge([boxMM(-0.62, 0.0, -0.21, 0.62, 0.62, -0.19), boxMM(-0.62, 0.0, 0.19, 0.62, 0.62, 0.21), boxMM(-0.62, 0.6, -0.21, 0.62, 0.625, 0.21)]);
  owned.push(bandGeo);
  const bands = new THREE.Mesh(bandGeo, M.standard({ color: 0xd6d3d1, roughness: 0.5, metalness: 0.3 }));
  bands.name = 'df:bands';
  det.add(bands);
  // Handpalette marking: floor frame (polygon offset beats the floor's own offset)
  const decalMat = M.hazard(2).clone();
  decalMat.polygonOffset = true;
  decalMat.polygonOffsetFactor = -12;
  decalMat.polygonOffsetUnits = -24;
  owned.push(decalMat);
  det.add(mesh(merge([boxMM(9.25, FLOOR_Y + 0.001, -3.82, 10.75, FLOOR_Y + 0.005, -3.75), boxMM(9.25, FLOOR_Y + 0.001, -2.25, 10.75, FLOOR_Y + 0.005, -2.18), boxMM(9.25, FLOOR_Y + 0.001, -3.82, 9.32, FLOOR_Y + 0.005, -2.18), boxMM(10.68, FLOOR_Y + 0.001, -3.82, 10.75, FLOOR_Y + 0.005, -2.18)]), decalMat, { name: 'df:hand-frame' }));

  // ── Umreifen station (portal with strapping head) ────────────────────────
  const U = UMREIFEN;
  det.add(
    mesh(
      merge([
        boxMM(U.x - 1.0, 0, U.z - 0.85, U.x - 0.85, 1.9, U.z + 0.85),
        boxMM(U.x + 0.85, 0, U.z - 0.85, U.x + 1.0, 1.9, U.z + 0.85),
        boxMM(U.x - 1.0, 1.9, U.z - 0.85, U.x + 1.0, 2.1, U.z + 0.85),
        boxMM(U.x + 1.0, 0, U.z - 0.3, U.x + 1.45, 1.1, U.z + 0.3),
      ]),
      M.panelElevated,
      { name: 'df:umreifen' },
    ),
  );
  const strapHead = mesh(box(1.7, 0.12, 0.3, U.x, 1.75, U.z), M.metalDark, { name: 'df:strap-head' });
  det.add(strapHead);
  ctx.physics.addStaticBox({ size: [2.5, 2.1, 1.8], position: [U.x + 0.2, 1.05, U.z], surface: 'metal' });

  // ── service point (Störung beheben) ──────────────────────────────────────
  const S = SERVICE;
  det.add(mesh(merge([boxMM(S.x - 0.7, 0, S.z - 0.9, S.x + 0.7, 2.0, S.z - 0.35), boxMM(S.x - 0.5, 0.95, S.z - 0.35, S.x + 0.5, 1.0, S.z - 0.05)]), M.panelElevated, { name: 'df:service' }));
  det.add(mesh(plane(0.9, 0.5, S.x, 1.55, S.z - 0.34), M.screen, { receive: false, name: 'df:service-screen' }));
  const beacon = new THREE.Group();
  beacon.position.set(S.x + 0.5, 2.12, S.z - 0.62);
  det.add(beacon);
  const beaconMesh = mesh(box(0.08, 0.14, 0.14, 0.06, 0, 0), M.accentOrange, { receive: false, name: 'df:beacon' });
  beaconMesh.visible = false;
  beacon.add(beaconMesh);
  ctx.physics.addStaticBox({ size: [1.4, 2, 0.6], position: [S.x, 1, S.z - 0.62], surface: 'metal' });

  // ── AMR shuttle (Anfahren) ───────────────────────────────────────────────
  const amr = new THREE.Group();
  amr.name = 'df:amr';
  det.add(amr);
  amr.add(mesh(merge([box(1.25, 0.26, 0.95, 0, 0.17, 0), box(1.1, 0.04, 0.8, 0, 0.32, 0), cyl(0.07, 0.07, 0.06, 12, 0.5, 0.33, 0)]), M.panelElevated, { name: 'df:amr-body' }));
  amr.add(mesh(merge([box(1.26, 0.03, 0.04, 0, 0.16, 0.48), box(1.26, 0.03, 0.04, 0, 0.16, -0.48), box(0.04, 0.03, 0.96, 0.63, 0.16, 0)]), M.emissiveTeal, { receive: false, name: 'df:amr-led' }));
  const AMR_HOME = new THREE.Vector3(12.4, FLOOR_Y, -7.4);
  amr.position.copy(AMR_HOME);
  amr.rotation.y = Math.PI;

  // ── people (stylised, faceless, stone-700) ───────────────────────────────
  const personGeo = merge([
    capsule(0.085, 0.72, -0.1, 0.45, 0),
    capsule(0.085, 0.72, 0.1, 0.45, 0),
    capsule(0.19, 0.42, 0, 1.17, 0),
    sphere(0.12, 14, 10, 0, 1.64, 0),
    capsule(0.06, 0.52, -0.27, 1.12, 0.14, -0.5, 0, 0.12),
    capsule(0.06, 0.52, 0.27, 1.12, 0.14, -0.5, 0, -0.12),
  ]);
  owned.push(personGeo);
  const people = new THREE.InstancedMesh(personGeo, M.standard({ color: 0x2b2725, roughness: 0.95, metalness: 0 }), 6);
  people.name = 'df:people';
  det.add(people);
  const personOn = [false, false, false, false, false, false];

  // ── cell lamps: housings (merged), faces / pools / cones (instanced) ────
  const housings: THREE.BufferGeometry[] = [];
  for (const c of CELLS) {
    housings.push(cyl(0.22, 0.32, 0.22, 16, c.lamp[0], c.lamp[1] + 0.11, c.lamp[2], 0, 0, 0, true));
    housings.push(cyl(0.012, 0.012, 15.6 - c.lamp[1] - 0.2, 4, c.lamp[0], (15.6 + c.lamp[1] + 0.2) / 2, c.lamp[2]));
  }
  det.add(mesh(merge(housings), M.metalDark, { name: 'df:lamp-housings' }));
  const lampFaceMat = new THREE.MeshBasicMaterial({ color: 0xffffff, name: 'dunkelfabrik:lamp-face' });
  owned.push(lampFaceMat);
  const faceGeo = cyl(0.28, 0.28, 0.02, 16, 0, -0.005, 0);
  owned.push(faceGeo);
  const faces = new THREE.InstancedMesh(faceGeo, lampFaceMat, 6);
  faces.name = 'df:lamp-faces';
  const poolTex = radialTex(128, 0, 2.2);
  owned.push(poolTex);
  const poolMat = new THREE.MeshBasicMaterial({ map: poolTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -12, polygonOffsetUnits: -24, name: 'dunkelfabrik:pool' });
  owned.push(poolMat);
  const poolGeo = plane(4.2, 4.2, 0, 0, 0, -Math.PI / 2);
  owned.push(poolGeo);
  const pools = new THREE.InstancedMesh(poolGeo, poolMat, 6);
  pools.name = 'df:lamp-pools';
  const cTex = coneTex(128);
  owned.push(cTex);
  const coneMat = new THREE.MeshBasicMaterial({ map: cTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, name: 'dunkelfabrik:cone' });
  coneMat.forceSinglePass = true; // Z1: additive lamp cones: one pass, same image
  owned.push(coneMat);
  const coneGeo = cyl(0.26, 1.6, 1, 24, 0, -0.5, 0, 0, 0, 0, true);
  owned.push(coneGeo);
  const cones = new THREE.InstancedMesh(coneGeo, coneMat, 6);
  cones.name = 'df:lamp-cones';
  for (const im of [faces, pools, cones]) {
    im.frustumCulled = false;
    det.add(im);
  }
  const lampState: LampState[] = CELLS.map(() => 'day');
  const lampLevel = new Float32Array(6); // animated 0…1
  const lampTarget = new Float32Array(6);
  const COL: Record<LampState, THREE.Color> = {
    day: new THREE.Color(0xfff1dc).multiplyScalar(2.2),
    off: new THREE.Color(0x0c0b0a),
    standby: new THREE.Color(0x9fded4).multiplyScalar(0.55),
    work: new THREE.Color(0xff8a3d).multiplyScalar(2.6),
    alert: new THREE.Color(0xff6700).multiplyScalar(3.0),
  };
  const POOL: Record<LampState, THREE.Color> = {
    day: new THREE.Color(0xffe6c4).multiplyScalar(0.16),
    off: new THREE.Color(0, 0, 0),
    standby: new THREE.Color(0x5fb8ad).multiplyScalar(0.08),
    work: new THREE.Color(0xff8a3d).multiplyScalar(0.55),
    alert: new THREE.Color(0xff6700).multiplyScalar(0.45),
  };
  const CONE: Record<LampState, THREE.Color> = {
    day: new THREE.Color(0, 0, 0),
    off: new THREE.Color(0, 0, 0),
    standby: new THREE.Color(0x5fb8ad).multiplyScalar(0.04),
    work: new THREE.Color(0xff9a52).multiplyScalar(0.22),
    alert: new THREE.Color(0xff6700).multiplyScalar(0.2),
  };
  const _c = new THREE.Color();
  const _c2 = new THREE.Color();
  const lampFrom = CELLS.map(() => ({ face: new THREE.Color(), pool: new THREE.Color(), cone: new THREE.Color() }));
  CELLS.forEach((c, i) => {
    faces.setMatrixAt(i, _m.makeTranslation(c.lamp[0], c.lamp[1], c.lamp[2]));
    pools.setMatrixAt(i, _m.makeTranslation(c.lamp[0], FLOOR_Y + 0.008, c.lamp[2]));
    _m.compose(_p.set(c.lamp[0], c.lamp[1], c.lamp[2]), _q.identity(), _s.set(1, c.lamp[1] - 0.05, 1));
    cones.setMatrixAt(i, _m);
    lampFrom[i].face.copy(COL.day);
    lampFrom[i].pool.copy(POOL.day);
    lampFrom[i].cone.copy(CONE.day);
    lampLevel[i] = 1;
    lampTarget[i] = 1;
  });
  for (const im of [faces, pools, cones]) im.instanceMatrix.needsUpdate = true;
  const applyLamp = (i: number): void => {
    const s = lampState[i];
    const k = easeInOut(lampLevel[i]);
    faces.setColorAt(i, _c.copy(lampFrom[i].face).lerp(COL[s], k));
    pools.setColorAt(i, _c.copy(lampFrom[i].pool).lerp(POOL[s], k));
    cones.setColorAt(i, _c2.copy(lampFrom[i].cone).lerp(CONE[s], k));
  };
  for (let i = 0; i < 6; i++) applyLamp(i);
  for (const im of [faces, pools, cones]) if (im.instanceColor) im.instanceColor.needsUpdate = true;

  // ── cell labels (one canvas atlas, 6 hanging signs facing the Leitstand) ─
  const atlas = canvasTex(512, 384);
  owned.push(atlas.tex);
  const labelMat = new THREE.MeshBasicMaterial({ map: atlas.tex, transparent: true, name: 'dunkelfabrik:labels' });
  owned.push(labelMat);
  const lab: THREE.BufferGeometry[] = [];
  CELLS.forEach((c, i) => {
    const col = i % 2,
      row = Math.floor(i / 2);
    const g = plane(1.5, 0.75, 0, 0, 0);
    atlasUV(g, col / 2, 1 - (row + 1) / 3, (col + 1) / 2, 1 - row / 3);
    const yaw = Math.atan2(12.4 - c.label[0], -4 - c.label[2]);
    g.rotateY(yaw);
    g.translate(c.label[0], c.label[1], c.label[2]);
    lab.push(g);
  });
  const labels = mesh(merge(lab), labelMat, { receive: false, name: 'df:cell-labels' });
  labels.visible = false;
  det.add(labels);
  let labelLevels: number[] | null = null;
  const drawLabels = (): void => {
    const g = atlas.g;
    g.clearRect(0, 0, atlas.w, atlas.h);
    for (let i = 0; i < 6; i++) {
      const x = (i % 2) * 256,
        y = Math.floor(i / 2) * 128;
      g.fillStyle = 'rgba(20,20,20,0.92)';
      roundRect(g, x + 6, y + 10, 244, 108, 10);
      g.fill();
      g.strokeStyle = '#3d3d3d';
      g.lineWidth = 2;
      g.stroke();
      g.fillStyle = '#a8a29e';
      g.font = '500 17px "Geist Mono", monospace';
      g.fillText(`// 0${i + 1}`, x + 20, y + 38);
      g.fillStyle = '#f5f5f4';
      g.font = '700 26px "Space Grotesk", sans-serif';
      g.fillText(gestureName(i), x + 20, y + 72, 220);
      if (labelLevels) {
        g.fillStyle = '#2dd4bf';
        g.font = '500 22px "Geist Mono", monospace';
        g.fillText(`L${labelLevels[i]}`, x + 20, y + 104);
      }
    }
    atlas.tex.needsUpdate = true;
  };
  drawLabels();

  // ── state: belt, arm, AMR ────────────────────────────────────────────────
  type BeltCrate = { x: number; scanned: boolean };
  const belt: BeltCrate[] = [];
  let spawnTimer = 0;
  let rollerPhase = 0;
  let clackDist = 0;
  const line = {} as Line;
  let held = false; // arm holds a crate
  const heldPos = new THREE.Vector3();
  // arm state machine
  type ArmPhase = 'idle' | 'toPick' | 'down' | 'up' | 'toPlace' | 'place' | 'back';
  const ARM_DUR: Record<ArmPhase, number> = { idle: 1, toPick: 1.1, down: 0.45, up: 0.4, toPlace: 1.5, place: 0.5, back: 1.4 };
  let armPhase: ArmPhase = 'idle';
  let armT = 0;
  const armFrom = new THREE.Vector3();
  const armTo = new THREE.Vector3();
  let trackFrom = 0;
  let trackTo = 0;
  const tcpTarget = new THREE.Vector3();
  const qTmp = new Float64Array(6);
  const PARK = new THREE.Vector3(4.8, 1.75, -9.4);
  const parkTrack = 3.9;
  // race (Station A): the arm's own infeed stand inside the cell, behind the track
  const INFEED = { x: 5.4, z: -11.0, top: 0.78 } as const;
  const RACE_TAKT = 20; // s, Station 7's fictional Takt (sim.TAKT_S)
  let raceOn = false;
  let raceT = 0;
  let raceNext = 0;
  let racePick = false;
  let infeedFull = true;
  let robotCount = 0;
  const pickAt = new THREE.Vector3();
  // the infeed stand: a short roller table inside the cell (carbon body, teal T0 edge)
  det.add(mesh(merge([boxMM(INFEED.x - 0.36, 0, INFEED.z - 0.28, INFEED.x + 0.36, INFEED.top - 0.04, INFEED.z + 0.28), boxMM(INFEED.x - 0.4, INFEED.top - 0.04, INFEED.z - 0.32, INFEED.x + 0.4, INFEED.top, INFEED.z + 0.32)]), M.metalDark, { name: 'df:infeed' }));
  det.add(mesh(boxMM(INFEED.x - 0.4, INFEED.top - 0.03, INFEED.z + 0.32, INFEED.x + 0.4, INFEED.top - 0.012, INFEED.z + 0.335), ledEdgeMat, { receive: false, name: 'df:infeed-led' }));
  const slotOf = (i: number, out: THREE.Vector3, base: THREE.Vector3): THREE.Vector3 => {
    const layer = Math.floor(i / 6);
    const k = i % 6;
    const sx = (k % 2) * CRATE.w - CRATE.w / 2;
    const sz = Math.floor(k / 2) * CRATE.d - CRATE.d;
    return out.set(base.x + sx, base.y + PALLET_TOP + CRATE.h / 2 + layer * CRATE.h, base.z + sz);
  };
  const _slot = new THREE.Vector3();
  const armGo = (phase: ArmPhase, to: THREE.Vector3, track: number): void => {
    armPhase = phase;
    armT = 0;
    armFrom.copy(tcpTarget);
    armTo.copy(to);
    trackFrom = arm.trackX;
    trackTo = track;
  };
  tcpTarget.copy(PARK);
  if (arm.solve(tcpTarget, 0, qTmp)) arm.apply(qTmp);
  arm.syncRings();

  // AMR mission
  type AmrPhase = 'home' | 'toP1' | 'toStrap' | 'strap' | 'toLift' | 'sink' | 'back' | 'toCargo';
  let amrPhase: AmrPhase = 'home';
  // the cargo run by day (shipCargo): the same mission without the night's palletising
  let cargo: { onAboard?: () => void } | null = null;
  let amrT = 0;
  let amrPath: THREE.Vector3[] = [];
  let amrSeg = 0;
  const amrCarry = { on: false };
  let liftT = 0;

  const setPath = (pts: [number, number][]): void => {
    amrPath = [amr.position.clone(), ...pts.map(([x, z]) => new THREE.Vector3(x, FLOOR_Y, z))];
    amrSeg = 0;
  };
  const AMR_SPEED = 1.3;
  const stepAmr = (dt: number): boolean => {
    // returns true when the path is finished
    let remaining = AMR_SPEED * dt;
    while (remaining > 0 && amrSeg < amrPath.length - 1) {
      const b = amrPath[amrSeg + 1];
      const dx = b.x - amr.position.x,
        dz = b.z - amr.position.z;
      const d = Math.hypot(dx, dz);
      const targetYaw = Math.atan2(-dz, dx);
      let dy = targetYaw - amr.rotation.y;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      if (Math.abs(dy) > 0.05 && d > 0.05) {
        amr.rotation.y += Math.sign(dy) * Math.min(Math.abs(dy), 2.4 * dt);
        return false;
      }
      if (d <= remaining) {
        amr.position.x = b.x;
        amr.position.z = b.z;
        remaining -= d;
        amrSeg++;
      } else {
        amr.position.x += (dx / d) * remaining;
        amr.position.z += (dz / d) * remaining;
        remaining = 0;
      }
    }
    return amrSeg >= amrPath.length - 1;
  };

  // ── per-frame rebuild of crate instances ─────────────────────────────────
  let nInst = 0;
  const putCrate = (x: number, y: number, z: number, yaw: number): void => {
    if (nInst >= MAX) return;
    _q.setFromEuler(_e.set(0, yaw, 0));
    _m.compose(_p.set(x, y, z), _q, _s.set(1, 1, 1));
    crates.setMatrixAt(nInst++, _m);
  };
  const writeCrates = (): void => {
    nInst = 0;
    for (let i = 0; i < belt.length; i++) putCrate(belt[i].x, BELT.top + CRATE.h / 2, BELT.z, 0);
    if (held) putCrate(heldPos.x, heldPos.y, heldPos.z, 0);
    if (raceOn && infeedFull) putCrate(INFEED.x, INFEED.top + CRATE.h / 2, INFEED.z, 0);
    for (let pi = 0; pi < palletList.length; pi++) {
      const p = palletList[pi];
      if (!p.visible) continue;
      const cy = Math.cos(p.yaw),
        sy = Math.sin(p.yaw);
      for (let i = 0; i < p.count; i++) {
        slotOf(i, _slot, p.pos);
        // rotate the slot offset by the pallet yaw
        const ox = _slot.x - p.pos.x,
          oz = _slot.z - p.pos.z;
        putCrate(p.pos.x + ox * cy + oz * sy, _slot.y, p.pos.z - ox * sy + oz * cy, p.yaw);
      }
    }
    crates.count = nInst;
    crates.instanceMatrix.needsUpdate = true;
    for (let i = 0; i < palletList.length; i++) {
      const p = palletList[i];
      _q.setFromEuler(_e.set(0, p.yaw, 0));
      _m.compose(_p.copy(p.pos), _q, _s.setScalar(p.visible ? 1 : 0.0001));
      pallets.setMatrixAt(i, _m);
    }
    pallets.instanceMatrix.needsUpdate = true;
    bands.visible = pa.visible && pa.strapped && pa.count > 0;
    bands.position.copy(pa.pos);
    bands.position.y += PALLET_TOP;
    bands.rotation.y = pa.yaw;
  };

  const writePeople = (t: number): void => {
    for (let i = 0; i < CELLS.length; i++) {
      const c = CELLS[i];
      const on = personOn[i];
      const sway = on ? Math.sin(t * 1.3 + i) * 0.03 : 0;
      _q.setFromEuler(_e.set(0, c.person[3] + sway, 0));
      _m.compose(_p.set(c.person[0], FLOOR_Y, c.person[2]), _q, _s.setScalar(on ? 1 : 0.0001));
      people.setMatrixAt(i, _m);
    }
    people.instanceMatrix.needsUpdate = true;
  };

  Object.assign(line, {
    mode: 'day' as const,
    speed: 1,
    running: true,
    crateMaterial,
    crateGeometry,
    arm,
    hand,
    onScan: null,
    onPalletOut: null,
    onClack: null,
    queued: () => belt.filter((c) => c.x >= END_X - QUEUE_MAX * (CRATE.w + 0.04)).length,
    frontCrate(out: THREE.Vector3): boolean {
      const f = belt[0];
      if (!f || f.x < END_X - 0.02) return false;
      out.set(f.x, BELT.top + CRATE.h / 2, BELT.z);
      return true;
    },
    takeFront(): boolean {
      const f = belt[0];
      if (!f || f.x < END_X - 0.02) return false;
      belt.shift();
      return true;
    },
    handSlot(i: number, out: THREE.Vector3) {
      return slotOf(i, out, hand.pos);
    },
    setLamp(k: number, s: LampState) {
      if (lampState[k] === s) return;
      // start a blend from the current colour
      const kk = easeInOut(lampLevel[k]);
      lampFrom[k].face.lerp(COL[lampState[k]], kk);
      lampFrom[k].pool.lerp(POOL[lampState[k]], kk);
      lampFrom[k].cone.lerp(CONE[lampState[k]], kk);
      lampState[k] = s;
      lampLevel[k] = 0;
      lampTarget[k] = 1;
    },
    setPerson(k: number, on: boolean) {
      personOn[k] = on;
    },
    setLabels(levels: number[] | null) {
      labelLevels = levels ? [...levels] : null;
      labels.visible = !!levels;
      drawLabels();
    },
    setLabelDim(dim: boolean) {
      labelMat.color.setScalar(dim ? 0.45 : 1);
    },
    setDayPeople() {
      for (let i = 0; i < 6; i++) personOn[i] = i === 4 || i === 2;
    },
    prefill(n: number) {
      belt.length = 0;
      for (let i = 0; i < n; i++) belt.push({ x: END_X - i * (CRATE.w + 0.04), scanned: true });
    },
    resetForNight() {
      belt.length = 0;
      hand.count = 0;
      p1.count = 0;
      pa.count = 0;
      pa.visible = false;
      held = false;
      armPhase = 'idle';
      amrPhase = 'home';
      amr.position.copy(AMR_HOME);
      amr.rotation.y = Math.PI;
      amrCarry.on = false;
      liftT = 0;
      hall.setLift(0);
      spawnTimer = 0;
    },
    resetForDay() {
      belt.length = 0;
      p1.count = 0;
      pa.count = 12;
      pa.strapped = true;
      pa.visible = true;
      pa.pos.set(UMREIFEN.x, FLOOR_Y, UMREIFEN.z);
      pa.yaw = 0;
      held = false;
      armPhase = 'idle';
      armGo('back', PARK, parkTrack);
      amrPhase = 'home';
      amr.position.copy(AMR_HOME);
      amr.rotation.y = Math.PI;
      amrCarry.on = false;
      liftT = 0;
      hall.setLift(0);
      spawnTimer = 0;
    },
    relabel() {
      drawLabels();
    },
    race(on: boolean) {
      if (on === raceOn) return;
      raceOn = on;
      if (on) {
        raceT = 0;
        raceNext = 0.4;
        robotCount = 0;
        infeedFull = true;
        p1.count = 0;
      } else {
        // the arm finishes the crate in its gripper, then parks; P1 clears a little later
        ctx.after(5, () => {
          if (!raceOn && line.mode === 'day') p1.count = 0;
        });
      }
    },
    robotCount: () => robotCount,
    onRobotCrate: null,
    shipCargo(onAboard?: () => void) {
      if (line.mode !== 'day' || amrPhase !== 'home' || cargo) return;
      // a full, strapped pallet waits at the Umreifer by day (resetForDay); the AMR fetches it
      pa.count = 12;
      pa.strapped = true;
      pa.visible = true;
      pa.pos.set(UMREIFEN.x, FLOOR_Y, UMREIFEN.z);
      cargo = { onAboard };
      amrPhase = 'toCargo';
      setPath([
        [AMR_HOME.x, -8.4],
        [UMREIFEN.x, P1.z],
        [UMREIFEN.x, UMREIFEN.z],
      ]);
    },
    setNight(level: number) {
      const k = Math.max(0, Math.min(1, level));
      ledEdgeMat.color.copy(LK.tierColor(0x2dd4bf, k));
      floorGlowMat.opacity = 0.22 * k;
      floorGlow.visible = k > 0.01;
    },
    update(dt: number, t: number) {
      const night = line.mode === 'night';
      const sp = night ? line.speed : 1;
      const run = line.running;
      const ldt = run ? dt * sp : 0;

      // belt spawn + motion
      const beltV = night ? 1.6 : 1.1;
      spawnTimer -= ldt;
      const queueLimit = night ? 5 : QUEUE_MAX;
      if (spawnTimer <= 0 && belt.length < queueLimit) {
        const last = belt[belt.length - 1];
        if (!last || last.x > BELT.x0 + 0.9) {
          belt.push({ x: BELT.x0 - 0.2, scanned: false });
          spawnTimer = night ? 2.2 : 6;
        }
      }
      let moving = false;
      for (let i = 0; i < belt.length; i++) {
        const c = belt[i];
        const stop = i === 0 ? END_X : belt[i - 1].x - (CRATE.w + 0.04);
        const nx = Math.min(stop, c.x + beltV * ldt);
        if (nx > c.x + 1e-5) moving = true;
        if (!c.scanned && nx >= archX && c.x < archX) {
          c.scanned = true;
          scanGlow = 1;
          line.onScan?.();
        }
        c.x = nx;
      }
      if (moving) {
        clackDist += beltV * ldt;
        if (clackDist > 0.6) {
          clackDist = 0;
          line.onClack?.();
        }
        rollerPhase += beltV * ldt / 0.045;
        _q.setFromEuler(_e.set(0, 0, -rollerPhase));
        for (let i = 0; i < nRollers; i++) {
          _m.compose(_p.set(rollerX[i], BELT.top - 0.045, BELT.z), _q, _s.set(1, 1, 1));
          rollers.setMatrixAt(i, _m);
        }
        rollers.instanceMatrix.needsUpdate = true;
      }
      // pick lamp: orange when a crate waits in the day (active station)
      const waiting = !night && belt.length > 0 && belt[0].x >= END_X - 0.02;
      pickLamp.material = waiting ? M.accentOrange : M.emissiveTeal;

      // IR beams: idle shimmer + flash on scan
      scanGlow = Math.max(0, scanGlow - dt * 2.5);
      beamMat.opacity = 0.35 + 0.08 * Math.sin(t * 9) + 0.55 * scanGlow;

      // arm (night: from the belt end; day race: from its own infeed)
      if (raceOn && !night) {
        raceT += dt;
        if (!infeedFull && raceT >= raceNext - RACE_TAKT + 6) infeedFull = true; // the infeed refills
      }
      if (night || armPhase === 'back' || (raceOn && !night) || (racePick && armPhase !== 'idle')) {
        armT += ldt;
        if (armPhase === 'idle' && night && run) {
          if (belt[0] && belt[0].x >= END_X - 0.02 && p1.count < 12) {
            racePick = false;
            pickAt.set(END_X, BELT.top, BELT.z);
            _slot.set(END_X, BELT.top + CRATE.h + 0.32, BELT.z);
            armGo('toPick', _slot, END_X);
          }
        } else if (armPhase === 'idle' && !night && raceOn) {
          if (raceT >= raceNext && infeedFull && p1.count < 12) {
            raceNext += RACE_TAKT;
            racePick = true;
            pickAt.set(INFEED.x, INFEED.top, INFEED.z);
            _slot.set(INFEED.x, INFEED.top + CRATE.h + 0.32, INFEED.z);
            armGo('toPick', _slot, Math.max(ARM.trackX0, Math.min(ARM.trackX1, INFEED.x - 0.4)));
          }
        } else if (armPhase !== 'idle') {
          const dur = ARM_DUR[armPhase];
          const k = easeInOut(Math.min(1, armT / dur));
          tcpTarget.lerpVectors(armFrom, armTo, k);
          if (armPhase === 'toPlace' || armPhase === 'toPick' || armPhase === 'back') tcpTarget.y += Math.sin(Math.PI * k) * 0.35;
          arm.trackX = trackFrom + (trackTo - trackFrom) * k;
          if (armT >= dur) {
            tcpTarget.copy(armTo);
            if (armPhase === 'toPick') {
              _slot.set(pickAt.x, pickAt.y + CRATE.h, pickAt.z);
              armGo('down', _slot, arm.trackX);
            } else if (armPhase === 'down') {
              if (racePick) {
                if (infeedFull) {
                  infeedFull = false;
                  held = true;
                }
              } else if (belt[0] && belt[0].x >= END_X - 0.02) {
                belt.shift();
                held = true;
              }
              _slot.set(pickAt.x, pickAt.y + CRATE.h + 0.55, pickAt.z);
              armGo('up', _slot, arm.trackX);
            } else if (armPhase === 'up') {
              slotOf(p1.count, _slot, p1.pos);
              _slot.y += CRATE.h / 2 + 0.35;
              armGo('toPlace', _slot, Math.min(ARM.trackX1, p1.pos.x - 0.6));
            } else if (armPhase === 'toPlace') {
              slotOf(p1.count, _slot, p1.pos);
              _slot.y += CRATE.h / 2;
              armGo('place', _slot, arm.trackX);
            } else if (armPhase === 'place') {
              if (held) {
                held = false;
                p1.count++;
                ctx.audio.play('thud', { volume: 0.25, at: [p1.pos.x, 0.5, p1.pos.z] });
                if (racePick) {
                  robotCount++;
                  line.onRobotCrate?.(robotCount, _slot);
                }
              }
              racePick = racePick && raceOn;
              armGo('back', night ? _slot.set(END_X + 0.6, BELT.top + CRATE.h + 0.6, BELT.z - 0.4) : PARK, night ? END_X : parkTrack);
            } else if (armPhase === 'back') {
              armPhase = 'idle';
            }
          }
          if (arm.solve(tcpTarget, 0, qTmp)) arm.apply(qTmp);
          arm.syncRings();
          if (held) heldPos.copy(tcpTarget).add(_p.set(0, -CRATE.h / 2, 0));
        }
      }

      // AMR (night): P1 full → take it, strap, deliver, sink; by day the cargo run (shipCargo)
      if (night || cargo) {
        const adt = night ? ldt : dt;
        if (amrPhase === 'toCargo') {
          if (stepAmr(adt)) {
            amrCarry.on = true;
            amrPhase = 'toLift';
            setPath([
              [LIFT.x, -12.2],
              [LIFT.x, LIFT.z],
            ]);
          }
        }
        if (amrPhase === 'home' && p1.count >= 12 && run) {
          amrPhase = 'toP1';
          setPath([[P1.x, P1.z]]);
        } else if (amrPhase === 'toP1') {
          if (stepAmr(adt)) {
            // lift the full pallet onto the AMR, a fresh pallet slides into P1
            pa.count = p1.count;
            pa.strapped = false;
            pa.visible = true;
            amrCarry.on = true;
            p1.count = 0;
            amrPhase = 'toStrap';
            setPath([
              [UMREIFEN.x, P1.z],
              [UMREIFEN.x, UMREIFEN.z],
            ]);
          }
        } else if (amrPhase === 'toStrap') {
          if (stepAmr(adt)) {
            amrPhase = 'strap';
            amrT = 0;
          }
        } else if (amrPhase === 'strap') {
          amrT += adt;
          strapHead.position.y = -Math.sin(Math.min(1, amrT / 1.6) * Math.PI) * 0.95;
          if (amrT > 1.6) {
            pa.strapped = true;
            strapHead.position.y = 0;
            amrPhase = 'toLift';
            setPath([
              [LIFT.x, -12.2],
              [LIFT.x, LIFT.z],
            ]);
          }
        } else if (amrPhase === 'toLift') {
          if (stepAmr(adt)) {
            amrPhase = 'sink';
            amrT = 0;
            amrCarry.on = false;
            pa.pos.set(LIFT.x, 0.05, LIFT.z);
          }
        } else if (amrPhase === 'sink') {
          amrT += adt;
          if (amrT > 0.4 && amrT < 2.4) {
            // AMR backs off first, then the lift sinks
            liftT = Math.min(1, (amrT - 0.4) / 2);
          }
          if (amrT < 0.6) {
            amr.position.z += adt * 1.5;
          }
          hall.setLift(liftT);
          pa.pos.y = hall.liftTop.position.y;
          if (amrT > 2.4) {
            pa.visible = false;
            pa.count = 0;
            line.onPalletOut?.();
            cargo?.onAboard?.();
            if (cargo) cargo.onAboard = undefined;
            amrPhase = 'back';
            setPath([
              [LIFT.x, -12.2],
              [10.5, -9.3],
              [AMR_HOME.x, -8.4],
              [AMR_HOME.x, AMR_HOME.z],
            ]);
          }
        } else if (amrPhase === 'back') {
          if (liftT > 0) {
            liftT = Math.max(0, liftT - adt * 0.8);
            hall.setLift(liftT);
          }
          if (stepAmr(adt)) {
            amrPhase = 'home';
            cargo = null;
          }
        }
        if (amrCarry.on) {
          pa.pos.set(amr.position.x, FLOOR_Y + 0.34, amr.position.z);
          pa.yaw = amr.rotation.y;
        }
      }
      // beacon spins while the line stands still (MRC)
      beaconMesh.visible = night && !run;
      if (beaconMesh.visible) beacon.rotation.y += dt * 9;

      // lamp blends
      let lampDirty = false;
      for (let i = 0; i < 6; i++) {
        if (lampLevel[i] < lampTarget[i]) {
          lampLevel[i] = Math.min(1, lampLevel[i] + dt * 2.2);
          lampDirty = true;
        }
        if (lampState[i] === 'alert') {
          const pulse = 0.55 + 0.45 * Math.sin(t * 8);
          faces.setColorAt(i, _c.copy(COL.alert).multiplyScalar(pulse));
          pools.setColorAt(i, _c.copy(POOL.alert).multiplyScalar(pulse));
          cones.setColorAt(i, _c.copy(CONE.alert).multiplyScalar(pulse));
          lampDirty = true;
        } else if (lampDirty) applyLamp(i);
      }
      if (lampDirty) for (const im of [faces, pools, cones]) if (im.instanceColor) im.instanceColor.needsUpdate = true;

      writeCrates();
      writePeople(t);
    },
  });
  line.setDayPeople();
  line.prefill(2);
  writeCrates();
  writePeople(0);
  return line;
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

/** stone-600 composite crate: ribbed sides, a small hazard label and the mass (18 kg) */
function drawCrate(c: CanvasTex): void {
  const { g, w, h } = c;
  g.fillStyle = '#57534e';
  g.fillRect(0, 0, w, h);
  // frame + ribs
  g.fillStyle = '#4a4642';
  g.fillRect(0, 0, w, 10);
  g.fillRect(0, h - 10, w, 10);
  g.fillRect(0, 0, 10, h);
  g.fillRect(w - 10, 0, 10, h);
  g.fillStyle = 'rgba(0,0,0,0.18)';
  for (let x = 28; x < w - 20; x += 22) g.fillRect(x, 14, 3, h - 28);
  // label
  g.fillStyle = '#e7e5e4';
  g.fillRect(w * 0.58, 30, 86, 60);
  // hazard stripe across the label top
  g.save();
  g.beginPath();
  g.rect(w * 0.58, 30, 86, 14);
  g.clip();
  g.fillStyle = '#0a0a0a';
  g.fillRect(w * 0.58, 30, 86, 14);
  g.fillStyle = '#ff6700';
  for (let x = -14; x < 100; x += 12) {
    g.beginPath();
    g.moveTo(w * 0.58 + x, 44);
    g.lineTo(w * 0.58 + x + 6, 44);
    g.lineTo(w * 0.58 + x + 20, 30);
    g.lineTo(w * 0.58 + x + 14, 30);
    g.fill();
  }
  g.restore();
  g.fillStyle = '#1c1917';
  g.font = '700 22px "Space Grotesk", sans-serif';
  g.fillText('18 kg', w * 0.58 + 8, 70);
  g.font = '500 11px "Geist Mono", monospace';
  g.fillText('ST 7 · 41 °C', w * 0.58 + 8, 84);
  c.tex.needsUpdate = true;
}
