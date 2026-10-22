/**
 * Station B „Unter Last messen“ ◆: EmAI's mobile Messzelle. A 6 × 2.5 × 3 m container on
 * rails (kinematic collider moving with it), pushed by holding E (servo-assisted, 1.2 m/s),
 * docks next to the line: bay unfolds, hatch opens, the 4 m sensor mast extends. At the console
 * the player sets temperature, vibration, light, shift length and n, predicts, and measures:
 * fast-forward trials stream onto the live screen (Kennlinie with Wilson band, dot stream,
 * failure mix, torque drift), then the giant sign flips to the measured value.
 */
import * as THREE from 'three';
import type { ChallengeHandle, InfoCardSpec, KennlinieSpec, Stars, Text } from '@/core/zones';
import { FONT_DISPLAY, FONT_MONO, makeCanvas, metricBoxUv, Painter, place, rrect, ribNormalMap } from './geom';
import type { LineCell } from './line';
import { drawTrial, expectedRate, OUTCOMES, rateDisplay, rng, torqueDriftPct, trialHour, wilson, plusMinusPct, T_MAX, T_MIN, type Outcome, type RunSettings, type Vib } from './model';
import { isWorstCase, type RunResult, type Shared } from './state';
import { look } from './look';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

export const CELL = { x: 10, parkZ: 6, dockZ: -3, len: 6, w: 2.5, h: 3, floor: 0.35 };
/** operate camera at the Messpult: arm, conveyor and the live screen in view */
const OP_POSE: { pos: [number, number, number]; look: [number, number, number] } = { pos: [4.2, 2.25, -0.3], look: [9.0, 1.45, -5.1] };
const V = new THREE.Vector3();
const PL = new THREE.Vector3();
const KP = new THREE.Vector3();

export const OUTCOME_COLORS: Record<Outcome, string> = {
  erfolg: '#2DD4BF',
  teil: '#E7E5E4',
  rutschen: '#A8A29E',
  fehlgriff: '#78716C',
  uebertemp: '#FF8534',
  drift: '#57534E',
};

export interface Messzelle {
  dock(instant?: boolean): void;
  /** debug: run a full measurement instantly (n = 200, 44 °C) */
  solve(worst?: boolean): RunResult;
  readonly challenge: import('@/core/zones').ChallengeHandle;
  /** world position of the printer slot paper animation */
  print(onDone: () => void): void;
  readonly paperObject: THREE.Object3D;
  readonly handleObject: THREE.Object3D;
  goToHandle(): void;
}

export function buildMesszelle(S: Shared, line: LineCell): Messzelle {
  const ctx = S.ctx;
  const M = ctx.materials;
  const LK = look(ctx);
  const ext = ctx.groups.exterior;
  const L = CELL.len,
    W = CELL.w,
    Hh = CELL.h;

  // ── rails (exterior) ─────────────────────────────────────────────────────
  const railZ0 = CELL.dockZ - L / 2 - 0.45,
    railZ1 = CELL.parkZ + L / 2 + 0.5;
  // ART-V2 §6.6: a carbon bed with brushed-alu rails and a teal running light that wakes while you push
  const rails = new Painter().box(2.3, 0.03, railZ1 - railZ0, [CELL.x, 0.045, (railZ0 + railZ1) / 2], 0x1c1917);
  for (const dx of [-0.75, 0.75]) rails.box(0.08, 0.05, railZ1 - railZ0, [CELL.x + dx, 0.085, (railZ0 + railZ1) / 2], 0xc9c4bf);
  rails.box(0.5, 0.3, 0.3, [CELL.x - 0.75, 0.15, railZ0 - 0.1], 0x1c1917).box(0.5, 0.3, 0.3, [CELL.x + 0.75, 0.15, railZ0 - 0.1], 0x1c1917);
  ext.add(rails.mesh(M.standard({ vertexColors: true, roughness: 0.34, metalness: 0.75, polygonOffset: true, polygonOffsetFactor: -7, polygonOffsetUnits: -14 })));
  const railLightMat = new THREE.MeshBasicMaterial({ color: LK.tierColor(0x2dd4bf, 0).multiplyScalar(0.45) });
  ctx.onDispose(() => railLightMat.dispose());
  const railLight = new Painter();
  for (const dx of [-1.06, 1.06]) railLight.box(0.03, 0.012, railZ1 - railZ0 - 0.2, [CELL.x + dx, 0.066, (railZ0 + railZ1) / 2], 0xffffff);
  ext.add(railLight.mesh(railLightMat, { receive: false }));
  let railGlow = 0;
  const stops = new Painter()
    .addUv(new THREE.BoxGeometry(0.52, 0.1, 0.32), [CELL.x - 0.75, 0.35, railZ0 - 0.1])
    .addUv(new THREE.BoxGeometry(0.52, 0.1, 0.32), [CELL.x + 0.75, 0.35, railZ0 - 0.1]);
  ext.add(new THREE.Mesh(stops.merge(), M.hazard(2)));

  // ── container (exterior, kinematic) ──────────────────────────────────────
  const cell = new THREE.Group();
  cell.userData.noMerge = true; // Z1: the container drives along the rails
  const startZ = ctx.progress.get('docked', false) ? CELL.dockZ : CELL.parkZ;
  cell.position.set(CELL.x, 0, startZ);
  ext.add(cell);
  const ribs = ribNormalMap();
  ctx.onDispose(() => ribs.dispose());
  // ART-V2 §6.6: the container becomes a ceramic module with rounded edges on a carbon frame. Own
  // material (the shared hull's world-space panels would slide over a moving body); a faint rib.
  const shellMat = new THREE.MeshPhysicalMaterial({ color: 0xd6d3d1, roughness: 0.5, metalness: 0, clearcoat: 0.12, clearcoatRoughness: 0.5, envMapIntensity: 0.8, normalMap: ribs, normalScale: new THREE.Vector2(0.25, 0.25), name: 'prueffeld:cell-shell' });
  ctx.onDispose(() => shellMat.dispose());
  const bodyGeo = new RoundedBoxGeometry(W, Hh - CELL.floor, L, 3, 0.12);
  const body = new THREE.Mesh(bodyGeo, shellMat);
  body.position.y = CELL.floor + (Hh - CELL.floor) / 2;
  body.castShadow = true;
  body.receiveShadow = true;
  cell.add(body);
  const nc = (o: THREE.Object3D): THREE.Object3D => {
    o.traverse((c) => (c.userData.noCollide = true));
    return o;
  };
  // cell details drawn only near the zone (manual detail tier inside the moving exterior group)
  const near = new THREE.Group();
  near.userData.noCollide = true;
  cell.add(near);
  // frame, corner posts, chassis, end doors, hatch recess, roof details
  const trim = new Painter();
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) trim.box(0.12, Hh - CELL.floor + 0.02, 0.12, [sx * (W / 2 - 0.04), CELL.floor + (Hh - CELL.floor) / 2, sz * (L / 2 - 0.04)], 0x1c1917);
  trim.box(W + 0.04, 0.16, L + 0.04, [0, CELL.floor + 0.08, 0], 0x1c1917).box(W + 0.04, 0.1, L + 0.04, [0, Hh - 0.03, 0], 0x1c1917);
  trim.box(W - 0.3, 0.22, L - 0.4, [0, 0.2, 0], 0x141414);
  // ISO corner castings (lighter: reads as a container)
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) for (const y of [CELL.floor + 0.09, Hh - 0.09]) trim.box(0.19, 0.18, 0.19, [sx * (W / 2 - 0.08), y, sz * (L / 2 - 0.08)], 0xc9c4bf);
  // handle arms + screen bezel
  trim.box(0.05, 0.05, 0.36, [-0.62, 1.15, L / 2 + 0.18], 0x1c1917).box(0.05, 0.05, 0.36, [0.62, 1.15, L / 2 + 0.18], 0x1c1917);
  trim.box(0.05, 2.24, 3.89, [-W / 2 - 0.01, 1.62, -0.75], 0x1c1917);
  // wordmark plate on the +z end
  trim.box(1.62, 0.66, 0.012, [0, 2.42, L / 2 + 0.062], 0x141414);
  // +z end: double doors with lock bars
  // ceramic doors with alu lock bars (the dark end read as a black box)
  trim.box(W - 0.3, Hh - CELL.floor - 0.3, 0.03, [0, CELL.floor + (Hh - CELL.floor) / 2, L / 2 + 0.01], 0xcfc9c2);
  for (const x of [-0.6, -0.42, 0.42, 0.6]) trim.box(0.03, Hh - CELL.floor - 0.5, 0.04, [x, CELL.floor + (Hh - CELL.floor) / 2, L / 2 + 0.035], 0xc9c4bf);
  trim.box(0.02, Hh - CELL.floor - 0.3, 0.035, [0, CELL.floor + (Hh - CELL.floor) / 2, L / 2 + 0.03], 0x0c0a09);
  // hatch recess (dark interior)
  trim.box(0.06, 1.42, 1.42, [-W / 2 + 0.02, 1.65, 2.15], 0x0c0a09);
  // printer on the +z end
  trim.box(0.5, 0.16, 0.08, [0.55, 1.45, L / 2 + 0.05], 0x141414);
  trim.box(0.3, 0.012, 0.09, [0.55, 1.46, L / 2 + 0.06], 0x0c0a09);
  // roof: mast base, cable tray
  trim.cyl(0.16, 0.18, 0.3, [0.6, Hh + 0.15, -2.3], 0x1c1917);
  trim.box(0.18, 0.08, 4.0, [0.6, Hh + 0.04, 0.0], 0x1c1917);
  const trimMesh = trim.mesh(M.standard({ vertexColors: true, roughness: 0.45, metalness: 0.3 }), { cast: true });
  cell.add(nc(trimMesh));
  // wheels (instanced, they turn while rolling)
  const wheelGeo = new THREE.CylinderGeometry(0.17, 0.17, 0.1, 16).rotateZ(Math.PI / 2);
  ctx.onDispose(() => wheelGeo.dispose());
  const wheels = new THREE.InstancedMesh(wheelGeo, M.metalDark, 8);
  near.add(wheels);
  const WHEEL_Z = [-2.2, -1.2, 1.2, 2.2];
  const wq = new THREE.Quaternion();
  const wm4 = new THREE.Matrix4();
  const AX = new THREE.Vector3(1, 0, 0);
  const ONE = new THREE.Vector3(1, 1, 1);
  const setWheels = (angle: number): void => {
    let i = 0;
    wq.setFromAxisAngle(AX, angle);
    for (let a = 0; a < 2; a++)
      for (let b = 0; b < WHEEL_Z.length; b++) {
        wm4.compose(V.set(a ? 0.75 : -0.75, 0.28, WHEEL_Z[b]), wq, ONE);
        wheels.setMatrixAt(i++, wm4);
      }
    wheels.instanceMatrix.needsUpdate = true;
  };
  setWheels(0);

  // push handle (+z end) — the interactable
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.3, 14).rotateZ(Math.PI / 2), M.orangePaint);
  handle.position.set(0, 1.15, L / 2 + 0.36);
  near.add(handle);
  // aim target: the 7 cm bar sat ≈ 34° below a level gaze from where you stand to push, so E did
  // nothing and W walked you past the cell (playtest PT-07). An invisible grip zone over the cell's
  // end, eye-high, makes „Messzelle schieben“ show when you face the cell; only the bar lights up.
  const grip = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.15, 0.3), new THREE.MeshBasicMaterial({ visible: false }));
  grip.position.set(0, 0.025, -0.1); // y 0.6–1.75 over the bar, flush with the cell's end
  grip.userData.noCollide = true;
  grip.userData.noHighlight = true;
  handle.add(grip);
  ctx.onDispose(() => {
    grip.geometry.dispose();
    (grip.material as THREE.Material).dispose();
  });

  // EmAI wordmark (exact brand colours, unlit) on the +z end and the +x side
  const wm = makeCanvas(1024, 384);
  ctx.onDispose(() => wm.tex.dispose());
  const drawWordmark = (): void => {
    const g = wm.g;
    g.clearRect(0, 0, 1024, 384);
    g.font = `700 210px ${FONT_DISPLAY}`;
    g.textBaseline = 'alphabetic';
    const wEm = g.measureText('Em').width,
      wAi = g.measureText('AI').width;
    const x0 = (1024 - wEm - wAi) / 2;
    g.fillStyle = '#F5F5F4';
    g.fillText('Em', x0, 214);
    g.fillStyle = '#FF6700';
    g.fillText('AI', x0 + wEm, 214);
    g.fillStyle = '#D6D3D1';
    g.font = `500 52px ${FONT_MONO}`;
    g.textAlign = 'center';
    g.fillText(ctx.t('cellLabel'), 512, 330, 980);
    g.textAlign = 'left';
    wm.tex.needsUpdate = true;
  };
  drawWordmark();
  ctx.i18n.onChange(drawWordmark);
  const wmMat = new THREE.MeshBasicMaterial({ map: wm.tex, transparent: true, toneMapped: false, depthWrite: false });
  ctx.onDispose(() => wmMat.dispose());
  const wmGeo = new Painter();
  const sub = (w: number, h: number, v0: number, v1: number, p: [number, number, number], r: [number, number, number] = [0, 0, 0]): void => {
    const g = new THREE.PlaneGeometry(w, h);
    const uv = g.getAttribute('uv') as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setY(i, v0 + uv.getY(i) * (v1 - v0));
    wmGeo.parts.push(place(g, p, r));
  };
  // +z end: wordmark + label; +x side: wordmark; −x side: label above the hatch
  sub(1.42, 0.37, 1 - 230 / 384, 1, [0, 2.53, L / 2 + 0.07]);
  sub(1.42, 0.17, 0, 1 - 260 / 384, [0, 2.2, L / 2 + 0.07]);
  sub(1.6, 0.42, 1 - 230 / 384, 1, [W / 2 + 0.012, 2.45, -1.6], [0, Math.PI / 2, 0]);
  sub(1.5, 0.18, 0, 1 - 260 / 384, [-W / 2 - 0.012, 2.62, 2.15], [0, -Math.PI / 2, 0]);
  const wmMesh = new THREE.Mesh(wmGeo.merge(), wmMat);
  cell.add(nc(wmMesh));

  // teal status strip on the roof edge (data side)
  const stripMat = new THREE.MeshBasicMaterial({ color: 0x15302c });
  ctx.onDispose(() => stripMat.dispose());
  const strip = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.04, L - 0.4), stripMat);
  strip.position.set(-W / 2 - 0.01, Hh - 0.12, 0);
  near.add(nc(strip)); // a 4 cm trim: near only (Z1)

  // live screen (−x side, faces the line)
  const scr = makeCanvas(1024, 576);
  ctx.onDispose(() => scr.tex.dispose());
  const scrMat = new THREE.MeshBasicMaterial({ map: scr.tex, toneMapped: true });
  ctx.onDispose(() => scrMat.dispose());
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(3.75, 2.1), scrMat);
  screen.position.set(-W / 2 - 0.037, 1.62, -0.75);
  screen.rotation.y = -Math.PI / 2;
  cell.add(nc(screen));

  // hatch (awning) + bay (fold-down platform) + console panel
  const hatchPivot = new THREE.Group();
  hatchPivot.position.set(-W / 2 - 0.02, 2.36, 2.15);
  const hatch = new THREE.Mesh(metricBoxUv(new THREE.BoxGeometry(0.05, 1.42, 1.42), 0.05, 1.42, 1.42, 0.42).translate(0, -0.71, 0), shellMat);
  hatch.castShadow = true;
  hatchPivot.add(hatch);
  const bayPivot = new THREE.Group();
  bayPivot.position.set(-W / 2 - 0.05, 0.06, 2.15);
  const bay = new Painter()
    .box(0.06, 1.25, 1.6, [0, 0.625, 0], 0x3d3a37)
    .mesh(M.standard({ vertexColors: true, roughness: 0.7, metalness: 0.4 }));
  const bayTape = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.1, 1.6), M.hazard(8));
  bayTape.position.set(0, 1.2, 0);
  bayPivot.add(bay, bayTape);
  near.add(hatchPivot, bayPivot);
  const consoleTex = makeCanvas(256, 160);
  ctx.onDispose(() => consoleTex.tex.dispose());
  const drawConsole = (on: boolean): void => {
    const g = consoleTex.g;
    g.fillStyle = '#0c0a09';
    g.fillRect(0, 0, 256, 160);
    if (on) {
      g.strokeStyle = '#2DD4BF';
      g.lineWidth = 3;
      g.beginPath();
      for (let x = 0; x < 236; x += 4) g.lineTo(10 + x, 110 - Math.sin(x * 0.06) * 18 - x * 0.12);
      g.stroke();
      g.fillStyle = '#2DD4BF';
      g.font = `500 18px ${FONT_MONO}`;
      g.fillText(ctx.t('consoleLabel'), 12, 30);
      g.fillStyle = '#A8A29E';
      g.font = `500 13px ${FONT_MONO}`;
      g.fillText('T · VIB · LUX · n', 12, 52);
    }
    consoleTex.tex.needsUpdate = true;
  };
  drawConsole(false);
  ctx.i18n.onChange(() => drawConsole(S.docked));
  const consoleMat = new THREE.MeshBasicMaterial({ map: consoleTex.tex });
  ctx.onDispose(() => consoleMat.dispose());
  // pull-out console desk: slides out of the hatch when docked
  const consoleG = new THREE.Group();
  consoleG.position.set(-W / 2 + 0.62, 0, 2.15);
  const desk = new Painter()
    .box(0.55, 0.05, 1.15, [-0.3, 1.02, 0], 0x292524)
    .box(0.5, 0.42, 0.05, [-0.3, 0.8, 0.55], 0x1c1917)
    .box(0.5, 0.42, 0.05, [-0.3, 0.8, -0.55], 0x1c1917)
    .box(0.06, 0.22, 0.7, [-0.08, 1.15, 0], 0x1c1917)
    .mesh(M.standard({ vertexColors: true, roughness: 0.6, metalness: 0.4 }));
  const consolePanel = new THREE.Mesh(new THREE.PlaneGeometry(0.66, 0.4), consoleMat);
  consolePanel.position.set(-0.3, 1.2, 0);
  consolePanel.rotation.set(0, -Math.PI / 2, 0);
  consolePanel.rotateX(-0.95);
  consoleG.add(desk, consolePanel);
  near.add(consoleG);
  const setConsoleOut = (u: number): void => {
    consoleG.position.x = -W / 2 + 0.62 * (1 - u);
    consoleG.visible = u > 0.02;
  };
  setConsoleOut(startZ === CELL.dockZ ? 1 : 0);

  // sensor mast: three telescoping sections + head (thermal camera, watt meter, antenna)
  const mast = new THREE.Group();
  mast.position.set(0.6, Hh + 0.3, -2.3);
  near.add(mast);
  const SEC = [
    { r: 0.085, l: 1.45 },
    { r: 0.065, l: 1.45 },
    { r: 0.05, l: 1.45 },
  ];
  const secs = SEC.map((s, i) => {
    // ART-V2 §6.6: an alu mast with white sensor pods
    const m = new THREE.Mesh(new THREE.CylinderGeometry(s.r, s.r, s.l, 14).translate(0, s.l / 2, 0), i === 0 ? M.carbon : M.brushedAlu);
    m.castShadow = true;
    mast.add(m);
    return m;
  });
  const head = new Painter()
    .box(0.9, 0.05, 0.08, [0, 0.03, 0], 0xc9c4bf)
    .rbox(0.22, 0.17, 0.27, 0.04, [-0.3, 0.14, 0], 0xe7e5e4)
    .cyl(0.055, 0.055, 0.04, [-0.3, 0.14, -0.15], 0x0c0a09, [Math.PI / 2, 0, 0])
    .rbox(0.16, 0.2, 0.1, 0.03, [0.28, 0.15, 0], 0xe7e5e4)
    .cyl(0.008, 0.008, 0.62, [0.42, 0.34, 0], 0xc9c4bf)
    .mesh(M.standard({ vertexColors: true, roughness: 0.5, metalness: 0.5 }));
  const headG = new THREE.Group();
  headG.add(head);
  const beaconMat = new THREE.MeshBasicMaterial({ color: 0x0f2a26 });
  ctx.onDispose(() => beaconMat.dispose());
  const leds = new Painter();
  leds.parts.push(place(new THREE.SphereGeometry(0.035, 12, 8).toNonIndexed(), [0.42, 0.66, 0]));
  leds.parts.push(place(new THREE.BoxGeometry(0.11, 0.05, 0.004).toNonIndexed(), [0.28, 0.18, -0.052]));
  for (const g of leds.parts) {
    g.deleteAttribute('uv');
    g.setIndex([...Array(g.getAttribute('position').count).keys()]);
  }
  headG.add(new THREE.Mesh(leds.merge(), beaconMat));
  mast.add(headG);
  let mastExt = startZ === CELL.dockZ ? 1 : 0;
  let woke = false;
  const placeMast = (): void => {
    const e = mastExt;
    secs[0].position.y = 0;
    secs[1].position.y = e * (SEC[0].l - 0.12);
    secs[2].position.y = secs[1].position.y + e * (SEC[1].l - 0.12);
    headG.position.y = secs[2].position.y + SEC[2].l * (0.35 + 0.65 * e);
    headG.rotation.y = e * -0.9;
  };
  placeMast();

  // printer paper
  const paperMat = new THREE.MeshStandardMaterial({ color: 0xf5f5f4, roughness: 0.9, side: THREE.DoubleSide, emissive: 0xffffff, emissiveIntensity: 0.15 });
  ctx.onDispose(() => paperMat.dispose());
  const paperPivot = new THREE.Group();
  paperPivot.position.set(0.55, 1.46, L / 2 + 0.1);
  const paper = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.32).translate(0, 0.16, 0).rotateX(Math.PI / 2), paperMat);
  paper.scale.set(1, 1, 0.001);
  paperPivot.add(paper);
  near.add(paperPivot);
  let paperT = -1;
  let paperDone: (() => void) | null = null;

  // kinematic collider (body box) — the group follows the body
  nc(near);
  const kin = ctx.physics.addKinematic(cell, { shape: 'box' });
  let zc = startZ;
  let v = 0;
  let pushArmed = false;
  let restoreSpeed: (() => void) | null = null;
  const rumble = ctx.audio.loop('generator', { at: cell, volume: 0 });

  const handleIa = ctx.addInteractable({
    object: handle,
    label: ctx.i18n.text('ia.handle'),
    hint: ctx.i18n.text('ia.handleHint'),
    range: 2.8,
    isEnabled: () => !S.docked,
    onInteract: () => {
      if (!S.shutterOpen) {
        S.say('emi.shutterFirst');
        S.sfx.denied([CELL.x, 1.2, zc + L / 2]);
        return;
      }
      pushArmed = true;
      if (!ctx.progress.get('pushHint', false)) {
        ctx.progress.set('pushHint', true);
        S.say('emi.pushHint');
      }
      ctx.ui.hint(ctx.i18n.text('ia.handleHint'), 3);
    },
  });
  void handleIa;

  S.onFixed((dt) => {
    if (!S.docked) {
      const holdKey = ctx.input.isDown('KeyE') || ctx.input.isDown('MouseLeft');
      if (!holdKey) pushArmed = false;
      ctx.player.positionLocal(PL);
      const near = Math.hypot(PL.x - CELL.x, PL.z - (zc + L / 2 + 0.36)) < 2.6;
      const pushing = pushArmed && holdKey && near && S.shutterOpen && !ctx.player.operating;
      v = pushing ? Math.min(1.2, v + 2.4 * dt) : Math.max(0, v - 4 * dt);
      if (pushing && !restoreSpeed) restoreSpeed = ctx.player.setSpeedFactor(0.3);
      if (!pushing && restoreSpeed) {
        restoreSpeed();
        restoreSpeed = null;
      }
      if (v > 0) {
        zc = Math.max(CELL.dockZ, zc - v * dt);
        if (zc <= CELL.dockZ) dock();
      }
      // the rail light follows the push: T0 at rest (dim), T1 while the cell rolls
      const g = Math.min(1, v / 0.6);
      if (Math.abs(g - railGlow) > 0.02) {
        railGlow = g;
        LK.tierColor(0x2dd4bf, g, railLightMat.color).multiplyScalar(0.45 + 0.55 * Math.min(1, g * 2));
      }
    }
    KP.set(CELL.x, 0, zc);
    kin.setPose(KP);
  });

  // ── docking sequence ─────────────────────────────────────────────────────
  let dockT = startZ === CELL.dockZ ? 99 : -1;
  const dock = (instant = false): void => {
    if (S.docked) return;
    S.docked = true;
    zc = CELL.dockZ;
    v = 0;
    railGlow = 0;
    LK.tierColor(0x2dd4bf, 0, railLightMat.color).multiplyScalar(0.45);
    pushArmed = false;
    restoreSpeed?.();
    restoreSpeed = null;
    ctx.progress.set('docked', true);
    if (instant) {
      dockT = 99;
      kin.setPose([CELL.x, 0, zc]);
      return;
    }
    dockT = 0;
    S.sfx.clunk([CELL.x, 0.6, CELL.dockZ - L / 2], true);
    ctx.audio.play('land', { at: [CELL.x, 0.4, CELL.dockZ], pitch: 0.6 });
    if (ctx.playerDistance < 30) ctx.player.shake(0.015, 0.35);
    ctx.after(0.45, () => ctx.audio.play('whoosh', { at: [CELL.x - 1.4, 1.2, CELL.dockZ + 2], pitch: 0.7 }));
    ctx.after(1.0, () => S.sfx.rattle([CELL.x, 4.5, CELL.dockZ - 2.3], 1.6));
    ctx.after(2.4, () => S.say('emi.docked'));
    ctx.after(2.6, () => S.refreshObjective());
  };
  if (startZ === CELL.dockZ) S.docked = true;

  S.onFar(() => {
    if (near.visible) near.visible = false;
  });
  S.onUpdate((dt) => {
    near.visible = ctx.playerDistance < 45;
    const moving = v > 0.01;
    rumble.setVolume(moving ? 0.25 + 0.45 * (v / 1.2) : 0, 0.15);
    if (moving) setWheels((CELL.parkZ - zc) / 0.17);
    // docking animation
    if (dockT >= 0 && dockT < 99) {
      dockT += dt;
      const u = (a: number, b: number): number => THREE.MathUtils.smoothstep(dockT, a, b);
      bayPivot.rotation.z = u(0.3, 1.3) * (Math.PI / 2);
      hatchPivot.rotation.z = -u(0.4, 1.4) * 1.72;
      setConsoleOut(u(1.1, 1.9));
      mastExt = u(1.0, 2.8);
      placeMast();
      if (dockT > 1.5 && !woke) {
        woke = true;
        // the cell wakes: status strip T0, the mast beacon a steady T1 point (no blinking)
        LK.tierColor(0x2dd4bf, 0, stripMat.color);
        LK.tierColor(0x2dd4bf, 1, beaconMat.color);
        drawConsole(true);
        screenDirty = true;
      }
      if (dockT > 3) dockT = 99;
    } else if (dockT === 99 && S.docked && bayPivot.rotation.z === 0) {
      bayPivot.rotation.z = Math.PI / 2;
      hatchPivot.rotation.z = -1.72;
      setConsoleOut(1);
      mastExt = 1;
      placeMast();
      woke = true;
      LK.tierColor(0x2dd4bf, 0, stripMat.color);
      LK.tierColor(0x2dd4bf, 1, beaconMat.color);
      drawConsole(true);
      screenDirty = true;
    }
    // printer
    if (paperT >= 0) {
      paperT += dt;
      const e = Math.min(1, paperT / 2);
      paper.scale.z = Math.max(0.001, e);
      paper.rotation.x = 0.55 * e * e;
      if (paperT >= 2 && paperDone) {
        const f = paperDone;
        paperDone = null;
        f();
      }
    }
  });

  // ── measurement (station B) ──────────────────────────────────────────────
  // Phase 5: the first run starts in the vendor's studio light (44 °C, mittel, 8 h: ≈ 74 %); the worst case
  // adds hall light + strong vibration (≈ 65 %). Monte Carlo with this model (4000 pairs of n = 200 runs,
  // artifacts/phase5/zones/calib/p2-mc.ts): re-using your last number as the worst-case guess lands in the
  // band 22 % of the time, a guess of 65 % („harsher → lower“) 95 %. With the old default (hall light,
  // ≈ 69 %) the plain re-use earned ★★★ 66 % of the time.
  const settings: RunSettings = { tempC: 44, vib: 1, light: 'studio', shiftH: 8, n: 200 };
  let run: { s: RunSettings; outcomes: Outcome[]; next: number; rand: () => number; t: number } | null = null;
  let predicted: number | null = ctx.progress.get<number | null>('predicted', null);
  /** the outcome mix shows after a run in this visit of the console */
  let ranThisVisit = false;
  /** the guess for the current run (k of n) */
  let tip: { k: number; n: number } | null = null;
  let lastBlip = 0;
  let screenDirty = true;
  let screenTimer = 0;
  /** debug only: speeds up the fast-forward for automated tests (1 = as designed) */
  let testSpeed = 1;
  const interval = (i: number): number => (i < 10 ? 0.32 : Math.max(0.085, 0.32 - (i - 10) * 0.018)) / testSpeed;

  const result = (s: RunSettings, outcomes: Outcome[]): RunResult => {
    const k = outcomes.filter((o) => o === 'erfolg').length;
    return { settings: { ...s }, outcomes: outcomes.slice(), k, n: outcomes.length, ci: wilson(k, outcomes.length), pm: plusMinusPct(k, outcomes.length) };
  };

  const startRun = async (): Promise<void> => {
    if (run || !S.docked) return;
    const s: RunSettings = { ...settings };
    // „Erst tippen, dann messen“ before every run: ★★ = your guess inside the measured band. The first
    // guess still feeds the Prognose-Güte (recorded once, as before).
    const p = await ctx.ui.predict({
      question: ctx.i18n.text('cell.predict', { n: s.n, t: s.tempC }),
      unit: ctx.t('cell.predictUnit'),
      min: 0,
      max: s.n,
      step: 1,
      initial: Math.round(s.n * (tip ? tip.k / tip.n : 0.85)),
      digits: 0,
    });
    tip = { k: p, n: s.n };
    if (predicted == null) {
      predicted = p;
      ctx.progress.set('predicted', p);
      ctx.progress.set('predictedN', s.n);
    }
    run = { s, outcomes: [], next: 0.4, rand: rng((Date.now() ^ 0x5f3759df) >>> 0), t: 0 };
    ranThisVisit = true;
    S.running = true;
    line.setConditions(s.vib, s.light === 'studio', true);
    ctx.audio.play('click');
    S.sfx.chime([CELL.x - 1.3, 1.8, CELL.dockZ]);
    refreshPanel?.();
  };

  const finishRun = (quiet = false): void => {
    if (!run) return;
    const r = result(run.s, run.outcomes);
    run = null;
    S.running = false;
    line.setConditions(r.settings.vib, r.settings.light === 'studio', false);
    S.lastRun = r;
    ctx.progress.set('lastRun', { s: r.settings, o: r.outcomes.map((o) => OUTCOMES.indexOf(o)).join('') });
    const qualifies = r.n === 200 && r.settings.tempC >= 40;
    if (qualifies) S.qualifyingRun = r;
    // the sign flips to the measured value (split-flap clatter) — watched through the open shutter
    const d = rateDisplay(r.k, r.n);
    const flip = (): void => {
      S.updateSign();
      S.sfx.clatter([-7, 7, -8], 2.2, 1);
      ctx.after(2.3, () => {
        if (qualifies && d.symmetric) S.react('emi.flip', { p: d.p, pm: d.pm }, 'nod');
        else if (r.n < 200 || !d.symmetric) S.react('emi.flipSmall', { k: r.k, n: r.n, lo: d.lo, hi: d.hi });
        else S.react('emi.flipCool', { t: r.settings.tempC });
      });
    };
    const firstFlip = !ctx.progress.get('flipSeen', false) || (qualifies && !ctx.progress.get('flipSeenQ', false));
    if (firstFlip && S.operating === 'cell' && S.shutterOpen) {
      ctx.progress.set('flipSeen', true);
      if (qualifies) ctx.progress.set('flipSeenQ', true);
      S.inBeat = true;
      S.exitOp?.();
      S.cine(
        [
          // fly-through: out of the console view, through the open Rolltor, onto the stage, face the sign
          { t: 0, pos: OP_POSE.pos, look: OP_POSE.look },
          { t: 1.4, pos: [0.4, 2.4, -2.7], look: [-6, 4.5, -6] },
          { t: 2.6, pos: [-2.6, 2.45, -2.4], look: [-7, 6.5, -8] },
          { t: 4.0, pos: [-5.8, 2.5, 3.0], look: [-7, 6.9, -8] },
          { t: 7.6, pos: [-6.2, 2.45, 3.7], look: [-7, 6.9, -8] },
        ],
        { fromPose: true, events: [{ t: 3.4, fn: flip }], onDone: () => (S.inBeat = false) },
      );
    } else flip();
    // Prognose-Güte: once, for the first run after the prediction
    if (predicted != null && !ctx.progress.get('predRecorded', false)) {
      const pn = ctx.progress.get<number>('predictedN', r.n);
      if (pn === r.n) {
        ctx.pass.recordPrediction('unter-last', predicted, r.k, { min: 0, max: r.n, scale: 'linear' });
        ctx.progress.set('predRecorded', true);
      }
    }
    // the first n = 200 run hands out card #2 „Wie viele Versuche?“ (moved here from 03 C, plan §4.7)
    if (r.n === 200) ctx.pass.awardQuestion(2);
    const total = ctx.progress.get<number>('trials', 0) + r.n;
    ctx.progress.set('trials', total);
    ctx.pass.setBest('trialsMeasured', total, 'higher');
    if (qualifies) {
      const value = {
        de: d.symmetric ? `${d.p} % ± ${d.pm} % · n = ${r.n} · ${r.settings.tempC} °C` : `${d.lo}–${d.hi} % · n = ${r.n} · ${r.settings.tempC} °C`,
        en: d.symmetric ? `${d.p}% ± ${d.pm}% · n = ${r.n} · ${r.settings.tempC} °C` : `${d.lo}–${d.hi}% · n = ${r.n} · ${r.settings.tempC} °C`,
      };
      const curve: number[] = [];
      for (let h = 0; h < r.settings.shiftH; h++) {
        let k = 0,
          n = 0;
        r.outcomes.forEach((o, i) => {
          if (Math.floor(trialHour(r.settings, i)) === h) {
            n++;
            if (o === 'erfolg') k++;
          }
        });
        if (n) curve.push(k / n);
      }
      ctx.pass.award('unter-last', { value, curve });
      // the result (FUN-PLAN P2): ★ the stamp; ★★ your guess inside the Wilson band; ★★★ ★★ at the worst
      // case (all four conditions at their harshest). Condition-based, so binomial luck is not rewarded.
      const [, lo, hi] = r.ci;
      const guess = tip && tip.n > 0 ? tip.k / tip.n : null;
      const inBand = guess != null && guess >= lo - 1e-9 && guess <= hi + 1e-9;
      const worst = isWorstCase(r.settings, r.n);
      const stars = (1 + (inBand ? 1 : 0) + (inBand && worst ? 1 : 0)) as Stars;
      const rate = S.rateText(r);
      const showResult = (): void => {
        ch.submit(null, { stars, detail: ctx.i18n.text('game.b.rework', { rate, n: r.n, t: r.settings.tempC, r: Math.round(1000 * (1 - r.k / r.n)) }) });
        if (!quiet) {
          ctx.game.juice.cue('great');
          ctx.game.juice.burst([-7, 6.4, -7.6], { tone: 'teal', count: 36, spread: 2.2 });
        }
      };
      // the banner waits for the sign flip (the fly-through shows it at 3.4 s)
      if (firstFlip && !quiet) ctx.after(4.2, showResult);
      else showResult();
      ctx.after(3, () => S.refreshObjective());
    }
    // the guess against the measurement, right at the cell
    if (tip && tip.n === r.n && !quiet) {
      const [, lo2, hi2] = r.ci;
      const g = tip.k / tip.n;
      const ok = g >= lo2 - 1e-9 && g <= hi2 + 1e-9;
      ctx.game.juice.popup([CELL.x - 1.4, 3.1, CELL.dockZ], ctx.i18n.text(ok ? 'game.b.tipIn' : 'game.b.tipOut', { p: Math.round(g * 100) }), { tone: ok ? 'teal' : 'muted', seconds: 2.4 });
      ctx.game.juice.cue(ok ? 'good' : 'oops', { at: [CELL.x - 1.4, 1.6, CELL.dockZ] });
    }
    screenDirty = true;
    refreshPanel?.();
  };

  S.onUpdate((dt) => {
    if (run) {
      run.t += dt;
      while (run && run.t >= run.next && run.outcomes.length < run.s.n) {
        const i = run.outcomes.length;
        const o = drawTrial(run.s, i, run.rand);
        run.outcomes.push(o);
        const iv = interval(i);
        run.next += iv;
        line.runCycle(o, iv);
        if (ctx.time.elapsed - lastBlip > 0.07) {
          lastBlip = ctx.time.elapsed;
          S.sfx.blip([CELL.x - 1.3, 1.6, CELL.dockZ], o === 'erfolg');
        }
        screenDirty = true;
      }
      if (run && run.outcomes.length >= run.s.n && run.t >= run.next + 0.4) finishRun();
    }
    screenTimer -= dt;
    if (screenDirty && screenTimer <= 0 && ctx.playerDistance < 45) {
      screenDirty = false;
      screenTimer = 0.12;
      drawScreen();
      refreshPanelData?.();
    }
  });

  // ── Kennlinie spec (per shift hour, Wilson band) ──────────────────────────
  const klSpec = (r: { s: RunSettings; outcomes: Outcome[] } | null): KennlinieSpec => {
    const s = r?.s ?? settings;
    const trials: { x: number; k: number; n: number }[] = [];
    let k = 0;
    if (r) {
      for (let h = 0; h < s.shiftH; h++) {
        let kk = 0,
          nn = 0;
        r.outcomes.forEach((o, i) => {
          if (Math.min(s.shiftH - 1, Math.floor(trialHour(s, i))) === h) {
            nn++;
            if (o === 'erfolg') kk++;
          }
        });
        if (nn) trials.push({ x: h + 0.5, k: kk, n: nn });
      }
      k = r.outcomes.filter((o) => o === 'erfolg').length;
    }
    const n = r?.outcomes.length ?? 0;
    return {
      title: ctx.i18n.text('cell.klTitle'),
      xLabel: ctx.i18n.text('cell.klX'),
      yLabel: ctx.i18n.text('cell.klY'),
      chip: 'sim',
      band: 'wilson95',
      percent: true,
      xMin: 0,
      xMax: s.shiftH,
      yMin: 0,
      yMax: 1,
      keyValue: n ? ctx.t('cell.keyValue', { rate: ctx.ui.formatRate(k, n), t: s.tempC }) : undefined,
      series: [{ id: 'messung', label: ctx.i18n.text('cell.klTitle'), trials }],
    };
  };
  const screenKl = ctx.ui.kennlinie(klSpec(null), { target: 'texture', width: 600, height: 352 });
  ctx.onDispose(() => screenKl.remove());

  const drawScreen = (): void => {
    const g = scr.g;
    const W2 = 1024,
      H2 = 576;
    g.fillStyle = '#0f0e0d';
    g.fillRect(0, 0, W2, H2);
    if (!S.docked) {
      // standby (Phase 5): a scope grid, the instruction large, a schematic of cell → line (it was a
      // black 3.75 m screen with one dim line of text)
      g.fillStyle = 'rgba(245,245,244,0.035)';
      for (let x = 0; x <= W2; x += 32) g.fillRect(x, 0, 1, H2);
      for (let y = 0; y <= H2; y += 32) g.fillRect(0, y, W2, 1);
      const [eyebrow, title] = ctx.t('screen.parked').split(' · ');
      g.textAlign = 'left';
      g.textBaseline = 'alphabetic';
      g.fillStyle = '#2DD4BF';
      g.font = `500 22px ${FONT_MONO}`;
      g.fillText(`${ctx.t('screen.title').split(' · ')[0]} · ${eyebrow}`, 48, 130);
      g.fillStyle = '#F5F5F4';
      g.font = `700 60px ${FONT_DISPLAY}`;
      g.fillText(title ?? '', 48, 212);
      // schematic: the cell (box) slides along a dashed path to the line (long bar with stations)
      g.strokeStyle = '#A8A29E';
      g.lineWidth = 3;
      rrect(g, 64, 350, 170, 120, 12);
      g.stroke();
      g.fillStyle = '#A8A29E';
      g.font = `500 18px ${FONT_MONO}`;
      g.fillText('06', 84, 384);
      g.fillStyle = '#FF6700';
      g.fillRect(64, 454, 170, 6);
      g.setLineDash([14, 12]);
      g.strokeStyle = '#2DD4BF';
      g.beginPath();
      g.moveTo(250, 410);
      g.lineTo(560, 410);
      g.stroke();
      g.setLineDash([]);
      g.fillStyle = '#2DD4BF';
      g.beginPath();
      g.moveTo(586, 410);
      g.lineTo(556, 392);
      g.lineTo(556, 428);
      g.closePath();
      g.fill();
      g.fillStyle = '#3D3A37';
      g.fillRect(612, 390, 360, 40);
      g.fillStyle = '#A8A29E';
      for (let k = 0; k < 6; k++) g.fillRect(630 + k * 58, 380, 28, 10);
      scr.tex.needsUpdate = true;
      return;
    }
    const r = run ?? (S.lastRun ? { s: S.lastRun.settings, outcomes: S.lastRun.outcomes } : null);
    const s = r?.s ?? settings;
    // header
    g.fillStyle = '#2DD4BF';
    g.font = `500 20px ${FONT_MONO}`;
    g.textAlign = 'left';
    g.fillText(`${ctx.t('screen.title')}${run ? '  ●' : ''}`, 24, 38);
    g.fillStyle = '#A8A29E';
    g.font = `500 16px ${FONT_MONO}`;
    const vibLabel = ctx.t('cell.vibOpts').split('|')[s.vib].toUpperCase();
    const lightLabel = (s.light === 'studio' ? ctx.t('cell.lightStudio') : ctx.t('cell.lightHall')).toUpperCase();
    g.fillText(ctx.t('screen.cond', { t: s.tempC, v: vibLabel, l: lightLabel, h: s.shiftH, n: s.n }), 24, 64);
    pill(g, 'SIM · LIVE', W2 - 320, 22, '#2DD4BF', 'rgba(45,212,191,0.15)');
    pill(g, ctx.lang === 'de' ? 'ILLUSTRATIV' : 'ILLUSTRATIVE', W2 - 190, 22, '#FBBF24', 'rgba(251,191,36,0.15)');
    // Kennlinie (the kit draws it; copy into the screen)
    screenKl.update(klSpec(r));
    g.drawImage(screenKl.canvas, 16, 84);
    // dot stream
    const n = s.n;
    const cols = n >= 200 ? 20 : n >= 100 ? 14 : n >= 50 ? 10 : 7;
    const pitch = Math.min(17.5, 360 / cols);
    const gx = 640,
      gy = 96;
    g.fillStyle = '#78716C';
    g.font = `500 13px ${FONT_MONO}`;
    g.fillText(ctx.t('screen.dots'), gx, gy - 6);
    const outs = r?.outcomes ?? [];
    for (let i = 0; i < n; i++) {
      const x = gx + (i % cols) * pitch + pitch / 2,
        y = gy + 10 + Math.floor(i / cols) * pitch;
      const o = outs[i];
      g.beginPath();
      g.arc(x, y, pitch * 0.32, 0, Math.PI * 2);
      if (o) {
        g.fillStyle = OUTCOME_COLORS[o];
        g.fill();
      } else {
        g.strokeStyle = '#44403C';
        g.lineWidth = 1.5;
        g.stroke();
      }
    }
    // failure mix
    const my = gy + 18 + Math.ceil(n / cols) * pitch + 10;
    g.fillStyle = '#78716C';
    g.fillText(ctx.t('screen.mix'), gx, my);
    const counts = OUTCOMES.map((o) => outs.filter((x) => x === o).length);
    const maxC = Math.max(1, ...counts);
    OUTCOMES.forEach((o, i) => {
      const y = my + 12 + i * 21;
      g.fillStyle = OUTCOME_COLORS[o];
      g.fillRect(gx, y, 12, 12);
      g.fillStyle = '#D6D3D1';
      g.font = `500 14px ${FONT_MONO}`;
      g.fillText(ctx.t(`outcome.${o}`), gx + 20, y + 11);
      g.fillStyle = 'rgba(214,211,209,0.18)';
      g.fillRect(gx + 190, y + 1, 130, 10);
      g.fillStyle = OUTCOME_COLORS[o];
      g.fillRect(gx + 190, y + 1, (130 * counts[i]) / maxC, 10);
      g.fillStyle = '#F5F5F4';
      g.textAlign = 'right';
      g.fillText(String(counts[i]), gx + 362, y + 11);
      g.textAlign = 'left';
    });
    // bottom: running total, shift clock, torque drift
    const k = counts[0],
      nn = outs.length;
    const by = 470;
    if (nn) {
      const [p, lo, hi] = wilson(k, nn);
      g.fillStyle = '#FF6700';
      g.font = `700 46px ${FONT_DISPLAY}`;
      const big = `${ctx.i18n.num(p * 100)} %`;
      g.fillText(big, 24, by + 14);
      const bw = g.measureText(big).width;
      g.fillStyle = '#FF8534';
      g.font = `500 22px ${FONT_MONO}`;
      g.fillText(`[${ctx.i18n.num(lo * 100)}–${ctx.i18n.num(hi * 100)}] · n = ${nn} · ${s.tempC} °C`, 36 + bw, by + 6);
    } else {
      g.fillStyle = '#78716C';
      g.font = `500 20px ${FONT_MONO}`;
      g.fillText(ctx.t('screen.idle'), 24, by);
    }
    const shiftNow = nn ? trialHour(s, nn - 1) : 0;
    const hh = Math.floor(shiftNow),
      mm = Math.floor((shiftNow - hh) * 60);
    g.fillStyle = '#A8A29E';
    g.font = `500 16px ${FONT_MONO}`;
    g.fillText(`${ctx.t('screen.shift')} ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')} h${run ? '   ' + ctx.t('screen.ff') : ''}`, 24, by + 46);
    // torque drift sparkline (ILLUSTRATIV)
    const dx0 = 24,
      dy0 = by + 64,
      dw = 250,
      dh = 30;
    g.fillStyle = '#78716C';
    g.font = `500 13px ${FONT_MONO}`;
    g.fillText(ctx.t('screen.drift'), dx0 + dw + 16, dy0 + 10);
    const dEnd = torqueDriftPct(s.tempC, s.shiftH);
    g.fillStyle = '#D6D3D1';
    g.fillText(ctx.t('screen.driftNote', { v: ctx.i18n.num(dEnd, 1), h: s.shiftH, t: s.tempC }), dx0 + dw + 16, dy0 + 28);
    g.strokeStyle = '#3D3D3D';
    g.strokeRect(dx0, dy0, dw, dh);
    g.strokeStyle = '#FBBF24';
    g.lineWidth = 2;
    g.beginPath();
    for (let i = 0; i <= 20; i++) {
      const th = (i / 20) * s.shiftH;
      const dv = torqueDriftPct(s.tempC, th) / 15;
      const x = dx0 + (i / 20) * dw,
        y = dy0 + dh - Math.min(1, dv) * dh;
      if (i) g.lineTo(x, y);
      else g.moveTo(x, y);
    }
    g.stroke();
    g.lineWidth = 1;
    scr.tex.needsUpdate = true;
  };
  drawScreen();
  ctx.i18n.onChange(() => {
    screenDirty = true;
  });

  // ── info card B (with Befundkarte) ───────────────────────────────────────
  const cardSpecB = (): InfoCardSpec => {
    const r = S.qualifyingRun ?? S.lastRun ?? result(settings, ['erfolg']);
    const d = rateDisplay(r.k, r.n);
    // value: "69 % ± 6 %" (or the interval for a skewed sample), localised lazily
    // (a function Text re-resolves on language and mode changes; ctx.t uses the live language)
    const tx = (key: string): Text => () => ctx.t(key, { p: d.p, value: S.rateText(r), n: r.n, t: r.settings.tempC });
    return {
      eyebrow: ctx.i18n.text('cardB.eyebrow'),
      title: tx('cardB.title'),
      body: [tx('cardB.body'), ctx.i18n.text('cardB.model')],
      metrics: [
        { label: ctx.i18n.text('cardB.m1'), value: d.p, unit: '%', note: `[${d.lo}–${d.hi}] · n = ${r.n} · ${r.settings.tempC} °C` },
        { label: ctx.i18n.text('cardB.m2'), value: 100, unit: '%', note: { de: '[57–100] · n = 5 · FIKTION', en: '[57–100] · n = 5 · FICTION' } },
      ],
      illustrative: true,
      illustrativeNote: { de: 'Spielzeugmodell: simulierte Griffe, keine echten Robotermessungen.', en: 'Toy model: simulated picks, not real robot measurements.' },
      // the line of the retired „200 Griffe“ that card #2 carries now (plan §4.7)
      bullets: [ctx.i18n.text('cardB.wilson')],
      entdecker: { bullets: [ctx.i18n.text('cardB.wilson'), ctx.i18n.text('cardB.curious')] },
      // Entscheider: the toy-model note moves into the Befundkarte's "Grenze" line
      entscheider: {
        body: [tx('cardB.body')],
        forDecisionMakers: {
          title: ctx.i18n.text('cardB.fdmTitle'),
          bullets: [tx('cardB.f2'), ctx.i18n.text('cardB.f3'), ctx.i18n.text('cardB.f4')],
        },
      },
      diagram: {
        aspect: 4 / 3,
        caption: { de: 'Wilson-95-%-Intervall: je mehr n, desto schmaler', en: 'Wilson 95 % interval: more n, narrower' },
        draw(g, w, h) {
          const rows: [number, number][] = [
            [5, 5],
            [16, 20],
            [80, 100],
            [r.k, r.n],
          ];
          const pad = 18;
          g.font = '12px "Geist Mono", monospace';
          rows.forEach(([k, n], i) => {
            const [pp, lo, hi] = wilson(k, n);
            const y = pad + 16 + i * ((h - pad * 2) / rows.length);
            const X = (v2: number): number => 70 + v2 * (w - 90);
            g.fillStyle = '#A8A29E';
            g.fillText(`${k}/${n}`, 4, y + 4);
            g.fillStyle = 'rgba(45,212,191,0.25)';
            g.fillRect(X(lo), y - 7, X(hi) - X(lo), 14);
            g.fillStyle = i === 3 ? '#FF6700' : '#F5F5F4';
            g.beginPath();
            g.arc(X(pp), y, 4, 0, Math.PI * 2);
            g.fill();
          });
          g.strokeStyle = '#3D3D3D';
          for (const v2 of [0, 0.5, 1]) {
            const x = 70 + v2 * (w - 90);
            g.beginPath();
            g.moveTo(x, pad);
            g.lineTo(x, h - pad);
            g.stroke();
            g.fillStyle = '#78716C';
            g.fillText(`${v2 * 100} %`, x - 14, h - 4);
          }
        },
      },
    };
  };
  // the challenge „Falsifiziere die 100 %“ (FUN-PLAN P2)
  const ch: ChallengeHandle = ctx.game.challenge({
    id: 'unter-last',
    title: ctx.i18n.text('game.b.title'),
    goals: [{ text: ctx.i18n.text('game.b.g1') }, { text: ctx.i18n.text('game.b.g2') }, { text: ctx.i18n.text('game.b.g3') }],
    lesson: ctx.i18n.text('game.b.lesson'),
    why: cardSpecB,
    retry: () => {
      if (S.docked && S.operating !== 'cell') operate();
    },
    emi: S.emi ?? undefined,
  });

  // ── console → operate panel ──────────────────────────────────────────────
  let refreshPanel: (() => void) | null = null;
  let refreshPanelData: (() => void) | null = null;
  const operate = (): void => {
    if (!S.docked) {
      S.say('emi.measureFirst');
      return;
    }
    S.operating = 'cell';
    ranThisVisit = false;
    line.setProduction(false);
    // the hall lights show the light you set (the shutter opened them to the hall)
    S.lights?.set('hall', settings.light === 'studio');
    S.exitOp = ctx.player.enterOperate({
      title: ctx.i18n.text('cell.eyebrow'),
      cameraPose: { position: OP_POSE.pos, lookAt: OP_POSE.look },
      panelPosition: 'right',
      panel: (el) => {
        el.style.width = '410px';
        const head = document.createElement('div');
        const ctrls = document.createElement('div');
        ctrls.style.cssText = 'display:grid;grid-template-columns:96px 1fr;gap:7px 10px;align-items:center;margin-top:10px;font-size:13px';
        const row2 = document.createElement('div');
        row2.className = 'op-row';
        const klHost = document.createElement('div');
        const mix = document.createElement('div');
        mix.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px 10px;margin-top:6px;font-size:11.5px';
        mix.className = 'mono';
        const foot = document.createElement('div');
        foot.style.cssText = 'margin-top:8px;font-size:12px;color:var(--text-3);display:flex;gap:8px;align-items:center;flex-wrap:wrap';
        el.append(head, ctrls, row2, klHost, mix, foot);
        const label = (t: string): HTMLElement => {
          const l = document.createElement('span');
          l.style.color = 'var(--text-2)';
          l.textContent = t;
          return l;
        };
        const seg = (opts: string[], cur: number, on: (i: number) => void): HTMLElement => {
          const s2 = document.createElement('div');
          s2.className = 'seg';
          opts.forEach((o, i) => {
            const b = document.createElement('button');
            b.textContent = o;
            b.className = i === cur ? 'on' : '';
            b.onclick = () => {
              if (run) return;
              on(i);
              ctx.audio.play('click');
              render();
            };
            s2.append(b);
          });
          return s2;
        };
        const slider = (min: number, max: number, val: number, unit: string, on: (v2: number) => void): HTMLElement => {
          const wrap = document.createElement('div');
          wrap.style.cssText = 'display:flex;gap:10px;align-items:center';
          const inp = document.createElement('input');
          inp.type = 'range';
          inp.min = String(min);
          inp.max = String(max);
          inp.step = '1';
          inp.value = String(val);
          inp.style.cssText = 'flex:1;accent-color:var(--orange)';
          const out = document.createElement('span');
          out.className = 'mono';
          out.style.cssText = 'min-width:52px;text-align:right;color:var(--text)';
          out.textContent = `${val} ${unit}`;
          inp.oninput = () => {
            if (run) {
              inp.value = String(val);
              return;
            }
            const v2 = Number(inp.value);
            out.textContent = `${v2} ${unit}`;
            on(v2);
            screenDirty = true;
          };
          wrap.append(inp, out);
          return wrap;
        };
        let kl: ReturnType<typeof ctx.ui.kennlinie> | null = null;
        // Entscheider: a shorter setup, the conditions are preset (plan §4.7); „ändern ▸“ opens the five rows
        let showSettings = ctx.mode !== 'entscheider';
        const render = (): void => {
          // ≤ 50 visible words at open: goal chips (they carry the stamp rule), the five settings, „Messen“
          head.replaceChildren(ch.chips());
          const chips = document.createElement('div');
          chips.style.cssText = 'display:flex;gap:6px;margin-top:6px';
          chips.append(ctx.ui.chip('sim'), ctx.ui.chip('illustrativ', ctx.i18n.text('cell.model')));
          head.append(chips);
          const preset = document.createElement('div');
          preset.style.cssText = 'grid-column:1/-1;display:flex;gap:8px;align-items:center;flex-wrap:wrap;color:var(--text-2)';
          preset.dataset.chip = 'ui';
          if (!showSettings) {
            const more = document.createElement('button');
            more.className = 'btn ghost';
            more.style.cssText = 'font-size:12px;padding:3px 8px';
            more.textContent = ctx.t('cell.change');
            more.onclick = () => {
              showSettings = true;
              render();
            };
            preset.append(document.createTextNode(ctx.t('cell.preset', { t: settings.tempC, h: settings.shiftH, n: settings.n })), more);
            ctrls.replaceChildren(preset);
          } else ctrls.replaceChildren(
            label(ctx.t('cell.temp')),
            slider(T_MIN, T_MAX, settings.tempC, '°C', (v2) => (settings.tempC = v2)),
            label(ctx.t('cell.vib')),
            seg(ctx.t('cell.vibOpts').split('|'), settings.vib, (i) => (settings.vib = i as Vib)),
            label(ctx.t('cell.light')),
            seg([ctx.t('cell.lightStudio'), ctx.t('cell.lightHall')], settings.light === 'studio' ? 0 : 1, (i) => {
              settings.light = i === 0 ? 'studio' : 'halle';
              S.lights?.set('hall', settings.light === 'studio');
            }),
            label(ctx.t('cell.shift')),
            slider(1, 8, settings.shiftH, 'h', (v2) => (settings.shiftH = v2)),
            label(ctx.t('cell.n')),
            seg(['20', '50', '100', '200'], [20, 50, 100, 200].indexOf(settings.n), (i) => (settings.n = [20, 50, 100, 200][i])),
          );
          row2.replaceChildren();
          const go = document.createElement('button');
          go.className = 'btn primary';
          go.style.cssText = 'padding:9px 18px';
          go.textContent = run ? ctx.t('cell.measuring', { i: run.outcomes.length, n: run.s.n }) : ctx.t('cell.measure');
          go.disabled = !!run;
          go.onclick = () => void startRun();
          row2.append(go);
          // the card (± explained) is the challenge's why(): [H] in the banner or the Pass (≤ 50 words here)
          renderData();
        };
        const renderData = (): void => {
          const r = run ?? (S.lastRun ? { s: S.lastRun.settings, outcomes: S.lastRun.outcomes } : null);
          const spec = klSpec(r);
          if (!kl) kl = ctx.ui.kennlinie(spec, { parent: klHost, width: 370, height: 168 });
          else kl.update(spec);
          // ≤ 35 words at open (plan §4): the Kennlinie shows once something ran in this visit
          klHost.style.display = run || ranThisVisit ? '' : 'none';
          const goBtn = row2.querySelector('button.primary') as HTMLButtonElement | null;
          if (goBtn && run) goBtn.textContent = ctx.t('cell.measuring', { i: run.outcomes.length, n: run.s.n });
          const outs = r?.outcomes ?? [];
          mix.style.display = r && (run || ranThisVisit) ? 'flex' : 'none';
          mix.replaceChildren(
            ...OUTCOMES.map((o) => {
              const sp = document.createElement('span');
              sp.innerHTML = `<i style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${OUTCOME_COLORS[o]};margin-right:5px"></i>${ctx.t(`outcome.${o}`)} ${outs.filter((x) => x === o).length}`;
              sp.style.color = 'var(--text-2)';
              return sp;
            }),
          );
          foot.textContent = '';
          foot.title = r ? ctx.t('cell.stampHint') : ctx.t('cell.noRun');
        };
        refreshPanel = render;
        refreshPanelData = renderData;
        render();
        return () => {
          refreshPanel = null;
          refreshPanelData = null;
          kl?.remove();
          kl = null;
        };
      },
      onExit: () => {
        S.operating = null;
        if (!run) line.setProduction(true);
      },
    });
  };
  ctx.addInteractable({ object: consolePanel, label: ctx.i18n.text('ia.console'), hint: ctx.i18n.text('ia.consoleHint'), range: 2.6, isEnabled: () => S.docked, onInteract: operate });

  // restore the last run (sign + screen) from storage
  const saved = ctx.progress.get<{ s: RunSettings; o: string } | null>('lastRun', null);
  if (saved && saved.s && typeof saved.o === 'string') {
    const outs = saved.o.split('').map((c) => OUTCOMES[Number(c)] ?? 'teil');
    S.lastRun = result(saved.s, outs);
    if (S.lastRun.n === 200 && S.lastRun.settings.tempC >= 40) S.qualifyingRun = S.lastRun;
    S.updateSign(true);
  }

  ctx.debug.register('fast', () => {
    testSpeed = 5;
  });
  return {
    challenge: ch,
    dock,
    paperObject: paperPivot,
    handleObject: handle,
    goToHandle() {
      ctx.player.teleport([CELL.x, 0, zc + L / 2 + 1.1], { yawDeg: 0 });
    },
    solve(worst = false) {
      if (!S.docked) dock(true);
      const s: RunSettings = worst ? { tempC: T_MAX, vib: 2, light: 'halle', shiftH: 8, n: 200 } : { tempC: 44, vib: 1, light: 'halle', shiftH: 8, n: 200 };
      // ★★★ hook: a guess at the model's expected rate (inside the band); the plain solve guesses nothing
      tip = worst ? { k: Math.round(200 * expectedRate(s)), n: 200 } : null;
      const rand = rng(20261015);
      const outs: Outcome[] = [];
      for (let i = 0; i < s.n; i++) outs.push(drawTrial(s, i, rand));
      if (predicted == null) {
        predicted = 150;
        ctx.progress.set('predicted', 150);
        ctx.progress.set('predictedN', 200);
      }
      run = { s, outcomes: outs, next: 0, rand, t: 999 };
      finishRun(true);
      return S.lastRun!;
    },
    print(onDone) {
      paperT = 0;
      paper.scale.z = 0.001;
      paperDone = onDone;
      S.sfx.buzz([CELL.x + 0.55, 1.46, zc + L / 2 + 0.1], 2.0);
    },
  };
}

function pill(g: CanvasRenderingContext2D, text: string, x: number, y: number, fg: string, bg: string): void {
  g.font = `500 14px ${FONT_MONO}`;
  const w = g.measureText(text).width + 22;
  g.fillStyle = bg;
  rrect(g, x, y, w, 24, 12);
  g.fill();
  g.strokeStyle = fg;
  g.globalAlpha = 0.5;
  g.stroke();
  g.globalAlpha = 1;
  g.fillStyle = fg;
  g.fillText(text, x + 11, y + 17);
}
