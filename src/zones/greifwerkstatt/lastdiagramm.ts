/**
 * Station C „Lastdiagramm“ ◆ → M3 (Messen), plan §4.4. Replaces „200 Griffe“ (retired, src/systems/retired.ts).
 *
 * The real SO-101 follower (TheRobotStudio / Hugging Face, Apache-2.0, through ctx.robots) on a test
 * bench in the former cabinet at (7, 0, 6). Reach and payload never peak together: the shoulder motor
 * holds a torque, τ = g · (Σ mᵢ · xᵢ + m · x), so the same arm carries much close to its body and almost
 * nothing stretched out. The link masses and centres of mass are WP0's manifest `inertials`; the
 * geometry is read from the loaded model (lastModel.ts → PlanarArm). Two servo figures, both shown:
 * rated 6,5 kg·cm and the stall band 16,5–19,5 kg·cm (two sources disagree, R1 §1.1).
 *
 *  Do       mouse = reach (IK keeps the jaws level), LMB held = lower, F = hang a weight / grip the gear;
 *           a torque bar with the Nenn mark and the Spitze band. Above Nenn amber („nur kurz“), inside the
 *           band a tremble, above it the shoulder gives way until it holds (nothing breaks).
 *  Predict  „Wie viel Gramm hält der Arm ganz gestreckt dauerhaft?“ (the zone's one prediction)
 *  Measure  „Lastdiagramm aufnehmen“: 6 reach points 0,10 … 0,41 m, the rig finds the payload at Nenn
 *           and at both stall edges by bisection (2×, ≤ 10 s); a Kennlinie with two curves.
 *  Task     „Bring das 100-g-Zahnrad in die hintere Kiste, ohne den Nennwert zu überschreiten.“
 *  ★ diagram with ≥ 4 reach points (stamp) · ★★ prediction within ±40 g · ★★★ the gear task under Nenn
 *  Card #5 „Wie viele Objektlagen?“ on the stamp. The UR5e point (5 kg bis 850 mm, HERSTELLERANGABE)
 *  stands on its own plaque: one vendor point for scale, no comparison, no score.
 */
import * as THREE from 'three';
import type { InfoCardSpec, KennlinieHandle, KennlinieSpec, RobotModel, Stars } from '@/core/zones';
import { css } from '@/core/zones';
import { COL, type Ctx, box, h, merge, paint, panelRoot, setShadow } from './shared';
import { rbox, type Look } from './look';
import type { Sfx } from './sfx';
import { FLOOR_H } from './shell';
import { bisectPayload, carryPeak, diagramPoint, KGCM, maxReach, payloadKg, pose, sagAngle, torqueOf, type ArmPose, type DiagramPoint, type PlanarArm, type Q3 } from './lastModel';
import { BENCH, LD, LIMITS, SERVO, TASK } from './tuning';

const CX = 7,
  CZ = 6;
const X0 = 5,
  X1 = 9,
  Z0 = 4.75,
  Z1 = 7.25;
const TOP = FLOOR_H + 0.78; // bench top inside the cabinet frame
const ROOF = FLOOR_H + 2.5;
const LECTERN = { x: CX + 3.4, z: 8.6 };
const CRATE = { x: 8.75, z: 8.05 };
const ARM_JOINTS = ['shoulder_pan', 'shoulder_lift', 'elbow_flex', 'wrist_flex', 'wrist_roll', 'gripper'] as const;
const PLANAR = ['shoulder_lift', 'elbow_flex', 'wrist_flex'] as const;
const INERTIAL_SEG: Record<string, 1 | 2 | 3> = { upper_arm_link: 1, lower_arm_link: 2, wrist_link: 3, gripper_link: 3, moving_jaw_so101_v1_link: 3 };
/** gripper joint: open / closed (rad) */
const JAW_OPEN = 0.9,
  JAW_SHUT = 0.12;

export interface StationC {
  update(dt: number, elapsed: number): void;
  readonly done: boolean;
  debug: {
    enter(): void;
    solve(): Promise<void>;
    stars3(): Promise<void>;
    state(): Record<string, unknown>;
    /** the model numbers for tools/lastdiagramm-check.mjs (waits for the robot) */
    model(): Promise<Record<string, unknown> | null>;
    /** screen pixels (CSS) of the gear and the box centre, for scripted play */
    aim(): { gear: [number, number]; box: [number, number] };
  };
}

type Phase = 'idle' | 'measure';

interface Kinematics {
  arm: PlanarArm;
  /** pan axis (bench-local x, z) and the arm plane's lateral offset at pan 0 (bench-local z) */
  pan: { x: number; z: number; d0: number; k: number };
  rMax: number;
}

export function buildStationC(ctx: Ctx, sfx: Sfx, look: Look, hooks: { onStamp(): void; say(key: string): void; onUse(): void }): StationC {
  const M = ctx.materials;
  const ext = ctx.groups.exterior;
  const det = ctx.groups.detail;
  const vc = M.standard({ vertexColors: true, metalness: 0.3, roughness: 0.62 });
  const T = (k: string, p?: Record<string, string | number>): string => ctx.t(`c.${k}`, p);
  const n0 = (v: number): string => ctx.i18n.num(v, 0);
  const n1 = (v: number): string => ctx.i18n.num(v, 1);
  const n2 = (v: number): string => ctx.i18n.num(v, 2);

  // ── the former cabinet as an open test bench: ceramic plinth, carbon top and roof, alu frame ──
  // (exterior: a landmark of the plot; the glass came off so the camera sees the arm without a pane)
  const plinth = new THREE.Mesh(rbox(X1 - X0, TOP - FLOOR_H - 0.12, Z1 - Z0, 0.06).translate(CX, (TOP + FLOOR_H + 0.12) / 2 - 0.02, CZ), look.hull);
  setShadow(plinth, true);
  ext.add(plinth);
  const carbonParts = new THREE.Mesh(
    merge(
      [
        new THREE.BoxGeometry(X1 - X0 - 0.4, 0.12, Z1 - Z0 - 0.4).translate(CX, FLOOR_H + 0.06, CZ).toNonIndexed(),
        rbox(X1 - X0 + 0.04, 0.04, Z1 - Z0 + 0.04, 0.015).translate(CX, TOP - 0.02, CZ),
        rbox(X1 - X0, 0.04, Z1 - Z0, 0.015).translate(CX, ROOF + 0.05, CZ),
        // the diagram board's back above the front
        rbox(4.16, 2.36, 0.12, 0.04).translate(CX, ROOF + 0.06 + 1.18, Z1 - 0.02),
      ].map((g) => (g.deleteAttribute('uv'), g)),
    ),
    look.carbon,
  );
  setShadow(carbonParts, true);
  ext.add(carbonParts);
  const aluParts = new THREE.Mesh(
    merge(
      [
        ...[X0, X1].flatMap((x) => [Z0, Z1].map((z) => new THREE.CylinderGeometry(0.045, 0.045, ROOF - TOP, 12).translate(x, (ROOF + TOP) / 2, z).toNonIndexed())),
        new THREE.BoxGeometry(X1 - X0 + 0.09, 0.07, 0.07).translate(CX, ROOF, Z0).toNonIndexed(),
        new THREE.BoxGeometry(X1 - X0 + 0.09, 0.07, 0.07).translate(CX, ROOF, Z1).toNonIndexed(),
        new THREE.BoxGeometry(0.07, 0.07, Z1 - Z0).translate(X0, ROOF, CZ).toNonIndexed(),
        new THREE.BoxGeometry(0.07, 0.07, Z1 - Z0).translate(X1, ROOF, CZ).toNonIndexed(),
        new THREE.BoxGeometry(X1 - X0 + 0.06, 0.03, Z1 - Z0 + 0.06).translate(CX, TOP + 0.005, CZ).toNonIndexed(),
        ...[X0 + 0.25, X1 - 0.25].map((x) => new THREE.CylinderGeometry(0.03, 0.03, 0.3, 10).translate(x, ROOF + 0.12, Z1 - 0.06).toNonIndexed()),
        new THREE.BoxGeometry(4.22, 0.04, 0.14).translate(CX, ROOF + 0.06 + 2.38, Z1 - 0.02).toNonIndexed(),
      ].map((g) => (g.deleteAttribute('uv'), g)),
    ),
    look.alu,
  );
  setShadow(aluParts, true);
  ext.add(aluParts);
  // the bench is waist high: the player walks round it, the arm stays out of reach of the camera rig
  ctx.physics.addStaticBox({ size: [X1 - X0 + 0.1, TOP + 0.05, Z1 - Z0 + 0.1], position: [CX, (TOP + 0.05) / 2, CZ] });

  // ── the diagram board above the bench (canvas; detail: it is read from the station) ──
  const BW = 1024,
    BH = 590;
  const boardCanvas = document.createElement('canvas');
  boardCanvas.width = BW;
  boardCanvas.height = BH;
  const boardTex = new THREE.CanvasTexture(boardCanvas);
  boardTex.colorSpace = THREE.SRGBColorSpace;
  boardTex.anisotropy = 8;
  ctx.onDispose(() => boardTex.dispose());
  const boardMat = new THREE.MeshBasicMaterial({ map: boardTex, toneMapped: false });
  ctx.onDispose(() => boardMat.dispose());
  const board = new THREE.Mesh(new THREE.PlaneGeometry(4, 2.3), boardMat);
  board.position.set(CX, ROOF + 0.06 + 1.18, Z1 + 0.045);
  det.add(board);

  // ── bench props (detail, one draw): weight rack, the gear's pedestal, the box, the 0,35 m ruler,
  //    the load cell of the rig, the arm's base plate ──
  const bench = (x: number, z: number): [number, number] => [BENCH.x + x, BENCH.z + z];
  /** bench-local polar (azimuth + = toward the back, −z) → zone-local x/z for a horizontal distance ρ from the pan axis */
  let panX = 0.0388,
    panZ = 0;
  const polarXZ = (az: number, rho: number): [number, number] => bench(panX + Math.cos(az) * rho, panZ - Math.sin(az) * rho);
  // the arm stands on a 12 mm base plate; its shoulder axis is 0,117 m above the base's floor (the model's
  // value replaces this once it is loaded)
  const ARM_Y = TOP + 0.012;
  let shoulderUp = 0.1166;
  const yOf = (hRel: number): number => ARM_Y + shoulderUp + hRel;
  const parts: THREE.BufferGeometry[] = [];
  // a work mat that frames the arm's reach (the bench is 4 m wide, the arm reaches 0,41 m) and the base plate
  parts.push(paint(box(1.15, 0.003, 0.95, BENCH.x + 0.12, TOP + 0.0015, BENCH.z + 0.04), 0x57534e));
  parts.push(paint(box(0.2, 0.012, 0.16, BENCH.x + 0.02, TOP + 0.006, BENCH.z), COL.chassis));
  // weight rack (front left), four steel weights stand on it when they are not hanging
  const RACK = bench(-0.18, 0.34);
  parts.push(paint(box(0.32, 0.03, 0.09, RACK[0], TOP + 0.015, RACK[1]), COL.structure));
  const WEIGHT_R = (g: number): number => 0.011 + Math.cbrt(g) * 0.0021;
  const WEIGHT_H = (g: number): number => 0.016 + Math.cbrt(g) * 0.0042;
  const rackSlot = (i: number): [number, number] => [RACK[0] - 0.105 + i * 0.07, RACK[1]];
  // the gear's pedestal (front) and the box (back)
  const GEAR_R = 0.032,
    GEAR_T = 0.018;
  const gearAt0 = (): THREE.Vector3 => {
    const [x, z] = polarXZ(TASK.gear.az, TASK.gear.r + 0.03);
    return new THREE.Vector3(x, yOf(TASK.gear.h), z);
  };
  const g0 = gearAt0();
  const pedestalH = g0.y - GEAR_T / 2 - TOP;
  parts.push(paint(new THREE.CylinderGeometry(0.03, 0.036, pedestalH, 18).translate(g0.x, TOP + pedestalH / 2, g0.z), COL.shell));
  const [bx, bz] = polarXZ(TASK.box.az, TASK.box.r + 0.03);
  const BOX_H = 0.052;
  const bw = TASK.boxHalf * 2 + 0.012;
  for (const [sx, sz, w, d] of [
    [0, -1, bw, 0.006],
    [0, 1, bw, 0.006],
    [-1, 0, 0.006, bw],
    [1, 0, 0.006, bw],
  ] as const)
    parts.push(paint(box(w, BOX_H, d, bx + (sx * bw) / 2, TOP + BOX_H / 2, bz + (sz * bw) / 2), 0x9a9188));
  parts.push(paint(box(bw, 0.004, bw, bx, TOP + 0.002, bz), 0x6b645d));
  // ruler between pedestal and box (teal = data): the 0,35 m the gear has to travel
  {
    const a = new THREE.Vector2(g0.x, g0.z),
      b = new THREE.Vector2(bx, bz);
    const len = a.distanceTo(b),
      ang = Math.atan2(b.y - a.y, b.x - a.x);
    const g = box(len, 0.002, 0.006, 0, 0, 0);
    g.rotateY(-ang);
    g.translate((a.x + b.x) / 2, TOP + 0.001, (a.y + b.y) / 2);
    parts.push(paint(g, COL.teal));
  }
  // load cell of the rig on the bench in front of the arm, with its hook post
  const CELL = bench(0.42, 0.0);
  parts.push(paint(box(0.07, 0.03, 0.07, CELL[0], TOP + 0.015, CELL[1]), COL.chassis));
  parts.push(paint(box(0.012, 0.012, 0.012, CELL[0], TOP + 0.036, CELL[1]), COL.orange));
  const props = new THREE.Mesh(merge(parts), vc);
  setShadow(props, false);
  det.add(props);

  // test weights (instanced, one draw): on the rack or hanging from the jaws
  const weightGeo = new THREE.CylinderGeometry(1, 1, 1, 20);
  ctx.onDispose(() => weightGeo.dispose());
  const weights = new THREE.InstancedMesh(weightGeo, M.standard({ color: 0x8a8580, metalness: 0.75, roughness: 0.32 }), LD.weights.length);
  weights.frustumCulled = false;
  weights.castShadow = true;
  det.add(weights);
  // the gear part (100 g): a toothed disc, its own mesh (it travels)
  const gearMesh = new THREE.Mesh(gearGeometry(GEAR_R, GEAR_T, 14), M.standard({ color: 0xb9a68a, metalness: 0.55, roughness: 0.38 }));
  gearMesh.castShadow = true;
  gearMesh.position.copy(g0);
  det.add(gearMesh);
  // the wire from the jaws to a hanging weight, and the rig's pull cable to the load cell
  const wireGeo = new THREE.BufferGeometry();
  const wirePos = new Float32Array(12);
  wireGeo.setAttribute('position', new THREE.BufferAttribute(wirePos, 3));
  const wire = new THREE.LineSegments(wireGeo, new THREE.LineBasicMaterial({ color: 0x2dd4bf }));
  wire.frustumCulled = false;
  det.add(wire);
  ctx.onDispose(() => {
    wireGeo.dispose();
    (wire.material as THREE.Material).dispose();
  });
  // the 18-kg crate from the Dunkelfabrik on the floor, the station's joke („Nein.“)
  const crate = new THREE.Mesh(rbox(0.6, 0.4, 0.4, 0.03).translate(0, 0.2, 0), M.crate);
  crate.position.set(CRATE.x, FLOOR_H, CRATE.z);
  crate.rotation.y = 0.35;
  crate.castShadow = true;
  det.add(crate);
  ctx.physics.addStaticBox({ size: [0.6, 0.4, 0.4], position: [CRATE.x, FLOOR_H + 0.2, CRATE.z], rotation: [0, 0.35, 0] });

  // bench label strip (one canvas): the weights, the gear, the box, the ruler and the crate's tag
  const LW = 1024,
    LH = 128;
  const labelCanvas = document.createElement('canvas');
  labelCanvas.width = LW;
  labelCanvas.height = LH;
  const labelTex = new THREE.CanvasTexture(labelCanvas);
  labelTex.colorSpace = THREE.SRGBColorSpace;
  ctx.onDispose(() => labelTex.dispose());
  const labelMat = new THREE.MeshBasicMaterial({ map: labelTex, transparent: true, toneMapped: false });
  ctx.onDispose(() => labelMat.dispose());
  // lying on the bench at the work mat's front edge, readable from the console camera
  const strip = new THREE.Mesh(new THREE.PlaneGeometry(0.72, 0.09), labelMat);
  strip.rotation.x = -Math.PI / 2;
  strip.position.set(BENCH.x + 0.12, TOP + 0.004, BENCH.z + 0.56);
  det.add(strip);
  const crateTag = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.13), labelMat);
  {
    // the crate tag uses the right end of the strip canvas (uv 0.72…1)
    const uv = crateTag.geometry.getAttribute('uv') as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setX(i, 0.72 + uv.getX(i) * 0.28);
  }
  crateTag.position.set(0, 0.24, 0.201);
  crate.add(crateTag);
  {
    const uv = strip.geometry.getAttribute('uv') as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * 0.7);
  }
  const drawLabels = (): void => {
    const g = labelCanvas.getContext('2d')!;
    g.clearRect(0, 0, LW, LH);
    g.fillStyle = 'rgba(18,17,16,0.92)';
    g.fillRect(0, 0, LW * 0.7, LH);
    g.fillStyle = '#a8a29e';
    g.font = '500 30px "Geist Mono", monospace';
    g.fillText(T('stripWeights'), 22, 52);
    g.fillStyle = '#f5f5f4';
    g.font = '600 34px "Geist", sans-serif';
    g.fillText(T('stripTask'), 22, 102);
    // crate tag
    g.fillStyle = '#e7e5e4';
    g.fillRect(LW * 0.72, 0, LW * 0.28, LH);
    g.fillStyle = '#1c1917';
    g.font = '700 56px "Space Grotesk", sans-serif';
    g.fillText('18 kg', LW * 0.72 + 22, 70);
    g.font = '500 24px "Geist Mono", monospace';
    g.fillStyle = '#44403c';
    g.fillText(T('crateTag'), LW * 0.72 + 22, 108);
    labelTex.needsUpdate = true;
  };
  drawLabels();

  // the UR5e plaque on the cabinet's front post: one vendor point for scale (its own card)
  const PW = 512,
    PH = 256;
  const plaqueCanvas = document.createElement('canvas');
  plaqueCanvas.width = PW;
  plaqueCanvas.height = PH;
  const plaqueTex = new THREE.CanvasTexture(plaqueCanvas);
  plaqueTex.colorSpace = THREE.SRGBColorSpace;
  ctx.onDispose(() => plaqueTex.dispose());
  const plaqueMat = new THREE.MeshBasicMaterial({ map: plaqueTex, toneMapped: false });
  ctx.onDispose(() => plaqueMat.dispose());
  const plaque = new THREE.Mesh(new THREE.PlaneGeometry(0.56, 0.28), plaqueMat);
  plaque.position.set(X1 + 0.31, 1.42, Z1 + 0.06);
  det.add(plaque);
  const plaqueBack = new THREE.Mesh(rbox(0.6, 0.32, 0.03, 0.01).translate(X1 + 0.31, 1.42, Z1 + 0.04), look.carbon);
  det.add(plaqueBack);
  const plaquePost = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.26, 8).translate(X1 + 0.31, FLOOR_H + 0.63, Z1 + 0.02), look.alu);
  det.add(plaquePost);
  const drawPlaque = (): void => {
    const g = plaqueCanvas.getContext('2d')!;
    g.fillStyle = '#141312';
    g.fillRect(0, 0, PW, PH);
    g.fillStyle = '#a8a29e';
    g.font = '500 22px "Geist Mono", monospace';
    g.fillText(T('plaqueEyebrow'), 22, 40);
    g.fillStyle = '#f5f5f4';
    g.font = '700 46px "Space Grotesk", sans-serif';
    g.fillText('UR5e · 5 kg · 850 mm', 22, 108);
    g.fillStyle = '#d6d3d1';
    g.font = '400 22px "Geist", sans-serif';
    g.fillText(T('plaqueLine'), 22, 152);
    pillCanvas(g, 22, 186, ctx.i18n.resolve({ de: 'HERSTELLERANGABE', en: 'VENDOR SPEC' }), '#d6d3d1');
    g.fillStyle = '#78716c';
    g.font = '400 18px "Geist", sans-serif';
    g.fillText(T('plaqueSrc'), 262, 206);
    plaqueTex.needsUpdate = true;
  };
  drawPlaque();

  // console (the rc4 lectern, moved nothing): the orange knob is what players aim at
  const lectern = new THREE.Mesh(
    merge([
      paint(box(0.55, 0.92, 0.38, 0, 0.46 + FLOOR_H, 0), COL.chassis),
      paint(box(0.66, 0.06, 0.48, 0, 0.96 + FLOOR_H, 0.03, -0.42), COL.carbon),
      paint(box(0.48, 0.012, 0.3, 0, 0.995 + FLOOR_H, 0.04, -0.42), COL.teal),
    ]),
    vc,
  );
  lectern.position.set(LECTERN.x, 0, LECTERN.z);
  det.add(lectern);
  ctx.physics.addStaticBox({ size: [0.6, 1.0, 0.45], position: [LECTERN.x, 0.5, LECTERN.z] });
  const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.055, 0.04, 20), M.accentOrange);
  knob.position.set(0.2, 1.07 + FLOOR_H, 0.04);
  knob.rotation.x = -0.42;
  lectern.add(knob);
  ctx.lights.point([BENCH.x + 0.1, TOP + 1.1, BENCH.z + 0.25], { color: 0xfff1dc, intensity: 2.6, distance: 3.2 });

  // ── the real SO-101 (ctx.robots: queued, LOD-tracked, released with the zone) ──────────────
  const armRoot = new THREE.Group();
  armRoot.position.set(BENCH.x, ARM_Y, BENCH.z);
  det.add(armRoot);
  let model: RobotModel | null = null;
  let kin: Kinematics | null = null;
  let loadFailed: string | null = null;
  const modelReady = ctx.robots
    .load('so101', { castShadow: true })
    .then(async (m) => {
      const info = await ctx.robots.info('so101');
      model = m;
      armRoot.add(m.object);
      kin = derive(m, info.inertials, armRoot);
      // the bench props follow the measured pan axis (a few millimetres from the pipeline's nominal)
      ({ x: panX, z: panZ } = kin.pan);
      shoulderUp = kin.arm.S[1];
      applyPose(true);
      return m;
    })
    .catch((err: unknown) => {
      loadFailed = String(err);
      console.warn('[greifwerkstatt] so101:', err);
      return null;
    });

  // ── state ─────────────────────────────────────────────────────────────────
  type Saved = { pts: { r: number; nenn: number; lo: number; hi: number }[]; tip: number | null; tipJudged: boolean; task: boolean; taskTries: number };
  const saved = ctx.progress.get<Saved | null>('ld', null);
  const points: { r: number; nenn: number; lo: number; hi: number }[] = (saved?.pts ?? []).filter((p) => LD.reaches.some((r) => Math.abs(r - p.r) < 1e-6));
  let tip: number | null = saved?.tip ?? null;
  let taskDone = saved?.task ?? false;
  let taskTries = saved?.taskTries ?? 0;
  const save = (): void => ctx.progress.set('ld', { pts: points, tip, tipJudged: tip != null, task: taskDone, taskTries } satisfies Saved);
  let done = ctx.pass.has('lastdiagramm');
  let operating = false;
  let phase: Phase = 'idle';

  // steering: the target (bench polar), the pose, the load
  const target: { az: number; r: number; h: number } = { az: 0, r: 0.3, h: LD.carryH };
  const shown: { az: number; r: number; h: number } = { az: 0, r: 0.3, h: LD.carryH };
  let lower = false;
  let hang = 0; // test weight hanging (g)
  let gear: 'pedestal' | 'held' | 'bench' | 'box' = 'pedestal';
  const gearRest = g0.clone();
  let attempt: { over: boolean; peak: number } | null = null;
  let q: Q3 = [0, 0, 0];
  let qPan = 0;
  let curPose: ArmPose | null = null;
  let sag = 0;
  let tau = 0;
  let jaw = JAW_OPEN;
  let overSaid = false,
    sagSaid = false,
    keySaid = ctx.progress.get('ldKeySaid', false);
  let lastBand: 'ok' | 'nenn' | 'band' | 'sag' = 'ok';
  const loadKg = (): number => (gear === 'held' ? LD.gearKg : hang / 1000);

  // ── the challenge (★ ≥ 4 points · ★★ tip within ±40 g · ★★★ the gear task under Nenn) ─────
  const stretched = (): { nenn: number; lo: number; hi: number } | null => {
    if (!kin) return null;
    const p = diagramPoint(kin.arm, kin.rMax, LD.measureH, LIMITS);
    return p ? { nenn: p.nenn, lo: p.lo, hi: p.hi } : null;
  };
  const tipOk = (): boolean => {
    const s = stretched();
    return tip != null && s != null && Math.abs(tip - s.nenn) <= LD.tipTolG + 1e-9;
  };
  const starsNow = (): Stars => (!ctx.pass.has('lastdiagramm') ? 0 : ((1 + (tipOk() ? 1 : 0) + (taskDone ? 1 : 0)) as Stars));
  const ch = ctx.game.challenge({
    id: 'lastdiagramm',
    title: ctx.i18n.text('game.c.title'),
    goals: [{ text: ctx.i18n.text('game.c.g1') }, { text: ctx.i18n.text('game.c.g2') }, { text: ctx.i18n.text('game.c.g3') }],
    lesson: ctx.i18n.text('game.c.lesson'),
    why: () => cardSpec(),
    retry: () => {
      // a fresh tip (the Prognose-Güte keeps the first) and the gear back on its pedestal
      tip = null;
      resetGear();
      save();
      refreshPanel();
      if (!operating) ctx.ui.hint(ctx.i18n.text('c.retryHint'), 3);
    },
  });
  let shownStars = ch.stars;
  const judge = (detail?: () => string): void => {
    const st = starsNow();
    if (st <= shownStars) return;
    shownStars = st;
    ch.submit(null, { stars: st, detail: detail ?? (() => detailText()) });
    ctx.game.juice.burst([BENCH.x + 0.2, TOP + 0.6, BENCH.z], { tone: 'teal', count: 60, spread: 0.7 });
    ctx.game.juice.cue('great');
  };
  const detailText = (): string => {
    const s = stretched();
    const parts2: string[] = [];
    if (tip != null && s) parts2.push(T('detailTip', { t: n0(tip), m: n0(s.nenn) }));
    parts2.push(taskDone ? T('detailTask') : T('detailNoTask'));
    return parts2.join(' · ');
  };

  // ── kinematics: the target (bench polar) → joints, the torque, the sag ──────────────────────
  const solveTarget = (): void => {
    if (!kin) return;
    const r = Math.min(kin.rMax, Math.max(0.06, shown.r));
    const p = pose(kin.arm, r, shown.h, curPose?.q ?? null) ?? pose(kin.arm, r, shown.h) ?? curPose;
    if (!p) return;
    curPose = p;
    q = [...p.q] as Q3;
    qPan = panFor(kin, shown.az, r);
    tau = torqueOf(kin.arm, p, loadKg());
  };
  const applyPose = (instant = false): void => {
    if (!model || !kin) return;
    if (instant) Object.assign(shown, target);
    solveTarget();
    model.setJoint('shoulder_pan', qPan);
    // the shoulder gives way above the stall band until it holds (nothing breaks)
    model.setJoint('shoulder_lift', q[0] - sag / kin.arm.s[0]);
    model.setJoint('elbow_flex', q[1]);
    model.setJoint('wrist_flex', q[2]);
    model.setJoint('gripper', jaw);
  };
  /** the grasp point and the pan axis in zone-local coordinates (for the weight, the gear, the wire) */
  const _gp = new THREE.Vector3();
  const graspLocal = (out: THREE.Vector3): THREE.Vector3 | null => {
    if (!model || !model.getLinkWorldPosition('gripper_frame_link', out)) return null;
    return ctx.toLocal(out, out);
  };

  // ── the measurement run: 6 reach points, bisection at Nenn and at the band's edges ───────────
  let run: null | { i: number; t: number; dp: DiagramPoint | null; tried: number[]; ghost: number } = null;
  const startMeasure = async (): Promise<void> => {
    if (phase !== 'idle' || !kin) return;
    if (tip == null) {
      const v = await ctx.ui.predict({ question: ctx.i18n.text('c.predict'), unit: 'g', min: LD.predict.min, max: LD.predict.max, step: LD.predict.step, initial: LD.predict.initial, digits: 0 });
      tip = Math.round(v);
      save();
      const s = stretched();
      if (s && !ctx.progress.get('ldPredRecorded', false)) {
        ctx.progress.set('ldPredRecorded', true);
        ctx.pass.recordPrediction('lastdiagramm', tip, s.nenn, { min: LD.predict.min, max: LD.predict.max, scale: 'linear' });
      }
    }
    if (phase !== 'idle') return;
    if (gear === 'held') dropGear(false);
    hang = 0;
    phase = 'measure';
    run = { i: 0, t: 0, dp: null, tried: [], ghost: 0 };
    ctx.game.unattended(true, 'lastdiagramm');
    hooks.say(points.length ? 'emi.cAgain' : 'emi.cMeasure');
    ctx.audio.play('click');
    refreshPanel();
  };
  const stepMeasure = (dt: number): void => {
    if (!run || !kin) return;
    run.t += dt;
    const per = LD.driveS + LD.bisectS;
    const i = Math.floor(run.t / per);
    if (i !== run.i || !run.dp) {
      if (run.dp && i > run.i) commitPoint(run.dp);
      if (i >= LD.reaches.length) return finishMeasure();
      run.i = i;
      run.dp = diagramPoint(kin.arm, LD.reaches[i], LD.measureH, LIMITS);
      // the rig's tries at the band's upper edge (the white Nenn curve follows from the same pull)
      if (run.dp) run.tried = bisectPayload(kin.arm, run.dp.pose, LIMITS.hi, LD.bisectShown).tried;
      target.r = LD.reaches[i];
      target.h = LD.measureH;
      target.az = 0;
    }
    // the rig's ghost load: the bisection's tries, one per step
    const u = run.t - run.i * per - LD.driveS;
    if (u > 0 && run.dp) {
      const k = Math.min(run.tried.length - 1, Math.floor((u / LD.bisectS) * run.tried.length));
      const prev = run.ghost;
      run.ghost = run.tried[Math.max(0, k)] ?? 0;
      if (prev !== run.ghost) sfx.clack('ld-bisect', armTipFallback(), 1.4 + k * 0.08, 0.5);
    }
  };
  const commitPoint = (dp: DiagramPoint): void => {
    const j = points.findIndex((p) => Math.abs(p.r - dp.r) < 1e-6);
    const row = { r: dp.r, nenn: dp.nenn, lo: dp.lo, hi: dp.hi };
    if (j >= 0) points[j] = row;
    else points.push(row);
    points.sort((a, b) => a.r - b.r);
    save();
    const at: [number, number, number] = [CX, ROOF + 0.4, Z1 + 0.3];
    ctx.game.juice.popup(at, () => T('popPoint', { r: n2(dp.r), n: n0(dp.nenn) }), { tone: 'teal', seconds: 1.4 });
    ctx.game.juice.cue('tick', { pitch: 1 + points.length * 0.07 });
    refreshCurves();
    boardDirty = true;
    if (points.length >= LD.stampPoints) checkStamp();
  };
  const finishMeasure = (): void => {
    if (run?.dp) commitPoint(run.dp);
    run = null;
    phase = 'idle';
    ctx.game.unattended(false, 'lastdiagramm');
    target.r = 0.22;
    target.h = LD.carryH;
    ctx.audio.play('success', { volume: 0.5, at: [BENCH.x, TOP + 0.3, BENCH.z] });
    if (!keySaid) {
      keySaid = true;
      ctx.progress.set('ldKeySaid', true);
      ctx.after(0.6, () => hooks.say('emi.cKey'));
    }
    judge();
    refreshPanel();
  };
  const abortMeasure = (): void => {
    if (!run) return;
    run = null;
    phase = 'idle';
    ctx.game.unattended(false, 'lastdiagramm');
    target.h = LD.carryH;
  };

  const stampValue = (): { de: string; en: string } => {
    const s = stretched();
    const at20 = kin ? payloadAt(kin, 0.2) : null;
    const band = s ? `${round10(s.lo)}–${round10(s.hi)}` : '–';
    return {
      de: `Nennlast gestreckt ${s ? s.nenn : 0} g · bei 0,20 m ${at20 ?? '–'} g · Spitze gestreckt ${band} g`,
      en: `Rated load stretched ${s ? s.nenn : 0} g · at 0.20 m ${at20 ?? '–'} g · peak stretched ${band} g`,
    };
  };
  const checkStamp = (): void => {
    if (done || points.length < LD.stampPoints) return;
    done = true;
    ctx.pass.award('lastdiagramm', { value: stampValue(), curve: points.map((p) => p.nenn) });
    ctx.pass.awardQuestion(5);
    hooks.onStamp();
    judge();
  };

  // ── the gear task ─────────────────────────────────────────────────────────
  const nearGear = (): boolean => {
    const p = graspLocal(_gp);
    if (!p) return false;
    return Math.hypot(p.x - gearMesh.position.x, p.z - gearMesh.position.z) <= TASK.tol && p.y - gearMesh.position.y < 0.025;
  };
  const inBox = (p: THREE.Vector3): boolean => Math.abs(p.x - bx) <= TASK.boxHalf && Math.abs(p.z - bz) <= TASK.boxHalf;
  const gripGear = (): void => {
    gear = 'held';
    hang = 0;
    attempt ??= { over: false, peak: 0 };
    taskTries++;
    save();
    sfx.clack('ld-grip', armTipFallback(), 1.1, 0.8);
    ctx.audio.play('grab', { at: gearMesh.position });
    if (!ctx.progress.get('ldTaskSaid', false)) {
      ctx.progress.set('ldTaskSaid', true);
      hooks.say('emi.cTask');
    }
    refreshPanel();
  };
  const dropGear = (judgeIt = true): void => {
    const p = graspLocal(_gp) ?? gearMesh.position.clone();
    if (judgeIt && inBox(p)) {
      gear = 'box';
      gearMesh.position.set(bx, TOP + 0.004 + GEAR_T / 2, bz);
      ctx.audio.play('drop', { at: gearMesh.position, pitch: 1.2 });
      const a = attempt;
      attempt = null;
      if (a && !a.over) {
        const first = !taskDone;
        taskDone = true;
        save();
        ctx.game.juice.popup([bx, TOP + 0.35, bz], () => T('popTask', { t: n1(a.peak / KGCM) }), { tone: 'teal', seconds: 2.4 });
        ctx.game.juice.burst([bx, TOP + 0.1, bz], { tone: 'teal', count: 30, spread: 0.25 });
        ctx.game.juice.cue('good', { at: [bx, TOP, bz] });
        if (first) hooks.say('emi.cTaskDone');
        if (ctx.pass.has('lastdiagramm')) judge();
        else ctx.ui.hint(ctx.i18n.text('c.taskBeforeStamp'), 4);
      } else {
        ctx.game.juice.popup([bx, TOP + 0.35, bz], () => T('popTaskOver'), { tone: 'muted', seconds: 2.4 });
        ctx.after(1.6, () => gear === 'box' && resetGear());
      }
    } else {
      // set down on the bench where the jaws are (two moves are allowed: the attempt goes on)
      gear = 'bench';
      gearMesh.position.set(p.x, Math.max(TOP + GEAR_T / 2, p.y), p.z);
      if (Math.hypot(p.x - gearRest.x, p.z - gearRest.z) < 0.04) gearMesh.position.copy(gearRest);
      else gearMesh.position.y = TOP + GEAR_T / 2;
      ctx.audio.play('drop', { at: gearMesh.position, pitch: 1.4 });
    }
    sfx.clack('ld-grip', armTipFallback(), 0.9, 0.6);
    refreshPanel();
  };
  const resetGear = (): void => {
    gear = 'pedestal';
    attempt = null;
    gearMesh.position.copy(gearRest);
    gearMesh.rotation.set(0, 0, 0);
  };
  const cycleWeight = (): void => {
    if (gear === 'held') return dropGear();
    if (nearGear()) return gripGear();
    const all = [0, ...LD.weights];
    hang = all[(all.indexOf(hang) + 1) % all.length];
    ctx.audio.play(hang ? 'grab' : 'drop', { at: armTipFallback(), pitch: 1.3 });
    refreshPanel();
  };
  const setWeight = (g: number): void => {
    if (phase !== 'idle') return;
    if (gear === 'held') dropGear(false);
    hang = g;
    ctx.audio.play(g ? 'grab' : 'drop', { at: armTipFallback(), pitch: 1.3 });
    refreshPanel();
  };
  const armTipFallback = (): THREE.Vector3 => graspLocal(new THREE.Vector3()) ?? new THREE.Vector3(BENCH.x + 0.3, TOP + 0.2, BENCH.z);

  // ── the crate joke: „Nein.“ (and the wrist shakes its head) ─────────────────
  let shake = 0;
  ctx.addInteractable({
    object: crate,
    label: ctx.i18n.text('c.crate'),
    range: 2.4,
    onInteract: () => {
      shake = 1.2;
      ctx.game.juice.popup([BENCH.x + 0.2, TOP + 0.55, BENCH.z], () => T('nein'), { tone: 'accent', seconds: 1.8 });
      ctx.game.juice.cue('oops', { at: [BENCH.x, TOP + 0.3, BENCH.z] });
      sfx.servo('ld-shake', { x: BENCH.x, y: TOP + 0.3, z: BENCH.z }, 2.4, 0.8);
      ctx.after(1.2, () => sfx.servo('ld-shake', { x: BENCH.x, y: TOP + 0.3, z: BENCH.z }, 0));
      hooks.say('emi.cCrate');
    },
  });
  ctx.addInteractable({ object: plaque, label: ctx.i18n.text('c.plaque'), range: 2.6, onInteract: () => void ctx.ui.card(ur5eCard()) });

  // ── the panel ─────────────────────────────────────────────────────────────
  let ui: null | { refresh(): void } = null;
  let k1: KennlinieHandle | null = null;
  const spec1 = (): KennlinieSpec => {
    const xs = points.map((p) => p.r);
    return {
      title: ctx.i18n.text('c.kTitle'),
      xLabel: ctx.i18n.text('c.kX'),
      yLabel: ctx.i18n.text('c.kY'),
      chip: 'modell',
      xMin: 0,
      xMax: 0.45,
      yMin: 0,
      yMax: 2.1,
      // the key value is the stretched point once it is measured (R1's „0 g at rated torque“)
      keyValue: (() => {
        const p = points.find((x) => Math.abs(x.r - LD.reaches[LD.reaches.length - 1]) < 1e-6);
        return p ? T('kKey', { n: n0(p.nenn) }) : undefined;
      })(),
      series: [
        { id: 'nenn', label: ctx.i18n.text('c.sNenn'), points: points.map((p) => [p.r, p.nenn / 1000] as [number, number]), color: css.text },
        { id: 'lo', label: ctx.i18n.text('c.sSpitze'), line: points.map((p) => [p.r, p.lo / 1000] as [number, number]), color: css.teal, dashed: true },
        { id: 'hi', line: points.map((p) => [p.r, p.hi / 1000] as [number, number]), color: css.teal, dashed: true },
        ...(xs.length >= 2 ? [{ id: 'nennLine', line: points.map((p) => [p.r, p.nenn / 1000] as [number, number]), color: css.text }] : []),
      ],
    };
  };
  const refreshCurves = (): void => k1?.update(spec1());
  const refreshPanel = (): void => ui?.refresh();

  const buildPanel = (el: HTMLElement, exit: () => void): (() => void) => {
    const root = panelRoot(el);
    // ≤ 35 words at open (plan §4): the operate bar names the station, the head carries the chip only
    const head = h('div', { class: 'gw-head', style: 'justify-content:flex-end' }, ctx.ui.chip('modell', ctx.i18n.text('c.chipModel')));
    const goals = ch.chips();
    goals.style.margin = '8px 0 2px';
    // the torque gauge: bar 0…24 kg·cm, the Nenn mark, the stall band
    const gauge = h('div', { class: 'ld-gauge' });
    const gaugeHead = h('div', { class: 'ld-ghead' });
    const bar = h('div', { class: 'ld-bar' });
    const fill = h('i', {});
    const SCALE = 24;
    const pctOf = (kgcm: number): string => `${(Math.min(SCALE, kgcm) / SCALE) * 100}%`;
    const band = h('b', { class: 'ld-band', style: `left:${pctOf(SERVO.stallLoKgcm)};width:calc(${pctOf(SERVO.stallHiKgcm)} - ${pctOf(SERVO.stallLoKgcm)})` });
    const nennMark = h('u', { class: 'ld-nenn', style: `left:${pctOf(SERVO.nennKgcm)}` });
    bar.append(band, fill, nennMark);
    const marks = h('div', { class: 'ld-marks' }, h('span', { style: `left:${pctOf(SERVO.nennKgcm)}` }, ctx.t('c.mNenn')), h('span', { style: `left:${pctOf((SERVO.stallLoKgcm + SERVO.stallHiKgcm) / 2)}` }, ctx.t('c.mSpitze')));
    gauge.append(gaugeHead, bar, marks);
    // weights (buttons are exempt from the chip rule: they are the player's choice)
    const wRow = h('div', { class: 'gw-row' }, h('span', { class: 'gw-k' }, ctx.t('c.load')));
    const wSeg = h('div', { class: 'seg gw-seg' });
    wRow.append(wSeg);
    const status = h('div', { class: 'gw-result', style: 'display:none' });
    const go = h('button', { class: 'btn primary' }, '');
    go.onclick = () => void startMeasure();
    const info = h('button', { class: 'btn ghost' }, 'ⓘ');
    info.title = ctx.t('c.cardTitle');
    info.onclick = () => void ctx.ui.card(cardSpec());
    const leave = h('button', { class: 'btn ghost' }, 'Esc');
    leave.onclick = exit;
    const btns = h('div', { class: 'gw-row' }, go, h('span', { style: 'flex:1' }), info, leave);
    const kWrap = h('div', {});
    root.append(h('style', {}, LD_CSS), head, goals, gauge, wRow, btns, status, kWrap);
    k1 = ctx.ui.kennlinie(spec1(), { parent: kWrap, width: 360, height: 132 });
    const gLabel = h('span', { class: 'gw-k', style: 'width:auto' });
    const gValue = h('span', { class: 'gw-big ld-v' });
    const gReach = h('span', { class: 'gw-mono gw-muted', 'data-chip': 'ui' });
    gaugeHead.append(gLabel, gValue, gReach);
    const wButtons = [0, ...LD.weights].map((g) => {
      const b = h('button', {}, String(g));
      b.onclick = () => setWeight(g);
      wSeg.append(b);
      return { g, b };
    });
    const render = (): void => {
      const kgcm = tau / KGCM;
      const zone = bandOf(tau);
      gLabel.textContent = ctx.t('c.moment');
      gValue.textContent = `${n1(Math.max(0, kgcm))} kg·cm`;
      gValue.className = `gw-big ld-v ld-${zone}`;
      gReach.textContent = `${n2(Math.max(0, shown.r))} m · ${n0(loadKg() * 1000)} g`;
      fill.style.width = pctOf(Math.max(0, kgcm));
      fill.className = `ld-${zone}`;
      for (const { g, b } of wButtons) {
        b.classList.toggle('on', hang === g && gear !== 'held');
        b.disabled = phase !== 'idle';
      }
      go.textContent = phase === 'measure' ? `${T('measuring')} ${run ? run.i + 1 : 0}/${LD.reaches.length}` : `▶ ${points.length ? T('measureAgain') : T('measure')}`;
      go.disabled = phase !== 'idle' || !kin;
      // the task / band line: only once something happens (≤ 35 words at open)
      let line = '';
      let cls = 'gw-result';
      if (phase === 'measure') line = T('rigLine');
      else if (gear === 'held' || attempt) {
        line = attempt?.over ? T('taskOver') : T('taskOn');
        cls += attempt?.over ? ' bad' : ' good';
      } else if (zone === 'sag') (line = T('sagLine')), (cls += ' bad');
      else if (zone === 'band') (line = T('bandLine')), (cls += ' bad');
      else if (zone === 'nenn') (line = T('nennLine')), (cls += ' bad');
      status.className = cls;
      status.textContent = line;
      status.style.display = line ? '' : 'none';
      kWrap.style.display = points.length ? '' : 'none';
    };
    ui = { refresh: render };
    render();
    return () => {
      k1?.remove();
      k1 = null;
      ui = null;
    };
  };
  ctx.i18n.onChange(() => {
    boardDirty = true;
    drawLabels();
    drawPlaque();
    refreshPanel();
  });

  // ── operate: mouse = reach (on the carry plane), LMB = lower, F = weight / gear, Space = measure ──
  const _o = new THREE.Vector3(),
    _d = new THREE.Vector3();
  const pointTo = (origin: THREE.Vector3, dir: THREE.Vector3): void => {
    if (!kin || phase !== 'idle') return;
    const y = yOf(LD.carryH);
    if (Math.abs(dir.y) < 1e-4) return;
    const t = (y - origin.y) / dir.y;
    if (t <= 0) return;
    _o.copy(origin).addScaledVector(dir, t);
    // zone-local → bench-local (the bench is not rotated): relative to the pan axis
    const dx = _o.x - (BENCH.x + kin.pan.x),
      dz = _o.z - (BENCH.z + kin.pan.z);
    const rho = Math.hypot(dx, dz);
    target.az = THREE.MathUtils.clamp(Math.atan2(-dz, dx), -1.85, 1.85);
    target.r = THREE.MathUtils.clamp(Math.sqrt(Math.max(0, rho * rho - kin.pan.d0 * kin.pan.d0)) - kin.arm.S[0], 0.06, kin.rMax);
  };
  const lowHeight = (): number => {
    if (!kin) return LD.lowH;
    const p = graspLocal(_gp);
    if (p && gear !== 'held' && Math.hypot(p.x - gearMesh.position.x, p.z - gearMesh.position.z) <= TASK.tol * 1.6) return gearMesh.position.y - yOf(0);
    if (p && gear === 'held' && inBox(p)) return TASK.box.h;
    return LD.lowH;
  };
  const operate = (): void => {
    hooks.onUse();
    if (!kin) {
      // the console waits behind the loading card (WP1's card shows for a failed download on its own)
      ctx.ui.hint(ctx.i18n.text(loadFailed ? 'c.robotFailed' : 'c.robotLoading'), 3);
      void modelReady;
      return;
    }
    operating = true;
    ctx.player.enterOperate({
      title: ctx.i18n.text('c.opTitle'),
      // close in front of the bench, slightly above: the arm left of centre, the docked panel on the right
      cameraPose: { position: [BENCH.x + 0.3, TOP + 0.5, BENCH.z + 1.02], lookAt: [BENCH.x + 0.36, TOP + 0.07, BENCH.z - 0.02] },
      panelPosition: 'right',
      panel: buildPanel,
      onPointer: (e) => {
        if (e.type === 'move' || e.type === 'down') pointTo(_d.copy(e.origin), e.direction);
        if (e.type === 'down' && e.button === 0) lower = true;
        if (e.type === 'up' && e.button === 0) lower = false;
      },
      onExit: () => {
        operating = false;
        lower = false;
        abortMeasure();
      },
    });
    ctx.ui.hint(ctx.i18n.text('c.keys'), 5);
  };
  ctx.addInteractable({ object: lectern, label: ctx.i18n.text('c.console'), hint: ctx.i18n.text('c.consoleHint'), onInteract: operate, range: 2.8 });
  ctx.input.onKey(
    ['KeyF', 'Space'],
    (code) => {
      if (!operating) return;
      if (code === 'KeyF' && phase === 'idle') cycleWeight();
      else if (code === 'Space') {
        if (phase === 'measure' && run) {
          // Space = jump to the result
          while (run) {
            run.t += LD.driveS + LD.bisectS;
            stepMeasure(0);
          }
        } else void startMeasure();
      }
    },
    { whileOperating: true },
  );

  // ── the board (the Lastdiagramm, large, for everyone at the station) ───────────────────────
  let boardDirty = true;
  let boardAt = 0;
  const drawBoard = (): void => {
    const g = boardCanvas.getContext('2d')!;
    g.fillStyle = '#121110';
    g.fillRect(0, 0, BW, BH);
    g.font = '500 28px "Geist Mono", monospace';
    g.fillStyle = '#ff6700';
    g.fillText(T('boardTitle'), 30, 52);
    pillCanvas(g, BW - 190, 26, ctx.i18n.resolve({ de: 'MODELL', en: 'MODEL' }), '#a8a29e');
    // plot: payload (kg) over reach (m)
    const px0 = 96,
      px1 = 660,
      py0 = 92,
      py1 = 500;
    const X = (r: number): number => px0 + (r / 0.45) * (px1 - px0);
    const Y = (kg: number): number => py1 - (Math.min(2.1, kg) / 2.1) * (py1 - py0);
    g.strokeStyle = '#2a2826';
    g.lineWidth = 1;
    g.fillStyle = '#78716c';
    g.font = '400 18px "Geist Mono", monospace';
    for (const kg of [0, 0.5, 1, 1.5, 2]) {
      g.beginPath();
      g.moveTo(px0, Y(kg));
      g.lineTo(px1, Y(kg));
      g.stroke();
      g.fillText(`${n1(kg)}`, 30, Y(kg) + 6);
    }
    for (const r of [0, 0.1, 0.2, 0.3, 0.4]) g.fillText(n1(r), X(r) - 14, py1 + 28);
    g.fillText(T('kX'), px1 - 140, py1 + 58);
    g.save();
    g.translate(22, py0 - 14);
    g.fillText(T('kYshort'), 0, 0);
    g.restore();
    if (points.length) {
      // the stall band (teal, area) and the rated curve (white)
      g.fillStyle = 'rgba(45,212,191,0.22)';
      g.beginPath();
      points.forEach((p, i) => (i ? g.lineTo(X(p.r), Y(p.hi / 1000)) : g.moveTo(X(p.r), Y(p.hi / 1000))));
      for (let i = points.length - 1; i >= 0; i--) g.lineTo(X(points[i].r), Y(points[i].lo / 1000));
      g.closePath();
      g.fill();
      g.strokeStyle = '#2dd4bf';
      g.setLineDash([8, 6]);
      for (const key of ['lo', 'hi'] as const) {
        g.beginPath();
        points.forEach((p, i) => (i ? g.lineTo(X(p.r), Y(p[key] / 1000)) : g.moveTo(X(p.r), Y(p[key] / 1000))));
        g.stroke();
      }
      g.setLineDash([]);
      g.strokeStyle = '#f5f5f4';
      g.lineWidth = 3;
      g.beginPath();
      points.forEach((p, i) => (i ? g.lineTo(X(p.r), Y(p.nenn / 1000)) : g.moveTo(X(p.r), Y(p.nenn / 1000))));
      g.stroke();
      g.fillStyle = '#f5f5f4';
      for (const p of points) {
        g.beginPath();
        g.arc(X(p.r), Y(p.nenn / 1000), 6, 0, Math.PI * 2);
        g.fill();
      }
    }
    // the live arm: where it reaches now
    if (kin && curPose) {
      const r = Math.max(0, shown.r);
      g.strokeStyle = '#ff6700';
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(X(r), py0);
      g.lineTo(X(r), py1);
      g.stroke();
      const lk = loadKg();
      if (lk > 0) {
        g.fillStyle = '#ff6700';
        g.beginPath();
        g.arc(X(r), Y(lk), 8, 0, Math.PI * 2);
        g.fill();
      }
    }
    // right column: the two servo figures and the stretched result
    const rx = 700;
    g.fillStyle = '#a8a29e';
    g.font = '500 20px "Geist Mono", monospace';
    g.fillText(T('boardServo'), rx, 118);
    g.fillStyle = '#f5f5f4';
    g.font = '700 30px "Space Grotesk", sans-serif';
    g.fillText(`${T('mNenn')} ${n1(SERVO.nennKgcm)} kg·cm`, rx, 160);
    g.fillStyle = '#2dd4bf';
    g.fillText(`${T('mSpitze')} ${n1(SERVO.stallLoKgcm)}–${n1(SERVO.stallHiKgcm)}`, rx, 202);
    const s = stretched();
    if (s && points.some((p) => Math.abs(p.r - LD.reaches[LD.reaches.length - 1]) < 1e-6)) {
      g.fillStyle = '#a8a29e';
      g.font = '500 20px "Geist Mono", monospace';
      g.fillText(T('boardStretched'), rx, 268);
      g.fillStyle = '#f5f5f4';
      g.font = '700 54px "Space Grotesk", sans-serif';
      g.fillText(`${s.nenn} g`, rx, 330);
      g.fillStyle = '#2dd4bf';
      g.font = '700 30px "Space Grotesk", sans-serif';
      g.fillText(`${T('mSpitze')} ${round10(s.lo)}–${round10(s.hi)} g`, rx, 374);
    } else {
      g.fillStyle = '#78716c';
      g.font = '400 22px "Geist", sans-serif';
      wrap(g, T('boardEmpty'), rx, 268, 300, 30);
    }
    g.fillStyle = '#78716c';
    g.font = '400 17px "Geist", sans-serif';
    g.fillText(T('boardFoot'), 30, BH - 22);
    boardTex.needsUpdate = true;
  };

  // ── cards ─────────────────────────────────────────────────────────────────
  const cardSpec = (): InfoCardSpec => {
    const s = stretched();
    const at20 = kin ? payloadAt(kin, 0.2) : null;
    return {
      eyebrow: ctx.i18n.text('c.cardEyebrow'),
      title: ctx.i18n.text('c.cardTitle'),
      body: [ctx.i18n.text('c.cardBody')],
      metrics: [
        { label: ctx.i18n.text('c.mStretched'), value: s ? s.nenn : '–', unit: 'g', note: ctx.i18n.text('c.mNoteModel') },
        { label: ctx.i18n.text('c.mAt20'), value: at20 ?? '–', unit: 'g', note: ctx.i18n.text('c.mNoteModel') },
        { label: ctx.i18n.text('c.mPeak'), value: s ? `${round10(s.lo)}–${round10(s.hi)}` : '–', unit: 'g', note: ctx.i18n.text('c.mNoteBand') },
      ],
      bullets: [ctx.i18n.text('c.cardServo'), ctx.i18n.text('c.cardMass')],
      entdecker: { bullets: [ctx.i18n.text('c.curious'), ctx.i18n.text('c.cardServo')], forDecisionMakers: undefined },
      forDecisionMakers: {
        title: ctx.i18n.text('c.befundTitle'),
        bullets: [ctx.i18n.text('c.bMess'), ctx.i18n.text('c.bGrenze'), ctx.i18n.text('c.bFrage'), ctx.i18n.text('c.bWerk')],
      },
      diagram: { aspect: 16 / 9, caption: ctx.i18n.text('c.diagramCaption'), draw: drawLeverDiagram },
    };
  };
  const ur5eCard = (): InfoCardSpec => ({
    eyebrow: ctx.i18n.text('c.urEyebrow'),
    title: ctx.i18n.text('c.urTitle'),
    body: [ctx.i18n.text('c.urBody')],
    metrics: [
      { label: ctx.i18n.text('c.urPayload'), value: 5, unit: 'kg', note: ctx.i18n.text('c.urNote') },
      { label: ctx.i18n.text('c.urReach'), value: 850, unit: 'mm', note: ctx.i18n.text('c.urNote') },
    ],
    bullets: [ctx.i18n.text('c.urSrc')],
  });

  // ── per frame ─────────────────────────────────────────────────────────────
  const _w = new THREE.Vector3(),
    _tip = new THREE.Vector3(),
    _m4 = new THREE.Matrix4(),
    _q4 = new THREE.Quaternion(),
    _s3 = new THREE.Vector3();
  let prevQ: Q3 = [0, 0, 0];
  const update = (dt: number, elapsed: number): void => {
    if (!model || !kin) return;
    if (phase === 'measure') stepMeasure(dt);
    // the target height: lowered on LMB, the measuring height during the run
    target.h = phase === 'measure' ? LD.measureH : lower ? lowHeight() : LD.carryH;
    const k = 1 - Math.exp(-dt / LD.followTau);
    shown.az += (target.az - shown.az) * k;
    shown.r += (target.r - shown.r) * k;
    shown.h += (target.h - shown.h) * k;
    const wantJaw = gear === 'held' ? JAW_SHUT : hang ? JAW_SHUT : JAW_OPEN;
    jaw += (wantJaw - jaw) * Math.min(1, dt * 10);
    solveTarget();
    // during the run the ghost load sets the bar (the bisection's current try)
    const lk = phase === 'measure' && run ? run.ghost : loadKg();
    if (curPose) tau = torqueOf(kin.arm, curPose, lk);
    // above the stall band the shoulder gives way until it holds; inside the band a tremble
    const zone = bandOf(tau);
    const wantSag = zone === 'sag' && curPose && phase === 'idle' ? sagAngle(kin.arm, curPose.q, lk, LIMITS.hi) : 0;
    sag += (wantSag - sag) * (1 - Math.exp(-dt / LD.sagTau));
    const tremble = zone === 'band' && phase === 'idle' && !ctx.settings.reducedMotion ? Math.sin(elapsed * 31) * LD.trembleRad : 0;
    // the crate joke: the wrist shakes its head
    shake = Math.max(0, shake - dt);
    const noShake = shake > 0 && !ctx.settings.reducedMotion ? Math.sin(shake * 22) * 0.5 * Math.min(1, shake) : 0;
    model.setJoint('shoulder_pan', qPan);
    model.setJoint('shoulder_lift', q[0] - (sag + tremble) / kin.arm.s[0]);
    model.setJoint('elbow_flex', q[1]);
    model.setJoint('wrist_flex', q[2]);
    model.setJoint('wrist_roll', noShake);
    model.setJoint('gripper', jaw);
    // juice: servo whine by joint speed, a strain creak above Nenn
    const speed = (Math.abs(q[0] - prevQ[0]) + Math.abs(q[1] - prevQ[1]) + Math.abs(q[2] - prevQ[2])) / Math.max(1e-3, dt);
    prevQ = [...q] as Q3;
    const tip3 = graspLocal(_tip);
    if (tip3) {
      sfx.servo('ld-arm', tip3, Math.min(3, speed * 0.25), 0.7);
      sfx.creak(tip3, zone === 'ok' ? 0 : Math.min(40, (tau / LIMITS.nenn - 1) * 30 + 4));
    }
    if (zone !== lastBand) {
      if (zone === 'nenn' && lastBand === 'ok') ctx.game.juice.cue('tick', { pitch: 0.8 });
      if (zone === 'sag') {
        ctx.game.juice.cue('oops');
        if (!sagSaid && phase === 'idle') (sagSaid = true), hooks.say('emi.cSag');
      }
      if (zone === 'nenn' && !overSaid && phase === 'idle' && loadKg() > 0) (overSaid = true), hooks.say('emi.cNenn');
      lastBand = zone;
      refreshPanel();
    }
    // the task: any moment over Nenn while the gear is held spoils the attempt
    if (gear === 'held' && attempt) {
      attempt.peak = Math.max(attempt.peak, tau);
      if (tau > LIMITS.nenn + 1e-9 && !attempt.over) {
        attempt.over = true;
        ch.fail(ctx.i18n.text('c.taskFail'));
        refreshPanel();
      }
    }
    // the hanging weight / the held gear / the wire
    if (tip3) {
      const wPos = wirePos;
      let n = 0;
      const lw = phase === 'measure' ? 0 : hang;
      for (let i = 0; i < LD.weights.length; i++) {
        const g = LD.weights[i];
        const hanging = lw === g && gear !== 'held';
        const r = WEIGHT_R(g),
          hh = WEIGHT_H(g);
        if (hanging) _s3.set(r, hh, r), _w.set(tip3.x, Math.max(TOP + hh / 2, tip3.y - 0.05 - hh / 2), tip3.z);
        else {
          const [sx, sz] = rackSlot(i);
          _s3.set(r, hh, r);
          _w.set(sx, TOP + 0.03 + hh / 2, sz);
        }
        _m4.compose(_w, _q4.identity(), _s3);
        weights.setMatrixAt(i, _m4);
        if (hanging) {
          wPos.set([tip3.x, tip3.y, tip3.z, tip3.x, tip3.y - 0.05, tip3.z], n);
          n += 6;
        }
      }
      weights.instanceMatrix.needsUpdate = true;
      // the rig's pull cable during the measurement: from the jaws to the load cell
      if (phase === 'measure') {
        wPos.set([tip3.x, tip3.y, tip3.z, CELL[0], TOP + 0.04, CELL[1]], n);
        n += 6;
      }
      wireGeo.setDrawRange(0, n / 3);
      wireGeo.attributes.position.needsUpdate = true;
      if (gear === 'held') {
        gearMesh.position.set(tip3.x, tip3.y - GEAR_T * 0.1, tip3.z);
        gearMesh.rotation.y = qPan;
      }
    }
    if (ui && ctx.time.frame % 4 === 0) refreshPanel();
    if ((boardDirty || ctx.time.frame % 10 === 0) && elapsed - boardAt > 0.08 && ctx.playerDistance < 50) {
      boardDirty = false;
      boardAt = elapsed;
      drawBoard();
    }
  };

  drawBoard();

  // ── debug hooks (deterministic; tools/playtest.mjs and tools/lastdiagramm-check.mjs drive them) ──
  const ensureModel = async (): Promise<boolean> => {
    await modelReady;
    return !!kin;
  };
  const measureAllNow = (): void => {
    if (!kin) return;
    for (const r of LD.reaches) {
      const dp = diagramPoint(kin.arm, r, LD.measureH, LIMITS);
      if (!dp) continue;
      const j = points.findIndex((p) => Math.abs(p.r - r) < 1e-6);
      const row = { r, nenn: dp.nenn, lo: dp.lo, hi: dp.hi };
      if (j >= 0) points[j] = row;
      else points.push(row);
    }
    points.sort((a, b) => a.r - b.r);
    save();
    refreshCurves();
    boardDirty = true;
  };
  return {
    update,
    get done() {
      return done;
    },
    debug: {
      enter: () => !operating && operate(),
      async solve() {
        if (!(await ensureModel())) return;
        // a plain ★ result: the tip far off (★★ missed), the diagram measured, no gear task
        if (tip == null) {
          tip = 300;
          const s = stretched();
          if (s && !ctx.progress.get('ldPredRecorded', false)) {
            ctx.progress.set('ldPredRecorded', true);
            ctx.pass.recordPrediction('lastdiagramm', tip, s.nenn, { min: LD.predict.min, max: LD.predict.max, scale: 'linear' });
          }
        }
        measureAllNow();
        checkStamp();
        save();
      },
      async stars3() {
        if (!(await ensureModel())) return;
        await this.solve();
        tip = 0;
        // the gear task as the bot plays it: grip, carry close to the body, into the box, never over Nenn
        if (kin) {
          const res = carryCheck(kin);
          if (res.peak <= LIMITS.nenn) {
            taskDone = true;
            taskTries++;
          }
        }
        save();
        judge();
      },
      state: () => ({
        loaded: !!kin,
        failed: loadFailed,
        phase,
        points: points.map((p) => ({ ...p })),
        tip,
        taskDone,
        gear,
        hang,
        tau: Math.round((tau / KGCM) * 100) / 100,
        target: { ...target },
        done,
        stars: ch.stars,
      }),
      aim() {
        const px = (v: THREE.Vector3): [number, number] => {
          const w = ctx.toWorld(v, new THREE.Vector3()).project(ctx.camera);
          const el = document.querySelector('canvas');
          const W = el?.clientWidth ?? 1280,
            H = el?.clientHeight ?? 720;
          return [Math.round(((w.x + 1) / 2) * W), Math.round(((1 - w.y) / 2) * H)];
        };
        return { gear: px(new THREE.Vector3(gearMesh.position.x, yOf(LD.carryH), gearMesh.position.z)), box: px(new THREE.Vector3(bx, yOf(LD.carryH), bz)) };
      },
      async model() {
        if (!(await ensureModel()) || !kin) return null;
        const s = stretched()!;
        const carry = carryCheck(kin);
        const wide = carryCheck(kin, 0.33);
        const rows = LD.reaches.map((r) => {
          const p = diagramPoint(kin!.arm, r, LD.measureH, LIMITS);
          return p ? { r, nenn: p.nenn, lo: p.lo, hi: p.hi, tilt: Math.round(p.pose.beta * 1000) / 1000, tauArm: Math.round(p.pose.tauArm * 10000) / 10000 } : { r, unreachable: true };
        });
        const st = pose(kin.arm, kin.rMax, LD.measureH)!;
        return {
          rMax: Math.round(kin.rMax * 10000) / 10000,
          stretched: s,
          stretchedTauArmNm: Math.round(st.tauArm * 10000) / 10000,
          exact: { nenn: payloadKg(kin.arm, st, LIMITS.nenn) * 1000, lo: payloadKg(kin.arm, st, LIMITS.lo) * 1000, hi: payloadKg(kin.arm, st, LIMITS.hi) * 1000 },
          at20: payloadAt(kin, 0.2),
          rows,
          limitsNm: LIMITS,
          gearTask: { peakNm: Math.round(carry.peak * 10000) / 10000, solvable: carry.peak <= LIMITS.nenn, wideNm: Math.round(wide.peak * 10000) / 10000 },
          arm: kin.arm,
          masses: kin.arm.coms.reduce((a, c) => a + c.m, 0),
        };
      },
    },
  };
}

// ── helpers ─────────────────────────────────────────────────────────────────

/** band of a torque: under Nenn, over Nenn (amber), inside the stall band (tremble), above it (sag) */
function bandOf(tau: number): 'ok' | 'nenn' | 'band' | 'sag' {
  if (tau <= LIMITS.nenn + 1e-9) return 'ok';
  if (tau <= LIMITS.lo) return 'nenn';
  if (tau <= LIMITS.hi) return 'band';
  return 'sag';
}

const round10 = (g: number): number => Math.round(g / 10) * 10;

function payloadAt(kin: Kinematics, r: number): number | null {
  const p = diagramPoint(kin.arm, r, LD.measureH, LIMITS);
  return p ? p.nenn : null;
}

/** the gear task along the straight line (the bot's path); `boxR` overrides the box reach (a wide path) */
function carryCheck(kin: Kinematics, boxR?: number): { peak: number } {
  // planar x is measured from the pan axis already (panX = 0)
  return carryPeak(kin.arm, { ...TASK.gear }, { ...TASK.box, r: boxR ?? TASK.box.r }, LD.carryH, LD.gearKg, 0);
}

/** the pan joint value that turns the arm plane through the bench-polar azimuth az at reach r */
function panFor(kin: Kinematics, az: number, r: number): number {
  // the arm plane sits d0 to the side of the pan axis: the grasp point at in-plane distance xf lies at
  // the angle atan2(d0, xf) off the plane's direction
  const xf = r + kin.arm.S[0];
  const off = Math.atan2(kin.pan.d0, xf);
  return (az + off) / kin.pan.k;
}

/**
 * The planar arm from the loaded model: link frames at the zero pose (bench-local, the model turned so
 * that its zero pose points along +x), the manifest's masses and centres of mass, the joint signs by a
 * small test turn of each joint, and the joint limits from the model.
 */
function derive(model: RobotModel, inertials: readonly { link: string; mass: number; com: readonly [number, number, number] }[], root: THREE.Object3D): Kinematics {
  const zero = (): void => {
    for (const j of ARM_JOINTS) model.setJoint(j, 0);
  };
  const local = (link: string, out = new THREE.Vector3()): THREE.Vector3 => {
    root.updateWorldMatrix(true, true);
    model.getLinkWorldPosition(link, out);
    return root.worldToLocal(out);
  };
  zero();
  model.object.rotation.set(0, 0, 0);
  // face +x: turn the model about y so the zero pose's grasp direction points along the bench's +x
  const pan0 = local('shoulder_link');
  const g0 = local('gripper_frame_link');
  const yaw = Math.atan2(g0.z - pan0.z, g0.x - pan0.x);
  model.object.rotation.y = yaw;
  const pan = local('shoulder_link');
  const S3 = local('upper_arm_link'),
    E3 = local('lower_arm_link'),
    W3 = local('wrist_link'),
    P3 = local('gripper_frame_link');
  const plane = (v: THREE.Vector3): [number, number] => [v.x - pan.x, v.y];
  const coms: { m: number; seg: 1 | 2 | 3; c: [number, number] }[] = [];
  const mInv = new THREE.Matrix4();
  for (const it of inertials) {
    const seg = INERTIAL_SEG[it.link];
    if (!seg || it.mass <= 0) continue;
    root.updateWorldMatrix(true, true);
    const m = model.getLinkWorldMatrix(it.link);
    if (!m) continue;
    const c = new THREE.Vector3(...it.com).applyMatrix4(m);
    mInv.copy(root.matrixWorld).invert();
    c.applyMatrix4(mInv);
    coms.push({ m: it.mass, seg, c: plane(c) });
  }
  // joint signs: a small positive turn, the grasp point's angle about the joint's pivot
  const pivots = [S3, E3, W3];
  const s: [number, number, number] = [1, 1, 1];
  PLANAR.forEach((j, i) => {
    const a0 = Math.atan2(P3.y - pivots[i].y, P3.x - pivots[i].x);
    model.setJoint(j, 0.1);
    const p = local('gripper_frame_link');
    const a1 = Math.atan2(p.y - pivots[i].y, p.x - pivots[i].x);
    s[i] = Math.sign(Math.atan2(Math.sin(a1 - a0), Math.cos(a1 - a0))) || 1;
    model.setJoint(j, 0);
  });
  // pan: which way a positive pan turns the grasp point's azimuth (+ = toward −z)
  const az0 = Math.atan2(-(P3.z - pan.z), P3.x - pan.x);
  model.setJoint('shoulder_pan', 0.1);
  const pp = local('gripper_frame_link');
  const az1 = Math.atan2(-(pp.z - pan.z), pp.x - pan.x);
  const k = Math.sign(az1 - az0) || 1;
  model.setJoint('shoulder_pan', 0);
  const lim = (j: string): [number, number] => {
    const d = model.joints.find((x) => x.name === j);
    return [d?.lower ?? -Math.PI, d?.upper ?? Math.PI];
  };
  const arm: PlanarArm = {
    S: plane(S3),
    E: plane(E3),
    W: plane(W3),
    P: plane(P3),
    s,
    coms,
    limits: [lim('shoulder_lift'), lim('elbow_flex'), lim('wrist_flex')],
  };
  // the arm plane's lateral offset from the pan axis (bench z, + = toward −z like the azimuth)
  const d0 = -(S3.z - pan.z);
  return { arm, pan: { x: pan.x, z: pan.z, d0, k }, rMax: maxReachOf(arm) };
}

function maxReachOf(arm: PlanarArm): number {
  return maxReach(arm, LD.measureH);
}

/** a toothed disc in the x/z plane (the gear part), centred */
function gearGeometry(r: number, t: number, teeth: number): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  const n = teeth * 4;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    const rr = i % 4 < 2 ? r : r * 0.84;
    if (i === 0) shape.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
    else shape.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  const hole = new THREE.Path();
  hole.absarc(0, 0, r * 0.3, 0, Math.PI * 2, true);
  shape.holes.push(hole);
  const g = new THREE.ExtrudeGeometry(shape, { depth: t, bevelEnabled: false, curveSegments: 4 });
  g.rotateX(-Math.PI / 2);
  g.translate(0, -t / 2, 0);
  return g;
}

function pillCanvas(g: CanvasRenderingContext2D, x: number, y: number, text: string, color: string): void {
  g.font = '500 18px "Geist Mono", monospace';
  const w = g.measureText(text).width + 24;
  g.strokeStyle = color;
  g.globalAlpha = 0.6;
  g.lineWidth = 1.5;
  g.beginPath();
  g.roundRect(x, y, w, 30, 15);
  g.stroke();
  g.globalAlpha = 1;
  g.fillStyle = color;
  g.fillText(text, x + 12, y + 21);
}

function wrap(g: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, lh: number): void {
  let line = '';
  for (const word of text.split(' ')) {
    const t = line ? `${line} ${word}` : word;
    if (g.measureText(t).width > maxW && line) {
      g.fillText(line, x, y);
      y += lh;
      line = word;
    } else line = t;
  }
  if (line) g.fillText(line, x, y);
}

/** info-card diagram: the same arm, two levers (close in and stretched), the torque each needs */
function drawLeverDiagram(g: CanvasRenderingContext2D, w: number, hh: number): void {
  g.fillStyle = '#141414';
  g.fillRect(0, 0, w, hh);
  const base = { x: w * 0.12, y: hh * 0.62 };
  const draw = (len: number, y: number, label: string, color: string): void => {
    g.strokeStyle = color;
    g.lineWidth = 6;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(base.x, y);
    g.lineTo(base.x + len, y);
    g.stroke();
    g.fillStyle = color;
    g.fillRect(base.x + len - 8, y + 8, 16, 18);
    g.font = '12px "Geist Mono", monospace';
    g.fillText(label, base.x + len + 14, y + 6);
  };
  g.fillStyle = '#57534e';
  g.beginPath();
  g.arc(base.x, base.y - 40, 10, 0, Math.PI * 2);
  g.arc(base.x, base.y + 20, 10, 0, Math.PI * 2);
  g.fill();
  draw(w * 0.22, base.y - 40, 'm · g · 0,15 m', '#2dd4bf');
  draw(w * 0.56, base.y + 20, 'm · g · 0,41 m', '#ff8534');
}


const LD_CSS = `
.gw .ld-gauge { margin-top: 8px; }
.gw .ld-ghead { display:flex; gap:10px; align-items:baseline; }
.gw .ld-ghead .ld-v { font-size: 18px; }
.gw .ld-v.ld-ok { color: var(--teal); }
.gw .ld-v.ld-nenn, .gw .ld-v.ld-band, .gw .ld-v.ld-sag { color: var(--warning); }
.gw .ld-bar { position: relative; height: 12px; border-radius: 6px; background: var(--elevated); margin-top: 6px; overflow: hidden; }
.gw .ld-bar > i { position:absolute; left:0; top:0; bottom:0; border-radius: 6px; transition: width .08s linear; }
.gw .ld-bar > i.ld-ok { background: var(--teal); }
.gw .ld-bar > i.ld-nenn, .gw .ld-bar > i.ld-band { background: var(--warning); }
.gw .ld-bar > i.ld-sag { background: repeating-linear-gradient(45deg, var(--warning) 0 6px, rgba(251,191,36,.45) 6px 12px); }
.gw .ld-bar > b { position:absolute; top:0; bottom:0; background: rgba(45,212,191,.28); border-left: 1px dashed var(--teal); border-right: 1px dashed var(--teal); }
.gw .ld-bar > u { position:absolute; top:-2px; bottom:-2px; width: 2px; margin-left: -1px; background: var(--text); }
.gw .ld-marks { position: relative; height: 15px; font-family: var(--font-mono); font-size: 11px; color: var(--text-3); }
.gw .ld-marks > span { position:absolute; transform: translateX(-50%); top: 1px; white-space: nowrap; }
`;
