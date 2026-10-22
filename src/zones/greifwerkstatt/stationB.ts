/**
 * Station B „Das Ei" (Verstehen), GDD §7.3.
 *
 * A real-scale parallel-jaw gripper (0–120 mm) on a small gantry over a bench at local (−7, 0, 4).
 *  B1 „Nur Position":   hold LMB → jaws close at 10 mm/s, no force display (the robot only knows
 *                       where its jaws are). F_N = k·δ, k = 8 N/mm. ≥ 30 N cracks the egg.
 *  B2 „Kraftsensor":    the same, plus a live force graph (2–8 N band) and a creak at 200 + 20·F Hz.
 *  B3 „Kraftregelung":  one button: a force PI loop at 1 kHz holds 5 N → always succeeds.
 *  Reibungstisch:       object × pad × lift acceleration × grip force (force-controlled). Hold if
 *                       2μF_N ≥ m(g + a); friction cones (half-angle atan μ) and force arrows show it.
 * A crack bursts 40 shards + yolk and plays a 0.25× slow-motion replay with the force curve.
 * Dropped objects fall in a private Rapier world. The giant arm's fingers squeeze with F_N.
 */
import * as THREE from 'three';
import type { InfoCardSpec } from '@/core/zones';
import type RAPIER from '@dimforge/rapier3d-compat';
import { COL, type Ctx, box, clamp, cyl, h, kLabel, merge, paint, panelRoot, seg, setShadow } from './shared';
import { ForcePI, G, GRIPPER_MAX_N, JAW_MAX, K_PAD, LiftSim, MU, OBJECTS, type ObjectId, type PadId, CLOSE_SPEED, requiredForce } from './grip';
import { eggGeometry } from './giantArm';
import type { Sfx } from './sfx';
import type { Shards } from './shards';
import { FLOOR_H } from './shell';

const WX = -7.0,
  WZ = 4.05;
const BENCH_TOP = FLOOR_H + 0.9;
const MAT_Y = BENCH_TOP + 0.008;
const BEAM_Y = MAT_Y + 0.78;
const CUP_H = 0.006; // the egg stands in a low ring
/** jaw-pad centre height above the object's bottom (m) */
const GRIP_H: Record<ObjectId, number> = { ei: CUP_H + 0.0285, stahl: 0.042, glas: 0.072, mehl: 0.14 };
const HIST = 480; // force history samples (≈ 8 s at 60 Hz)

type Sub = 'b1' | 'b2' | 'b3' | 'rt';
type Phase = 'ready' | 'auto' | 'lift' | 'hold' | 'lower' | 'broken' | 'replay' | 'drop' | 'empty';

export interface StationB {
  update(dt: number, elapsed: number): void;
  readonly done: boolean;
  /** current grip force (N) for the giant arm */
  readonly force: number;
  debug: {
    enter(): void;
    setSub(s: Sub): void;
    /** B1/B2: close until F ≥ f (or contact), then release */
    squeezeTo(f: number): Promise<void>;
    lift(): Promise<string>;
    grip5(): Promise<string>;
    rt(o: { obj: ObjectId; pad: PadId; a: number; f: number }): Promise<string>;
    reset(): void;
    solve(): Promise<void>;
    /** debug: solve + five intact eggs in a row in B2 inside the band (★★★) */
    stars3(): Promise<void>;
    state(): Record<string, unknown>;
  };
}

export function buildStationB(
  ctx: Ctx,
  sfx: Sfx,
  shards: Shards,
  hooks: { onStamp(): void; say(key: string): void; onUse(): void; crack(): void },
): StationB {
  const M = ctx.materials;
  const det = ctx.groups.detail;
  const vc = M.standard({ vertexColors: true, metalness: 0.35, roughness: 0.6 });

  // ── bench, mat, shelf, gantry, control panel (one merged mesh) ─────────────
  const benchParts: THREE.BufferGeometry[] = [
    paint(box(3.0, 0.06, 1.2, WX, BENCH_TOP - 0.03, 4.0), 0xd6d3d1),
    paint(box(3.0, 0.08, 0.04, WX, BENCH_TOP - 0.07, 4.62), COL.chassis),
    ...[-1.42, 1.42].flatMap((dx) => [-0.52, 0.52].map((dz) => paint(box(0.08, 0.86, 0.08, WX + dx, FLOOR_H + 0.43, 4.0 + dz), 0xc9c4bf))),
    paint(box(2.9, 0.04, 1.1, WX, FLOOR_H + 0.22, 4.0), COL.structure),
    // rubber mat
    paint(box(0.7, 0.008, 0.5, WX, BENCH_TOP + 0.004, WZ), 0x262321),
    // egg cup ring (stays on the mat)
    paint(new THREE.TorusGeometry(0.017, 0.0035, 6, 20).rotateX(Math.PI / 2).translate(WX, MAT_Y + 0.003, WZ), COL.chassis),
    // shelf at the back
    paint(box(2.8, 0.025, 0.26, WX, MAT_Y + 0.12, 3.58), COL.chassis),
    ...[-1.35, 0, 1.35].map((dx) => paint(box(0.03, 0.12, 0.2, WX + dx, MAT_Y + 0.06, 3.58), COL.chassis)),
    // gantry posts + beam
    ...[-1.15, 1.15].map((dx) => paint(box(0.09, BEAM_Y - BENCH_TOP + 0.05, 0.09, WX + dx, (BEAM_Y + BENCH_TOP) / 2, 3.66), 0xc9c4bf)),
    paint(box(2.42, 0.1, 0.12, WX, BEAM_Y, 3.66), 0xc9c4bf),
    paint(box(2.3, 0.02, 0.02, WX, BEAM_Y + 0.06, 3.72), COL.steel),
    // carriage on the beam
    paint(box(0.2, 0.16, 0.16, WX, BEAM_Y, 3.78), COL.shell),
    paint(box(0.06, 0.12, 0.5, WX, BEAM_Y, 3.95), COL.shell),
  ];
  const bench = new THREE.Mesh(merge(benchParts), vc);
  setShadow(bench, true);
  det.add(bench);
  ctx.physics.addStaticBox({ size: [3.05, BENCH_TOP, 1.25], position: [WX, BENCH_TOP / 2, 4.0] });
  // control panel on the front right of the bench: panel + knob form ONE interactable, so aiming at
  // either the teal screen or the glowing knob works (the knob alone is a 7 cm target)
  const consoleGroup = new THREE.Group();
  consoleGroup.position.set(WX + 1.05, BENCH_TOP + 0.08, 4.47);
  det.add(consoleGroup);
  const consoleMesh = new THREE.Mesh(
    merge([paint(box(0.56, 0.2, 0.3, 0, 0, 0, -0.5), COL.chassis), paint(box(0.46, 0.012, 0.18, 0, 0.105, -0.02, -0.5), COL.teal)]),
    vc,
  );
  consoleGroup.add(consoleMesh);
  const panelKnob = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.03, 18), M.accentOrange);
  panelKnob.position.set(0.15, 0.12, -0.04);
  panelKnob.rotation.x = -0.5;
  consoleGroup.add(panelKnob);
  ctx.lights.point([WX - 0.35, MAT_Y + 0.75, WZ + 0.3], { color: 0xffe4c4, intensity: 1.1, distance: 1.9 });

  // ── gripper: Z rod + body (shell) + two fingers with exchangeable pads ─────
  const gripper = new THREE.Group();
  det.add(gripper);
  const body = new THREE.Mesh(
    merge([
      paint(box(0.15, 0.05, 0.07, 0, 0.135, 0), COL.shell),
      paint(box(0.16, 0.014, 0.074, 0, 0.112, 0), COL.chassis),
      paint(box(0.06, 0.012, 0.072, 0, 0.162, 0), COL.shellShadow),
      paint(cyl(0.014, 0.014, 0.7, 12, 0, 0.51, 0), COL.steel),
    ]),
    vc,
  );
  gripper.add(body);
  const fingerGeo = merge([paint(box(0.014, 0.12, 0.04, 0, 0.04, 0), COL.shell), paint(box(0.015, 0.018, 0.041, 0, -0.012, 0), COL.shellShadow), paint(box(0.026, 0.02, 0.05, 0, 0.105, 0), COL.chassis)]);
  const fingerL = new THREE.Mesh(fingerGeo, vc);
  const fingerR = new THREE.Mesh(fingerGeo, vc);
  gripper.add(fingerL, fingerR);
  const padGeo = new THREE.BoxGeometry(0.005, 0.034, 0.04);
  const PAD_MAT: Record<PadId, THREE.Material> = { stahl: M.steel, gummi: M.rubber, silikon: M.standard({ color: 0xd6d3d1, roughness: 0.55, metalness: 0 }) };
  const padL = new THREE.Mesh(padGeo, PAD_MAT.gummi);
  const padR = new THREE.Mesh(padGeo, PAD_MAT.gummi);
  gripper.add(padL, padR);
  // jaw-centre reference: the pads' centres sit at gripper-local y = 0 → the gripper origin is the grip point

  // ── objects ────────────────────────────────────────────────────────────────
  const objMeshes: Record<ObjectId, THREE.Object3D> = {
    ei: new THREE.Mesh(eggGeometry(0.022, 0.0285, 28, 18), M.standard({ color: 0xe6dccb, roughness: 0.8, metalness: 0 })),
    stahl: new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.084, 0.055), M.steel),
    glas: (() => {
      const g = new THREE.Group();
      const shell = new THREE.Mesh(merge([new THREE.CylinderGeometry(0.0355, 0.0335, 0.105, 28, 1, true), new THREE.CylinderGeometry(0.0335, 0.0335, 0.006, 28).translate(0, -0.05, 0)]), M.glass);
      const water = new THREE.Mesh(new THREE.CylinderGeometry(0.0335, 0.032, 0.06, 24).translate(0, -0.02, 0), M.standard({ color: 0xc9d1cf, transparent: true, opacity: 0.32, roughness: 0.05, metalness: 0 }));
      water.renderOrder = 1;
      g.add(water, shell);
      return g;
    })(),
    mehl: (() => {
      const geo = new THREE.BoxGeometry(0.1, 0.24, 0.17, 3, 6, 4);
      const pa = geo.getAttribute('position');
      for (let i = 0; i < pa.count; i++) {
        const x = pa.getX(i),
          y = pa.getY(i),
          z = pa.getZ(i);
        const bulge = 1 + 0.09 * (1 - (y / 0.12) ** 2) * (1 - Math.abs(z) / 0.17);
        pa.setXYZ(i, x * bulge, y, z * (1 + 0.05 * (1 - (y / 0.12) ** 2)));
      }
      geo.computeVertexNormals();
      return new THREE.Mesh(geo, M.standard({ color: 0xd8ccb4, roughness: 0.96, metalness: 0 }));
    })(),
  };
  const SHELF_X: Record<ObjectId, number> = { ei: WX - 1.0, stahl: WX - 0.45, glas: WX + 0.4, mehl: WX + 0.95 };
  for (const id of Object.keys(objMeshes) as ObjectId[]) {
    const o = objMeshes[id];
    det.add(o); // small props: no shadow casting (GDD §9.4)
  }
  const centreOffset = (id: ObjectId): number => OBJECTS[id].height / 2000 + (id === 'ei' ? CUP_H : 0);
  const placeOnShelf = (id: ObjectId): void => {
    objMeshes[id].position.set(SHELF_X[id], MAT_Y + 0.1325 + OBJECTS[id].height / 2000, 3.58);
    objMeshes[id].rotation.set(0, 0, 0);
    objMeshes[id].visible = true;
  };
  const yolkPool = new THREE.Mesh(new THREE.CircleGeometry(1, 28).rotateX(-Math.PI / 2), M.standard({ color: 0xe9a23b, roughness: 0.18, metalness: 0, transparent: true, opacity: 0.92 }));
  yolkPool.visible = false;
  det.add(yolkPool);
  const glassShardColor = 0xcfd4d2;

  // ── overlays: friction cones (instanced ×2) + force arrows (instanced ×3), drawn on top ──
  const coneGeo = new THREE.ConeGeometry(1, 1, 28, 1, true).translate(0, -0.5, 0).rotateZ(Math.PI / 2);
  const coneMat = new THREE.MeshBasicMaterial({ color: 0x2dd4bf, transparent: true, opacity: 0.2, depthTest: false, depthWrite: false, side: THREE.DoubleSide });
  const cones = new THREE.InstancedMesh(coneGeo, coneMat, 2);
  cones.renderOrder = 10;
  cones.frustumCulled = false;
  det.add(cones);
  const coneEdgeGeo = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(8 * 3), 3));
  const coneEdgeMat = new THREE.LineBasicMaterial({ color: 0x2dd4bf, transparent: true, opacity: 0.85, depthTest: false });
  const coneEdges = new THREE.LineSegments(coneEdgeGeo, coneEdgeMat);
  coneEdges.renderOrder = 11;
  coneEdges.frustumCulled = false;
  det.add(coneEdges);
  const arrowGeo = merge([new THREE.CylinderGeometry(0.06, 0.06, 0.78, 8).rotateZ(-Math.PI / 2).translate(0.39, 0, 0), new THREE.ConeGeometry(0.16, 0.24, 12).rotateZ(-Math.PI / 2).translate(0.88, 0, 0)]);
  const arrowMat = new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false, transparent: true });
  const arrows = new THREE.InstancedMesh(arrowGeo, arrowMat, 3);
  arrows.renderOrder = 12;
  arrows.frustumCulled = false;
  det.add(arrows);
  ctx.onDispose(() => {
    coneMat.dispose();
    coneEdgeMat.dispose();
    arrowMat.dispose();
  });

  // ── in-world force screen on the gantry (canvas, redrawn ≤ 15 Hz) ──────────
  const SW = 512,
    SH = 256;
  const screenCanvas = document.createElement('canvas');
  screenCanvas.width = SW;
  screenCanvas.height = SH;
  const screenTex = new THREE.CanvasTexture(screenCanvas);
  screenTex.colorSpace = THREE.SRGBColorSpace;
  ctx.onDispose(() => screenTex.dispose());
  const screenMat = new THREE.MeshBasicMaterial({ map: screenTex, toneMapped: false });
  ctx.onDispose(() => screenMat.dispose());
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.8), screenMat);
  screen.position.set(WX, BEAM_Y + 0.58, 3.64);
  det.add(screen);
  const screenFrame = new THREE.Mesh(
    merge([box(1.68, 0.88, 0.05, WX, BEAM_Y + 0.58, 3.61), box(0.05, 0.2, 0.05, WX - 0.6, BEAM_Y + 0.1, 3.64), box(0.05, 0.2, 0.05, WX + 0.6, BEAM_Y + 0.1, 3.64)]),
    M.steel,
  );
  det.add(screenFrame);

  // ── private physics world for dropped objects ─────────────────────────────
  const R = ctx.physics.rapier;
  const pw = ctx.physics.createPrivateWorld({ gravity: { x: 0, y: -G, z: 0 } });
  pw.createCollider(R.ColliderDesc.cuboid(1.5, 0.05, 0.6).setTranslation(WX, MAT_Y - 0.05, 4.0).setFriction(0.8).setRestitution(0.05));
  pw.createCollider(R.ColliderDesc.cuboid(3, 0.05, 3).setTranslation(WX, FLOOR_H - 0.05, 4.0).setFriction(0.8));
  let dropBody: RAPIER.RigidBody | null = null;

  // ── state ─────────────────────────────────────────────────────────────────
  let sub: Sub = 'b1';
  let objId: ObjectId = 'ei';
  let pad: PadId = 'gummi';
  let accel = 2;
  let fSet = 10;
  const unlocked = { b2: false, b3: false, rt: false };
  if (ctx.pass.has('ei')) unlocked.b2 = unlocked.b3 = unlocked.rt = true;
  let phase: Phase = 'ready';
  let jaw = 64; // mm
  let force = 0;
  let closeIn: -1 | 0 | 1 = 0;
  let pi: ForcePI | null = null;
  let settle = 0;
  let lift: LiftSim | null = null;
  let liftDrop = 0; // gripper height offset (m) while lifting/lowering
  let objLift = 0;
  let holdT = 0;
  let peak = 0;
  let slipSounded = false;
  let resultText = '';
  let resultTone: 'good' | 'bad' | '' = '';
  let operating = false;
  let done = ctx.pass.has('ei');
  let eggIntact = done;
  let eggHoldForce = 0;
  let rtLifts = done ? 3 : 0;
  const rtObjects = new Set<ObjectId>();
  let rtSlips = done ? 1 : 0;
  let slipCase: { obj: ObjectId; pad: PadId; req: number } | null = null;
  // ── „Eier-Serie" (FUN-PLAN G2) ────────────────────────────────────────────
  // ★ the stamp (one egg intact + one slip on the friction table) · ★★ 3 intact eggs in a row in B2 ·
  // ★★★ 5 in a row in B2 with every grip inside the band (3–7 N). Tally of all eggs on screen.
  const BAND: [number, number] = [3, 7];
  const tallySaved = ctx.progress.get<{ ok: number; broken: number; best: number; bestBand: number }>('bTally', { ok: 0, broken: 0, best: 0, bestBand: 0 });
  const tally = { ...tallySaved, streak: 0, band: 0 };
  const saveTally = (): void => ctx.progress.set('bTally', { ok: tally.ok, broken: tally.broken, best: tally.best, bestBand: tally.bestBand });
  const starsG2 = (): 0 | 1 | 2 | 3 => (!ctx.pass.has('ei') || ctx.progress.get('bSkipped', false) ? 0 : ((1 + (tally.best >= 3 ? 1 : 0) + (tally.best >= 3 && tally.bestBand >= 5 ? 1 : 0)) as 1 | 2 | 3));
  let shownG2 = (ctx.game.stars('greifwerkstatt').byStation['ei'] ?? 0) as number;
  const chB = ctx.game.challenge({
    id: 'ei',
    title: ctx.i18n.text('game.b.title'),
    metric: { label: ctx.i18n.text('game.b.metric'), better: 'higher', digits: 0 },
    goals: [{ text: ctx.i18n.text('game.b.g1') }, { text: ctx.i18n.text('game.b.g2'), at: 3 }, { text: ctx.i18n.text('game.b.g3'), at: 5 }],
    lesson: ctx.i18n.text('game.b.lesson'),
    why: () => cardSpec(),
    retry: () => {
      resetObject();
      ctx.audio.play('click');
      refreshPanel();
    },
  });
  /** a result banner whenever the stars rise (the stamp, 3 in a row, 5 in the band) */
  const judgeG2 = (value: number): void => {
    const st = starsG2();
    if (st <= shownG2) return;
    shownG2 = st;
    chB.submit(value, { stars: st, detail: ctx.i18n.text('game.b.tally', { ok: tally.ok, broken: tally.broken }) });
    ctx.game.juice.burst(gripper, { tone: 'teal', count: 60, spread: 0.5 });
    ctx.game.juice.cue('great');
  };

  const said = new Set<string>();
  const sayOnce = (k: string): void => {
    if (said.has(k)) return;
    said.add(k);
    hooks.say(k);
  };
  // force history: time + force + jaw (for graph and replay)
  const hT = new Float32Array(HIST),
    hF = new Float32Array(HIST),
    hJ = new Float32Array(HIST);
  let hHead = 0,
    hCount = 0;
  let clock = 0;
  const pushHist = (): void => {
    hT[hHead] = clock;
    hF[hHead] = force;
    hJ[hHead] = jaw;
    hHead = (hHead + 1) % HIST;
    hCount = Math.min(HIST, hCount + 1);
  };
  // replay
  let replay: null | { t0: number; t1: number; r: number; fPeak: number } = null;
  /** the finished replay stays on the graph (frozen, spike annotated) until the next egg */
  let lastReplay: null | { t0: number; t1: number; r: number; fPeak: number } = null;
  let breakAt = 0;
  let broke: null | { at: number; peak: number } = null;
  let skipHist = false;

  const obj = (): (typeof OBJECTS)[ObjectId] => OBJECTS[objId];
  const mu = (): number => MU[pad][objId];
  const sensorOn = (): boolean => sub !== 'b1';

  const objectBase = (): number => MAT_Y; // bottom of the object at rest
  const gripY = (): number => objectBase() + GRIP_H[objId];

  const resetObject = (): void => {
    if (dropBody) {
      pw.removeRigidBody(dropBody);
      dropBody = null;
    }
    for (const id of Object.keys(objMeshes) as ObjectId[]) if (id !== objId) placeOnShelf(id);
    const o = objMeshes[objId];
    o.visible = true;
    o.position.set(WX, objectBase() + centreOffset(objId), WZ);
    o.rotation.set(0, 0, 0);
    shards.clearNear(WX, WZ, 1.2);
    yolkPool.visible = false;
    jaw = Math.min(JAW_MAX, obj().width + 20);
    force = 0;
    peak = 0;
    pi = null;
    lift = null;
    liftDrop = 0;
    objLift = 0;
    closeIn = 0;
    settle = 0;
    slipSounded = false;
    broke = null;
    replay = null;
    lastReplay = null;
    phase = 'ready';
    padL.material = padR.material = PAD_MAT[pad];
  };

  const setResult = (text: string, tone: 'good' | 'bad' | ''): void => {
    resultText = text;
    resultTone = tone;
    refreshPanel();
  };

  const fmtN = (v: number): string => ctx.i18n.num(v, v < 10 ? 1 : 0);

  // ── events ────────────────────────────────────────────────────────────────
  const attempt = (): void => {
    if (sub === 'b1' && !unlocked.b2) {
      unlocked.b2 = true;
      rerender?.();
    } else if (sub === 'b2' && !unlocked.b3) {
      unlocked.b3 = true;
      rerender?.();
    } else if (sub === 'b3' && !unlocked.rt) {
      unlocked.rt = true;
      rerender?.();
    }
  };

  const doBreak = (): void => {
    const o = obj();
    const at = objMeshes[objId].position;
    broke = { at: clock, peak: force };
    breakAt = clock;
    phase = 'broken';
    closeIn = 0;
    pi = null;
    objMeshes[objId].visible = false;
    if (objId === 'ei') {
      tally.broken++;
      if (sub === 'b2') {
        tally.streak = 0;
        tally.band = 0;
      }
      saveTally();
      ctx.game.juice.cue('oops', { at: [at.x, at.y, at.z] });
      ctx.game.juice.popup([at.x, at.y + 0.1, at.z], ctx.i18n.text('game.b.cracked', { f: fmtN(force) }), { tone: 'bad' });
      sfx.crack(at);
      shards.burst({ x: at.x, y: at.y + 0.01, z: at.z, count: 40, size: 0.009, speed: 0.55, floor: MAT_Y + 0.002, yolk: 14, spreadX: 1.3 });
      yolkPool.position.set(at.x, MAT_Y + 0.0015, at.z);
      yolkPool.scale.setScalar(0.001);
      yolkPool.visible = true;
      hooks.crack();
    } else {
      sfx.shatter(at);
      shards.burst({ x: at.x, y: at.y + 0.02, z: at.z, count: 46, size: 0.012, speed: 0.9, floor: MAT_Y + 0.002, color: glassShardColor });
    }
    ctx.player.shake(0.004, 0.2);
    setResult(ctx.t('b.broken', { f: fmtN(force), b: fmtN(o.fBreak ?? 0) }), 'bad');
    // keep the peak sample in the history, then the jaws relax (the shell gave way)
    pushHist();
    skipHist = true;
    force = 0;
    attempt();
    if (objId === 'ei') {
      if (sub === 'b1') sayOnce('emi.bCrack');
      // slow-motion replay of the last 0.5 s, starting 0.9 s after the crack
      ctx.after(0.9, () => {
        if (phase !== 'broken' || !broke) return;
        replay = { t0: breakAt - 0.5, t1: breakAt, r: breakAt - 0.5, fPeak: broke.peak };
        phase = 'replay';
        objMeshes[objId].visible = true;
        shards.clearNear(WX, WZ, 1.2);
        yolkPool.visible = false;
        ctx.ui.status(ctx.i18n.text('b.replay'));
        sfx.creak(objMeshes[objId].position, 0);
      });
    }
  };

  const startLift = (): void => {
    if (phase !== 'ready' && phase !== 'auto') return;
    closeIn = 0;
    if (force < 0.05) {
      // no contact: the gripper rises alone
      lift = new LiftSim(accel, obj().m, mu(), 0);
      lift.dropped = true;
      phase = 'lift';
      setResult(ctx.t('b.noContact'), 'bad');
      attempt();
      return;
    }
    lift = new LiftSim(sub === 'rt' ? accel : 2, obj().m, mu(), force);
    phase = 'lift';
    slipSounded = false;
    ctx.audio.play('whoosh', { volume: 0.25, pitch: 1.6, at: [WX, MAT_Y + 0.2, WZ] });
  };

  const finishLift = (): void => {
    const l = lift!;
    const o = obj();
    const isEgg = objId === 'ei';
    const fN = l.fN; // the grip force during the lift (force is zeroed once a dropped object leaves the jaws)
    if (sub === 'rt' && fN >= 0.05) {
      rtLifts++;
      rtObjects.add(objId);
      if (l.slipped) rtSlips++;
    }
    if (fN < 0.05) {
      // nothing gripped
    } else if (l.dropped) {
      const req = requiredForce(o.m, sub === 'rt' ? accel : 2, mu());
      setResult(ctx.t('b.slipped', { f: fmtN(fN), r: fmtN(req) }), 'bad');
      slipCase = { obj: objId, pad, req };
      sayOnce('emi.bSlip');
      ctx.game.juice.cue('oops');
      ctx.game.juice.popup(gripper, ctx.i18n.text('game.b.slipped', { f: fmtN(fN), r: fmtN(req) }), { tone: 'bad' });
      if (isEgg && sub === 'b2') {
        tally.streak = 0;
        tally.band = 0;
      }
    } else if (l.slipped) {
      // slid while accelerating (load left the cone), then static friction caught it again
      const req = requiredForce(o.m, sub === 'rt' ? accel : 2, mu());
      setResult(ctx.t('b.slippedHeld', { s: ctx.i18n.num(l.slide * 1000, 0), f: fmtN(fN), r: fmtN(req) }), '');
      slipCase = slipCase ?? { obj: objId, pad, req };
      sayOnce('emi.bSlip');
      if (isEgg) (eggIntact = true), (eggHoldForce = fN);
    } else {
      setResult(isEgg ? ctx.t('b.heldEgg', { f: fmtN(fN) }) : ctx.t('b.held', { f: fmtN(fN) }), 'good');
      ctx.game.juice.burst(gripper, { tone: 'teal', count: 26, spread: 0.18 });
      ctx.game.juice.cue('good', { pitch: 1 + Math.min(5, tally.streak) * 0.08 });
      if (isEgg) {
        tally.ok++;
        const inBand = fN >= BAND[0] && fN <= BAND[1];
        if (sub === 'b2') {
          tally.streak++;
          tally.band = inBand ? tally.band + 1 : 0;
          tally.best = Math.max(tally.best, tally.streak);
          tally.bestBand = Math.max(tally.bestBand, tally.band);
        }
        saveTally();
        const streakTxt = sub === 'b2' && tally.streak > 1 ? ` · ${tally.streak}×` : '';
        ctx.game.juice.popup(gripper, `${ctx.t('game.b.intact', { f: fmtN(fN) })}${streakTxt}`, { tone: sub === 'b2' && !inBand ? 'muted' : 'teal' });
        if (sub === 'b2') judgeG2(tally.streak);
      } else ctx.game.juice.popup(gripper, `${fmtN(fN)} N`, { tone: 'teal' });
      if (isEgg) {
        if (!eggIntact) ctx.audio.play('success', { volume: 0.6 });
        eggIntact = true;
        eggHoldForce = fN;
        if (sub === 'b1') sayOnce('emi.bLucky');
        if (sub === 'b2') ctx.pass.setBest('gripForceError', Math.round(Math.abs(fN - 5) * 10) / 10, 'lower');
        if (sub === 'b3') sayOnce('emi.b3');
        if (!unlocked.rt) {
          unlocked.rt = true;
          rerender?.();
        }
      }
    }
    attempt();
    checkStamp();
    refreshPanel();
  };

  const checkStamp = (): void => {
    // eased (FUN-PLAN G2): one intact egg + ONE slip on the friction table (the cone lesson)
    if (done || !eggIntact || rtSlips < 1) return;
    done = true;
    const sc = slipCase ?? { obj: 'glas' as ObjectId, pad: 'gummi' as PadId, req: requiredForce(0.4, 2, 0.25) };
    const name = (id: ObjectId, l: 'de' | 'en'): string => STR_OBJ[id][l];
    const padName = (id: PadId, l: 'de' | 'en'): string => STR_PAD[id][l];
    // both languages are stored: format each with its own decimal mark (not the current UI language)
    const de = `Ei: ${eggHoldForce.toFixed(1).replace('.', ',')} N gehalten · ${name(sc.obj, 'de')}/${padName(sc.pad, 'de')} rutscht unter ${(Math.round(sc.req * 10) / 10).toFixed(1).replace('.', ',')} N`;
    const en = `Egg: ${eggHoldForce.toFixed(1)} N held · ${name(sc.obj, 'en').toLowerCase()}/${padName(sc.pad, 'en').toLowerCase()} slips below ${(Math.round(sc.req * 10) / 10).toFixed(1)} N`;
    ctx.pass.award('ei', { value: { de, en }, curve: [eggHoldForce, sc.req] });
    hooks.onStamp();
    hooks.say('emi.bDone');
    judgeG2(tally.best);
  };

  // ── panel ─────────────────────────────────────────────────────────────────
  let ui: null | {
    readJaw: HTMLElement;
    readF: HTMLElement;
    graph: HTMLCanvasElement;
    result: HTMLElement;
    prog: HTMLElement;
    tally: HTMLElement;
    liftBtn: HTMLButtonElement | null;
    accelVal: HTMLElement | null;
    fVal: HTMLElement | null;
    muVal: HTMLElement | null;
  } = null;
  let rerender: (() => void) | null = null;
  let tallyEl: HTMLElement = h('div', {});

  let lastHelp = '';
  const buildPanel = (el: HTMLElement, exit: () => void): (() => void) => {
    const root = panelRoot(el);
    lastHelp = '';
    const render = (): void => {
      root.replaceChildren();
      // ⓘ / Esc sit in the header: the footer must not wrap in English, and the friction view is tall
      const leave = h('button', { class: 'btn ghost', style: 'padding:3px 9px' }, 'Esc');
      leave.onclick = exit;
      const info = h('button', { class: 'btn ghost', style: 'padding:3px 9px' }, 'ⓘ');
      info.title = ctx.t('b.cardTitle');
      info.onclick = () => void openCard();
      // ≤ 35 words at open (plan §4): the operate bar names the station; ⓘ, Esc and the chip stay
      root.append(h('div', { class: 'gw-head', style: 'justify-content:flex-end' }, info, leave, ctx.ui.chip('sim')));
      const goalChips = chB.chips();
      goalChips.style.margin = '8px 0 0';
      root.append(goalChips);
      tallyEl = h('div', { class: 'gw-mono', style: 'margin-top:6px;font-size:12.5px;color:var(--text)', 'data-chip': 'ui' });
      root.append(tallyEl);
      const tabs = seg<Sub>(
        [
          { value: 'b1', label: ctx.t('b.tabB1') },
          { value: 'b2', label: ctx.t('b.tabB2'), disabled: !unlocked.b2, title: unlocked.b2 ? '' : ctx.t('b.lockedB2') },
          { value: 'b3', label: ctx.t('b.tabB3'), disabled: !unlocked.b3, title: unlocked.b3 ? '' : ctx.t('b.lockedB3') },
          { value: 'rt', label: ctx.t('b.tabRt'), disabled: !unlocked.rt, title: unlocked.rt ? '' : ctx.t('b.lockedRt') },
        ],
        sub,
        (v) => setSub(v),
      );
      root.append(h('div', { class: 'gw-row', style: 'margin-top:10px' }, tabs.el));
      // the keys of the sub-station show as a hint, not as a panel line (≤ 35 words at open)
      const help = ctx.t(`b.help${sub === 'rt' ? 'Rt' : sub.toUpperCase()}`);
      if (help && help !== lastHelp) {
        lastHelp = help;
        ctx.ui.hint(help, 4);
      }
      let accelVal: HTMLElement | null = null,
        fVal: HTMLElement | null = null,
        muVal: HTMLElement | null = null;
      if (sub === 'rt') {
        const objSeg = seg<ObjectId>(
          (['ei', 'stahl', 'glas', 'mehl'] as ObjectId[]).map((id) => ({ value: id, label: STR_OBJ[id][ctx.lang] })),
          objId,
          (v) => {
            if (phase !== 'ready' && phase !== 'broken' && phase !== 'drop' && phase !== 'empty') return;
            objId = v;
            resetObject();
            render();
          },
        );
        const padSeg = seg<PadId>(
          (['stahl', 'gummi', 'silikon'] as PadId[]).map((id) => ({ value: id, label: STR_PAD[id][ctx.lang] })),
          pad,
          (v) => {
            if (phase !== 'ready') return;
            pad = v;
            padL.material = padR.material = PAD_MAT[pad];
            ctx.audio.play('click');
            render();
          },
        );
        muVal = h('span', { class: 'gw-mono' });
        const ar = h('input', { type: 'range', min: '0', max: '10', step: '0.5', value: String(accel) }) as HTMLInputElement;
        accelVal = h('span', { class: 'gw-mono', style: 'width:62px;text-align:right' });
        ar.oninput = () => {
          accel = Number(ar.value);
          refreshPanel();
        };
        const fr = h('input', { type: 'range', min: '0', max: String(GRIPPER_MAX_N), step: '1', value: String(fSet) }) as HTMLInputElement;
        fVal = h('span', { class: 'gw-mono', style: 'width:62px;text-align:right' });
        fr.oninput = () => {
          fSet = Number(fr.value);
          refreshPanel();
        };
        root.append(
          h('div', { class: 'gw-row' }, h('span', { class: 'gw-k' }, ctx.t('b.object')), objSeg.el),
          h('div', { class: 'gw-row' }, h('span', { class: 'gw-k' }, ctx.t('b.pad')), padSeg.el, muVal, ctx.ui.chip('richtwert', ctx.i18n.text('b.muSource'))),
          h('div', { class: 'gw-row' }, kLabel(ctx.t('b.accel'), 'a'), ar, accelVal),
          h('div', { class: 'gw-row' }, kLabel(ctx.t('b.fset'), 'F_N'), fr, fVal),
        );
      }
      const readJaw = h('span', { class: 'gw-mono' });
      const readF = h('span', { class: 'gw-mono' });
      root.append(h('div', { class: 'gw-row' }, h('span', { class: 'gw-k' }, ctx.t('b.jaw')), readJaw, h('span', { style: 'flex:1' }), h('span', { class: 'gw-k', style: 'width:auto' }, ctx.t('b.force')), readF));
      const graph = h('canvas', { width: String(360 * 2), height: String(104 * 2), style: 'width:360px;height:104px;margin-top:8px;border-radius:6px;background:#141414' });
      root.append(graph);
      const btnRow = h('div', { class: 'gw-row' });
      let liftBtn: HTMLButtonElement | null = null;
      if (sub === 'b1' || sub === 'b2') {
        const close = h('button', { class: 'btn' }, ctx.t('b.close'));
        close.onpointerdown = () => (closeIn = 1);
        close.onpointerup = close.onpointerleave = () => closeIn === 1 && (closeIn = 0);
        btnRow.append(close);
        if (sub === 'b2') {
          const open = h('button', { class: 'btn' }, ctx.t('b.open'));
          open.onpointerdown = () => (closeIn = -1);
          open.onpointerup = open.onpointerleave = () => closeIn === -1 && (closeIn = 0);
          btnRow.append(open);
        }
        liftBtn = h('button', { class: 'btn primary' }, ctx.t('b.lift'));
        liftBtn.onclick = startLift;
        btnRow.append(liftBtn);
      } else if (sub === 'b3') {
        liftBtn = h('button', { class: 'btn primary' }, ctx.t('b.grip5'));
        liftBtn.onclick = () => startAuto(5);
        btnRow.append(liftBtn);
      } else {
        liftBtn = h('button', { class: 'btn primary' }, ctx.t('b.gripLift'));
        liftBtn.onclick = () => startAuto(fSet);
        btnRow.append(liftBtn);
      }
      const rst = h('button', { class: 'btn ghost' }, sub === 'rt' ? ctx.t('b.resetObj') : ctx.t('b.reset'));
      rst.onclick = () => {
        resetObject();
        ctx.audio.play('click');
        refreshPanel();
      };
      btnRow.append(rst);
      root.append(btnRow);
      const result = h('div', { class: 'gw-result' });
      const prog = h('div', { class: 'gw-prog' });
      root.append(
        result,
        prog,
        // the model note sits in the chip's tooltip and the ⓘ card (panel ≤ 50 words at open)
        h('div', { class: 'gw-chips', style: 'flex-wrap:nowrap' }, ctx.ui.chip('illustrativ', ctx.i18n.text('b.modelSource'))),
      );
      ui = { readJaw, readF, graph, result, prog, tally: tallyEl, liftBtn, accelVal, fVal, muVal };
      refreshPanel();
      drawGraph(graph.getContext('2d')!, 360, 104, 2);
    };
    rerender = render;
    render();
    return () => {
      ui = null;
      rerender = null;
    };
  };
  ctx.i18n.onChange(() => operating && rerender?.());

  const refreshPanel = (): void => {
    if (!ui) return;
    ui.readJaw.textContent = `${ctx.i18n.num(jaw, 1)} mm`;
    ui.readF.textContent = sensorOn() || phase === 'replay' ? `${ctx.i18n.num(force, 1)} N` : ctx.t('b.forceHidden');
    ui.result.textContent = resultText;
    ui.result.className = `gw-result ${resultTone}`;
    const ok = (b: boolean): string => (b ? '✓' : '·');
    ui.prog.innerHTML = '';
    ui.prog.append(
      h('b', {}, ok(eggIntact)),
      ` ${ctx.t('b.progressEgg')}   `,
      h('b', {}, ok(rtSlips >= 1)),
      ` ${ctx.t('game.b.progressSlip')}`,
    );
    ui.prog.style.display = done ? 'none' : '';
    // the tally as marks (≤ 35 words at open); the words sit in the tooltip
    ui.tally.textContent = `✓ ${tally.ok} · ✗ ${tally.broken}${sub === 'b2' ? ` · ${tally.streak}×` : ''}`;
    ui.tally.title = ctx.t('game.b.tally', { ok: tally.ok, broken: tally.broken }) + (sub === 'b2' ? ` · ${ctx.t('game.b.streak', { n: tally.streak })}` : '');
    if (ui.accelVal) ui.accelVal.textContent = `${ctx.i18n.num(accel, 1)} m/s²`;
    if (ui.fVal) ui.fVal.textContent = `${ctx.i18n.num(fSet, 0)} N`;
    if (ui.muVal) ui.muVal.textContent = `μ = ${ctx.i18n.num(mu(), 2)}`;
    if (ui.liftBtn) ui.liftBtn.disabled = !(phase === 'ready');
  };

  const setSub = (s: Sub): void => {
    if (s === 'b2' && !unlocked.b2) return;
    if (s === 'b3' && !unlocked.b3) return;
    if (s === 'rt' && !unlocked.rt) return;
    sub = s;
    if (s !== 'rt') {
      objId = 'ei';
      pad = 'gummi';
    } else objId = objId === 'ei' && !rtObjects.size ? 'glas' : objId;
    if (s === 'rt') {
      if (!rtObjects.size) pad = 'stahl';
      sayOnce('emi.bRt');
    }
    if (s === 'b2') sayOnce('emi.b2');
    resetObject();
    setResult('', '');
    ctx.ui.status(null);
    ctx.audio.play('click');
    rerender?.();
  };

  const startAuto = (ref: number): void => {
    if (phase !== 'ready') return;
    pi = new ForcePI(ref);
    settle = 0;
    phase = 'auto';
    if (sub === 'rt' && ref > GRIPPER_MAX_N) setResult(ctx.t('b.overMax'), 'bad');
    refreshPanel();
  };

  // ── graph drawing (panel + in-world screen) ─────────────────────────────────
  const drawGraph = (g: CanvasRenderingContext2D, w: number, hh: number, dpr: number, oy = 0): void => {
    g.setTransform(dpr, 0, 0, dpr, 0, oy * dpr);
    g.fillStyle = '#141414';
    g.fillRect(0, 0, w, hh);
    const padL0 = 30,
      padR0 = 8,
      padT = 14,
      padB = 16;
    const rp = phase === 'replay' ? replay : phase === 'broken' ? lastReplay : null;
    const showForce = sensorOn() || !!rp;
    g.font = `500 ${Math.round(hh * 0.095)}px "Geist Mono", monospace`;
    if (sub === 'rt' && phase !== 'replay') {
      // bar: needed vs. set vs. gripper max vs. break limit (0…100 N)
      const o = obj();
      const req = requiredForce(o.m, accel, mu());
      const X = (f: number): number => padL0 + (clamp(f, 0, 100) / 100) * (w - padL0 - padR0);
      const y0 = hh * 0.42,
        bh = hh * 0.2;
      g.fillStyle = '#292929';
      g.fillRect(X(0), y0, X(100) - X(0), bh);
      g.fillStyle = 'rgba(45,212,191,0.28)';
      g.fillRect(X(Math.min(req, 100)), y0, X(o.fBreak ?? 100) - X(Math.min(req, 100)), bh);
      g.fillStyle = '#2dd4bf';
      g.fillRect(X(req) - 1.5, y0 - 8, 3, bh + 16);
      g.fillText(`${ctx.t('b.required')} ${fmtN(req)} N${req > 100 ? ' > 100' : ''}`, Math.min(X(req) + 4, w - 120), y0 - 12);
      g.fillStyle = '#ff6700';
      g.beginPath();
      g.moveTo(X(fSet), y0 + bh + 2);
      g.lineTo(X(fSet) - 7, y0 + bh + 14);
      g.lineTo(X(fSet) + 7, y0 + bh + 14);
      g.fill();
      g.fillText(`${ctx.t('b.set')} ${fmtN(fSet)} N`, Math.min(Math.max(padL0, X(fSet) - 30), w - 110), y0 + bh + 28);
      if (o.fBreak) {
        g.strokeStyle = '#f87171';
        g.setLineDash([4, 3]);
        g.beginPath();
        g.moveTo(X(o.fBreak), y0 - 4);
        g.lineTo(X(o.fBreak), y0 + bh + 4);
        g.stroke();
        g.setLineDash([]);
        g.fillStyle = '#f87171';
        g.fillText(ctx.t('b.breakAt', { f: o.fBreak }), Math.min(X(o.fBreak) + 4, w - 90), y0 + bh / 2 + 4);
      }
      g.fillStyle = '#78716c';
      g.fillText('0', padL0 - 4, y0 + bh + 12);
      g.fillText(`100 N · ${ctx.t('b.max')}`, w - padR0 - 108, y0 + bh + 12 + 16);
      return;
    }
    const fMax = 40;
    const X = (t: number): number => padL0 + t * (w - padL0 - padR0);
    const Y = (f: number): number => hh - padB - (clamp(f, 0, fMax) / fMax) * (hh - padT - padB);
    // grid + band + break line
    g.strokeStyle = '#2a2a2a';
    g.lineWidth = 1;
    for (const f of [0, 10, 20, 30, 40]) {
      g.beginPath();
      g.moveTo(padL0, Y(f));
      g.lineTo(w - padR0, Y(f));
      g.stroke();
      g.fillStyle = '#78716c';
      g.fillText(String(f), 4, Y(f) + 4);
    }
    g.fillStyle = 'rgba(45,212,191,0.16)';
    g.fillRect(padL0, Y(8), w - padL0 - padR0, Y(2) - Y(8));
    g.fillStyle = '#2dd4bf';
    g.fillText(ctx.t('b.band'), padL0 + 4, Y(8) - 3);
    if (obj().fBreak) {
      g.strokeStyle = '#f87171';
      g.setLineDash([5, 4]);
      g.beginPath();
      g.moveTo(padL0, Y(30));
      g.lineTo(w - padR0, Y(30));
      g.stroke();
      g.setLineDash([]);
      g.fillStyle = '#f87171';
      g.fillText(ctx.t('b.breakAt', { f: 30 }), padL0 + 4, Y(30) - 3);
    }
    if (!showForce) {
      g.fillStyle = '#a8a29e';
      g.fillText(ctx.t('b.graphSensorOff'), padL0 + 10, hh / 2 + 4);
      return;
    }
    // curve: last 5 s (or the replay window, stretched)
    const span = rp ? 0.5 : 5;
    const tEnd = rp ? rp.r : clock;
    const tStart = rp ? rp.t0 : clock - span;
    g.strokeStyle = '#f5f5f4';
    g.lineWidth = 2;
    g.beginPath();
    let first = true;
    for (let i = 0; i < hCount; i++) {
      const k = (hHead - hCount + i + HIST) % HIST;
      const t = hT[k];
      if (t < tStart || t > tEnd) continue;
      const x = X((t - tStart) / span),
        y = Y(hF[k]);
      if (first) g.moveTo(x, y), (first = false);
      else g.lineTo(x, y);
    }
    g.stroke();
    if (rp) {
      g.fillStyle = '#ff6700';
      if (phase === 'replay') g.fillText(ctx.t('b.replay'), padL0 + 4, padT + 2);
      if (rp.r >= rp.t1 - 0.02) {
        const x = X(1) - 2,
          y = Y(rp.fPeak);
        g.beginPath();
        g.arc(x, y, 4, 0, Math.PI * 2);
        g.fill();
        g.fillText(ctx.t('b.spike', { f: fmtN(rp.fPeak) }), x - 96, Math.max(padT + 14, y - 6));
      }
    }
  };
  let screenDirtyAt = 0;
  const drawScreen = (): void => {
    const g = screenCanvas.getContext('2d')!;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = '#141414';
    g.fillRect(0, 0, SW, SH);
    g.font = '500 20px "Geist Mono", monospace';
    g.fillStyle = '#ff6700';
    g.fillText(ctx.t('b.screenTitle'), 16, 30);
    // SIM · LIVE pill (every live number carries its chip), then the sub-step
    g.font = '500 16px "Geist Mono", monospace';
    const pill = 'SIM · LIVE';
    const pw = g.measureText(pill).width + 20;
    g.fillStyle = 'rgba(45,212,191,0.16)';
    g.beginPath();
    g.roundRect(SW - 16 - pw, 12, pw, 26, 13);
    g.fill();
    g.fillStyle = '#2dd4bf';
    g.fillText(pill, SW - 16 - pw + 10, 30);
    g.font = '500 20px "Geist Mono", monospace';
    g.fillStyle = '#a8a29e';
    const label = sub === 'rt' ? ctx.t('b.subRt') : ctx.t(`b.sub${sub.toUpperCase()}`);
    g.fillText(label, SW - 32 - pw - g.measureText(label).width, 30);
    drawGraph(g, SW, SH - 48, 1, 44);
    g.setTransform(1, 0, 0, 1, 0, 0);
    screenTex.needsUpdate = true;
  };

  // ── operate ───────────────────────────────────────────────────────────────
  const operate = (): void => {
    hooks.onUse();
    operating = true;
    if (phase === 'ready' && !resultText) sayOnce('emi.bIntro');
    // once stamped, the panel opens on the Eier-Serie (B2): the ★★/★★★ toy; the friction table is a tab away
    if (done && sub === 'rt' && unlocked.b2) {
      sub = 'b2';
      objId = 'ei';
      pad = 'gummi';
      resetObject();
      resultText = '';
      resultTone = '';
    }
    ctx.player.enterOperate({
      title: ctx.i18n.text('b.opTitle'),
      cameraPose: { position: [WX + 0.13, MAT_Y + 0.33, WZ + 0.46], lookAt: [WX + 0.13, MAT_Y + 0.12, WZ - 0.02] },
      panelPosition: 'right',
      panel: buildPanel,
      onPointer: (e) => {
        if (sub !== 'b1' && sub !== 'b2') return;
        if (e.type === 'down') {
          if (phase !== 'ready') return;
          if (e.button === 0) closeIn = 1;
          else if (e.button === 2 && sub === 'b2') closeIn = -1;
        } else if (e.type === 'up') closeIn = 0;
      },
      onExit: () => {
        operating = false;
        closeIn = 0;
        ctx.ui.status(null);
      },
    });
  };
  ctx.addInteractable({ object: consoleGroup, label: ctx.i18n.text('b.console'), hint: ctx.i18n.text('b.consoleHint'), onInteract: operate, range: 2.8 });
  ctx.input.onKey('Space', () => operating && (sub === 'b1' || sub === 'b2') && startLift(), { whileOperating: true });
  // R = a new egg (also the banner's retry)
  ctx.input.onKey('KeyR', () => {
    if (!operating) return;
    resetObject();
    ctx.audio.play('click');
    refreshPanel();
  }, { whileOperating: true });

  const openCard = (): Promise<void> => ctx.ui.card(cardSpec());
  const cardSpec = (): InfoCardSpec => ({
      eyebrow: ctx.i18n.text('b.cardEyebrow'),
      title: ctx.i18n.text('b.cardTitle'),
      body: [ctx.i18n.text('b.cardBody')],
      metrics: [
        { label: ctx.i18n.text('b.mEgg'), value: eggIntact ? ctx.i18n.num(eggHoldForce, 1) : '–', unit: 'N' },
        { label: ctx.i18n.text('b.mSlip'), value: slipCase ? ctx.i18n.num(slipCase.req, 1) : '–', unit: 'N', note: slipCase ? `${STR_OBJ[slipCase.obj][ctx.lang]} / ${STR_PAD[slipCase.pad][ctx.lang]}` : undefined },
        { label: 'k', value: K_PAD, unit: 'N/mm' },
      ],
      illustrative: true,
      // Entdecker: idea + holding condition (≤ 60 words); Entscheider: decision box on top (≤ 80 words)
      // the egg study of the retired „200 Griffe“ lives here now (plan §4.4)
      bullets: [ctx.i18n.text('b.cardStudy')],
      entdecker: { body: [ctx.i18n.text('b.cardBody'), ctx.i18n.text('b.curious')], forDecisionMakers: undefined },
      entscheider: {
        metrics: [{ label: ctx.i18n.text('b.mSlip'), value: slipCase ? ctx.i18n.num(slipCase.req, 1) : '–', unit: 'N', note: slipCase ? `${STR_OBJ[slipCase.obj][ctx.lang]} / ${STR_PAD[slipCase.pad][ctx.lang]}` : undefined }],
      },
      forDecisionMakers: { title: ctx.i18n.text('b.dfmTitle'), bullets: [ctx.i18n.text('b.dfm1'), ctx.i18n.text('b.dfm2'), ctx.i18n.text('b.dfm3')] },
      diagram: { aspect: 16 / 9, animate: true, draw: (g, w, hh, t) => drawConeDiagram(g, w, hh, t, ctx.t('b.diagIn'), ctx.t('b.diagOut'), ctx.lang), caption: ctx.i18n.text('b.coneCaption') },
  });

  // ── per frame ─────────────────────────────────────────────────────────────
  const m4 = new THREE.Matrix4(),
    qq = new THREE.Quaternion(),
    vv = new THREE.Vector3(),
    ss = new THREE.Vector3(),
    dir = new THREE.Vector3(),
    xAxis = new THREE.Vector3(1, 0, 0),
    col = new THREE.Color();
  const overlays = (): void => {
    const show = ctx.settings.overlays && sub !== 'b1' && !dropBody && objMeshes[objId].visible && (phase === 'ready' || phase === 'auto' || phase === 'lift' || phase === 'hold' || phase === 'lower');
    cones.visible = coneEdges.visible = arrows.visible = show;
    if (!show) return;
    const o = obj();
    const half = o.width / 2000;
    const y = gripper.position.y;
    const muv = mu();
    // cones and arrows are drawn on the OUTER side of each contact (finger side): the cone of
    // admissible contact forces is point-symmetric through the contact, so "arrow inside the cone"
    // is the same test — and nothing piles up inside the object.
    const hc = clamp((o.width / 1000) * 0.9, 0.035, 0.065);
    const r = hc * muv;
    const ePos = coneEdgeGeo.getAttribute('position') as THREE.BufferAttribute;
    for (let s = 0; s < 2; s++) {
      const out = s === 0 ? -1 : 1; // left contact: outward = −x
      const cx = WX + out * half;
      qq.setFromAxisAngle(vv.set(0, 1, 0), out < 0 ? Math.PI : 0);
      m4.compose(vv.set(cx, y, WZ), qq, ss.set(hc, r, r));
      cones.setMatrixAt(s, m4);
      ePos.setXYZ(s * 4, cx, y, WZ + 0.01);
      ePos.setXYZ(s * 4 + 1, cx + out * hc, y - r, WZ + 0.01);
      ePos.setXYZ(s * 4 + 2, cx, y, WZ + 0.01);
      ePos.setXYZ(s * 4 + 3, cx + out * hc, y + r, WZ + 0.01);
    }
    ePos.needsUpdate = true;
    cones.instanceMatrix.needsUpdate = true;
    // force arrows: the contact force each jaw must transmit = F_N inward + F_t = m(g + a)/2 up
    const aNow = phase === 'lift' && lift ? lift.jawA : sub === 'rt' ? accel : 2;
    const fN = phase === 'ready' && sub === 'rt' ? fSet : force;
    const ft = (o.m * (G + aNow)) / 2;
    const inside = fN > 0 && ft <= muv * fN + 1e-9;
    const len = hc * 0.95;
    for (let s = 0; s < 2; s++) {
      const out = s === 0 ? -1 : 1;
      const cx = WX + out * half;
      dir.set(-out * Math.max(fN, 1e-3), ft, 0).normalize(); // force ON the object: inward + up
      qq.setFromUnitVectors(xAxis, dir);
      // tail outside, head at the contact point
      m4.compose(vv.set(cx - dir.x * len, y - dir.y * len, WZ + 0.012), qq, ss.set(len, len * 0.8, len * 0.8));
      arrows.setMatrixAt(s, m4);
      arrows.setColorAt(s, inside ? col.setHex(COL.teal).multiplyScalar(1.5) : col.setHex(COL.amber).multiplyScalar(1.4));
    }
    // weight arrow from the object's centre
    const op = objMeshes[objId].position;
    const wl = clamp(0.025 + 0.012 * Math.log10(1 + o.m * G * 10), 0.03, 0.08);
    qq.setFromUnitVectors(xAxis, dir.set(0, -1, 0));
    m4.compose(vv.set(op.x, op.y, WZ + 0.03), qq, ss.set(wl, wl, wl));
    arrows.setMatrixAt(2, m4);
    arrows.setColorAt(2, col.setHex(0xd6d3d1));
    arrows.instanceMatrix.needsUpdate = true;
    if (arrows.instanceColor) arrows.instanceColor.needsUpdate = true;
  };

  const SUB = 8;
  const update = (dt: number, elapsed: number): void => {
    clock += dt;
    const o = obj();
    const prevForce = force;
    if (phase === 'ready' && closeIn !== 0) {
      jaw = clamp(jaw - closeIn * CLOSE_SPEED * dt, 0, JAW_MAX);
      force = K_PAD * Math.max(0, o.width - jaw);
    } else if (phase === 'auto' && pi) {
      // 1 kHz force loop (PI), substepped inside the frame
      const steps = Math.max(1, Math.round(dt / 0.001));
      const h1 = dt / steps;
      for (let i = 0; i < steps; i++) {
        const v = pi.step(force, h1);
        jaw = clamp(jaw - v * h1, 0, JAW_MAX);
        force = Math.min(GRIPPER_MAX_N, K_PAD * Math.max(0, o.width - jaw));
        if (o.fBreak && force >= o.fBreak) break;
      }
      if (Math.abs(force - pi.ref) < Math.max(0.05 * pi.ref, 0.15)) settle += dt;
      else settle = 0;
      if (settle > 0.3) {
        pi = null;
        startLift();
      }
    }
    peak = Math.max(peak, force);
    if (o.fBreak && force >= o.fBreak && (phase === 'ready' || phase === 'auto')) doBreak();

    if (phase === 'lift' && lift) {
      for (let i = 0; i < SUB; i++) lift.step(dt / SUB);
      liftDrop = lift.jawY;
      if (!lift.dropped || force < 0.05) objLift = force < 0.05 ? 0 : lift.objY;
      if (lift.slipped && !slipSounded && force >= 0.05) {
        slipSounded = true;
        sfx.squeak(objMeshes[objId].position);
      }
      if (lift.dropped && force >= 0.05 && !dropBody) {
        // the object leaves the jaws: hand it to the private physics world
        const op = objMeshes[objId].position;
        const desc = R.RigidBodyDesc.dynamic().setTranslation(op.x, op.y, op.z).setLinvel(0, lift.objV, 0).setAngularDamping(0.6);
        dropBody = pw.createRigidBody(desc);
        const sh =
          objId === 'ei'
            ? R.ColliderDesc.capsule(0.006, 0.022)
            : objId === 'glas'
              ? R.ColliderDesc.cylinder(0.0525, 0.034)
              : objId === 'stahl'
                ? R.ColliderDesc.cuboid(0.0275, 0.042, 0.0275)
                : R.ColliderDesc.cuboid(0.05, 0.12, 0.085);
        pw.createCollider(sh.setDensity(o.m / colliderVolume(objId)).setFriction(0.6).setRestitution(0.08), dropBody);
        dropBody.applyTorqueImpulse({ x: 0, y: 0, z: (Math.random() - 0.5) * 2e-6 * o.m }, true);
        force = 0;
      }
      if (lift.done) {
        phase = 'hold';
        holdT = 0;
        finishLift();
      }
    } else if (phase === 'hold') {
      holdT += dt;
      if (holdT > 1.3) {
        // a dropped object stays where it fell; the gripper waits up there and then resets
        if (dropBody) phase = 'drop';
        else phase = 'lower';
      }
    } else if (phase === 'lower') {
      liftDrop = Math.max(0, liftDrop - dt * 0.35);
      if (!dropBody && force >= 0.05) objLift = liftDrop;
      if (liftDrop <= 0) {
        // open and get ready again (the object stays intact on the mat)
        const keep = resultText,
          tone = resultTone;
        resetObject();
        resultText = keep;
        resultTone = tone;
        refreshPanel();
      }
    } else if (phase === 'drop') {
      holdT += dt;
      if (holdT > 1.3 + 2.4) {
        const keep = resultText,
          tone = resultTone;
        resetObject();
        resultText = keep;
        resultTone = tone;
        refreshPanel();
      }
    } else if (phase === 'replay' && replay) {
      replay.r = Math.min(replay.t1, replay.r + dt * 0.25);
      // reconstruct jaw + force from history
      let kBest = -1,
        dBest = Infinity;
      for (let i = 0; i < hCount; i++) {
        const k = (hHead - hCount + i + HIST) % HIST;
        const d = Math.abs(hT[k] - replay.r);
        if (d < dBest) (dBest = d), (kBest = k);
      }
      if (kBest >= 0) {
        jaw = hJ[kBest];
        force = hF[kBest];
      }
      sfx.creak(objMeshes[objId].position, force);
      if (replay.r >= replay.t1) {
        // the crack, in slow motion
        const at = objMeshes[objId].position;
        objMeshes[objId].visible = false;
        shards.timeScale = 0.25;
        shards.burst({ x: at.x, y: at.y + 0.01, z: at.z, count: 40, size: 0.009, speed: 0.55, floor: MAT_Y + 0.002, yolk: 14, spreadX: 1.3 });
        yolkPool.visible = true;
        yolkPool.scale.setScalar(0.001);
        sfx.crack(at, 2.5);
        sfx.creak(at, 0);
        ctx.after(1.6, () => (shards.timeScale = 1));
        phase = 'broken';
        lastReplay = replay;
        replay = null;
        ctx.ui.status(null);
        if (sub === 'b1') setResult(`${resultText} · ${ctx.t('b.spikeNote')}`, 'bad');
      }
    }
    if (phase !== 'replay' && !skipHist) pushHist();
    skipHist = false;
    if (yolkPool.visible && yolkPool.scale.x < 0.03) yolkPool.scale.setScalar(Math.min(0.03, yolkPool.scale.x + dt * (shards.timeScale < 1 ? 0.012 : 0.05)));

    // creak (sensor modes only, while the force changes or is held under control)
    const changing = Math.abs(force - prevForce) > 1e-4 || phase === 'auto';
    if (phase !== 'replay') sfx.creak(objMeshes[objId].position, sensorOn() && changing && force > 0 ? force : 0);

    // pose gripper + object
    const gy = gripY() + liftDrop;
    gripper.position.set(WX, gy, WZ);
    const half = jaw / 2000;
    fingerL.position.set(-half - 0.005 - 0.007, 0, 0);
    fingerR.position.set(half + 0.005 + 0.007, 0, 0);
    padL.position.set(-half - 0.0025, 0, 0);
    padR.position.set(half + 0.0025, 0, 0);
    if (dropBody) {
      const t = dropBody.translation(),
        r = dropBody.rotation();
      objMeshes[objId].position.set(t.x, t.y, t.z);
      objMeshes[objId].quaternion.set(r.x, r.y, r.z, r.w);
    } else if (objMeshes[objId].visible && phase !== 'broken') {
      objMeshes[objId].position.set(WX, objectBase() + centreOffset(objId) + objLift, WZ);
    }
    overlays();
    shards.update(dt);
    if (operating && ctx.time.frame % 3 === 0 && ui) {
      refreshPanel();
      drawGraph(ui.graph.getContext('2d')!, 360, 104, 2);
    }
    if (elapsed - screenDirtyAt > 1 / 12 && ctx.playerDistance < 30) {
      screenDirtyAt = elapsed;
      drawScreen();
    }
  };

  const waitUntil = (cond: () => boolean, timeout = 15): Promise<void> =>
    new Promise((res) => {
      const t0 = ctx.time.elapsed;
      const tick = (): void => {
        if (cond() || ctx.time.elapsed - t0 > timeout) res();
        else ctx.after(0.03, tick);
      };
      tick();
    });

  resetObject();
  drawScreen();

  return {
    update,
    get done() {
      return done;
    },
    get force() {
      return phase === 'replay' ? 0 : force;
    },
    debug: {
      enter: () => !operating && operate(),
      setSub: (s) => {
        if (s === 'b2') unlocked.b2 = true;
        if (s === 'b3') unlocked.b2 = unlocked.b3 = true;
        if (s === 'rt') unlocked.b2 = unlocked.b3 = unlocked.rt = true;
        setSub(s);
      },
      async squeezeTo(f) {
        if (phase !== 'ready') resetObject();
        closeIn = 1;
        await waitUntil(() => force >= f || phase !== 'ready' || jaw <= 0);
        closeIn = 0;
      },
      async lift() {
        startLift();
        await waitUntil(() => phase === 'ready' || phase === 'drop' || phase === 'broken', 10);
        return resultText;
      },
      async grip5() {
        if (phase !== 'ready') resetObject();
        startAuto(5);
        await waitUntil(() => phase === 'hold' || phase === 'broken' || phase === 'drop', 10);
        return resultText;
      },
      async rt(c) {
        if (sub !== 'rt') this.setSub('rt');
        objId = c.obj;
        pad = c.pad;
        accel = c.a;
        fSet = c.f;
        resetObject();
        rerender?.();
        startAuto(c.f);
        await waitUntil(() => phase === 'hold' || phase === 'broken' || phase === 'drop' || (phase === 'lower' && !lift), 10);
        await waitUntil(() => phase === 'ready' || phase === 'drop' || phase === 'broken', 6);
        return resultText;
      },
      reset: () => resetObject(),
      async stars3() {
        await this.solve();
        // five eggs in a row in B2, each squeezed to ≈ 5 N (inside the 3–7 N band)
        this.setSub('b2');
        for (let i = 0; i < 5; i++) {
          // set the jaws to exactly 5 N (the frame-polled squeeze overshoots by up to 4 N), then the real lift
          if (phase !== 'ready') resetObject();
          jaw = obj().width - 5 / K_PAD;
          force = 5;
          await this.lift();
          resetObject();
        }
      },
      async solve() {
        this.setSub('b3');
        await this.grip5();
        await this.rt({ obj: 'glas', pad: 'stahl', a: 2, f: 10 });
        await this.rt({ obj: 'glas', pad: 'gummi', a: 2, f: 12 });
        await this.rt({ obj: 'stahl', pad: 'gummi', a: 2, f: 20 });
      },
      state: () => ({ tally: { ...tally }, sub, objId, pad, accel, fSet, phase, jaw: Math.round(jaw * 10) / 10, force: Math.round(force * 100) / 100, peak: Math.round(peak * 10) / 10, unlocked: { ...unlocked }, eggIntact, rtLifts, rtObjects: [...rtObjects], rtSlips, result: resultText, done }),
    },
  };
}

const STR_OBJ: Record<ObjectId, { de: string; en: string }> = {
  ei: { de: 'Ei', en: 'Egg' },
  stahl: { de: 'Stahlblock', en: 'Steel block' },
  glas: { de: 'nasses Glas', en: 'Wet glass' },
  mehl: { de: 'Mehlsack', en: 'Flour sack' },
};
const STR_PAD: Record<PadId, { de: string; en: string }> = {
  stahl: { de: 'Stahl', en: 'Steel' },
  gummi: { de: 'Gummi', en: 'Rubber' },
  silikon: { de: 'Silikon', en: 'Silicone' },
};

function colliderVolume(id: ObjectId): number {
  switch (id) {
    case 'ei':
      return Math.PI * 0.022 * 0.022 * (0.012 + (4 / 3) * 0.022);
    case 'glas':
      return Math.PI * 0.034 * 0.034 * 0.105;
    case 'stahl':
      return 0.055 * 0.084 * 0.055;
    case 'mehl':
      return 0.1 * 0.24 * 0.17;
  }
}

/** info-card diagram: a jaw, a friction cone and a force arrow that sweeps in and out of it */
function drawConeDiagram(g: CanvasRenderingContext2D, w: number, hh: number, t: number, inText: string, outText: string, lang: string): void {
  g.fillStyle = '#141414';
  g.fillRect(0, 0, w, hh);
  const cx = w * 0.42,
    cy = hh * 0.55;
  const mu = 0.5;
  const half = Math.atan(mu);
  const L = hh * 0.42;
  // object
  g.fillStyle = '#e7e5e4';
  g.beginPath();
  g.ellipse(cx + L * 0.55, cy, L * 0.5, L * 0.7, 0, 0, Math.PI * 2);
  g.fill();
  // jaw
  g.fillStyle = '#292929';
  g.fillRect(cx - 26, cy - L * 0.5, 22, L);
  // cone
  g.fillStyle = 'rgba(45,212,191,0.22)';
  g.strokeStyle = '#2dd4bf';
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(cx, cy);
  g.lineTo(cx + L * Math.cos(half), cy - L * Math.sin(half));
  g.lineTo(cx + L * Math.cos(half), cy + L * Math.sin(half));
  g.closePath();
  g.fill();
  g.stroke();
  // force arrow angle sweeps 10° … 45°
  const ang = ((10 + 35 * (0.5 + 0.5 * Math.sin(t * 1.4))) * Math.PI) / 180;
  const inside = ang <= half;
  g.strokeStyle = inside ? '#2dd4bf' : '#fbbf24';
  g.fillStyle = g.strokeStyle;
  g.lineWidth = 4;
  const ex = cx + L * 0.85 * Math.cos(ang),
    ey = cy - L * 0.85 * Math.sin(ang);
  g.beginPath();
  g.moveTo(cx, cy);
  g.lineTo(ex, ey);
  g.stroke();
  g.font = '13px "Geist Mono", monospace';
  g.fillText(inside ? inText : outText, 14, 22);
  g.fillStyle = '#a8a29e';
  g.fillText(`atan μ = ${Math.round((half * 180) / Math.PI)}° · μ = ${lang === 'de' ? '0,5' : '0.5'}`, 14, hh - 14);
}
